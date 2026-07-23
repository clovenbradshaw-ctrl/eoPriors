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
import { loadReader, loadMusicReader, readingToFold } from '../src/reader-bridge.js';
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
  return { textDir: get('--text-dir', null), maxBooks: Number(get('--max-books', 20)), eoreaderPath: get('--eoreader-path', undefined) };
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
  const { textDir, maxBooks, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!textDir) { console.error('usage: native-metaphor-experiment.mjs --text-dir <dir> [--max-books N]'); process.exit(1); }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const { ingestMusic } = await loadMusicReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));

  const textFiles = readdirSync(textDir).filter((f) => f.endsWith('.txt')).sort().slice(0, maxBooks);
  const textByItem = {};
  for (const f of textFiles) {
    const doc = createParser().parse(stripFrame(readFileSync(`${textDir}/${f}`, 'utf8')));
    const units = (doc.units || doc.sentences || []).slice(SKIP);
    textByItem[f] = restrictAndRenormalize(await foldsForDoc({ ...doc, units }, readingAt, cellsBundle, MAX_SENTENCES), contentCellKeys);
    console.error(`  text  ${f}: ${textByItem[f].length} span-folds`);
  }

  const musicByItem = {};
  for (const [name, notes] of Object.entries(MELODIES)) {
    musicByItem[name] = restrictAndRenormalize(await foldsForDoc(ingestMusic({ name, notes }), readingAt, cellsBundle, MAX_SENTENCES), contentCellKeys);
    console.error(`  music ${name}: ${musicByItem[name].length} note-folds`);
  }

  const allText = Object.values(textByItem).flat();
  const allMusic = Object.values(musicByItem).flat();
  const Qtext = normalize(accumulate(allText, contentCellKeys), contentCellKeys);
  const Qmusic = normalize(accumulate(allMusic, contentCellKeys), contentCellKeys);

  const scoreModality = (byItem, otherPrior) => {
    const nativeBits = [], crossBits = [];
    for (const held of Object.keys(byItem)) {
      const trainSpans = Object.keys(byItem).filter((k) => k !== held).flatMap((k) => byItem[k]);
      const Qown = normalize(accumulate(trainSpans, contentCellKeys), contentCellKeys);
      nativeBits.push(...perSpanSurprise(byItem[held], Qown, contentCellKeys));
      crossBits.push(...perSpanSurprise(byItem[held], otherPrior, contentCellKeys));
    }
    return { nativeMean: +mean(nativeBits).toFixed(4), crossMean: +mean(crossBits).toFixed(4), n: nativeBits.length };
  };

  const textScored = scoreModality(textByItem, Qmusic);
  const musicScored = scoreModality(musicByItem, Qtext);

  console.log(JSON.stringify({
    textItems: Object.keys(textByItem).length,
    musicItems: Object.keys(musicByItem).length,
    contentCells: contentCellKeys.length,
    text: { nativeBits: textScored.nativeMean, crossModalBits: textScored.crossMean, translationCost: +(textScored.crossMean - textScored.nativeMean).toFixed(4), spans: textScored.n },
    music: { nativeBits: musicScored.nativeMean, crossModalBits: musicScored.crossMean, translationCost: +(musicScored.crossMean - musicScored.nativeMean).toFixed(4), spans: musicScored.n },
    metaphor: {
      music_vs_text_prior_topCells: topCells(perCellKL(Qmusic, Qtext, contentCellKeys)),
      text_vs_music_prior_topCells: topCells(perCellKL(Qtext, Qmusic, contentCellKeys)),
    },
    aggregateProfiles: {
      text: Object.fromEntries(topCells(Qtext, 6).map(([c, p]) => [c, +p.toFixed(3)])),
      music: Object.fromEntries(topCells(Qmusic, 6).map(([c, p]) => [c, +p.toFixed(3)])),
    },
    caveat: 'Music organ emits only INS+CON, so SEG/DEF/SYN/SIG divergences are partly tautological; robust signal is CON-dominance within shared cells. Epsilon floor inflates bit magnitudes; direction is robust, exact bits are not.',
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
