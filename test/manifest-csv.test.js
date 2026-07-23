import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifestCsv } from '../scripts/lib/manifest-csv.mjs';

test('parses a plain CSV with no quoting', () => {
  const csv = 'id,title,author,subject_key,words,est_pages\n368,Acres of Diamonds,Conwell,Success,1000,4\n';
  const byId = parseManifestCsv(csv);
  assert.equal(byId['368'].title, 'Acres of Diamonds');
  assert.equal(byId['368'].subject_key, 'Success');
});

test('parses a quoted field containing a comma', () => {
  const csv = 'id,title,author,subject_key,words,est_pages\n1,"Sea stories, war stories",Author,X,1,1\n';
  const byId = parseManifestCsv(csv);
  assert.equal(byId['1'].title, 'Sea stories, war stories');
});

test('REGRESSION: a quoted field containing an embedded newline does not shift subsequent fields', () => {
  // Reproduces the exact bug found analyzing the real corpus: a multi-line
  // Gutenberg title (a subtitle on its own physical line inside the quotes)
  // made a naive line-by-line CSV parser treat the newline as a row
  // separator, silently reading subject_key back as undefined for that row.
  const csv = 'id,title,author,subject_key,words,est_pages\n' +
    '60819,"The Lathe & Its Uses\nOr, Instruction in the Art of Turning",Anonymous,"Turning (Lathe work); Lathes",5000,20\n' +
    '368,Acres of Diamonds,Conwell,Success,1000,4\n';
  const byId = parseManifestCsv(csv);
  assert.equal(byId['60819'].subject_key, 'Turning (Lathe work); Lathes');
  assert.ok(byId['60819'].title.includes('The Lathe & Its Uses'));
  assert.ok(byId['60819'].title.includes('Or, Instruction in the Art of Turning'));
  // the row AFTER the multi-line one must still parse correctly, not be
  // shifted or swallowed by the embedded-newline miscount
  assert.equal(byId['368'].title, 'Acres of Diamonds');
  assert.equal(byId['368'].subject_key, 'Success');
});

test('parses an escaped double-quote inside a quoted field', () => {
  const csv = 'id,title,author,subject_key,words,est_pages\n1,"He said ""hello""",Author,X,1,1\n';
  const byId = parseManifestCsv(csv);
  assert.equal(byId['1'].title, 'He said "hello"');
});

test('handles CRLF line endings without introducing a stray blank row', () => {
  const csv = 'id,title,author,subject_key,words,est_pages\r\n1,Title,Author,X,1,1\r\n';
  const byId = parseManifestCsv(csv);
  assert.equal(Object.keys(byId).length, 1);
  assert.equal(byId['1'].title, 'Title');
});
