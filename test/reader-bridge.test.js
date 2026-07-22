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

test('every operator_event lands at Figure grain — representation.schema.json reserves Ground/Pattern for other processes', () => {
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
