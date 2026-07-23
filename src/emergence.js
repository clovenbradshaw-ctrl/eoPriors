// src/emergence.js — Figure → Pattern → Ground projection (SPEC.md §6).
// Holons are projected, never asserted (invariant 6): this module is the only
// place a holon comes from, and it is a pure function of the observations and
// the previous projection's holon registry (for identity continuity) — no
// side effects, no I/O, so src/replay.js can call it deterministically.
//
// ── The gain formula, made concrete ─────────────────────────────────────────
// SPEC.md §6: gain(H) = Σ DL(E_i) − [DL(H) + Σ DL(E_i | H)]
//
// DL(·) here is a description-length PROXY, not an arithmetic coder: an
// observation's own phasepost distribution p_i already carries a natural
// self-description cost, its Shannon entropy in bits (a flat/uncommitted
// reading costs more to state fully than a sharply-peaked one). Given a
// prototype q_H (a holon's own, similarly-shaped distribution — the mean of
// its members' amplitude vectors), the cost of describing E_i AS A RESIDUAL
// from H should shrink toward zero as p_i approaches q_H, and grow toward
// DL(E_i) as they diverge. Scaling DL(E_i) by (1 − similarity(p_i, q_H))
// does exactly that, with similarity the Bhattacharyya coefficient (bounded
// in [0,1], symmetric, well-defined between two probability vectors — unlike
// raw cosine, it never rewards two distributions matching zeros against
// zeros). That gives:
//
//   DL(E_i)      = entropyBits(p_i)
//   DL(H)        = entropyBits(q_H) + mintOverheadBits
//   DL(E_i | H)  = DL(E_i) · (1 − similarity(p_i, q_H))
//
//   gain(H) = Σ DL(E_i)·similarity(p_i,q_H)  −  DL(H)
//
// Positive exactly when the members are, in aggregate, well-enough explained
// by a shared prototype to outweigh the fixed cost of minting that prototype
// as its own holon — a real (if simplified) MDL two-part code, and the
// concrete thing "joint description beats separate description" cashes out
// to below.

import { entropyMicrobits } from './compress.js';
import { contentRef, canonicalize } from './event.js';

export const EMERGENCE_ALGORITHM = 'eo-emergence@1.0.0';
// A single observation's entropy is bounded by log2(27) ≈ 4.755 bits (a
// fully uncommitted reading spread flat across every cell) and is typically
// far lower for a confidently-measured one — so the fixed mint cost has to
// sit well under that ceiling, or nothing this system actually measures
// could ever clear it. 1 bit ≈ "the cost of one yes/no commitment to mint a
// holon's identity" — a deliberately modest default; config/emergence-policy.yaml
// is where an operator retunes it.
const DEFAULT_MINT_OVERHEAD_BITS = 1;
const DEFAULT_IDENTITY_THRESHOLD = 0.5;
const DEFAULT_MAX_MERGE_ROUNDS = 2000; // backstop, not a tuning knob — see condenseByGain

const toProbabilities = (phasepostMeasurements) => {
  const probs = {};
  for (const [cell, m] of Object.entries(phasepostMeasurements)) probs[cell] = (m.amplitude_ppm ?? 0) / 1e6;
  return probs;
};

export const entropyBitsOf = (probabilities) => entropyMicrobits(probabilities) / 1e6;

export function bhattacharyyaCoefficient(p, q) {
  let sum = 0;
  for (const cell of Object.keys(p)) sum += Math.sqrt(Math.max(0, p[cell]) * Math.max(0, q[cell] ?? 0));
  return Math.min(1, Math.max(0, sum));
}

// Regrain a prototype into a target cube grain: move each cell's mass to the
// same-OPERATOR cell at that grain (INS_Making_Entity[Figure] ->
// INS_Composing_Kind[Pattern]). The operator is preserved; the grain shifts,
// carrying the site with it. This is how a Pattern-TIER holon (a Figure
// recurrence condensed across sources) comes to express in the cube's Pattern
// GRAIN — collapsing the tier/grain distinction the way the cube intends: the
// recurring version of a Figure IS the same operators read at Pattern grain.
// Ground-tier holons regrain to Ground the same way. Pure: the cube geometry
// comes in as `cellsBundle` (data/phasepost-cells.json), so emergence.js keeps
// its no-I/O contract and the (op,grain)->cell mapping never drifts from that
// file. Applied to the OUTPUT prototype only, after the gain/condensation math
// has run in Figure space — regraining the members would make Figure-grain
// vectors disjoint from a regrained prototype and collapse every gain to zero.
export function regrainPrototype(prototype, targetGrain, cellsBundle) {
  const index = {};
  for (const [cellKey, def] of Object.entries(cellsBundle.cells)) index[`${def.op}:${def.grain}`] = cellKey;
  const out = Object.fromEntries(Object.keys(prototype).map((c) => [c, 0]));
  for (const [cell, p] of Object.entries(prototype)) {
    if (!(p > 0)) continue;
    const def = cellsBundle.cells[cell];
    const target = (def && index[`${def.op}:${targetGrain}`]) || cell;
    out[target] = (out[target] || 0) + p;
  }
  return out;
}

// Elementwise mean of a set of probability vectors, renormalized to sum to 1.
export function meanPrototype(probabilityVectors) {
  const cells = Object.keys(probabilityVectors[0] || {});
  const sums = Object.fromEntries(cells.map((c) => [c, 0]));
  for (const p of probabilityVectors) for (const c of cells) sums[c] += p[c] ?? 0;
  const total = Object.values(sums).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(cells.map((c) => [c, sums[c] / total]));
}

export function compressionGainBits(probabilityVectors, { mintOverheadBits = DEFAULT_MINT_OVERHEAD_BITS } = {}) {
  const prototype = meanPrototype(probabilityVectors);
  const dlH = entropyBitsOf(prototype) + mintOverheadBits;
  let sum = 0;
  for (const p of probabilityVectors) sum += entropyBitsOf(p) * bhattacharyyaCoefficient(p, prototype);
  return { gain_bits: sum - dlH, prototype };
}

// ── Greedy agglomerative condensation ───────────────────────────────────────
// Repeatedly merges whichever pair of clusters yields the best positive gain,
// until no merge improves on separate description. O(n²) per round — fine
// for a batch's worth of observations; a corpus-scale ledger would want a
// nearest-neighbor index in front of this, not a smarter formula, and that's
// a future replay.js concern, not this module's.
function condenseByGain(items, { mintOverheadBits, minMembers = 2, maxRounds = DEFAULT_MAX_MERGE_ROUNDS } = {}) {
  let clusters = items.map((item) => ({
    memberIds: [item.id],
    probabilityVectors: [item.probabilities],
    sourceIds: new Set([item.sourceId]),
  }));

  // A cluster's own solo gain — for a lone singleton this is always
  // -mintOverheadBits (a single item is not a holon; nothing offsets the
  // mint cost), and for an already-condensed cluster it's the gain it's
  // already banking on its own.
  const soloGain = (cluster) => compressionGainBits(cluster.probabilityVectors, { mintOverheadBits }).gain_bits;

  for (let round = 0; round < maxRounds && clusters.length > 1; round++) {
    let best = null; // { i, j, delta, prototype }
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const merged = clusters[i].probabilityVectors.concat(clusters[j].probabilityVectors);
        const { gain_bits: mergedGain, prototype } = compressionGainBits(merged, { mintOverheadBits });
        // Accept a merge only if it beats leaving the two pieces separate —
        // NOT merely "merged gain > 0." Absolute gain alone lets an already
        // well-supported cluster eventually absorb a weakly-matching
        // outlier once its accumulated fit outweighs one fixed overhead;
        // requiring an improvement over the separate-gain baseline keeps a
        // large cluster from becoming promiscuous as it grows.
        const delta = mergedGain - (soloGain(clusters[i]) + soloGain(clusters[j]));
        if (delta > 0 && (!best || delta > best.delta)) best = { i, j, delta, prototype };
      }
    }
    if (!best) break;
    const { i, j } = best;
    const a = clusters[i], b = clusters[j];
    clusters = clusters.filter((_, k) => k !== i && k !== j);
    clusters.push({
      memberIds: [...a.memberIds, ...b.memberIds],
      probabilityVectors: [...a.probabilityVectors, ...b.probabilityVectors],
      sourceIds: new Set([...a.sourceIds, ...b.sourceIds]),
    });
  }

  const condensed = clusters.filter((c) => c.memberIds.length >= minMembers);
  const residual = clusters.filter((c) => c.memberIds.length < minMembers);
  return { condensed, residual };
}

// ── Figure tier ──────────────────────────────────────────────────────────
// observations: [{ observation_id, source_id, phasepost_measurements }]
export function condenseFigures(observations, policy = {}) {
  const items = observations.map((o) => ({
    id: o.observation_id,
    sourceId: o.source_id,
    probabilities: toProbabilities(o.phasepost_measurements),
  }));
  const { condensed, residual } = condenseByGain(items, { mintOverheadBits: policy.mintOverheadBits });
  const figures = condensed.map((c) => {
    const { gain_bits, prototype } = compressionGainBits(c.probabilityVectors, { mintOverheadBits: policy.mintOverheadBits });
    return { grain: 'Figure', supporting_observation_ids: c.memberIds, source_ids: [...c.sourceIds], prototype, gain_bits };
  });
  const residualObservations = residual.map((c) => ({ id: c.memberIds[0], sourceId: [...c.sourceIds][0], probabilities: c.probabilityVectors[0] }));
  return { figures, residualObservations };
}

// ── Pattern tier ─────────────────────────────────────────────────────────
// Patterns condense from Figures that recur with independent support (≥2
// distinct sourceIds among the merged figures) AND survive source-holdout:
// excluding any one contributing source, in turn, must leave gain positive
// still — otherwise the "pattern" was one source's figure wearing a costume.
function survivesSourceHoldout(memberProbabilityVectors, memberSourceLists, mintOverheadBits) {
  const allSources = new Set(memberSourceLists.flat());
  for (const heldOutSource of allSources) {
    // Keep every member NOT solely attributed to the held-out source.
    const keptVectors = [];
    memberProbabilityVectors.forEach((p, idx) => {
      const soleSource = memberSourceLists[idx].length === 1 && memberSourceLists[idx][0] === heldOutSource;
      if (!soleSource) keptVectors.push(p);
    });
    if (keptVectors.length < 2) return false; // nothing left to support the pattern without this source
    const { gain_bits } = compressionGainBits(keptVectors, { mintOverheadBits });
    if (gain_bits <= 0) return false;
  }
  return true;
}

export function promoteFigurePatterns(figures, policy = {}, cellsBundle = null) {
  const items = figures.map((f, i) => ({
    id: `figure:${i}`,
    sourceId: f.source_ids[0],
    sourceIds: f.source_ids,
    probabilities: f.prototype,
  }));
  const { condensed } = condenseByGain(
    items.map(({ id, sourceId, probabilities }) => ({ id, sourceId, probabilities })),
    { mintOverheadBits: policy.mintOverheadBits },
  );

  const patterns = [];
  const promotedFigureIdx = new Set();
  for (const cluster of condensed) {
    const memberIdxs = cluster.memberIds.map((id) => Number(id.split(':')[1]));
    const memberSourceLists = memberIdxs.map((idx) => figures[idx].source_ids);
    const distinctSources = new Set(memberSourceLists.flat());
    if (distinctSources.size < 2) continue; // not independent recurrence — leave these figures standalone
    if (!survivesSourceHoldout(cluster.probabilityVectors, memberSourceLists, policy.mintOverheadBits)) continue;

    const { gain_bits, prototype } = compressionGainBits(cluster.probabilityVectors, { mintOverheadBits: policy.mintOverheadBits });
    const supporting_observation_ids = memberIdxs.flatMap((idx) => figures[idx].supporting_observation_ids);
    // A Pattern-tier holon is the recurring version of its member Figures —
    // express it in the cube's Pattern grain (op preserved, Figure->Pattern).
    const patternPrototype = cellsBundle ? regrainPrototype(prototype, 'Pattern', cellsBundle) : prototype;
    patterns.push({ grain: 'Pattern', supporting_observation_ids, source_ids: [...distinctSources], prototype: patternPrototype, gain_bits });
    memberIdxs.forEach((idx) => promotedFigureIdx.add(idx));
  }

  const remainingFigures = figures.filter((_, idx) => !promotedFigureIdx.has(idx));
  return { patterns, remainingFigures };
}

// ── Ground tier ──────────────────────────────────────────────────────────
// Ground holons condense from residuals recurring ACROSS Figures and Patterns
// (§6). Scope, stated plainly: this v1 draws its residual pool from
// observations Figure-condensation left unclustered — not from the
// unexplained remainder *inside* an already-formed Figure/Pattern, which
// would need a defined vector subtraction in probability space this proxy
// doesn't attempt. "Recurring across" is checked the same way as Pattern
// promotion: a candidate Ground holon must draw its residuals from at least
// two distinct sources.
//
// Crucially, this must NOT reuse Figure-tier's mint overhead: condenseFigures
// already ran the identical greedy-gain-merge over this exact pool (residuals
// ARE its leftovers), so anything that clears the same bar would already have
// merged there. Ground has to be a genuinely CHEAPER holon to mint — which is
// exactly the cube's own reading of the grain (Ground is the ambient
// condition, ridden not committed; Figure is the specific committed thing,
// docs/cube.md) — for this tier to ever find anything at all.
const GROUND_OVERHEAD_FRACTION = 0.5;

export function condenseGround(residualObservations, policy = {}, cellsBundle = null) {
  const figureOverhead = policy.mintOverheadBits ?? DEFAULT_MINT_OVERHEAD_BITS;
  const groundOverhead = figureOverhead * GROUND_OVERHEAD_FRACTION;
  const items = residualObservations.map((r) => ({ id: r.id, sourceId: r.sourceId, probabilities: r.probabilities }));
  const { condensed } = condenseByGain(items, { mintOverheadBits: groundOverhead });
  return condensed
    .filter((c) => c.sourceIds.size >= 2)
    .map((c) => {
      const { gain_bits, prototype } = compressionGainBits(c.probabilityVectors, { mintOverheadBits: groundOverhead });
      // A Ground-tier holon is the ambient condition ridden across sources —
      // express it in the cube's Ground grain (op preserved, Figure->Ground).
      const groundPrototype = cellsBundle ? regrainPrototype(prototype, 'Ground', cellsBundle) : prototype;
      return { grain: 'Ground', supporting_observation_ids: c.memberIds, source_ids: [...c.sourceIds], prototype: groundPrototype, gain_bits };
    });
}

// ── Identity across rebuild (§6, last paragraph) ────────────────────────
// Max-overlap (Jaccard) on supporting-observation-id sets against the
// previous projection's holons of the same grain. Above threshold: the id
// persists. Below it but nonzero: the match is ambiguous — record a
// holon.identity.rebound audit rather than silently minting a new id that
// happens to look unrelated to a human reading the diff. Zero overlap: a
// genuinely new holon, minted silently.
function jaccard(a, b) {
  const setA = new Set(a), setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function assignHolonIdentity(candidate, previousHolons, { threshold = DEFAULT_IDENTITY_THRESHOLD } = {}) {
  const sameGrain = previousHolons.filter((h) => h.grain === candidate.grain);
  let best = null;
  for (const prev of sameGrain) {
    const overlap = jaccard(candidate.supporting_observation_ids, prev.supporting_observation_ids);
    if (!best || overlap > best.overlap) best = { overlap, prev };
  }
  const mintedId = await contentRef('holon', canonicalize({
    grain: candidate.grain,
    prototype: candidate.prototype,
    supporting_observation_ids: [...candidate.supporting_observation_ids].sort(),
  }));
  if (best && best.overlap >= threshold) {
    return { holon_id: best.prev.holon_id, rebound: null };
  }
  if (best && best.overlap > 0) {
    return {
      holon_id: mintedId,
      rebound: { previous_holon_id: best.prev.holon_id, candidate_holon_id: mintedId, overlap: best.overlap, grain: candidate.grain },
    };
  }
  return { holon_id: mintedId, rebound: null };
}

// ── Top-level orchestration ─────────────────────────────────────────────
// observations: [{ observation_id, source_id, phasepost_measurements }]
// previousHolons: [{ holon_id, grain, supporting_observation_ids }] from the
// prior projection snapshot, or [] on a first build.
// cellsBundle: optional cube geometry (data/phasepost-cells.json). When
// provided, Pattern-tier holons express in the cube's Pattern grain and
// Ground-tier in Ground grain (regrainPrototype); when omitted, prototypes
// stay in whatever grain their member observations used (backward compatible —
// the pre-regrain behavior every existing test relies on).
export async function emergeHolons({ basisId, observations, previousHolons = [], policy = {}, cellsBundle = null }) {
  const { figures, residualObservations } = condenseFigures(observations, policy);
  const { patterns, remainingFigures } = promoteFigurePatterns(figures, policy, cellsBundle);
  const grounds = condenseGround(residualObservations, policy, cellsBundle);

  const holons = [];
  const identityReboundAudits = [];
  for (const candidate of [...remainingFigures, ...patterns, ...grounds]) {
    const { holon_id, rebound } = await assignHolonIdentity(candidate, previousHolons, policy);
    holons.push({ ...candidate, holon_id, basis_id: basisId });
    if (rebound) identityReboundAudits.push(rebound);
  }
  return { holons, identityReboundAudits };
}
