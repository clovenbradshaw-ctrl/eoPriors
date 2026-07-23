#!/usr/bin/env node
// scripts/consolidate-corpus.mjs — flattens every corpus puller's output
// (scripts/gutenberg-corpus.py, holy-texts-corpus.py, shakespeare-corpus.py,
// western-canon-corpus.py, pull-journalism-corpus.py, pull-diverse-corpus.py)
// into ONE flat directory of .txt files, so run-fold-bridge.mjs and
// crossval-fold-priors.mjs — which both do a non-recursive readdirSync
// filtered to *.txt — can read across every identified content source in a
// single pass instead of per-puller.
//
// Two of the eight pullers write formats run-fold-bridge.mjs can't parse as
// prose out of the box, so this script also normalizes those in place:
//   - holy_texts/tanakh/*.json (Sefaria: Hebrew + HTML-tagged English per
//     book) -> plain text from the English ("en") field, footnote markup
//     stripped.
//   - holy_texts/greek_nt/sblgnt/data/sblgnt/text/*.txt is ALREADY plain
//     text (verse-ref + Greek, tab-separated) - just re-homed. Nestle1904
//     (the second Greek NT critical edition) is deliberately NOT included
//     here: it's the same 27 books of running Greek prose as SBLGNT, so it
//     would add near-duplicate signal to an aggregate prior, not new
//     content-modality coverage, for a real parsing cost (osisId-per-word
//     XML, no plain-text export upstream).
//   - holy_texts/pali_canon/*.json is EXCLUDED: SuttaCentral's API shape has
//     drifted since holy-texts-corpus.py was written — `root_text` and
//     `translation` both come back null for every sutta id in this fetch
//     (verified by inspection), so there is no real text to fold, only
//     sutta metadata. Fabricating placeholder text would violate this
//     repo's "nothing synthesized to fill a cell with no genuine evidence"
//     rule (see src/reader-bridge.js's file header) — so it's skipped, not
//     faked.
//   - diverse_corpus/code_*.{py,go,rs,c} are also excluded here: they're a
//     different modality (source code), already scoped for
//     scripts/cross-modal-probe.mjs, not this prose-fold-prior corpus.
//
// Usage:
//   node scripts/consolidate-corpus.mjs --sources <dir1> [<dir2> ...] --out <flatDir>

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const sources = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { out = argv[++i]; continue; }
    if (argv[i] === '--sources') { continue; }
    sources.push(argv[i]);
  }
  return { sources, out };
}

function stripHtml(s) {
  // Sefaria footnotes are inline <sup class="footnote-marker">a</sup><i
  // class="footnote">...commentary...</i> pairs — drop the whole footnote
  // (marker letter + commentary text), not just the tags around it, or the
  // marker letter and commentary prose leak into the verse as stray tokens.
  return s
    .replace(/<sup class="footnote-marker">.*?<\/sup>/g, '')
    .replace(/<i class="footnote">.*?<\/i>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sefaria's "en" field is an array of per-verse (or per-chapter, format
// varies by book) HTML-tagged strings.
function tanakhJsonToText(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const en = data.en;
  if (!en) return null;
  const flatten = (x) => Array.isArray(x) ? x.flatMap(flatten) : [x];
  const verses = flatten(en).filter((v) => typeof v === 'string' && v.trim());
  if (!verses.length) return null;
  return verses.map(stripHtml).join('\n');
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function main() {
  const { sources, out } = parseArgs(process.argv.slice(2));
  if (!sources.length || !out) {
    console.error('usage: consolidate-corpus.mjs --sources <dir1> [<dir2> ...] --out <flatDir>');
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });

  let written = 0, skipped = 0;
  const manifest = [];

  for (const srcRoot of sources) {
    let st;
    try { st = statSync(srcRoot); } catch { console.error(`  missing source dir, skipping: ${srcRoot}`); continue; }
    if (!st.isDirectory()) continue;

    // collection is the srcRoot's OWN basename, since callers pass leaf dirs
    // like ".../holy_texts/tanakh" directly — `rel` (relative to srcRoot)
    // never contains "tanakh/" itself, only what's INSIDE it.
    const collection = srcRoot.split(path.sep).filter(Boolean).pop();

    for (const file of walk(srcRoot)) {
      const rel = path.relative(srcRoot, file);
      const base = path.basename(file);
      const safeName = rel.replace(/[\\/]/g, '__');

      // Skip modalities/sources this consolidation deliberately excludes.
      if (collection === 'pali_canon') { skipped++; continue; }
      if (collection === 'greek_nt' && rel.includes(`nestle1904${path.sep}`)) { skipped++; continue; }
      if (/^code_/.test(base)) { skipped++; continue; } // separate modality (cross-modal-probe)
      if (base === 'manifest.csv' || base === 'README.md' || base === 'LICENSE' || base.startsWith('.')) { skipped++; continue; }

      if (collection === 'tanakh' && base.endsWith('.json')) {
        const text = tanakhJsonToText(file);
        if (!text || text.length < 200) { skipped++; continue; }
        const outName = `tanakh__${base.replace(/\.json$/, '.txt')}`;
        writeFileSync(path.join(out, outName), text, 'utf8');
        manifest.push({ collection, source: rel, out: outName, chars: text.length });
        written++;
        continue;
      }

      // greek_nt's only real plain-text books live under sblgnt/data/sblgnt/text/
      // — sblgnt also ships an XML tree and an "app" (apparatus) tree that
      // aren't running prose; nestle1904 is excluded above.
      if (collection === 'greek_nt' && !/sblgnt[\\/]data[\\/]sblgnt[\\/]text[\\/]/.test(rel)) { skipped++; continue; }

      if (base.endsWith('.txt')) {
        const text = readFileSync(file, 'utf8');
        if (text.trim().length < 200) { skipped++; continue; } // near-empty, not worth a fold pass
        const outName = `${collection}__${safeName}`;
        writeFileSync(path.join(out, outName), text, 'utf8');
        manifest.push({ collection, source: rel, out: outName, chars: text.length });
        written++;
        continue;
      }

      skipped++;
    }
  }

  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Consolidated ${written} text units into ${out} (${skipped} files skipped: non-prose/broken/duplicate/too-short).`);
}

main();
