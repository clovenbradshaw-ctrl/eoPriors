import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentParagraphs, segmentSentences, segmentLines, segmentObservations } from '../src/segment.js';

test('segmentParagraphs offsets are exact against the original text', () => {
  const text = 'First paragraph, one line.\n\nSecond paragraph\nwith two lines.\n\n\nThird.';
  const spans = segmentParagraphs(text);
  assert.equal(spans.length, 3);
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.text);
  assert.equal(spans[0].text, 'First paragraph, one line.');
  assert.equal(spans[1].text, 'Second paragraph\nwith two lines.');
  assert.equal(spans[2].text, 'Third.');
});

test('segmentSentences splits on terminal punctuation followed by capital, not on abbreviation-adjacent periods alone', () => {
  const text = 'The cat sat. The dog ran! Did it work?';
  const spans = segmentSentences(text);
  assert.deepEqual(spans.map((s) => s.text), ['The cat sat.', 'The dog ran!', 'Did it work?']);
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.text);
});

test('segmentSentences baseOffset shifts returned offsets, still exact against the ORIGINAL text', () => {
  const original = 'prefix. Sentence one. Sentence two.';
  const sub = original.slice(8); // "Sentence one. Sentence two."
  const spans = segmentSentences(sub, 8);
  for (const s of spans) assert.equal(original.slice(s.start, s.end), s.text);
});

test('segmentObservations nests sentence spans under paragraph_index and both grains have exact offsets', () => {
  const text = 'Para one sentence A. Para one sentence B.\n\nPara two only sentence.';
  const { paragraphs, sentences } = segmentObservations(text);
  assert.equal(paragraphs.length, 2);
  assert.equal(sentences.length, 3);
  assert.equal(sentences.filter((s) => s.paragraph_index === 0).length, 2);
  assert.equal(sentences.filter((s) => s.paragraph_index === 1).length, 1);
  for (const s of sentences) assert.equal(text.slice(s.start, s.end), s.text);
});

test('segmentLines splits on newlines, drops blank lines, offsets exact against the original text', () => {
  const text = 'import os\nimport sys\n\nx = foo.bar()';
  const spans = segmentLines(text);
  assert.deepEqual(spans.map((s) => s.text), ['import os', 'import sys', 'x = foo.bar()']);
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.text);
  assert.ok(spans.every((s) => s.kind === 'line'));
});

test('segmentLines baseOffset keeps offsets exact against the ORIGINAL text', () => {
  const original = 'HEADER\nfirst line\nsecond line';
  const sub = original.slice(7); // "first line\nsecond line"
  const spans = segmentLines(sub, 7);
  for (const s of spans) assert.equal(original.slice(s.start, s.end), s.text);
});

test('line grain rescues code that sentence grain collapses: a block of imports is one sentence but many lines', () => {
  // Real defect this fixes: code terminates statements with newlines, not
  // ./!/?, so under sentence grain a whole import block reads as ONE span.
  const code = 'import collections.abc as cabc\nimport inspect\nimport os\nimport sys';
  const { sentences, lines } = segmentObservations(code);
  assert.equal(sentences.length, 1);           // sentence grain sees one blob (the defect)
  assert.equal(lines.length, 4);               // line grain sees the four real statements (the fix)
  for (const l of lines) assert.equal(code.slice(l.start, l.end), l.text);
  assert.equal(lines[0].text, 'import collections.abc as cabc');
});

test('segmentObservations sentence grain is unchanged by the added line grain (parity)', () => {
  const text = 'Para one sentence A. Para one sentence B.\n\nPara two only sentence.';
  const { sentences } = segmentObservations(text);
  assert.equal(sentences.length, 3);           // exactly as before lines were added
  assert.deepEqual(sentences.map((s) => s.text), ['Para one sentence A.', 'Para one sentence B.', 'Para two only sentence.']);
});
