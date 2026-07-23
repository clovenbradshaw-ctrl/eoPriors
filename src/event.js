// src/event.js — canonical JSON + hashing, shared byte-for-byte by the browser
// surface and any agent (SPEC.md §4.1, §10). An event_id mismatch is a hard
// gateway rejection, so this is the one module both writers must agree with
// exactly — no reimplementing this logic anywhere else.
//
// event_id = sha256(canonical_json(envelope minus event_id))

// ── The two allowlists (SPEC.md §4.2 / §4.3) ────────────────────────────────
// Mirrors schemas/event.schema.json's gatewayWritableEventType /
// projectorOnlyEventType enums exactly — the schema and this file must not
// drift; a batch containing a §4.3 type is rejected on type alone (§12), not
// filtered out of one combined list.
export const GATEWAY_WRITABLE_EVENT_TYPES = Object.freeze([
  'source.discovered', 'source.identity.resolved', 'source.rights.assessed',
  'source.fetch.observed', 'source.archive.requested', 'source.archive.confirmed',
  'observation.created', 'observation.representation.computed',
  'observation.measured', 'observation.stability.measured',
  'observation.invalidated', 'observation.declined', 'observation.flagged',
  'evidence.support.observed', 'evidence.challenge.observed',
  'evidence.equivalence.proposed', 'evidence.distinction.proposed',
  'evidence.relation.observed',
  'event.retracted', 'event.superseded', 'selector.corrected',
  'exemplar.candidate.scored', 'exemplar.basis.selected',
  'grammar.candidate.proposed', 'grammar.candidate.evaluated',
  'calibration.run.recorded',
  'label.resource.proposed', 'label.resource.evaluated',
]);

export const PROJECTOR_ONLY_EVENT_TYPES = Object.freeze([
  'holon.emerged', 'holon.split.projected', 'holon.merge.projected', 'holon.dissolved',
  'projection.completed', 'projection.published',
  'policy.activated', 'projector.activated',
  'exemplar.basis.activated',
  'compressor_pack.activated',
  'grammar.pack.selected', 'grammar.pack.activated',
  'calibration.pack.selected', 'calibration.pack.activated',
  'label.resource.activated',
  'prior.snapshot.proposed', 'prior.snapshot.validated', 'prior.snapshot.published', 'prior.snapshot.superseded',
  'compatibility.assessed', 'leakage.audit.completed', 'rights.audit.completed',
]);

const WRITABLE_SET = new Set(GATEWAY_WRITABLE_EVENT_TYPES);
const PROJECTOR_ONLY_SET = new Set(PROJECTOR_ONLY_EVENT_TYPES);

export const isGatewayWritable = (eventType) => WRITABLE_SET.has(eventType);
export const isProjectorOnly = (eventType) => PROJECTOR_ONLY_SET.has(eventType);
export const isKnownEventType = (eventType) => WRITABLE_SET.has(eventType) || PROJECTOR_ONLY_SET.has(eventType);

// ── No floats, ever (§4.1, invariant 4) ──────────────────────────────────────
// Canonicalization must be stable across runtimes; a float that round-trips
// differently on two machines silently breaks "reproduced." ppm/scaled
// integers only. Walks payload recursively; throws with a path so a caller
// can find the offending field instead of guessing.
export class NonIntegerNumberError extends TypeError {
  constructor(path, value) {
    super(`payload.${path}: ${value} is not an integer — ppm/scaled integers only (SPEC.md §4.1)`);
    this.name = 'NonIntegerNumberError';
    this.path = path;
    this.value = value;
  }
}

export function assertNoFloats(value, path = '') {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new NonIntegerNumberError(path || '(root)', value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoFloats(v, path ? `${path}[${i}]` : `[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      assertNoFloats(value[key], path ? `${path}.${key}` : key);
    }
  }
}

// ── Canonical JSON ────────────────────────────────────────────────────────
// Recursively rebuilds objects with lexicographically sorted keys, then hands
// the result to JSON.stringify — which preserves insertion order, so a
// sorted-on-the-way-in object serializes with sorted keys on the way out.
// Arrays keep their given order (order is meaningful there: `inputs` is a
// list of causal edges). No whitespace, so the byte string is exactly what
// gets hashed.
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

// ── Hashing ───────────────────────────────────────────────────────────────
// Web Crypto (crypto.subtle) is available unprefixed in every evergreen
// browser and in Node >= 20 — no dependency, no build step, identical code
// path for the static surface and an Action.
const textEncoder = new TextEncoder();

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Ref(input) {
  return `sha256:${await sha256Hex(input)}`;
}

// content ref helpers — `kind:sha256:<hex>` (observation:sha256:..., etc.)
export async function contentRef(kind, canonicalValue) {
  return `${kind}:${await sha256Ref(canonicalJson(canonicalValue))}`;
}

export function makeUuidRef() {
  return `uuid:${crypto.randomUUID()}`;
}

// ── The event constructor ────────────────────────────────────────────────
// Computes event_id from every other field, so a caller cannot accidentally
// hash a stale envelope. Throws NonIntegerNumberError before hashing anything
// if payload carries a float — a validation failure the caller can act on,
// not a silently-wrong hash.
export async function makeEvent({
  spec_version = '1.0.0',
  event_type,
  occurred_at = new Date().toISOString(),
  actor,
  run,
  inputs = [],
  payload,
}) {
  if (!isKnownEventType(event_type)) {
    throw new TypeError(`makeEvent: unknown event_type "${event_type}"`);
  }
  assertNoFloats(payload);
  const envelopeWithoutId = { spec_version, event_type, occurred_at, actor, run, inputs, payload };
  const event_id = await sha256Ref(canonicalJson(envelopeWithoutId));
  return Object.freeze({ ...envelopeWithoutId, event_id });
}

// Recomputes event_id from an envelope's other fields and compares — the same
// check the gateway validator runs (§8) and that an agent should run on
// itself before submitting (§10 step 1: "get it right before sending").
export async function verifyEventId(event) {
  const { event_id, ...rest } = event;
  const expected = await sha256Ref(canonicalJson(rest));
  return expected === event_id;
}
