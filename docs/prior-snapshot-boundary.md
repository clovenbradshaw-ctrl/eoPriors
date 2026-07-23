# PriorSnapshot@1 boundary

`PriorSnapshot@1` is the EOReader5-facing release boundary for eoPriors. A
snapshot is declarative, immutable, content-addressed data that cites governed
packs, rights, compatibility, corpus splits, policies, algorithms, and basis
lineage. Catalog pointers may move, but snapshot bytes and IDs must not.

The boundary is intentionally non-ontological:

- eoPriors records reusable empirical expectations: proposals, calibration
  distributions, exemplars, labels, effects, rights, provenance, and evaluation
  evidence.
- EOReader5 decides what the current source supports now, including no-prior
  and source-local-null runs.
- eoreaderapp resolves an exact pinned snapshot and renders results without
  treating a mutable catalog pointer as a prior.

Legacy `priors/corpus-prior*.json` files remain reproducible text/eoreader4.2
history and are explicitly scoped as experimental. They are not the default
EOReader5 cross-modal prior and cannot become release-grade while basis lineage
is unresolved.
