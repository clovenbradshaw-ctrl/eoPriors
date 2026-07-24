import assert from 'node:assert/strict';
import test from 'node:test';
import { pocketContentHash, validatePocket, assertBasisComparable } from '../src/pocket.js';

async function makePocket(overrides = {}) {
  const pocket = {
    schema: 'Pocket@1',
    pocket_id: 'pocket:demo',
    version: '0.1.0',
    role: 'corpus',
    reader_version: 'eoreader4.2@1.0.0',
    basis_id: 'exemplar-basis:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scope: { languages: ['en'], media: ['text'], genres: ['prose'], date_range: null },
    provenance: { sources_manifest_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', curation_note: 'demo manifest only', license: 'test' },
    readiness: { per_channel_convergence: { priorMass: true, priorBond: true, priorProp: true }, singleton_rate: { priorMass_ppm: 1, priorBond_ppm: 1, priorProp_ppm: 1 }, sample_n: 3 },
    distributions: { priorMass: { CON_Ground: 500000, NUL_Ground: 500000 }, priorBond: {}, priorProp: {} },
    ...overrides,
  };
  pocket.content_hash = await pocketContentHash(pocket);
  return pocket;
}

test('validates distribution-only corpus pockets with matching reader major version', async () => {
  const pocket = await makePocket();
  assert.equal(await validatePocket(pocket, { engineReaderVersion: 'eoreader4.9@2.0.0' }), pocket);
});

test('refuses pocket reader major-version mismatch loudly', async () => {
  const pocket = await makePocket();
  await assert.rejects(() => validatePocket(pocket, { engineReaderVersion: 'eoreader5.0@1.0.0' }), /incompatible/);
});

test('refuses renderable corpus text inside distributions', async () => {
  const pocket = await makePocket({ distributions: { priorMass: { sentence: 'source text must not ship' } } });
  pocket.content_hash = await pocketContentHash(pocket);
  await assert.rejects(() => validatePocket(pocket, { engineReaderVersion: 'eoreader4.2@1.0.0' }), /firewall violation/);
});

test('refuses silent mixing of pockets on different bases', async () => {
  const first = await makePocket();
  const second = await makePocket({ basis_id: 'exemplar-basis:sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' });
  assert.throws(() => assertBasisComparable([first, second]), /different bases/);
});

test('refuses pockets whose serialized content hash changed', async () => {
  const pocket = await makePocket();
  pocket.version = '0.2.0';
  await assert.rejects(() => validatePocket(pocket, { engineReaderVersion: 'eoreader4.2@1.0.0' }), /hash mismatch/);
});
