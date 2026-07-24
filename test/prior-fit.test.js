import assert from 'node:assert/strict';
import test from 'node:test';

import {
  priorToDistribution,
  perSpanSurprise,
  crossEntropyBits,
  sourceEntropyBits,
  scorePriorFit,
  rankPriors,
  blendWithPrior,
} from '../src/prior-fit.js';
import { CELL_KEYS, EXCLUDED_UNIVERSAL_CELLS, GROUND_CHANNEL_CELLS, assertCellKeys } from '../src/fold-cells.js';
import { loadPhasepostCells } from '../src/fold.js';

const CELLS = CELL_KEYS;

// A helper that builds a normalized distribution concentrated on a few cells.
function distOver(weights) {
  const total = Object.values(weights).reduce((s, x) => s + x, 0);
  const out = {};
  for (const c of CELLS) out[c] = (weights[c] || 0) / total;
  return out;
}

test('CELL_KEYS matches the vendored phasepost-cells bundle (no drift)', async () => {
  const bundle = await loadPhasepostCells();
  assert.equal(assertCellKeys(bundle), true);
});

test('GROUND_CHANNEL_CELLS names the three Void/Field/Atmosphere channels', () => {
  for (const cells of Object.values(GROUND_CHANNEL_CELLS)) {
    for (const c of cells) assert.ok(CELLS.includes(c), `${c} is a real cell`);
  }
  assert.deepEqual(Object.keys(GROUND_CHANNEL_CELLS), ['priorMass', 'priorBond', 'priorProp']);
});

test('priorToDistribution accepts distribution_ppm and normalizes to 1', () => {
  const Q = priorToDistribution({ distribution_ppm: { INS_Making_Entity: 600000, CON_Binding_Link: 400000 } }, CELLS);
  const sum = CELLS.reduce((s, c) => s + Q[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Q.INS_Making_Entity > Q.CON_Binding_Link);
  // ε-floor: a never-seen cell is scoreable, not zero.
  assert.ok(Q.SYN_Composing_Network > 0);
});

test('a prior that matches the source costs fewer bits than a mismatched one', () => {
  const source = distOver({ INS_Making_Entity: 3, CON_Binding_Link: 1 });
  const matched = { distribution_ppm: { INS_Making_Entity: 750000, CON_Binding_Link: 250000 } };
  const mismatched = { distribution_ppm: { DEF_Dissecting_Lens: 750000, SEG_Dissecting_Link: 250000 } };
  const fitMatched = scorePriorFit(source, matched, { cellKeys: CELLS });
  const fitMismatched = scorePriorFit(source, mismatched, { cellKeys: CELLS });
  assert.ok(fitMatched.crossEntropyBits < fitMismatched.crossEntropyBits);
  assert.ok(fitMatched.surpriseReductionBits > fitMismatched.surpriseReductionBits);
});

test('KL is non-negative (Gibbs) and zero when prior equals the source', () => {
  const source = distOver({ INS_Making_Entity: 2, CON_Binding_Link: 1, SEG_Dissecting_Link: 1 });
  const perfect = { distribution: source };
  const fit = scorePriorFit(source, perfect, { cellKeys: CELLS, contentOnly: false });
  assert.ok(fit.klBits >= 0);
  // ~0 up to the ε-smoothing floor (1e-6 mass across 27 cells perturbs bits at ~1e-4).
  assert.ok(fit.klBits < 1e-3, `expected ~0 KL for a matching prior, got ${fit.klBits}`);
});

test('surpriseReductionBits is positive for a helpful prior, ~0 for uniform', () => {
  const source = distOver({ INS_Making_Entity: 3, CON_Binding_Link: 1 });
  const helpful = { distribution: distOver({ INS_Making_Entity: 3, CON_Binding_Link: 1 }) };
  const uniform = { distribution: Object.fromEntries(CELLS.map((c) => [c, 1])) };
  const fitHelpful = scorePriorFit(source, helpful, { cellKeys: CELLS, contentOnly: false });
  const fitUniform = scorePriorFit(source, uniform, { cellKeys: CELLS, contentOnly: false });
  assert.ok(fitHelpful.surpriseReductionBits > 0.5);
  assert.ok(Math.abs(fitUniform.surpriseReductionBits) < 1e-6);
});

test('contentOnly excludes the universal EVA/REC cells from scoring', () => {
  const source = distOver({ EVA_Binding_Lens: 5, INS_Making_Entity: 3, CON_Binding_Link: 1 });
  const fitContent = scorePriorFit(source, { distribution: source }, { cellKeys: CELLS, contentOnly: true });
  const fitFull = scorePriorFit(source, { distribution: source }, { cellKeys: CELLS, contentOnly: false });
  assert.equal(fitContent.cells_scored, CELLS.length - EXCLUDED_UNIVERSAL_CELLS.length);
  assert.equal(fitFull.cells_scored, CELLS.length);
  assert.equal(fitContent.cell_space, 'content');
});

test('rankPriors orders best (least surprising) first with rank fields', () => {
  const source = distOver({ INS_Making_Entity: 3, CON_Binding_Link: 1 });
  const priors = [
    { id: 'far', distribution: distOver({ DEF_Dissecting_Lens: 1 }) },
    { id: 'near', distribution: distOver({ INS_Making_Entity: 3, CON_Binding_Link: 1 }) },
    { id: 'mid', distribution: distOver({ INS_Making_Entity: 1, DEF_Dissecting_Lens: 1 }) },
  ];
  const ranked = rankPriors(source, priors, { cellKeys: CELLS });
  assert.equal(ranked[0].prior.id, 'near');
  assert.equal(ranked[0].fit.rank, 1);
  assert.ok(ranked[0].fit.surpriseReductionBits >= ranked[1].fit.surpriseReductionBits);
  assert.ok(ranked[1].fit.surpriseReductionBits >= ranked[2].fit.surpriseReductionBits);
});

test('per-span array and single aggregate distribution use the same estimator', () => {
  const a = distOver({ INS_Making_Entity: 1 });
  const b = distOver({ CON_Binding_Link: 1 });
  const prior = { distribution: distOver({ INS_Making_Entity: 1, CON_Binding_Link: 1 }) };
  const perSpan = perSpanSurprise([a, b], priorToDistribution(prior, CELLS), CELLS);
  assert.equal(perSpan.length, 2);
  const meanFromArray = crossEntropyBits([a, b], priorToDistribution(prior, CELLS), CELLS);
  assert.ok(Math.abs(meanFromArray - (perSpan[0] + perSpan[1]) / 2) < 1e-9);
});

test('blendWithPrior shrinks a sparse local read toward the prior', () => {
  // Cold start: the document has almost no local history, so the blend should
  // lean on the prior — the reading-improvement cold-start effect.
  const local = distOver({ INS_Making_Entity: 1 });
  const prior = { distribution: distOver({ CON_Binding_Link: 3, INS_Making_Entity: 1 }) };
  const blended = blendWithPrior(local, prior, { cellKeys: CELLS, alpha: 4 });
  const sum = CELLS.reduce((s, c) => s + blended[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // With alpha=4 the prior's CON mass pulls the blend's CON above the local's ~0.
  assert.ok(blended.CON_Binding_Link > 0.3);
});

test('sourceEntropyBits is the floor: cross-entropy against self ≈ entropy', () => {
  const source = [distOver({ INS_Making_Entity: 3, CON_Binding_Link: 1 })];
  const Q = priorToDistribution({ distribution: source[0] }, CELLS);
  const ce = crossEntropyBits(source, Q, CELLS);
  const h = sourceEntropyBits(source, CELLS);
  assert.ok(Math.abs(ce - h) < 1e-3); // equal up to the ε-smoothing floor
});

test('the shipped corpus prior helps a corpus-shaped source', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('../priors/corpus-prior.json', import.meta.url));
  const corpusPrior = JSON.parse(await readFile(path, 'utf8'));
  // A source shaped like the corpus prior's own content cells should read with
  // positive surprise reduction under it.
  const source = { distribution_ppm: corpusPrior.distribution_ppm };
  const fit = scorePriorFit(source, corpusPrior, { cellKeys: CELLS });
  assert.ok(fit.surpriseReductionBits > 0, `expected positive reduction, got ${fit.surpriseReductionBits}`);
  assert.ok(fit.klBits >= 0);
});
