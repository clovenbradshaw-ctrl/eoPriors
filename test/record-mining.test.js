import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldSignature, jaccard, mineRepeatingRecords } from '../src/record-mining.js';

const fold = (...events) => ({ operator_events: events.map(([op, grain]) => ({ op, grain, weight_ppm: 1 })) });
const unit = (...events) => ({ fold: fold(...events) });

test('foldSignature projects a fold to stable operator/grain structure', () => {
  assert.deepEqual(foldSignature(fold(['EVA', 'Figure'], ['CON', 'Ground'], ['EVA', 'Figure'])), [
    'CON:Ground',
    'EVA:Figure',
  ]);
});

test('jaccard treats two empty signatures as fully compatible holds', () => {
  assert.equal(jaccard([], []), 1);
  assert.equal(jaccard(['a'], ['a', 'b']), 0.5);
});

test('mineRepeatingRecords detects contiguous repeated records in the fold stream', () => {
  const units = [
    unit(['DEF', 'Figure']), unit(['CON', 'Figure']),
    unit(['DEF', 'Figure']), unit(['CON', 'Figure']),
  ];
  const [group] = mineRepeatingRecords(units, { minUnits: 2, maxUnits: 2, similarity: 1 });
  assert.deepEqual(group.records, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.equal(group.confidence, 1);
});

test('mineRepeatingRecords tolerates unrelated interleaving between record instances', () => {
  const units = [
    unit(['DEF', 'Figure']), unit(['CON', 'Figure']),
    unit(['SIG', 'Ground']),
    unit(['DEF', 'Figure']), unit(['CON', 'Figure']),
    unit(['REC', 'Ground']),
    unit(['DEF', 'Figure']), unit(['CON', 'Figure']),
  ];
  const [group] = mineRepeatingRecords(units, { minUnits: 2, maxUnits: 2, similarity: 1, maxGap: 1 });
  assert.deepEqual(group.records, [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 8 }]);
});
