import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson, sha256Ref, makeEvent, verifyEventId, assertNoFloats,
  NonIntegerNumberError, isGatewayWritable, isProjectorOnly, GATEWAY_WRITABLE_EVENT_TYPES,
} from '../src/event.js';

const cfgHash = await sha256Ref('test-config');
const run = () => ({ run_id: 'uuid:11111111-1111-1111-1111-111111111111', batch_id: 'uuid:22222222-2222-2222-2222-222222222222', configuration_hash: cfgHash });

test('canonicalJson sorts keys regardless of insertion order', () => {
  const a = canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } });
  const b = canonicalJson({ c: { y: 2, z: 1 }, a: 2, b: 1 });
  assert.equal(a, b);
});

test('canonicalJson preserves array order', () => {
  assert.equal(canonicalJson({ inputs: ['sha256:2', 'sha256:1'] }), '{"inputs":["sha256:2","sha256:1"]}');
});

test('assertNoFloats accepts integers and rejects non-integers with a path', () => {
  assert.doesNotThrow(() => assertNoFloats({ a: 1, b: [2, 3], c: { d: -5 } }));
  assert.throws(() => assertNoFloats({ a: 1.5 }), NonIntegerNumberError);
  assert.throws(() => assertNoFloats({ a: [1, { b: 0.1 }] }), (err) => err.path === 'a[1].b');
});

test('makeEvent computes an event_id that verifyEventId accepts, and it changes if payload changes', async () => {
  const base = {
    event_type: 'source.discovered',
    actor: { type: 'human', id: 'human:test', version: '1.0.0' },
    run: run(),
    payload: { source_id: 'source:sha256:' + '0'.repeat(64), uri: 'https://example.com' },
  };
  const event = await makeEvent(base);
  assert.ok(event.event_id.startsWith('sha256:'));
  assert.ok(await verifyEventId(event));

  const tampered = { ...event, payload: { ...event.payload, uri: 'https://example.com/other' } };
  assert.ok(!(await verifyEventId(tampered)), 'changing payload after hashing must invalidate event_id');
});

test('makeEvent rejects unknown event_type', async () => {
  await assert.rejects(async () => makeEvent({
    event_type: 'not.a.real.type',
    actor: { type: 'human', id: 'human:test', version: '1.0.0' },
    run: run(),
    payload: {},
  }));
});

test('makeEvent rejects floats in payload before hashing', async () => {
  await assert.rejects(async () => makeEvent({
    event_type: 'observation.flagged',
    actor: { type: 'human', id: 'human:test', version: '1.0.0' },
    run: run(),
    payload: { weight_ppm: 0.5 },
  }), NonIntegerNumberError);
});

test('gateway/projector event type lists are disjoint and non-empty', () => {
  const writable = new Set(GATEWAY_WRITABLE_EVENT_TYPES);
  assert.ok(writable.size > 0);
  assert.ok(isGatewayWritable('observation.measured'));
  assert.ok(!isGatewayWritable('holon.emerged'));
  assert.ok(isProjectorOnly('exemplar.basis.activated'));
  assert.ok(!isProjectorOnly('exemplar.basis.selected'));
});
