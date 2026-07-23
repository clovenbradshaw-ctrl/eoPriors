import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, stddev, pearson } from '../scripts/lib/stats.mjs';

test('mean and stddev of a known small sample', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(Math.abs(stddev([2, 4, 6]) - Math.sqrt(8 / 3)) < 1e-9);
});

test('stddev of a constant series is exactly 0', () => {
  assert.equal(stddev([5, 5, 5, 5]), 0);
});

test('pearson correlation of a series with itself is 1', () => {
  const xs = [1, 3, 2, 5, 4];
  assert.ok(Math.abs(pearson(xs, xs) - 1) < 1e-9);
});

test('pearson correlation of a series with its exact negation is -1', () => {
  const xs = [1, 3, 2, 5, 4];
  const ys = xs.map((x) => -x);
  assert.ok(Math.abs(pearson(xs, ys) + 1) < 1e-9);
});

test('pearson correlation involving a constant series is 0, not NaN', () => {
  const xs = [1, 2, 3, 4];
  const ys = [7, 7, 7, 7];
  assert.equal(pearson(xs, ys), 0);
  assert.ok(!Number.isNaN(pearson(xs, ys)));
});

test('pearson of two independent-looking series is between -1 and 1', () => {
  const xs = [1, 5, 2, 8, 3, 9, 4];
  const ys = [9, 1, 7, 2, 6, 3, 8];
  const r = pearson(xs, ys);
  assert.ok(r >= -1 && r <= 1);
});
