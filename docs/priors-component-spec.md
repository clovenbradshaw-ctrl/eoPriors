# eoPriors — Component Spec

**Layer:** priors (`github.com/clovenbradshaw-ctrl/eoPriors`)  
**Version:** 0.1  
**Companions:** `01-engine-spec.md` (normative boundary contracts), `03-app-spec.md`  
**Status:** allocation proposal.

## 0. What this layer is

Everything the system knows that did **not** come from the document currently being read.

The priors layer ships data, not behavior. It produces `Pocket` artifacts: versioned, hashed, distribution-only, firewalled. It has no runtime role in a read beyond being loaded.

## 1. The firewall

A pocket can affect **what is surprising**. It can never be quoted, cited, or surfaced as content.

Consequences:

- The prior inspector renders distributions only — never corpus text.
- Provenance may be retained for audit, but provenance is not content.
- Competency-corpus material fetched reactively at read time goes into a distinct store with the same firewall and a stricter gate. It is never citable and never auto-promoted to install-tier trust.

## 2. What a prior is

Not embeddings. The system already produces full meaning structure by actually reading things, so the prior is a distribution over **folds** — typed operators, terrains, stances, bonds, propositions — not over words or vectors.

Consequences:

1. It seeds all three Ground channels, not just Atmosphere: `priorMass` → Void, `priorBond` → Field, `priorProp` → Atmosphere.
2. It is content-auditable in the system vocabulary instead of a cosine score.
3. It is natively omnimodal because folds are modality-blind.

Pockets declare `reader_version`; the engine refuses major-version mismatches. Pockets need regeneration when the reader changes.

## 3. Exemplar basis

Everything is compressed against 100 exemplars selected through the pinned `eo-lexical-analysis-2.0` basis, not hand-picked.

Requirements:

- Basis membership is by id + hash. Exemplar text never ships.
- The basis is versioned with the pocket.
- A pocket declares its basis explicitly. Pockets on different bases are not comparable and must not be mixed silently.

## 4. Pocket registry

The registry is many narrow, genre-scoped pockets rather than one universal corpus. Each entry is versioned, hashed, date-scoped, and includes scope, provenance, readiness, size, and basis identity.

Coverage breadth is a correctness property: pockets should include Global South, indigenous, folk wisdom, Western canon, civic/documentary, and non-text traditions where possible.

## 5. Readiness and reactive harvesting

Readiness is reported per channel using convergence, Good-Turing singleton rate, and `deriveNull` thresholds. A pocket reports unready per channel rather than returning a thin distribution.

Reactive harvest may fill an unready projection-time channel only as a deliberate named trigger. Fetched material goes to a competency-corpus store, is held to a stricter gate, is excluded from readiness accounting until it clears that gate, and is never auto-promoted to install-tier trust.

## 6. Consolidation and slow dreaming

Admission, consolidation, and interpretation are distinct readings:

| Reading | When | Reversible? | Prior-weight |
|---|---|---|---|
| Admission | at ingestion | no | prior-light |
| Consolidation | at install + dream cycle | yes, as new version | full |
| Interpretation | at projection | yes, per lens | full |

Dreaming applies replay to Ground. Dream cycles are append-only versions, and every cycle must record a non-zero ungated ballast fraction from material such as the typed-discard log.

## 7. Multi-scale

Run multiple pockets simultaneously:

1. surprising relative to this document;
2. surprising relative to its genre;
3. surprising relative to everything the system has ever read.

The signal is in disagreement across scales.

## 8. Transport and storage

Transport reuses `net.js` proxy forms. Hash-verify before folding, fold client-side only, store OPFS binary/columnar artifacts, require `navigator.storage.persist()`, and require export because OPFS is origin-private.

## 9. Write paths

Human and AI-agent contributions both go through the n8n chain-head gateway and the same validation gate. The ledger is append-only observations plus deterministic projection into priors. Agents propose observations; the kernel disposes.

## 10. Build order

1. Pocket artifact + refusal on `reader_version` mismatch.
2. Consolidation pipeline.
3. Readiness measurement.
4. Registry with 3–5 heterogeneous pockets.
5. Prior inspector, distributions only.
6. Dream cycle with ungated ballast and append-only versioning.
7. Reactive harvest last.

## 11. Invariants

- No pocket payload contains renderable source text.
- Every pocket load appears in the ledger with id + version + hash.
- A mismatched `reader_version` is refused loudly.
- Dream cycles never mutate a version in place.
- Every dream cycle records a non-zero ballast fraction.
- Registry aggregate scope is reported visibly.
