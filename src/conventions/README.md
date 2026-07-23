# Conventions (moved from eoreader4.2)

Ported from `eoreader4.2/src/core/conventions/` as part of the eoreader5
transition. Convention sets (learned register sediment, induced Pass-0
slots, corpus-inherited relation vocabulary, irregular verb morphology) are
eoPriors-owned per `eoreader5/docs/architecture.md` section 2.3 — the engine
consumes a pinned `PriorSnapshot`, it does not carry its own convention
ledger.

Self-contained: every file here only imports its siblings in this
directory. `test/conventions-battery.test.js` (adapted from eoreader4.2's
`tests/conventions-battery.test.js`) pins the register predicates, the
DEF·EVA·REC defeasibility loop, and the seed-free slot geometry.

Not moved: `tests/conventions-induce.test.js` stayed behind in eoreader4.2 —
it exercises `induceSlots` against `perceiver/parse`, a cross-faculty
integration test rather than a conventions-only one. eoreader5's
`perceive/parse` holon (ported separately) should grow its own induction
test against this package once both sides are wired.
