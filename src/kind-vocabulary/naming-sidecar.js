// src/kind-vocabulary/naming-sidecar.js — naming pipeline for the
// kind-vocabulary channel (docs/03-prior-spec-kind-vocabulary.md §4).
//
// Naming discipline (§4):
//   1. Naming happens after publication, as a separate signed act, never
//      during induction. A kind is published nameless and gets a name
//      later, or never.
//   2. Every name carries provenance — who/what named it, when, against
//      which content_hash. Model-supplied names are marked as such.
//   3. A name is never an input. This is enforced structurally: this
//      sidecar is a genuinely separate module, keyed by kind id, and
//      src/kind-vocabulary/induction.js has no import edge into this file
//      (see the structural test in test/kind-vocabulary.test.js).
//
// This module never imports src/kind-vocabulary/induction.js — the read path
// only ever goes sidecar -> published-kind-id lookups, never the reverse.

const NAME_ENTRY_SCHEMA = 'KindExternalName@1';

export class NamingSidecarError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NamingSidecarError';
  }
}

// Creates a fresh, empty sidecar store keyed by kind id.
export function createNamingSidecar() {
  return { schema: NAME_ENTRY_SCHEMA, entries: {} };
}

// Records a name for a published kind. Requires the kind's content_hash so
// the name is pinned to the exact artifact it was assigned against (§4.2) —
// if the kind is republished with different evidence, the name entry becomes
// stale and must be re-signed, never silently carried forward.
export function nameKind(sidecar, {
  kindId,
  vocabularyContentHash,
  name,
  namedBy,
  namedAt = new Date().toISOString(),
  modelSupplied = false,
}) {
  if (!kindId || typeof kindId !== 'string') {
    throw new NamingSidecarError('nameKind requires a kindId');
  }
  if (!name || typeof name !== 'string') {
    throw new NamingSidecarError('nameKind requires a non-empty name');
  }
  if (!namedBy || typeof namedBy !== 'string') {
    throw new NamingSidecarError('nameKind requires namedBy (who/what named it)');
  }
  if (!vocabularyContentHash || typeof vocabularyContentHash !== 'string') {
    throw new NamingSidecarError('nameKind requires the content_hash of the vocabulary being named');
  }
  const provenance = `${modelSupplied ? 'model' : 'human'}, ${namedAt}, ${namedBy}, against ${vocabularyContentHash}`;
  return {
    ...sidecar,
    entries: {
      ...sidecar.entries,
      [kindId]: {
        external_name: name,
        external_name_provenance: provenance,
        vocabulary_content_hash: vocabularyContentHash,
        model_supplied: modelSupplied,
      },
    },
  };
}

// Merges sidecar names into a display copy of a KindVocabulary@1 payload.
// This is the one legitimate read path for the sidecar — an explicit,
// display-layer merge that happens after publication. It never runs inside
// induction or classification. A stale entry (vocabulary_content_hash does
// not match the payload's current content_hash) is dropped rather than
// silently applied, matching §4.2's "re-signed, never carried forward".
export function withDisplayNames(kindVocabularyPayload, sidecar) {
  const kinds = kindVocabularyPayload.kinds.map((kind) => {
    const entry = sidecar.entries[kind.id];
    if (!entry) return kind;
    if (entry.vocabulary_content_hash !== kindVocabularyPayload.content_hash) return kind;
    return {
      ...kind,
      external_name: entry.external_name,
      external_name_provenance: entry.external_name_provenance,
    };
  });
  return { ...kindVocabularyPayload, kinds };
}
