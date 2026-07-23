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

test('a span with INS+SEG surprises and a real SYN merge on the log fires all five Figure acts, plus a Ground SYN', () => {
  const doc = docWithLog([{ op: 'SYN', kind: 'merge', from: 'x', to: 'y', sentIdx: 3 }]);
  const reading = baseReading({
    surprises: [{ op: 'INS', text: 'Bob enters', idx: 3 }, { op: 'SEG', text: 'focus shifts off Alice', idx: 3 }],
    predicted: { op: 'REC', figures: ['alice'], bonds: [] },
  });
  const fold = readingToFold(doc, 3, reading);
  const ops = fold.operator_events.map((e) => e.op).sort();
  assert.deepEqual(ops, ['EVA', 'INS', 'REC', 'SEG', 'SYN', 'SYN']);
  assert.equal(fold.operator_events.filter((e) => e.op === 'SYN' && e.grain === 'Figure').length, 1);
  assert.equal(fold.operator_events.filter((e) => e.op === 'SYN' && e.grain === 'Ground').length, 1);
  const total = fold.operator_events.reduce((s, e) => s + e.weight_ppm, 0);
  assert.equal(total, 1_000_000);
});

test('a real SYN merge restructures the Field at Ground grain too, not only Figure', () => {
  const doc = docWithLog([{ op: 'SYN', kind: 'merge', from: 'x', to: 'y', sentIdx: 3 }]);
  const reading = baseReading();
  const fold = readingToFold(doc, 3, reading);
  const groundSyn = fold.operator_events.find((e) => e.op === 'SYN' && e.grain === 'Ground');
  assert.ok(groundSyn, 'a real SYN merge on the log produces a Ground-grain event too');
  assert.equal(groundSyn.source, 'ground:syn-merge');
});

test('with no SYN on the log, no Ground SYN event is fabricated', () => {
  const doc = docWithLog([]);
  const reading = baseReading();
  const fold = readingToFold(doc, 3, reading);
  assert.ok(!fold.operator_events.some((e) => e.op === 'SYN'));
});

test('multiple real SYN merges in one span each produce their own Figure AND Ground event', () => {
  const doc = docWithLog([
    { op: 'SYN', kind: 'merge', from: 'x', to: 'y', sentIdx: 3 },
    { op: 'SYN', kind: 'alias', from: 'p', to: 'q', sentIdx: 3 },
  ]);
  const reading = baseReading();
  const fold = readingToFold(doc, 3, reading);
  assert.equal(fold.operator_events.filter((e) => e.op === 'SYN' && e.grain === 'Figure').length, 2);
  assert.equal(fold.operator_events.filter((e) => e.op === 'SYN' && e.grain === 'Ground').length, 2);
});

test('REC fires from predicted bonds alone, even with zero predicted figures', () => {
  const doc = docWithLog([]);
  const reading = baseReading({ predicted: { op: 'REC', figures: [], bonds: ['Alice—Bob'] } });
  const fold = readingToFold(doc, 3, reading);
  assert.ok(fold.operator_events.some((e) => e.op === 'REC'));
});

test('without reading.ground set and no real SYN on the log, operator_events remain Figure-grain only', () => {
  const doc = docWithLog([]);
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

// reading.ground's REAL shape when read with { terrains: true } (eoreader4.2's actual
// src/perceiver/reading.js output): { void, field, atmosphere } x { cultivating, clearing,
// tending } — nine real numbers, not the old { novelty: {mass}, bonds: {mass}, propositions:
// {mass} } three-channel shape (that shape is gone entirely now — reading.js's Ground row grew
// from 3 cells to the full 3x3, see reading.js's own opts.terrains comment). (site, stance) ->
// operator is fixed by the cube geometry: void->{INS,NUL,SIG}, field->{SYN,SEG,CON},
// atmosphere->{REC,DEF,EVA} for {cultivating,clearing,tending} respectively.
test('reading ground channels (full 3x3 terrains shape) light all nine Ground cells', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: {
      void:       { cultivating: 10, clearing: 1, tending: 2 },
      field:      { cultivating: 5,  clearing: 1, tending: 2 },
      atmosphere: { cultivating: 3,  clearing: 1, tending: 1 },
    },
  });
  const fold = readingToFold(doc, 3, reading);
  const ground = fold.operator_events.filter((e) => e.grain === 'Ground');
  assert.equal(ground.length, 9, 'every (site, stance) cell has nonzero mass, so all nine fire');
  const opsSet = new Set(ground.map((e) => e.op));
  assert.deepEqual(opsSet, new Set(['INS', 'NUL', 'SIG', 'SYN', 'SEG', 'CON', 'REC', 'DEF', 'EVA']));
  const total = fold.operator_events.reduce((s, e) => s + e.weight_ppm, 0);
  assert.equal(total, 1_000_000);
});

test('reading ground channels: per-stance normalization keeps a near-constant clearing reserve alive beside a much larger cultivating mass', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: {
      // cultivating masses are ~100x clearing/tending — pooling raw magnitudes would
      // swamp clearing/tending to near-zero weight; per-stance normalization must not.
      void:       { cultivating: 1000, clearing: 1, tending: 0 },
      field:      { cultivating: 800,  clearing: 1, tending: 3 },
      atmosphere: { cultivating: 600,  clearing: 1, tending: 2 },
    },
  });
  const fold = readingToFold(doc, 3, reading);
  const ground = fold.operator_events.filter((e) => e.grain === 'Ground');
  const cultivatingTotal = ground.filter((e) => ['INS', 'SYN', 'REC'].includes(e.op)).reduce((s, e) => s + e.weight_ppm, 0);
  const clearingTotal = ground.filter((e) => ['NUL', 'SEG', 'DEF'].includes(e.op)).reduce((s, e) => s + e.weight_ppm, 0);
  assert.ok(clearingTotal > 0, 'the clearing reserve survives despite being ~100x smaller in raw magnitude');
  assert.ok(cultivatingTotal / clearingTotal < 3, 'per-stance normalization keeps the two stances roughly comparable, not 100x apart');
});

test('reading ground channels: a site with zero mass in an otherwise-active stance is omitted, not a zero-weight event', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: {
      void:       { cultivating: 5, clearing: 1, tending: 0 }, // tending=0: void has no active front this span
      field:      { cultivating: 5, clearing: 1, tending: 2 },
      atmosphere: { cultivating: 5, clearing: 1, tending: 1 },
    },
  });
  const fold = readingToFold(doc, 3, reading);
  const ground = fold.operator_events.filter((e) => e.grain === 'Ground');
  assert.equal(ground.length, 8, 'eight of nine cells fire; void.tending is the one omitted zero');
  assert.ok(!ground.some((e) => e.op === 'SIG'), 'SIG is void.tending — omitted, not emitted at zero weight');
});

test('reading ground channels: an entirely inactive stance (all three sites zero) contributes no events for it', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: {
      void:       { cultivating: 5, clearing: 0, tending: 1 },
      field:      { cultivating: 5, clearing: 0, tending: 1 },
      atmosphere: { cultivating: 5, clearing: 0, tending: 1 },
    },
  });
  const fold = readingToFold(doc, 3, reading);
  const ground = fold.operator_events.filter((e) => e.grain === 'Ground');
  assert.equal(ground.length, 6, 'clearing is entirely zero across all three sites — NUL/SEG/DEF never fire');
  assert.ok(!['NUL', 'SEG', 'DEF'].some((op) => ground.some((e) => e.op === op)));
});

test('reading ground channels: all-zero ground admits no Ground events at all', () => {
  const doc = docWithLog([]);
  const reading = baseReading({
    ground: {
      void:       { cultivating: 0, clearing: 0, tending: 0 },
      field:      { cultivating: 0, clearing: 0, tending: 0 },
      atmosphere: { cultivating: 0, clearing: 0, tending: 0 },
    },
  });
  const fold = readingToFold(doc, 3, reading);
  assert.ok(fold.operator_events.every((e) => e.grain !== 'Ground'));
});

test('reading ground channels: SYN_Cultivating_Field sums the systematic field.cultivating share AND a real merge event, not just one', () => {
  const doc = docWithLog([{ op: 'SYN', kind: 'merge', from: 'x', to: 'y', sentIdx: 3 }]);
  const reading = baseReading({
    ground: {
      void:       { cultivating: 5, clearing: 1, tending: 1 },
      field:      { cultivating: 5, clearing: 1, tending: 1 },
      atmosphere: { cultivating: 5, clearing: 1, tending: 1 },
    },
  });
  const fold = readingToFold(doc, 3, reading);
  const synGround = fold.operator_events.filter((e) => e.op === 'SYN' && e.grain === 'Ground');
  assert.equal(synGround.length, 2, 'one from the systematic field.cultivating share, one from the real merge event');
  assert.ok(synGround.some((e) => e.source === 'ground:field.cultivating'));
  assert.ok(synGround.some((e) => e.source === 'ground:syn-merge'));
});
