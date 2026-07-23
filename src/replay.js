// src/replay.js — DAG topological sort + projection build (SPEC.md §2
// invariant 2, §7, §11). Pure functions over an in-memory event list; the
// filesystem/network glue (reading batches/**, writing projections/**,
// POSTing the head-publish webhook) lives in scripts/build-projection.mjs so
// this module stays testable and so verify-determinism.yml can call the same
// code a second time, from a clean checkout, without touching a network.

import { canonicalize, sha256Ref } from './event.js';
import { emergeHolons } from './emergence.js';

export const PROJECTOR_VERSION = 'eopriors-replay@1.0.0';

// ── Deterministic topological sort (invariant 2) ────────────────────────
// Kahn's algorithm with a lexicographically-sorted ready queue: whenever more
// than one event has all its inputs already placed, the one with the
// smaller event_id goes first. Two batches landing in the same second from
// two different writers converge on one order with no coordination between
// them, because this sort is a pure function of event_id, never of arrival
// time or file path.
export function topologicalSort(events) {
  const byId = new Map(events.map((e) => [e.event_id, e]));
  const indegree = new Map(events.map((e) => [e.event_id, 0]));
  const dependents = new Map(events.map((e) => [e.event_id, []]));

  for (const e of events) {
    for (const inputId of e.inputs || []) {
      if (!byId.has(inputId)) continue; // an input outside this event set (e.g. pruned) is not an ordering constraint here
      indegree.set(e.event_id, (indegree.get(e.event_id) || 0) + 1);
      dependents.get(inputId).push(e.event_id);
    }
  }

  const ready = events.filter((e) => indegree.get(e.event_id) === 0).map((e) => e.event_id).sort();
  const order = [];
  while (ready.length) {
    ready.sort();
    const id = ready.shift();
    order.push(id);
    for (const dep of dependents.get(id) || []) {
      indegree.set(dep, indegree.get(dep) - 1);
      if (indegree.get(dep) === 0) ready.push(dep);
    }
  }

  if (order.length !== events.length) {
    const stuck = events.map((e) => e.event_id).filter((id) => !order.includes(id));
    throw new Error(`topologicalSort: cycle or missing input detected among event_ids: ${stuck.join(', ')}`);
  }
  return order.map((id) => byId.get(id));
}

// ── Retractions / supersessions (invariant 7) ───────────────────────────
// Corrections are new events, not edits — this computes which event_ids are
// still "current" without ever deleting anything from the input list.
export function resolveLedger(sortedEvents) {
  const retractedIds = new Set();
  const supersededIds = new Set();
  const supersessionOf = new Map(); // superseded_event_id -> superseding_event_id
  const invalidatedObservationIds = new Set();

  for (const e of sortedEvents) {
    if (e.event_type === 'event.retracted') retractedIds.add(e.payload?.retracted_event_id);
    if (e.event_type === 'event.superseded') {
      supersededIds.add(e.payload?.superseded_event_id);
      supersessionOf.set(e.payload?.superseded_event_id, e.payload?.superseding_event_id);
    }
    if (e.event_type === 'observation.invalidated' && e.payload?.observation_id) {
      invalidatedObservationIds.add(e.payload.observation_id);
    }
  }

  const excluded = new Set([...retractedIds, ...supersededIds]);
  const resolvedEvents = sortedEvents.filter((e) => !excluded.has(e.event_id));

  return { resolvedEvents, retractedIds, supersededIds, supersessionOf, invalidatedObservationIds };
}

// ── Ledger head — the DAG's current frontier, not a sequencer position ──
// (invariant 2). An event is a head when no OTHER resolved event names it as
// an input — nothing causally follows it yet.
export function computeLedgerHead(resolvedEvents) {
  const referenced = new Set();
  for (const e of resolvedEvents) for (const inputId of e.inputs || []) referenced.add(inputId);
  return resolvedEvents
    .map((e) => e.event_id)
    .filter((id) => !referenced.has(id))
    .sort();
}

// ── Join observation.created ⋈ observation.measured ─────────────────────
// observation.measured (§4.4) does not itself carry source_id — that lives
// on the observation.created event the measurement is about. This assumes
// observation.created's payload carries { observation_id, source_id,
// selector } (SPEC.md doesn't pin an exact shape for this event; documented
// here as the join key this module depends on).
function buildObservationSourceIndex(resolvedEvents) {
  const index = new Map();
  for (const e of resolvedEvents) {
    if (e.event_type === 'observation.created' && e.payload?.observation_id) {
      index.set(e.payload.observation_id, e.payload.source_id ?? 'unknown-source');
    }
  }
  return index;
}

// Every still-current observation.measured event, joined with its source_id,
// grouped by basis_id — a projection never pools measurements from different
// bases into one emergence run (invariant 11, invariant 18).
export function extractObservationMeasurementsByBasis(resolvedEvents, { invalidatedObservationIds = new Set() } = {}) {
  const sourceIndex = buildObservationSourceIndex(resolvedEvents);
  const byBasis = new Map();
  for (const e of resolvedEvents) {
    if (e.event_type !== 'observation.measured') continue;
    const { observation_id, basis_id, phasepost_measurements } = e.payload || {};
    if (!observation_id || invalidatedObservationIds.has(observation_id)) continue;
    if (!byBasis.has(basis_id)) byBasis.set(basis_id, []);
    byBasis.get(basis_id).push({
      observation_id,
      source_id: sourceIndex.get(observation_id) ?? 'unknown-source',
      phasepost_measurements,
    });
  }
  return byBasis;
}

// ── Policy hashing ───────────────────────────────────────────────────────
export async function hashPolicies(policyTextsByName) {
  const hashes = {};
  for (const [name, text] of Object.entries(policyTextsByName)) hashes[name] = await sha256Ref(text);
  return hashes;
}

const lensIdFor = (basisId) => (basisId ? basisId.replace(/^exemplar-basis:sha256:/, 'basis-').slice(0, 24) : 'unset');

// ── The projection ───────────────────────────────────────────────────────
// events: the full raw event list (every batch, flattened, unsorted).
// activeBasisId: config/exemplar-basis/active.json's pointer, or null.
// previousHolonsByLens: { [lens_id]: holon[] } from the prior snapshot, for
//   identity continuity (emergence.js's assignHolonIdentity).
// policyTexts: { library, 'rights-policy', 'emergence-policy' } raw file text.
// emergencePolicy: parsed emergence-policy.yaml (mintOverheadBits, etc).
// determinism: 'reproduced' | 'attested' — the manifest's declared grade.
//   Defaults to 'attested': claiming 'reproduced' is only honest once an
//   operator has verified the embedding step is bit-stable in their own build
//   environment (invariant 4) — this module does not verify that for you.
export async function buildProjection({
  events,
  activeBasisId = null,
  previousHolonsByLens = {},
  policyTexts,
  emergencePolicy = {},
  determinism = 'attested',
  batchesFolded = 0,
}) {
  const sorted = topologicalSort(events);
  const { resolvedEvents, retractedIds, invalidatedObservationIds } = resolveLedger(sorted);
  const ledgerHead = computeLedgerHead(resolvedEvents);
  const policyHashes = await hashPolicies(policyTexts);
  const measurementsByBasis = extractObservationMeasurementsByBasis(resolvedEvents, { invalidatedObservationIds });

  const basisIdsInScope = activeBasisId ? [activeBasisId] : [...measurementsByBasis.keys()].filter(Boolean);
  if (basisIdsInScope.length === 0) basisIdsInScope.push(null); // no basis active yet — an empty, valid, unset-lens projection

  const lenses = [];
  for (const basisId of basisIdsInScope) {
    const observations = measurementsByBasis.get(basisId) || [];
    const lensId = lensIdFor(basisId);
    const previousHolons = previousHolonsByLens[lensId] || [];
    const { holons, identityReboundAudits } = await emergeHolons({
      basisId,
      observations,
      previousHolons,
      policy: emergencePolicy,
    });
    lenses.push({ lens_id: lensId, basis_id: basisId, holons, identityReboundAudits, observationCount: observations.length });
  }

  const projection_id_seed = canonicalize({
    ledger_head: ledgerHead,
    projector_version: PROJECTOR_VERSION,
    policy_hashes: policyHashes,
    basis_ids_in_scope: basisIdsInScope,
  });
  const projection_id = `projection:${await sha256Ref(JSON.stringify(projection_id_seed))}`;

  const manifests = lenses.map((lens) => ({
    projection_id,
    lens_id: lens.lens_id,
    basis_ids_in_scope: [lens.basis_id].filter(Boolean).length ? [lens.basis_id] : [],
    ledger_head: ledgerHead,
    projector_version: PROJECTOR_VERSION,
    policy_hashes: policyHashes,
    determinism,
    built_at: new Date().toISOString(),
    counts: {
      batches_folded: batchesFolded,
      events_resolved: resolvedEvents.length,
      events_retracted: retractedIds.size,
      observations_declined: resolvedEvents.filter((e) => e.event_type === 'observation.declined').length,
      holons_ground: lens.holons.filter((h) => h.tier === 'Ground').length,
      holons_figure: lens.holons.filter((h) => h.tier === 'Figure').length,
      holons_pattern: lens.holons.filter((h) => h.tier === 'Pattern').length,
    },
  }));

  return { lenses, manifests, ledgerHead, resolvedEvents };
}

// ── Diff (invariant 9: "A projection diff explains what an import changed") ─
export function diffHolons(previousHolons = [], nextHolons = []) {
  const prevById = new Map(previousHolons.map((h) => [h.holon_id, h]));
  const nextById = new Map(nextHolons.map((h) => [h.holon_id, h]));
  const added = [...nextById.keys()].filter((id) => !prevById.has(id));
  const dissolved = [...prevById.keys()].filter((id) => !nextById.has(id));
  const changed = [...nextById.keys()].filter((id) => {
    if (!prevById.has(id)) return false;
    return JSON.stringify(prevById.get(id).supporting_observation_ids.slice().sort())
      !== JSON.stringify(nextById.get(id).supporting_observation_ids.slice().sort());
  });
  return { added, dissolved, changed };
}
