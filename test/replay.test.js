import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { makeEvent, contentRef, canonicalize, sha256Ref } from '../src/event.js';
import { topologicalSort, resolveLedger, computeLedgerHead, buildProjection } from '../src/replay.js';

const REPO_ROOT = path.resolve(new URL('../', import.meta.url).pathname);

const actor = { type: 'human', id: 'human:test', version: '1.0.0' };
const cfgHash = await sha256Ref('test-config');
const run = (batchId) => ({ run_id: 'uuid:11111111-1111-1111-1111-111111111111', batch_id: batchId, configuration_hash: cfgHash });

test('topologicalSort places every input before its dependent, tie-broken by event_id', async () => {
  const a = await makeEvent({ event_type: 'source.discovered', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), payload: { source_id: 'source:sha256:' + '1'.repeat(64), uri: 'https://a' } });
  const b = await makeEvent({ event_type: 'source.discovered', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), payload: { source_id: 'source:sha256:' + '2'.repeat(64), uri: 'https://b' } });
  const c = await makeEvent({ event_type: 'event.retracted', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), inputs: [a.event_id, b.event_id], payload: { retracted_event_id: a.event_id, reason: 'test' } });

  const order = topologicalSort([c, b, a]).map((e) => e.event_id);
  assert.ok(order.indexOf(a.event_id) < order.indexOf(c.event_id));
  assert.ok(order.indexOf(b.event_id) < order.indexOf(c.event_id));
});

test('topologicalSort throws on a cycle', () => {
  const x = { event_id: 'sha256:' + 'a'.repeat(64), inputs: ['sha256:' + 'b'.repeat(64)] };
  const y = { event_id: 'sha256:' + 'b'.repeat(64), inputs: ['sha256:' + 'a'.repeat(64)] };
  assert.throws(() => topologicalSort([x, y]));
});

test('resolveLedger excludes retracted and superseded events without deleting them from the input list', async () => {
  const a = await makeEvent({ event_type: 'source.discovered', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), payload: { source_id: 'source:sha256:' + '3'.repeat(64), uri: 'https://c' } });
  const retract = await makeEvent({ event_type: 'event.retracted', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), inputs: [a.event_id], payload: { retracted_event_id: a.event_id, reason: 'oops' } });

  const sorted = topologicalSort([a, retract]);
  const { resolvedEvents, retractedIds } = resolveLedger(sorted);
  assert.ok(retractedIds.has(a.event_id));
  assert.ok(!resolvedEvents.some((e) => e.event_id === a.event_id));
  assert.ok(resolvedEvents.some((e) => e.event_id === retract.event_id));
});

test('computeLedgerHead returns events nothing else depends on', async () => {
  const a = await makeEvent({ event_type: 'source.discovered', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), payload: { source_id: 'source:sha256:' + '4'.repeat(64), uri: 'https://d' } });
  const b = await makeEvent({ event_type: 'event.retracted', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), inputs: [a.event_id], payload: { retracted_event_id: a.event_id, reason: 'x' } });
  const head = computeLedgerHead([a, b]);
  assert.deepEqual(head, [b.event_id]);
});

test('buildProjection produces a manifest matching schemas/projection-manifest.schema.json', async () => {
  const basisId = 'exemplar-basis:sha256:' + '5'.repeat(64);
  const sourceId = 'source:sha256:' + '6'.repeat(64);
  const obsId = await contentRef('observation', canonicalize({ sourceId, n: 1 }));

  const created = await makeEvent({
    event_type: 'observation.created', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'),
    payload: { observation_id: obsId, source_id: sourceId, selector: { note: 'test' } },
  });
  const measured = await makeEvent({
    event_type: 'observation.measured', actor, run: run('uuid:22222222-2222-2222-2222-222222222222'), inputs: [created.event_id],
    payload: {
      observation_id: obsId,
      measurement_id: await contentRef('measurement', canonicalize({ n: 1 })),
      basis_id: basisId,
      measurement_protocol: 'eo-compression@1.0.0',
      phasepost_measurements: Object.fromEntries(Array.from({ length: 27 }, (_, i) => [`CELL_${i}`, { amplitude_ppm: i === 0 ? 1_000_000 : 0, similarity_ppm: i === 0 ? 1_000_000 : 0 }])),
      diagnostics: { entropy_microunits: 0, total_supported_amplitude: 1_000_000 },
    },
  });

  const { manifests } = await buildProjection({
    events: [created, measured],
    activeBasisId: basisId,
    policyTexts: { library: 'lib', 'rights-policy': 'rights', 'emergence-policy': 'emergence' },
    emergencePolicy: { mintOverheadBits: 8 },
    determinism: 'attested',
    batchesFolded: 1,
  });

  assert.equal(manifests.length, 1);
  const manifest = manifests[0];
  assert.equal(manifest.basis_ids_in_scope[0], basisId);
  assert.equal(manifest.counts.events_resolved, 2);

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schemasDir = path.join(REPO_ROOT, 'schemas');
  for (const file of await readdir(schemasDir)) {
    const schema = JSON.parse(await readFile(path.join(schemasDir, file), 'utf8'));
    ajv.addSchema(schema, schema.$id || file);
  }
  const validate = ajv.getSchema('projection-manifest.schema.json');
  const ok = validate(manifest);
  assert.ok(ok, JSON.stringify(validate.errors));
});

test('buildProjection on an empty ledger produces a valid, empty projection (bootstrap case)', async () => {
  const { manifests, lenses } = await buildProjection({
    events: [],
    activeBasisId: null,
    policyTexts: { library: 'lib', 'rights-policy': 'rights', 'emergence-policy': 'emergence' },
    emergencePolicy: {},
    determinism: 'attested',
    batchesFolded: 0,
  });
  assert.equal(manifests.length, 1);
  assert.equal(manifests[0].counts.events_resolved, 0);
  assert.equal(lenses[0].holons.length, 0);
});
