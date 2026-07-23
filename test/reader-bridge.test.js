import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synEventsAt, readingToFold, READER_VERSION } from '../src/reader-bridge.js';

// Fixtures shaped like eoreader4.2's real doc/reading objects (reading.js
// out object, perceiver/parse's doc.log), hand-built so this suite never
// requires the sibling eoreader4.2 checkout — only loadReader() does that,
// and nothing here calls it.
const baseReading = (overrides = {}) => ({
  sentIdx: 3,
  lens: 'recency@γ0.70',
  surprises: [],
  predicted: { op: 'REC', figures: [], bonds: [] },
  evaluation: { op: 'EVA', held: false, surprise: 0, bits: 0 },
  surprisalBits: 0,
  bayesBits: 0,
  held: false,
  ...overrides,
});

const docWithLog = (events = []) => ({ log: { events } });

test('synEventsAt filters doc.log to SYN events at exactly this sentIdx', () => {
  const doc = docWithLog([
    { op: 'SYN', kind: 'merge', from: 'a', to: 'b', sentIdx: 3 },
    { op: 'SYN', kind: 'merge', from: 'c', to: 'd', sentIdx: 4 },
    { op: 'INS', id: 'a', label: 'Alice', sentIdx: 3 },
  ]);
  assert.equal(synEventsAt(doc, 3).length, 1);
  assert.equal(synEventsAt(doc, 4).length, 1);
  assert.equal(synEventsAt(doc, 0).length, 0);
});

test('synEventsAt uses doc.log.snapshot() when present, not .events directly', () => {
  const events = [{ op: 'SYN', kind: 'merge', from: 'a', to: 'b', sentIdx: 3 }];
  const doc = { log: { snapshot: () => events, events: [] } };
  assert.equal(synEventsAt(doc, 3).length, 1);
});

test('a plain steady span (opening, no prior mass) fires only EVA — REC needs something to predict from', () => {
  const doc = docWithLog([]);
  const reading = baseReading({ predicted: { op: 'REC', figures: [], bonds: [] } });
  const fold = readingToFold(doc, 3, reading);
  assert.deepEqual(fold.operator_events.map((e) => e.op), ['EVA']);
  assert.equal(fold.operator_events[0].weight_ppm, 1_000_000);
});

test('a held span with prior mass but no surprises fires NUL + REC + EVA, not a bare fallback', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    held: true,
    predicted: { op: 'REC', figures: ['alice'], bonds: [] },
  });
  const fold = readingToFold(doc, 3, reading);
  assert.deepEqual(fold.operator_events.map((e) => e.op).sort(), ['EVA', 'NUL', 'REC']);
  assert.equal(fold.held, true);
});

test('a span with INS+SEG surprises and a real SYN merge on the log fires all five at once', () => {
  const doc = docWithLog([{ op: 'SYN', kind: 'merge', from: 'x', to: 'y', sentIdx: 3 }]);
  const reading = baseReading({
    surprises: [{ op: 'INS', text: 'Bob enters', idx: 3 }, { op: 'SEG', text: 'focus shifts off Alice', idx: 3 }],
    predicted: { op: 'REC', figures: ['alice'], bonds: [] },
  });
  const fold = readingToFold(doc, 3, reading);
  const ops = fold.operator_events.map((e) => e.op).sort();
  assert.deepEqual(ops, ['EVA', 'INS', 'REC', 'SEG', 'SYN']);
  const total = fold.operator_events.reduce((s, e) => s + e.weight_ppm, 0);
  assert.equal(total, 1_000_000);
});

test('REC fires from predicted bonds alone, even with zero predicted figures', () => {
  const doc = docWithLog([]);
  const reading = baseReading({ predicted: { op: 'REC', figures: [], bonds: ['Alice—Bob'] } });
  const fold = readingToFold(doc, 3, reading);
  assert.ok(fold.operator_events.some((e) => e.op === 'REC'));
});

test('without reading ground channels, legacy operator_events remain Figure-grain only', () => {
  const doc = docWithLog([{ op: 'SYN', kind: 'merge', from: 'x', to: 'y', sentIdx: 3 }]);
  const reading = baseReading({
    surprises: [{ op: 'DEF', text: 'age: 40', idx: 3 }],
    held: true,
    predicted: { op: 'REC', figures: ['alice'], bonds: [] },
  });
  const fold = readingToFold(doc, 3, reading);
  assert.ok(fold.operator_events.every((e) => e.grain === 'Figure'));
});

test('surprisal_bits and bayes_bits scale to integer micro-bits and reader_version/lens_id pass through', () => {
  const doc = docWithLog([]);
  const reading = baseReading({ surprisalBits: 1.5, bayesBits: 0.25, lens: 'entity@γ0.90' });
  const fold = readingToFold(doc, 3, reading);
  assert.equal(fold.surprisal_bits, 1_500_000);
  assert.equal(fold.bayes_bits, 250_000);
  assert.equal(fold.reader_version, READER_VERSION);
  assert.equal(fold.lens_id, 'entity@γ0.90');
  assert.ok(Number.isInteger(fold.surprisal_bits));
  assert.ok(Number.isInteger(fold.bayes_bits));
});

// reading.ground's REAL shape, matching eoreader4.2's actual src/perceiver/reading.js output
// (locked in by its own tests/smoke.test.js): nested { novelty: {mass}, bonds: {mass},
// propositions: {mass} }, not the flat {novelty_ppm, field_ppm, atmosphere_ppm} this test used
// to assert — that flat shape was never what eoreader4.2 produced, so this test was passing
// against a fiction while groundEventsFor silently no-opped on every real reading (see the
// comment above groundEventsFor). Regression-fixed: these fixtures now mirror the real shape.
test('reading ground channels (real eoreader4.2 shape) cast prior evidence onto Ground-grain cells', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: { novelty: { mass: 1 }, bonds: { mass: 3 }, propositions: { mass: 6 } },
  });
  const fold = readingToFold(doc, 3, reading);
  const ground = fold.operator_events.filter((e) => e.grain === 'Ground');
  assert.equal(ground.length, 3, 'all three Ground channels have nonzero mass, so all three fire');
  const novelty = ground.find((e) => e.op === 'INS' && e.source === 'ground:novelty');
  const field = ground.find((e) => e.op === 'CON' && e.source === 'ground:field');
  const atmosphere = ground.find((e) => e.op === 'REC' && e.source === 'ground:atmosphere');
  assert.ok(novelty && field && atmosphere);
  // relative shares mirror the 1:3:6 input mass ratio, regardless of what else is in the fold
  // (EVA always fires too — see readingToFold — but scales every event by the same factor).
  assert.ok(field.weight_ppm > novelty.weight_ppm, 'field (mass 3) outweighs novelty (mass 1)');
  assert.ok(atmosphere.weight_ppm > field.weight_ppm, 'atmosphere (mass 6) outweighs field (mass 3)');
  const total = fold.operator_events.reduce((s, e) => s + e.weight_ppm, 0);
  assert.equal(total, 1_000_000);
});

test('reading ground channels: a channel with zero mass does not fire, others still do', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: { novelty: { mass: 1 }, bonds: { mass: 0 }, propositions: { mass: 4 } },
  });
  const fold = readingToFold(doc, 3, reading);
  const ground = fold.operator_events.filter((e) => e.grain === 'Ground');
  assert.equal(ground.length, 2, 'the zero-mass bond channel is omitted, not emitted as a zero-weight event');
  assert.ok(!ground.some((e) => e.source === 'ground:field'));
});

test('reading ground channels: all-zero ground mass admits no Ground events at all', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: { novelty: { mass: 0 }, bonds: { mass: 0 }, propositions: { mass: 0 } },
  });
  const fold = readingToFold(doc, 3, reading);
  assert.ok(fold.operator_events.every((e) => e.grain !== 'Ground'));
});
