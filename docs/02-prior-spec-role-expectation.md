# The role-expectation channel — what a genre expects its apparatus to be

**Status:** proposal, P1 slice
**Consumed by:** `eoreader5` via `PriorSnapshot`
**Companion specs:** `01-engine-spec-apparatus-typing.md`, `03-app-spec-provenance-ring.md`
**Boundary:** `eoreader5/docs/priors-boundary.md`

## Purpose

`referent-role` is an optional PriorSnapshot channel that publishes genre-local
expectations for referent behavior by exemplar neighborhood. It sharpens the
engine's document-internal apparatus nulls without replacing them: when the
channel is absent, eoreader5 must continue typing referents from the document
alone.

## Payload

The channel artifact declares `RoleExpectation@1`. The payload is keyed by
`exemplar_id`, not by referent name, and contains only distributional moments,
null samples, readiness metadata, and ballast metadata. Fractional values are
stored as integer parts-per-million fields (`*_ppm`) so content hashing stays
byte-deterministic under the repository's no-float invariant.

A published payload must carry:

- `schema`, `basis_id`, `operator_epoch`, `content_hash`, and pinned
  `reader_version` identifiers;
- pocket id, version, source count, and date range;
- per-exemplar distributions for `attributive_share`, `coupling_dispersion`,
  `relative_mass`, and `apparatus_rate_ppm`;
- consolidation-built null samples;
- readiness evidence; and
- an ungated ballast fraction at or above its floor.

## Firewall

`RoleExpectation@1` is distribution-only. It must not contain citable source
content, referent names, pocket labels, titles, publication names, or any other
free string fields. The validator enforces this by allowing strings only in the
fixed identifier paths needed to pin schema, basis, epoch, content hash, reader
version, pocket identity, date range, and exemplar ids.

## Readiness and publication

An unready role-expectation channel is omitted from `PriorSnapshot.channels`.
Published payloads must be ready, must be append-only by pocket version, and
must include enough ballast to prevent salience-gated consolidation from
feeding a self-confirming apparatus loop.
