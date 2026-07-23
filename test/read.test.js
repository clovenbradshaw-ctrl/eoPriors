import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReading, absoluteSentenceOffsets, EXTRACTION_PROTOCOL } from '../src/read.js';

test('EXTRACTION_PROTOCOL matches the vendored package version pinned in src/vendor/eoreader/README.md', () => {
  assert.equal(EXTRACTION_PROTOCOL, 'eoreader-parse@0.1.0');
});

test('extractReading segments sentences with exact offsets against the original text', () => {
  const text = 'Maria Alvarez founded Acme Corp in 2019. She later sold it to Globex.';
  const { sentences } = extractReading(text);
  assert.equal(sentences.length, 2);
  for (const s of sentences) assert.equal(text.slice(s.start, s.end), s.text);
});

test('extractReading extracts a subject-verb-object relation with entity identity and exact offsets', () => {
  const text = 'Maria Alvarez founded Acme Corp in 2019.';
  const { relations } = extractReading(text);
  assert.ok(relations.length >= 1);
  const rel = relations[0];
  assert.equal(text.slice(rel.subject.start, rel.subject.end), rel.subject.text);
  assert.equal(text.slice(rel.object.start, rel.object.end), rel.object.text);
  assert.equal(rel.subject.entitySlug, 'maria-alvarez');
  assert.equal(rel.object.entitySlug, 'acme-corp');
  assert.ok(typeof rel.confidence === 'number' && rel.confidence >= 0 && rel.confidence <= 1);
});

test('extractReading resolves coreference to the same entity slug across sentences', () => {
  const text = 'Maria Alvarez founded Acme Corp in 2019. She later sold it to Globex.';
  const { relations } = extractReading(text);
  const first = relations.find((r) => r.sentIdx === 0);
  const second = relations.find((r) => r.sentIdx === 1);
  assert.equal(first.subject.entitySlug, 'maria-alvarez');
  assert.equal(second.subject.entitySlug, first.subject.entitySlug); // "She" resolves back to Maria Alvarez
});

test('extractReading only reports corroborated coreference merges as equivalences, each traceable to a warrant', () => {
  const text = 'Acme Corp was founded in 2019. The company, now called Globex Labs, still operates today.';
  const { equivalences } = extractReading(text);
  for (const eq of equivalences) {
    assert.ok(eq.entitySlug, 'every reported equivalence names the entity it merges into');
    assert.ok(eq.warrant, 'every reported equivalence carries a warrant (SPEC.md invariant 9: no unlabeled assertion)');
    if (eq.start != null) assert.equal(text.slice(eq.start, eq.end), eq.label);
  }
});

test('absoluteSentenceOffsets advances a moving cursor so repeated identical sentences do not collide', () => {
  const text = 'It happened. It happened again elsewhere. It happened.';
  const sentences = ['It happened.', 'It happened again elsewhere.', 'It happened.'];
  const offsets = absoluteSentenceOffsets(text, sentences);
  assert.equal(offsets.length, 3);
  offsets.forEach((o, i) => assert.equal(text.slice(o.start, o.end), sentences[i]));
  assert.ok(offsets[2].start > offsets[0].start, 'the second occurrence must not resolve back to the first');
});
