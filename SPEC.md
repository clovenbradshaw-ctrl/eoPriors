# eoPriors — Master Specification
**Status:** v1, consolidated. Supersedes the original Shadow Library
draft and the exemplar-basis addendum as separate documents — both are
folded in here with the changes worked out since. This is the document
to hand an AI coder, or to keep as `SPEC.md` in the repo.
**Repository:** `github.com/clovenbradshaw-ctrl/eoPriors`
**Gateway:** the `eoPriors — batch ingestion gateway` n8n workflow —
already built. Three endpoints, password-gated, described in §8.
**Two writers, one contract:** a human through a static HTML surface,
and an AI agent. Both submit through the same endpoint, the same
schema, the same validation. Neither can write anything else.
---
## 0. The architecture, in one paragraph
An append-only ledger of observations about source material is the
system of record. Two priors exist before any projection runs: an
inherited phasepost classifier (`eo-lexical-analysis-2.0`), and a
constructed **exemplar basis** — 100 texts selected, not declared, by
scoring a candidate pool against that classifier for coverage of the
27-cell space. Everything ingested afterward is compressed against the
basis. Where compression saves across observations, Figures condense.
Where Figures recur and survive holdout, Patterns condense. Where
residuals recur across Figures and Patterns, Ground holons condense —
and may, through a versioned human-gated event, propose a replacement
for the basis itself. The current library is never edited. It is
rebuilt, deterministically, from the ledger.
---
## 1. Terminology (fixing a collision from the draft)
Three distinct things were at risk of sharing one name. They don't:
| term | what it is | who makes it |
|---|---|---|
| **exemplar basis** | 100 texts + selection provenance; a Lens's ground | constructed once per basis, human-gated |
| **Ground channels** | `priorMass` / `priorBond` / `priorProp` — the live computational seeding folded from a basis | derived automatically from an active basis |
| **compressor pack** | compiled artifact (compressors, calibrations, fingerprints) built from a *projection* | rebuilt by every projection run, disposable |
The base draft called the third thing a "prior pack." That word is
retired here — every other prior-shaped thing in this system already
uses "prior," and the collision was real.
---
## 2. Governing invariants
1. **The ledger is canonical.** Everything else — indexes, holons,
   compressor packs, the basis Ground channels — is a deterministic,
   disposable projection of it. Deleting all derived state and
   replaying the ledger must recreate it exactly.
2. **Ordering is a DAG, not a sequencer.** Events carry causal `inputs`
   (event IDs they depend on). Canonical order is a deterministic
   topological sort over that DAG, tie-broken by `event_id`, computed
   at projection time. There is no monotonically-assigned
   `ledger_position` and no trusted numbering service — that would
   require a central sequencer arbitrating every writer, which neither
   a solo static app nor an occasionally-online agent can depend on.
   Two batches submitted seconds apart, from two different writers,
   converge without coordination.
3. **Batches are the atomic, immutable unit — not individual events.**
   One file per event was considered and rejected: at real ingestion
   volume it's tens of thousands of files per source, which degrades
   Git and blows past GitHub Pages' size ceiling for no benefit batches
   don't already provide. A batch is `batches/<yyyy-mm>/<batch-id>.json`,
   written once, by a **create-only** PUT — no blob sha supplied, so
   GitHub itself refuses an overwrite. Immutability is enforced by the
   API, not by a policy document.
4. **Projections are deterministic, in one of two declared grades.**
   *Reproduced*: identical ledger + policy + classifier + embedding
   model/version + algorithm version yields byte-identical output.
   *Attested*: one input (typically an externally-hosted embedding call,
   or a frontier-model judgment) is not independently regenerable, so
   the projection is verifiable against its recorded inputs but not
   rebuildable from scratch. Every manifest states which grade it is.
   Nothing is allowed to claim "reproduced" while depending on an
   unpinned or nondeterministic call.
5. **No manual phasepost assignment, ever.** Every phasepost claim
   comes from a run of `eo-lexical-analysis-2.0`, recorded in full
   (27 values, not just the winner). This is the rule most likely to be
   quietly violated under deadline pressure — it is enforced in CI
   (§12), not left as a norm.
6. **Holons are projected, never asserted.** An agent or a human may
   propose that observations belong together. Only the projector, given
   the current evidence and the versioned emergence rules, decides
   whether a holon exists in current state.
7. **Corrections are new events, not edits.** `event.retracted`,
   `event.superseded`, `observation.invalidated`, and
   `selector.corrected` append; nothing already in the ledger is ever
   rewritten in place.
8. **The discard ledger is first-class, not an afterthought.** The
   original draft had a path for something admitted and later rejected
   (`observation.invalidated`) but nothing for a span the salience gate
   *declined at ingestion*. That's the gap that matters most given this
   system's own stated identity — accountable-loss extraction. Add
   `observation.declined`, retained with enough fidelity to re-fold,
   carrying whatever competence-gain measurement the gate computed. A
   discard that can't be re-evaluated once the basis or the priors have
   moved isn't accountable, it's just quiet.
9. **Every claim is provenance-addressable.** For any holon or
   compressor-pack entry: which observations support it, which
   challenge it, which URIs, which selectors, which measurements, which
   basis, which projector version, at what point it entered current
   state. If a system can't answer this for a given output, that output
   doesn't ship.
10. **Basis construction is the one privileged act in the system.**
    Everywhere else, an agent proposes and the projector disposes. The
    exemplar basis sets the ground everything else is measured against,
    so activating one cannot be something that happens incidentally
    inside routine ingestion. Full governance in §5.5.
11. **`projections/current/` is a convenience, not a truth claim.**
    With multiple lenses (multiple bases) live simultaneously, there is
    no single canonical "current state" — only a projection relative to
    a standpoint. The `current/` pointer exists because a reader needs
    *some* default to open. It is documented everywhere as a default,
    never presented as the library's one true state, and every artifact
    it points to still carries its own basis/lens identity.
---
## 3. Repository layout
```text
eoPriors/
├── index.html                    ← the static surface (§9)
├── src/                          ← ESM, no build step; imported by both
│   ├── event.js                  ← canonical JSON + hashing (browser & Action)
│   ├── segment.js                ← observation segmentation
│   ├── embed.js                  ← embedding client (pinned model/version)
│   ├── compress.js               ← compression against an active basis
│   ├── emergence.js              ← Figure/Pattern/Ground projection
│   ├── replay.js                 ← DAG topological sort + projection build
│   └── basis-select.js           ← exemplar selection algorithm
│
├── schemas/
│   ├── event.schema.json
│   ├── source.schema.json
│   ├── selector.schema.json
│   ├── measurement.schema.json
│   ├── exemplar-basis.schema.json
│   └── projection-manifest.schema.json
│
├── config/
│   ├── library.yaml
│   ├── rights-policy.yaml
│   ├── emergence-policy.yaml
│   └── exemplar-basis/
│       ├── active.json           ← pointer to the live basis_id (CODEOWNERS-gated)
│       └── candidates/           ← proposed-but-not-activated selections
│
├── batches/
│   └── <yyyy-mm>/<batch-id>.json ← immutable, create-only, one per submission
│
├── projections/
│   ├── current/
│   │   ├── manifest.json         ← lists live lenses/bases + head; §2 invariant 11
│   │   └── <lens-id>/
│   │       ├── manifest.json
│   │       ├── salience.json     ← small, always fetched first
│   │       ├── holons/<xx>/<holon-id>.json   ← hash-prefix sharded
│   │       └── diff.json
│   └── snapshots/<projection-id>/
│
├── artifacts/
│   └── compressor-packs/<projection-id>/
│
└── .github/
    ├── workflows/
    │   ├── build-projection.yml  ← triggers on push: batches/**
    │   └── verify-determinism.yml
    └── CODEOWNERS                ← guards config/, schemas/, config/exemplar-basis/
```
No `ledger/` directory of per-event files (invariant 3). No merge-queue
PR ceremony for routine batches — both writers land on `main` through
the gateway; only changes under `config/`, `schemas/`, or
`config/exemplar-basis/` require a human-reviewed PR, enforced by
CODEOWNERS.
---
## 4. Event vocabulary
### 4.1 Common envelope
```json
{
  "spec_version": "1.0.0",
  "event_type": "observation.measured",
  "event_id": "sha256:...",
  "occurred_at": "2026-07-22T17:00:00Z",
  "actor": { "type": "agent", "id": "agent:eo-ingestor", "version": "0.4.0" },
  "run": { "run_id": "uuid:...", "batch_id": "uuid:...", "configuration_hash": "sha256:..." },
  "inputs": [],
  "payload": {}
}
```
`event_id` is `sha256(canonical_json(envelope minus event_id))`. No
floats anywhere in `payload` — ppm or scaled integers only, enforced by
the gateway validator, because canonicalization has to be stable across
runtimes (invariant 4).
### 4.2 Writable through the public gateway
```text
source.discovered · source.identity.resolved · source.rights.assessed
source.fetch.observed · source.archive.requested · source.archive.confirmed
observation.created · observation.representation.computed
observation.measured · observation.stability.measured
observation.invalidated · observation.declined · observation.flagged
evidence.support.observed · evidence.challenge.observed
evidence.equivalence.proposed · evidence.distinction.proposed
evidence.relation.observed
event.retracted · event.superseded
exemplar.candidate.scored · exemplar.basis.selected
```
### 4.3 Written only by the projector / build workflow
```text
holon.emerged · holon.split.projected · holon.merge.projected · holon.dissolved
projection.completed · projection.published
policy.activated · projector.activated
exemplar.basis.activated
compressor_pack.activated   (renamed from prior_pack.activated — see §1)
```
The gateway's allowlist (§8) contains only §4.2. §4.3 event types are
not filtered out of a broader list — they are simply never in it, so a
batch containing one is rejected the same way a malformed batch is,
not specially.
### 4.4 `observation.measured`, with basis identity
```json
{
  "event_type": "observation.measured",
  "payload": {
    "observation_id": "observation:sha256:...",
    "measurement_id": "measurement:sha256:...",
    "basis_id": "exemplar-basis:sha256:...",
    "measurement_protocol": "eo-compression@1.0.0",
    "phasepost_measurements": { "...all 27, including zeros...": {} },
    "diagnostics": { "entropy_microunits": 0, "total_supported_amplitude": 0 }
  }
}
```
A projection that mixes measurements from two `basis_id`s without
declaring both lenses is invalid (invariant 11's teeth).
### 4.5 `observation.declined` — the discard ledger
```json
{
  "event_type": "observation.declined",
  "payload": {
    "candidate_span_selector": { "...": "..." },
    "source_id": "source:sha256:...",
    "decline_reason": "below_salience_threshold",
    "competence_gain_ppm": 0,
    "refold_material": { "representation_ids": [], "artifact_uri": null },
    "gate_version": "salience-gate@1.0.0"
  }
}
```
Retained with enough material to re-fold later against a drifted basis
— a hash alone would satisfy nothing (invariant 8).
### 4.6 `observation.flagged` — the non-compression channel
```json
{
  "event_type": "observation.flagged",
  "payload": {
    "observation_id": "observation:sha256:...",
    "flagged_by": "human",
    "reason": "free text, short",
    "weight_ppm": 1000000
  }
}
```
For the singular, non-recurring, decisive span — the one wrongful
lockout that will never compress well against anything, because
compression rewards recurrence and this doesn't repeat. Carried as
evidence that does not decay when the salience gate would have declined
it. This is the SIG operator, not CON — a flag, not a fold.
---
## 5. Exemplar basis construction
### 5.1 Candidate pool
Any assembled set of texts — curated corpus, prior ingestion history, a
hand-supplied list. Evented (`source.discovered` per candidate) so a
basis's origin pool is always reconstructable even though most
candidates are discarded.
### 5.2 Scoring
Per candidate: embed (model + version pinned), score against all 27
phaseposts via `eo-lexical-analysis-2.0`, record the full distribution.
Wrapped as `exemplar.candidate.scored`, structurally an
`observation.measured` where the candidate is its own source.
### 5.3 Selection
`exemplar-selection@1.0.0`: greedy admission — for each pass, admit the
candidate that most reduces the largest remaining coverage gap across
the 27 cells, capped per-cell so no cell crowds out the others.
Versioned, named, deterministic given its inputs. If the embedding step
is nondeterministic or externally hosted, the resulting basis is marked
`attested`, not `reproduced` (invariant 4).
### 5.4 Ledger events
`exemplar.basis.selected` — the proposal, batch-writable, cheap to
discard if coverage is bad:
```json
{
  "event_type": "exemplar.basis.selected",
  "payload": {
    "candidate_pool_hash": "sha256:...",
    "classifier": "eo-lexical-analysis-2.0",
    "embedding_model": "name@version",
    "selection_algorithm": "exemplar-selection@1.0.0",
    "selected": [ { "candidate_id": "...", "phasepost_scores": {}, "admitted_for_cell": "..." } ],
    "coverage": { "cells_covered": 27, "min_cell_confidence_ppm": 0, "per_cell_count": {} },
    "determinism": "reproduced"
  }
}
```
`exemplar.basis.activated` — promotes a selected set to the live Lens
basis. **Not batch-writable at all** (§4.3). Written only by the build
workflow, only after a human-reviewed PR against
`config/exemplar-basis/active.json`.
### 5.5 Governance
* An agent may submit `exemplar.basis.selected`. It may never submit
  `.activated` — the type doesn't exist in the gateway's vocabulary.
* CODEOWNERS on `config/exemplar-basis/` requires human review before
  any PR touching the active basis pointer merges.
* No batch may contain both a `.selected` proposal and any routine
  ingestion event — basis proposals are reviewed in isolation.
* A basis is a Lens (`lens.js`, first-class object, already built). A
  second basis from a different candidate pool is a second Lens. Two
  lenses disagreeing on the same source is the signal, not an error —
  it's the same mechanism as the document/genre/global multi-scale
  disagreement, run at the basis level.
---
## 6. Compression and emergence
Unchanged from the base architecture, with `basis_id` threaded through:
```text
gain(H) = Σ DL(E_i) − [DL(H) + Σ DL(E_i | H)]
```
Figures (Entity, Link, Lens-candidate) condense where joint description
beats separate description. Patterns (Kind, Network, Paradigm) condense
from Figures that recur with independent support and survive
source-holdout. Ground holons condense from residuals recurring across
Figures and Patterns — and may be proposed (never installed) as a
future basis candidate via `exemplar.basis.candidate_proposed`, closing
the loop: the system can nominate its own next ground, but only a
human-reviewed PR installs it.
Holon identity across projection rebuilds: max-overlap on
supporting-evidence-event-id sets, above a versioned threshold; below
it, a `holon.identity.rebound` audit event records the ambiguous match
rather than silently churning the ID.
---
## 7. Projection
Projection identity is a hash of ledger head (the DAG's current
frontier, not a sequencer position) + projector version + policy hashes
+ basis IDs in scope + configuration. Manifest carries the determinism
grade (§2 invariant 4). `projections/current/` is rebuilt atomically per
invariant 11 — a default view, documented as such, never the only one.
---
## 8. The gateway (already built)
Three endpoints, n8n-hosted, password-gated:
| endpoint | method | auth | purpose |
|---|---|---|---|
| `/webhook/eo/v1/batches` | POST | password | the only public write surface |
| `/webhook/eo/v1/head/publish` | POST | password (separate) | build workflow only |
| `/webhook/eo/v1/head` | GET | none | cache of `projections/current/manifest.json`, always returns a `fallback_url` to the raw git manifest |
Validator, per batch: envelope shape, `event_type` in §4.2's allowlist
only, no `ledger_position` present, no floats in any `payload`,
recomputed `event_id` must match the submitted one, no duplicate IDs
within the batch. On pass: one create-only `PUT` to
`batches/<yyyy-mm>/<batch-id>.json`. GitHub's 422 on an existing path is
read as `duplicate`, not an error — that response *is* the immutability
guarantee firing.
Both writers — human surface and agent — currently share one password
gate. That's an honest simplification for a solo operator, not a
long-term identity system: the ledger still distinguishes them by
`actor`, but the gate itself can't yet tell a browser tab from a script.
If a second person or a second untrusted agent ever writes here, this
is the one place that needs to change — per-actor tokens, not a shared
secret.
---
## 9. The static HTML surface
One `index.html`, no server-rendered state, three views.
**Basis inspector (read-only).** Fetches the active basis manifest,
renders the 27-cell coverage grid. No edit affordance exists — per
invariant 10, basis-editing is structurally absent from this surface,
not merely disabled.
**Reader / ingest.**
```text
paste URL or drop file
  → source.fetch.observed
  → segment (src/segment.js — same segmenter the agent uses)
  → embed (src/embed.js — same pinned model as basis construction)
  → compress against the cached basis (src/compress.js)
  → render salience: which spans are surprising relative to the 100
  → reader flags a span (observation.flagged) or leaves it —
    the compression measurement is already logged either way
  → "submit" bundles everything touched into one batch,
    POSTs to /webhook/eo/v1/batches
```
**Basis cache.** The basis's embeddings/fold-signatures — not the 100
source texts themselves — are fetched once per `basis_id`, hashed, and
stored in OPFS. Reused across sessions until the manifest reports a new
`basis_id`. Password is typed once per session and held in memory only
— never `localStorage`.
The surface never writes to `ledger/`, `projections/`, or
`config/exemplar-basis/`. It emits exactly one thing: a batch, through
the one gateway, same as the agent.
---
## 10. AI agent operating instructions
*(Hand this section directly to an ingestion or coding agent.)*
You are a writer against the eoPriors ledger. You submit batches
through `POST /webhook/eo/v1/batches`. You hold no credential that
reaches `ledger/`, `projections/`, `artifacts/`, or
`config/exemplar-basis/` directly.
**You may:** discover and propose sources (`source.discovered`,
`.identity.resolved`, `.rights.assessed`, `.fetch.observed`); create
observations with a selector (`observation.created`); compute
representations and compress them against the **currently active**
basis, named by `basis_id` (`observation.measured`,
`.stability.measured`); propose evidence relationships
(`evidence.support.observed`, `.challenge.observed`,
`.equivalence.proposed`, `.distinction.proposed`); propose a new
exemplar candidate set for human review (`exemplar.basis.selected`
only); retract or supersede your own prior events; flag a decisive
span independent of its compression score (`observation.flagged`).
**You may not:** submit `exemplar.basis.activated`, `holon.emerged`,
`projection.completed`, `compressor_pack.activated`, or any §4.3 event
— the gateway rejects these on type alone, don't attempt them; assign a
`ledger_position` — ordering is the projector's job; invent a phasepost
label by judgment — every claim runs through
`eo-lexical-analysis-2.0`, never guessed; treat your own prose
interpretation as a measurement; alter a rejected batch's content to
force a new `event_id` past validation and resend under the same
`batch_id` — a validation failure is information about the batch, not
an obstacle; submit on another actor's behalf or omit your own identity.
**Every event carries**, in `actor`: your name, version, model
identifier, and a `run_id` shared across one working session. This is
how a human reviewing a projection diff tells your proposals apart from
a compression finding or another agent's work.
**Submission loop:**
1. Assemble events; compute `event_id` yourself via the same
   canonical-JSON hashing the gateway validates against (`src/event.js`)
   — get it right before sending, since a mismatch is a hard rejection.
2. Batch under one `batch_id` (uuid, generated by you).
3. `POST` with your password and the batch body.
4. `202 accepted` — your batch is now immutable history. **No prior has
   changed yet.** That happens only when the projection workflow next
   runs. Do not act as though your proposal is settled.
5. `409 duplicate` — this `batch_id` already landed; safe to stop.
6. Any other `4xx` — rejected before touching GitHub; read `error`, fix
   the batch, resubmit under a **new** `batch_id`.
You are not the projector. You observe, measure against the basis
you're given, and propose. The replay decides what the evidence
warrants.
---
## 11. GitHub Action / projector
Triggers on `push: paths: ['batches/**']`, `paths-ignore: ['projections/**']`,
with a concurrency group to prevent self-triggering:
```text
load policy + active basis pointer (config/exemplar-basis/active.json)
  → resolve valid sources/observations (apply retractions, supersessions)
  → topologically sort the event DAG (invariant 2)
  → compute measurements against the active basis(es)
  → compute Figure → Pattern → Ground holons
  → build indexes, salience.json, compressor pack
  → verify determinism grade against the manifest's declared grade
  → write projections/current/<lens-id>/, snapshot under projections/snapshots/<projection-id>/
  → POST /webhook/eo/v1/head/publish with the new manifest summary
```
`build-projection.yml` handles routine batches. `verify-determinism.yml`
runs on a schedule, replaying from a clean checkout and diffing against
the published projection — the enforcement mechanism for invariant 1.
---
## 12. Security and CI
* No broad GitHub token ever reaches the browser — the fine-grained PAT
  lives in n8n's credential store, scoped to Contents read/write on
  this repo only.
* CODEOWNERS on `schemas/`, `config/`, `config/exemplar-basis/`, and
  `.github/` — any PR touching these requires human review and may
  contain no batch files (no silent widening alongside a policy change).
* CI rejects any batch PR (agent path) or gateway submission (both
  paths) containing a §4.3 event type, a `ledger_position` field, a
  float in `payload`, or a mismatched `event_id`.
* CI runs a phasepost-assignment check: any event claiming a phasepost
  value must trace to a `measurement_protocol` call, not a literal.
* Least-privilege GitHub App / PAT permissions; secret scanning enabled;
  no remote source content is ever executed, only measured.
---
## 13. Acceptance criteria
1. An AI agent can submit a batch without any ledger-path credential.
2. The static surface can submit the same batch shape through the same
   endpoint.
3. Two writers submitting within the same second land in two files with
   no ordering claim between them; the projector's DAG sort resolves
   order deterministically at build time.
4. No existing batch file can be overwritten — verified by the
   gateway's create-only PUT and a CI test asserting the 422 path.
5. Current projected state can be deleted entirely and rebuilt from the
   ledger, byte-identical for any projection declared `reproduced`.
6. Every projected observation resolves to a source URI, selector, and
   basis_id.
7. Phasepost measurements retain all 27 values, always.
8. A projection manifest pins ledger head, projector version, policy
   hashes, and every basis_id in scope.
9. A projection diff explains what an import changed.
10. Retractions alter current state without erasing history.
11. `exemplar.basis.activated` cannot be reached through the public
    gateway under any batch content — type-level exclusion, not a
    runtime check.
12. Only the build workflow writes `projections/`, `artifacts/`, and
    the head cache.
13. Any projected claim answers "why does this exist," resolving to
    source URIs and evidence lineage, never to an unlabeled assertion.
14. A declined-at-ingestion span (`observation.declined`) can be
    re-folded later against a drifted basis, not merely referenced by
    hash.
15. No generated summary or manual label is required for a holon's
    identity.
16. A reader can open a source and see a gloss with per-span provenance
    — the actual MVP, not just a ledger that no one reads.
17. Given a fixed candidate pool, classifier version, embedding model
    version, and algorithm version, `exemplar.basis.selected` reproduces
    the same 100 candidates.
18. Every `observation.measured` event declares its `basis_id`; a
    projection mixing undeclared bases fails its own consistency check.
19. The static surface issues writes only to `batches/` — never
    anywhere else, verified the same way for both writers.
20. `projections/current/` is documented, everywhere it appears, as a
    default view rather than the library's one true state.
