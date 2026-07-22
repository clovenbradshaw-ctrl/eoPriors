import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentParagraphs, segmentSentences, segmentObservations } from '../src/segment.js';

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
