// src/kind-vocabulary/firewall.js — structural firewall for KindVocabulary@1
// (docs/03-prior-spec-kind-vocabulary.md §2.2). Two independent invariants:
//
//   1. provenance_expression is a program, not content: every node in the
//      AST must validate against the expression grammar below and must not
//      carry a free string literal (a quotation, proper noun, or claim).
//   2. no entity identity travels: propose_members / holdout_members /
//      members must never appear in a published artifact — they exist only
//      on the engine-internal EntityKindCandidate@1 during induction and are
//      stripped at publication (src/kind-vocabulary/induction.js).
//
// This module has no knowledge of naming — see src/kind-vocabulary/naming-sidecar.js
// for why that is a separate file with no import edge from induction.

import { canonicalJson, sha256Ref } from '../event.js';

const OP_PATTERN = /^[a-z][a-z0-9_]*$/;

export class FirewallViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FirewallViolationError';
  }
}

// ── §2.2 invariant 1: provenance_expression is an AST over channel indices ──
// A valid node is `{ op, args?, channel_index? }` where `op` matches
// OP_PATTERN and every arg is either another node or a plain number/boolean.
// A free string literal anywhere in the tree (as `op`, as an arg, or under
// any other key) is a firewall violation.
export function assertNoFreeStringLiteral(node, path = 'provenance_expression') {
  if (node === null || node === undefined) {
    throw new FirewallViolationError(`${path}: provenance_expression node must not be null/undefined`);
  }
  if (typeof node === 'string') {
    throw new FirewallViolationError(`${path}: free string literal "${node}" is not permitted in a provenance_expression`);
  }
  if (typeof node === 'number' || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => assertNoFreeStringLiteral(entry, `${path}[${index}]`));
    return;
  }
  if (typeof node !== 'object') {
    throw new FirewallViolationError(`${path}: unsupported provenance_expression node type ${typeof node}`);
  }
  if (typeof node.op !== 'string' || !OP_PATTERN.test(node.op)) {
    throw new FirewallViolationError(`${path}.op: "${node.op}" is not a valid expression-language operator`);
  }
  const allowedKeys = new Set(['op', 'args', 'channel_index']);
  for (const key of Object.keys(node)) {
    if (!allowedKeys.has(key)) {
      throw new FirewallViolationError(`${path}.${key}: unexpected key in provenance_expression node (only op, args, channel_index are allowed)`);
    }
  }
  if (node.channel_index !== undefined && (!Number.isInteger(node.channel_index) || node.channel_index < 0)) {
    throw new FirewallViolationError(`${path}.channel_index: must be a non-negative integer channel index`);
  }
  if (node.args !== undefined) {
    if (!Array.isArray(node.args)) {
      throw new FirewallViolationError(`${path}.args: must be an array`);
    }
    node.args.forEach((arg, index) => assertNoFreeStringLiteral(arg, `${path}.args[${index}]`));
  }
}

// ── §2.2 invariant 2: no member roster at publication ───────────────────────
const ROSTER_KEYS = ['propose_members', 'holdout_members', 'members'];

export function assertNoMemberRoster(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoMemberRoster(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of ROSTER_KEYS) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        throw new FirewallViolationError(`${path}.${key}: member roster present in a published KindVocabulary@1 artifact — must be stripped at publication`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      assertNoMemberRoster(entry, `${path}.${key}`);
    }
  }
}

// ── external_name is inert / display-only ────────────────────────────────
// This function exists so classification/matching code has an explicit,
// testable statement of intent: external_name (and its provenance string)
// must never participate in classifyEntity or any parameter-inheritance
// decision. Call it wherever a kind's engine-relevant fields are extracted.
export function stripDisplayOnlyFields(kind) {
  const { external_name, external_name_provenance, ...engineFields } = kind;
  return engineFields;
}

// ── whole-payload firewall check, used by publication and validation ────────
export function assertKindVocabularyFirewall(payload) {
  assertNoMemberRoster(payload);
  for (const kind of payload.kinds ?? []) {
    for (const parameter of kind.parameters ?? []) {
      if (parameter.provenance_expression !== undefined) {
        assertNoFreeStringLiteral(parameter.provenance_expression, `kind(${kind.id}).parameters(${parameter.id}).provenance_expression`);
      }
    }
  }
}

export function kindVocabularyContentHash(payload) {
  const clone = structuredClone(payload);
  delete clone.content_hash;
  return sha256Ref(canonicalJson(clone));
}

export async function validateKindVocabulary(payload, { requireCurrentHash = true } = {}) {
  if (!payload || payload.schema !== 'KindVocabulary@1') {
    throw new Error('KindVocabulary payload must declare schema: KindVocabulary@1');
  }
  assertKindVocabularyFirewall(payload);
  if (requireCurrentHash) {
    const expected = await kindVocabularyContentHash(payload);
    if (payload.content_hash !== expected) {
      throw new Error(`KindVocabulary content hash mismatch: expected ${expected}, got ${payload.content_hash}`);
    }
  }
  return payload;
}
