# The kind-vocabulary channel — corpus-scale entity kinds, evidence-only

**Status:** proposal, P1 slice
**Consumed by:** `eoreader5` via `PriorSnapshot`
**Companion specs:** `eoreader5/docs/04-engine-spec-entity-kinds.md` (normative:
`EntityHistory@1`, `ParameterHypothesis@1`, `EntityKindCandidate@1`,
`induceEntityKind`, the individuation gate), `02-prior-spec-role-expectation.md`
**Boundary:** `docs/prior-snapshot-boundary.md`

`04-engine-spec-entity-kinds.md` is being built in parallel by another agent
and may not exist yet in `eoreader5`. This spec and its implementation do not
import from it or block on it; every module here is built and tested against
the documented interface as a stable contract, using hand-built fixtures that
mimic `EntityKindCandidate@1`'s shape.

## Purpose

`kind-vocabulary` is an optional `PriorSnapshot` channel that publishes a
pocket's induced vocabulary of entity kinds — parameterized, evidence-backed,
and reader-version-pinned — without ever carrying entity identity, source
text, or a member roster into the published artifact.

## Payload

The channel artifact declares `KindVocabulary@1`
(`schemas/kind-vocabulary.schema.json`). Top-level fields: `schema`,
`basis_id`, `operator_epoch`, `reader_version`, `content_hash`, `pocket`
(`id`, `label`, `n_sources`, `n_entities`, `date_range`), and `kinds[]`.

Each kind carries `id`, `vocabulary`, `parameters` (`ParameterHypothesis@1`
records, treated as opaque pass-through — this layer does not interpret their
internals), `support_fraction`, `transfer_gain`, `membership_null`,
`relative_effect`, `n_propose`, `n_holdout`, and the optional naming pair
`external_name` / `external_name_provenance`.

## §2.2 The firewall (`src/kind-vocabulary/firewall.js`)

Two independent structural invariants, checked on every publish and every
validate:

1. **No free string literal in `provenance_expression`.** Every
   `ParameterHypothesis@1.provenance_expression` node must validate against a
   small expression-language grammar over channel indices
   (`{ op, args?, channel_index? }`) — never a quotation, proper noun, or
   other free-text claim.
2. **No member roster at publication.** `propose_members`, `holdout_members`,
   and `members` exist only on the engine-internal `EntityKindCandidate@1`
   during induction; they must never appear in a published artifact.

## §3.3 Reader-version coupling (`src/kind-vocabulary/reader-version.js`)

`validateReaderVersion(payload, readerVersion)` is a pure predicate: a channel
built for one `reader_version` must be refused, loudly and by name, by an
engine running a different one.

## §3.4 Readiness (`src/kind-vocabulary/ready.js`)

`isReady(candidateChannel, thresholds)` checks, all pure and reason-labeled:

- median `n_steps` sits comfortably above the 9-step floor;
- the kind recovers across at least 3 independent seeded splits;
- held-out transfer gain clears the membership null in every split;
- the relative-effect floor is met on holdout (not fit) data; and
- coreference fragmentation sits below the reported threshold.

An unready channel is omitted from `PriorSnapshot.channels` entirely — it is
never published half-ready.

## §4 Naming pipeline separation

Induction/publication (`src/kind-vocabulary/induction.js`) and the naming
sidecar (`src/kind-vocabulary/naming-sidecar.js`) are two separate modules.
Naming happens after publication, as a separate, provenance-carrying act,
never during induction — a kind is published nameless and named later, or
never. `external_name` is display-only: nothing in matching or classification
logic may read it. The induction module has no import edge into the naming
sidecar; this is enforced structurally by
`test/kind-vocabulary.test.js`, which statically scans the induction module's
imports.

## §6 Acceptance

See `test/kind-vocabulary.test.js`. Acceptance item 4 (a full induction run
against real `eoreader5` output) is skipped with a `TODO` pending
`04-engine-spec-entity-kinds.md` landing — this layer does not fake induction.
