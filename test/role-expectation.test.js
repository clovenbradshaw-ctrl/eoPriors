import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { roleExpectationContentHash, validateRoleExpectation } from '../src/role-expectation.js';

function ajv() {
  const instance = new Ajv2020({ strict: false });
  addFormats(instance);
  instance.addSchema(JSON.parse(fs.readFileSync('schemas/pack-common.schema.json', 'utf8')));
  return instance;
}

async function makeRoleExpectation(overrides = {}) {
  const payload = {
    schema: 'RoleExpectation@1',
    basis_id: 'exemplar-basis:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    operator_epoch: 'eo-2026-07',
    content_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    reader_version: 'eoreader5.0@1.0.0',
    pocket: { id: 'pocket:news-en', version: '3.0.0', n_sources: 41207, date_range: ['1996-01-01', '2026-06-30'] },
    expectations: [{
      exemplar_id: 'ex:071',
      attributive_share: { mean_ppm: 910000, sd_ppm: 80000, n: 18442 },
      coupling_dispersion: { mean_ppm: 940000, sd_ppm: 50000, n: 18442 },
      relative_mass: { mean_ppm: 310000, sd_ppm: 190000, n: 18442 },
      apparatus_rate_ppm: 870000,
    }],
    null_samples: { attributive_share: [100000, 200000], coupling_dispersion: [300000, 400000], relative_mass: [500000, 600000] },
    readiness: { min_n_per_exemplar: 1000, good_turing_singleton_rate_ppm: 1000, apparatus_rate_heldout_delta_ppm: 5000, derive_null_tolerance_ppm: 10000, ready: true },
    ballast: { ungated_fraction_ppm: 125000, floor_ppm: 100000 },
    ...overrides,
  };
  payload.content_hash = await roleExpectationContentHash(payload);
  return payload;
}

test('RoleExpectation@1 validates against its schema and firewall', async () => {
  const schema = JSON.parse(fs.readFileSync('schemas/role-expectation.schema.json', 'utf8'));
  const validate = ajv().compile(schema);
  const payload = await makeRoleExpectation();
  assert.equal(validate(payload), true, JSON.stringify(validate.errors));
  assert.equal(await validateRoleExpectation(payload), payload);
});

test('RoleExpectation@1 rejects referent names in free string fields', async () => {
  const payload = await makeRoleExpectation({ pocket: { id: 'pocket:news-en', version: '3.0.0', n_sources: 41207, date_range: ['1996-01-01', '2026-06-30'], label: 'NPR and Reuters news' } });
  await assert.rejects(() => validateRoleExpectation(payload, { requireCurrentHash: false }), /firewall violation/);
});

test('RoleExpectation@1 rejects ballast below publication floor', async () => {
  const payload = await makeRoleExpectation({ ballast: { ungated_fraction_ppm: 50000, floor_ppm: 100000 } });
  payload.content_hash = await roleExpectationContentHash(payload);
  await assert.rejects(() => validateRoleExpectation(payload), /ballast fraction/);
});

test('PriorSnapshot@1 channels admit referent-role', () => {
  const instance = ajv();
  const schema = JSON.parse(fs.readFileSync('schemas/prior-snapshot.schema.json', 'utf8'));
  const validate = instance.compile(schema);
  const snapshot = {
    schema: 'PriorSnapshot@1',
    snapshot_id: 'prior:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    spec_version: '1.0.0',
    operator_epoch: 'eo-2026-07',
    engine_compatibility: 'eoreader5.0@1.0.0',
    scope: { media_types: ['text'], languages: ['en'], domains: ['news'], source_families: ['text'], limitations: [] },
    channels: ['priorMass', 'priorBond', 'priorProp', 'referent-role'],
    packs: [{ pack_id: 'pack:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', pack_type: 'exemplar-basis', schema: 'ExemplarBasisPack@1', content_hash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }],
    governance_head: ['event:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'],
    build: { projector: 'eopriors@1.0.0', determinism: 'deterministic', policies: [], algorithms: ['role-expectation@1.0.0'], corpus_splits: [], basis_ids: ['exemplar-basis:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] },
    rights_manifest_id: 'rights:sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  };
  assert.equal(validate(snapshot), true, JSON.stringify(validate.errors));
});
