// src/kind-vocabulary/induction.js — publication pipeline for the
// kind-vocabulary channel (docs/03-prior-spec-kind-vocabulary.md §3, §4.1).
//
// STRUCTURAL INVARIANT (§4.3): this module must have NO import edge into
// src/kind-vocabulary/naming-sidecar.js. Naming happens after publication, as
// a separate signed act, never during induction — a kind is published
// nameless and gets a name later, or never. A name is never an input to
// induction; that is enforced here by the plain fact that this file cannot
// read the sidecar (see test/kind-vocabulary.test.js, the "naming pipeline
// has no read path into induction" structural test, which greps this file's
// imports).
//
// This module treats eoreader5's induceEntityKind/EntityKindCandidate@1 as an
// external, not-yet-stable contract (see the TODO below). What is genuinely
// implemented here — independent of that dependency — is: assembling a
// KindVocabulary@1 payload from already-produced candidate records, stripping
// the member roster that must never leave the engine, and computing a
// deterministic content_hash.

import { assertKindVocabularyFirewall, kindVocabularyContentHash } from './firewall.js';

// Strips the engine-internal-only fields off a single EntityKindCandidate@1-
// shaped record, leaving exactly the published Kind shape from
// schemas/kind-vocabulary.schema.json#/$defs/kind. propose_members and
// holdout_members exist on the candidate for audit during induction; they
// are never allowed to reach a published artifact.
export function publishedKindFromCandidate(candidate) {
  const {
    propose_members,
    holdout_members,
    members,
    splits, // per-seed audit detail used to compute isReady inputs; not part of the published Kind
    ...kind
  } = candidate;
  return kind;
}

// Assembles a full KindVocabulary@1 payload from a pocket descriptor and a
// list of EntityKindCandidate@1-shaped records that have already passed
// isReady (src/kind-vocabulary/ready.js). Computes content_hash last, over
// the fully-assembled payload minus content_hash itself, so republication
// with identical inputs is byte-for-byte identical (acceptance test 2).
export async function publishKindVocabulary({
  basisId,
  operatorEpoch,
  readerVersion,
  pocket,
  candidates,
}) {
  const payload = {
    schema: 'KindVocabulary@1',
    basis_id: basisId,
    operator_epoch: operatorEpoch,
    reader_version: readerVersion,
    content_hash: 'sha256:' + '0'.repeat(64),
    pocket,
    kinds: candidates.map(publishedKindFromCandidate),
  };
  assertKindVocabularyFirewall(payload);
  const { content_hash, ...withoutHash } = payload;
  const hash = await kindVocabularyContentHash(payload);
  return { ...withoutHash, content_hash: hash };
}

// TODO(eoreader5 04-engine-spec-entity-kinds.md): once induceEntityKind and
// EntityKindCandidate@1 are complete and released, replace the
// `candidates` parameter above with a real call into eoreader5's induction
// entry point (or a thin adapter that shapes its output into the
// EntityKindCandidate@1-like records this function already accepts). Until
// then, callers (and test/kind-vocabulary.test.js) construct candidates by
// hand as fixtures against this documented contract.
