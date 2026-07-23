#!/usr/bin/env node
// scripts/music-fold-probe.mjs — the first NON-TEXT modality through the SAME
// fold-compression core, proving "same core, different perceiver" concretely.
// MIDI bytes -> eoreader4.2's parseMidi -> ingestMusic (emits INS + CON onto
// the SAME EO log text uses) -> the SAME readingAt() -> the SAME
// readingToFold() -> the SAME measureFold(). No text anywhere in the path.
// This is what embeddings cannot do: a MiniLM text vector and an audio vector
// live in incompatible spaces, but fold-cells are the same 27 cells for any
// modality, so the compression core is genuinely modality-blind.
//
// Also accepts a melody as a comma-separated note list (--notes "C4,E4,G4")
// for controlled input — the bytes->fold path is proven with --midi, so
// direct notes are a cleaner way to feed known musical structure, not a
// shortcut around the byte claim.
//
// Usage:
//   node scripts/music-fold-probe.mjs --midi <file.mid> [--max-spans N]
//   node scripts/music-fold-probe.mjs --notes "C4,C4,G4,G4,A4,A4,G4" [--max-spans N]

import { readFileSync } from 'node:fs';
import { loadMusicReader, midiBytesToDoc, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';

const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    midi: get('--midi', null),
    notes: get('--notes', null),
    maxSpans: Number(get('--max-spans', 200)),
    eoreaderPath: get('--eoreader-path', undefined),
  };
}

async function main() {
  const { midi, notes, maxSpans, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!midi && !notes) {
    console.error('usage: music-fold-probe.mjs (--midi <file.mid> | --notes "C4,E4,G4") [--max-spans N]');
    process.exit(1);
  }

  const { ingestMusic, readingAt } = await loadMusicReader({ eoreaderPath });
  let doc, notesParsed, label;
  if (midi) {
    ({ doc, notesParsed } = await midiBytesToDoc(readFileSync(midi), { name: midi.replace(/^.*\//, ''), eoreaderPath }));
    label = midi.replace(/^.*\//, '');
    console.error(`parsed ${notesParsed} notes from MIDI bytes`);
  } else {
    const noteList = notes.split(',').map((s) => s.trim()).filter(Boolean);
    doc = ingestMusic({ name: 'notes', notes: noteList });
    notesParsed = noteList.length;
    label = `notes(${noteList.length})`;
  }

  const units = doc.units || doc.sentences || [];
  const cellsBundle = await loadPhasepostCells();
  const opCount = {};
  let spans = 0, held = 0, surprisalSum = 0;
  const firstFolds = [];
  const n = Math.min(units.length, maxSpans);
  for (let i = 0; i < n; i++) {
    const reading = readingAt(doc, i, { terrains: true });
    const fold = readingToFold(doc, i, reading);
    const m = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
    spans++;
    if (reading.held) held++;
    surprisalSum += reading.surprisalBits || 0;
    for (const [cell, mm] of Object.entries(m.phasepost_measurements)) {
      if (mm.amplitude_ppm <= 0) continue;
      opCount[cellsBundle.cells[cell].op] = (opCount[cellsBundle.cells[cell].op] || 0) + 1;
    }
    if (i < 6) firstFolds.push({ i, unit: units[i], ops: fold.operator_events.map((e) => e.op), surprisalBits: reading.surprisalBits });
  }

  console.log(JSON.stringify({
    source: label,
    modality: doc.modality,
    notesParsed,
    unitsRead: units.length,
    spansScored: spans,
    heldPct: +(100 * held / spans).toFixed(1),
    meanSurprisalBits: +(surprisalSum / spans).toFixed(3),
    operatorPct: Object.fromEntries(Object.entries(opCount).map(([op, c]) => [op, +(100 * c / spans).toFixed(1)])),
    firstFolds,
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
