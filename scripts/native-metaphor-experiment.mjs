#!/usr/bin/env node
// scripts/native-metaphor-experiment.mjs — the deepest validation of the
// modality-blind core: can a PRIOR from one medium be applied to ANOTHER,
// and what does the cross-modal divergence reveal?
//
// This is the thing embeddings CANNOT do. A MiniLM text vector and an audio
// vector live in incompatible spaces — you cannot score one against the
// other. But fold-cells are the SAME 27 cells regardless of medium (text via
// createParser, music via ingestMusic, both emitting INS/CON/... onto the
// same EO log, both read by the same readingAt). So a text prior and a music
// fold ARE comparable, and cross-modal surprise is well-defined.
//
// "Native metaphor": reading music against a text prior, the per-cell
// divergence is not an imposed analogy — it falls out of the shared
// substrate. Cells where music costs little extra under the text prior are
// where the mediums are structurally alike (the metaphor holds); cells with
// high extra cost are where they genuinely differ (it breaks).
//
// HONESTY CAVEATS (do not over-read the magnitudes):
//   1. The music organ (ingestMusic) emits ONLY INS + CON, so music folds
//      structurally cannot occupy SEG/DEF/SYN/SIG cells. A finding that
//      "text uses DEF, music doesn't" is therefore partly tautological — it
//      reflects the organ's operator vocabulary, not a deep truth about
//      music. The robust, non-tautological signal is differences WITHIN the
//      shared INS/CON/NUL cells (e.g. music being far more CON-heavy).
//   2. The epsilon smoothing floor inflates the raw bit magnitude when one
//      prior has near-zero mass on a cell the other uses. The DIRECTION of
//      the asymmetry and WHICH cells drive it are robust; the exact bit
//      counts are not.
//
// Observed (20 Gutenberg books vs 14 public-domain melodies): music reads
// through a text prior at low extra cost (~+1 bit) while text reads through a
// music prior catastrophically (~+8 bits) — music is a structural SUBSET of
// text in operator space (melody = introduce-pitch + bind-by-interval, a
// concentrated chain-of-bonds). Music is ~2.3x more CON-heavy than text: the
// non-tautological core of the metaphor, melody as prose's bond-chain.
//
// Usage: node scripts/native-metaphor-experiment.mjs --text-dir <dir> [--max-books N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, loadMusicReader, loadDnaReader, fastaToDoc, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { accumulate, normalize, restrictAndRenormalize, perSpanSurprise } from './lib/prior-crossval.mjs';
import { mean } from './lib/stats.mjs';

const MAX_SENTENCES = 200;
const SKIP = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const EXCLUDED = ['EVA_Binding_Lens', 'REC_Making_Lens'];

// Public-domain / traditional melodies as note-name sequences — a deliberate
// spread of structure (folk tunes, classical themes, scales, an atonal row)
// so the music prior isn't one narrow style.
const MELODIES = {
  twinkle: ['C4','C4','G4','G4','A4','A4','G4','F4','F4','E4','E4','D4','D4','C4'],
  ode_to_joy: ['E4','E4','F4','G4','G4','F4','E4','D4','C4','C4','D4','E4','E4','D4','D4'],
  mary_lamb: ['E4','D4','C4','D4','E4','E4','E4','D4','D4','D4','E4','G4','G4'],
  frere_jacques: ['C4','D4','E4','C4','C4','D4','E4','C4','E4','F4','G4','E4','F4','G4'],
  amazing_grace: ['G4','C5','E5','C5','E5','D5','C5','A4','G4','E4','G4','C5'],
  scarborough: ['A4','A4','E5','E5','B4','C5','B4','A4','F5','E5','C5','A4'],
  greensleeves: ['A4','C5','D5','E5','F5','E5','D5','B4','G4','A4','B4','C5','A4','A4'],
  major_scale: ['C4','D4','E4','F4','G4','A4','B4','C5','B4','A4','G4','F4','E4','D4','C4'],
  arpeggio: ['C4','E4','G4','C5','E5','G5','E5','C5','G4','E4','C4','E4','G4','C5'],
  chromatic: ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5'],
  whole_tone: ['C4','D4','E4','F#4','G#4','A#4','C5','A#4','G#4','F#4','E4','D4'],
  atonal_row: ['C4','F#4','D4','A4','E4','A#4','G4','C#5','B4','D#4','F4','G#4'],
  minor_melody: ['A4','B4','C5','D5','E5','F5','E5','D5','C5','B4','A4','G#4','A4'],
  pentatonic: ['C4','D4','E4','G4','A4','C5','A4','G4','E4','D4','C4','G4','A4'],
};

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return { textDir: get('--text-dir', null), maxBooks: Number(get('--max-books', 20)), fasta: get('--fasta', null), eoreaderPath: get('--eoreader-path', undefined) };
}

async function foldsForDoc(doc, readingAt, cellsBundle, maxSpans) {
  const units = doc.units || doc.sentences || [];
  const n = Math.min(units.length, maxSpans);
  const probsList = [];
  for (let i = 0; i < n; i++) {
    const reading = readingAt(doc, i);
    const fold = readingToFold(doc, i, reading);
    const m = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
    const probs = {};
    for (const [cell, mm] of Object.entries(m.phasepost_measurements)) probs[cell] = mm.amplitude_ppm / 1_000_000;
    probsList.push(probs);
  }
  return probsList;
}

function perCellKL(itemsAgg, Q, cellKeys) {
  const out = {};
  for (const c of cellKeys) out[c] = itemsAgg[c] > 0 ? +(itemsAgg[c] * Math.log2(itemsAgg[c] / Q[c])).toFixed(4) : 0;
  return out;
}
const topCells = (obj, n = 6) => Object.entries(obj).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n);

async function main() {
  const { textDir, maxBooks, fasta, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!textDir) { console.error('usage: native-metaphor-experiment.mjs --text-dir <dir> [--max-books N] [--fasta <file>]'); process.exit(1); }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const { ingestMusic } = await loadMusicReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));

  // Each modality is a map of item-name -> array of content-cell fold vectors.
  const modalities = {};

  const textFiles = readdirSync(textDir).filter((f) => f.endsWith('.txt')).sort().slice(0, maxBooks);
  modalities.text = {};
  for (const f of textFiles) {
    const doc = createParser().parse(stripFrame(readFileSync(`${textDir}/${f}`, 'utf8')));
    const units = (doc.units || doc.sentences || []).slice(SKIP);
    modalities.text[f] = restrictAndRenormalize(await foldsForDoc({ ...doc, units }, readingAt, cellsBundle, MAX_SENTENCES), contentCellKeys);
    console.error(`  text  ${f}: ${modalities.text[f].length} span-folds`);
  }

  modalities.music = {};
  for (const [name, notes] of Object.entries(MELODIES)) {
    modalities.music[name] = restrictAndRenormalize(await foldsForDoc(ingestMusic({ name, notes }), readingAt, cellsBundle, MAX_SENTENCES), contentCellKeys);
    console.error(`  music ${name}: ${modalities.music[name].length} note-folds`);
  }

  // DNA: one genome split into windows so leave-one-item-out has structure —
  // each window is an "item" the way each book/melody is. Optional (--fasta).
  if (fasta) {
    const { doc } = await fastaToDoc(readFileSync(fasta, 'utf8'), { name: 'dna', eoreaderPath });
    const allDnaFolds = restrictAndRenormalize(await foldsForDoc(doc, readingAt, cellsBundle, 280), contentCellKeys);
    modalities.dna = {};
    const WINDOWS = 14; // ~match the melody count so no modality dominates the pooled prior by sheer item count
    const per = Math.ceil(allDnaFolds.length / WINDOWS);
    for (let w = 0; w < WINDOWS; w++) {
      const slice = allDnaFolds.slice(w * per, (w + 1) * per);
      if (slice.length) modalities.dna[`window${w}`] = slice;
    }
    console.error(`  dna: ${Object.keys(modalities.dna).length} windows, ${allDnaFolds.length} codon-folds`);
  }

  const names = Object.keys(modalities);
  const priorOf = (m) => normalize(accumulate(Object.values(modalities[m]).flat(), contentCellKeys), contentCellKeys);
  const priors = Object.fromEntries(names.map((m) => [m, priorOf(m)]));

  // matrix[source][prior] = mean per-span surprise (bits) of source's folds
  // under prior's Q. The DIAGONAL uses leave-one-item-out within the source so
  // it isn't scoring against a prior that already contains the held item.
  const matrix = {};
  for (const src of names) {
    matrix[src] = {};
    for (const pri of names) {
      const bits = [];
      if (src === pri) {
        for (const held of Object.keys(modalities[src])) {
          const trainSpans = Object.keys(modalities[src]).filter((k) => k !== held).flatMap((k) => modalities[src][k]);
          if (!trainSpans.length) continue;
          bits.push(...perSpanSurprise(modalities[src][held], normalize(accumulate(trainSpans, contentCellKeys), contentCellKeys), contentCellKeys));
        }
      } else {
        bits.push(...perSpanSurprise(Object.values(modalities[src]).flat(), priors[pri], contentCellKeys));
      }
      matrix[src][pri] = +mean(bits).toFixed(3);
    }
  }

  // translation cost = extra bits over the source's own native (diagonal) cost.
  const translationCost = {};
  for (const src of names) {
    translationCost[src] = {};
    for (const pri of names) if (pri !== src) translationCost[src][pri] = +(matrix[src][pri] - matrix[src][src]).toFixed(3);
  }

  const conShare = Object.fromEntries(names.map((m) => [m, +(priors[m].CON_Binding_Link ?? 0).toFixed(3)]));

  // per-cell metaphor for each ordered pair: where does source diverge from prior?
  const metaphor = {};
  for (const src of names) for (const pri of names) if (src !== pri) {
    metaphor[`${src}_under_${pri}`] = topCells(perCellKL(priors[src], priors[pri], contentCellKeys), 4);
  }

  console.log(JSON.stringify({
    modalities: Object.fromEntries(names.map((m) => [m, Object.keys(modalities[m]).length])),
    contentCells: contentCellKeys.length,
    nativeBitsDiagonal: Object.fromEntries(names.map((m) => [m, matrix[m][m]])),
    crossModalMatrix: matrix,          // matrix[source][prior] mean bits/span
    translationCost,                   // extra bits over native, per (source, prior)
    conShareByModality: conShare,      // the non-tautological metaphor axis
    aggregateProfiles: Object.fromEntries(names.map((m) => [m, Object.fromEntries(topCells(priors[m], 6).map(([c, p]) => [c, +p.toFixed(3)]))])),
    metaphor,
    caveat: 'Music emits only INS+CON and the codon organ gives DNA positional (never-recurring) ids, so SEG/DEF/SYN/SIG absences are partly organ-vocabulary artifacts, not truths about the medium. Robust signal: CON-share differences within shared cells and the DIRECTION of the translation-cost matrix (a subset modality embeds cheaply into a richer one, not vice versa). Epsilon floor inflates absolute bit magnitudes.',
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
