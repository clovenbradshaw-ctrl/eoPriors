# Vendored from eoreader4.2

This directory is a verbatim copy of a subset of
[`clovenbradshaw-ctrl/eoreader4.2`](https://github.com/clovenbradshaw-ctrl/eoreader4.2),
vendored as a pinned read-only evaluation fixture (not fetched at runtime, not an npm dependency) for the same reason
`data/centroids-27.json` is vendored: a projection eoPriors declares
`reproduced` must never depend on an external repository being reachable or
unchanged (SPEC.md invariant 4).

```
source repo:   clovenbradshaw-ctrl/eoreader4.2
source commit: c568ca124a3ec08d8bcf8103af916135f4c7aa35 (2026-07-22)
source paths:  src/perceiver/parse/index.js
               src/perceiver/classify/index.js
               src/perceiver/referents/index.js
               (+ their full transitive closure of relative imports)
vendored into: eoPriors src/vendor/eoreader/, same relative paths, unmodified
package version at that commit: 0.1.0 (src/read.js's EXTRACTION_PROTOCOL)
```

## What's here and why

124 files, computed as the exact transitive closure of relative imports
starting from the three entry points above — traced mechanically (not
hand-picked) so nothing needed gets missed and nothing unneeded gets dragged
in. Confirmed at vendor time: **zero bare (npm) import specifiers** anywhere
in the closure, and no real (non-comment) use of browser-only globals
(`document`, `window`, `indexedDB`, `localStorage`) or `fetch` — the whole
subtree is portable, dependency-free ESM, safe to import from both the
browser surface (`index.html`, no build step, same dynamic-import pattern
eoPriors already uses for `data/centroids-27.json`) and Node.

Currently wired in (`src/read.js`): `perceiver/parse/index.js`'s
`parseText()` — real sentence segmentation, subject–verb–object claim
extraction, and coreference resolution, in place of `src/segment.js`'s regex
splitter.

Vendored but **not yet wired in**: `perceiver/classify/phasepost.js`'s
`createPhasepostClassifier` — a calibrated margin/floor/no-commit reader.
Deliberately not used in place of `src/compress.js`: its `classify()` returns
one top verdict per Ground/Figure/Pattern band, not the full 27-cell
distribution `measurement.schema.json` requires (invariant 5: "27 values,
not just the winner, always"). `src/compress.js` stays authoritative for
`observation.measured`; the classifier is a candidate for a *supplementary*
diagnostic later, not a replacement.

## Why the closure is 124 files, not ~5

`perceiver/parse/coref.js` imports one constant (`CONVERSATIONAL_CAP`) from
`turn/converse/index.js`, which — through `turn/converse/cast.js` and
`reference.js` — reaches back into the `perceiver/index.js` barrel and
`model/embed-hash.js` (a lightweight deterministic hash-based fallback
embedder, `measuresMeaning: false`, used only as a cold-start stand-in
before a real embedder warms — eoPriors' own pinned MiniLM embedder is what
actually gets used; `embed-hash.js` is present because it's part of the
closure, not because anything here calls it). This is a real, load-bearing
import cycle in the source project (its own files note the hazard), not a
byproduct of vendoring — importing `perceiver/parse/index.js` alone, live,
pulls in the same 122 files. Re-verify with:

```
node <trace-imports-script> <eoreader4.2 checkout>/src \
  src/perceiver/parse/index.js src/perceiver/classify/index.js src/perceiver/referents/index.js
```

(a small relative-import BFS; not checked in here, since it's a one-off
verification tool rather than something eoPriors runs.)

## Re-vendoring

Re-run the same trace against a newer eoreader4.2 commit, diff the file
list, and copy over any additions/changes preserving the exact relative
paths under this directory. Do not import `perceiver/index.js` or
`core/contracts.js` directly as a shortcut — both are barrels that pull in
substantially more (model backends, the full contract registry) than the
reading pipeline eoPriors actually uses.
