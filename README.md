# eoPriors

An append-only ledger of observations about source material, compressed
against a constructed exemplar basis. Two writers — a human through
`index.html`, an AI agent through the same gateway — submit through one
schema-validated endpoint and cannot write anything else.

**Read [`SPEC.md`](SPEC.md) first.** It is the full design and is
authoritative; this file is only a map and a quick start.

## Layout

- `index.html` — the static reader/ingest surface and basis inspector (§9). No build step.
- `src/` — ESM modules shared by the browser surface, an agent, and the build workflow (§3).
- `schemas/` — JSON Schema for every event/artifact shape (§4, §5, §7).
- `data/` — the vendored eo-lexical-analysis-2.0 phasepost instrument: 27 centroid vectors + their cell metadata.
- `config/` — library/rights/emergence policy, and the exemplar-basis pointer (CODEOWNERS-gated).
- `batches/` — the ledger itself: immutable, create-only, one file per submission (§2 invariant 3).
- `projections/`, `artifacts/` — deterministic, disposable rebuilds of the ledger (§2 invariant 1). Never hand-edit these; `npm run build:projection` (or the `build-projection` GitHub Action) is the only writer.
- `scripts/` — the Node-side glue between the filesystem and `src/replay.js`'s pure projection logic.

## The gateway

The `eoPriors — batch ingestion gateway` n8n workflow is already built and
deployed independently of this repo (§8) — nothing here starts or configures
it. `index.html`'s "gateway base URL" field defaults to the live deployment
(`https://n8n.intelechia.com/webhook`); override it there for a local or
alternate gateway.

## Running locally

```sh
npm ci
npm test                    # unit tests for src/*.js
npm run validate:batches    # CI check: every batch under batches/** is well-formed (§12)
npm run build:projection    # rebuild projections/ + artifacts/ from the current ledger
npm run verify:determinism  # confirm a clean rebuild matches what's published (§11)
```

`index.html` has no build step — open it via any static file server
(`python3 -m http.server`, GitHub Pages, etc.) rather than `file://`, since
its embedding client and OPFS cache need a real origin.
