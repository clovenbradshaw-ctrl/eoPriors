import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  assertNoFreeStringLiteral,
  assertNoMemberRoster,
  assertKindVocabularyFirewall,
  validateKindVocabulary,
  kindVocabularyContentHash,
  FirewallViolationError,
} from '../src/kind-vocabulary/firewall.js';
import { validateReaderVersion, assertReaderVersion } from '../src/kind-vocabulary/reader-version.js';
import { isReady, selectPriorSnapshotChannels } from '../src/kind-vocabulary/ready.js';
import { publishKindVocabulary, publishedKindFromCandidate } from '../src/kind-vocabulary/induction.js';
import { createNamingSidecar, nameKind, withDisplayNames } from '../src/kind-vocabulary/naming-sidecar.js';

function ajv() {
  const instance = new Ajv2020({ strict: false });
  addFormats(instance);
  instance.addSchema(JSON.parse(fs.readFileSync('schemas/pack-common.schema.json', 'utf8')));
  return instance;
}

// ── fixture: a hand-built stand-in for eoreader5's EntityKindCandidate@1 ────
// This is deliberately NOT imported from eoreader5 (it isn't released yet).
// It matches the documented contract in docs/03-prior-spec-kind-vocabulary.md
// §2.1/§3 closely enough to exercise publication, firewall, and readiness.
function fakeCandidate(overrides = {}) {
  return {
    id: 'entity-kind:sha256:' + 'a'.repeat(64),
    vocabulary: ['parameter:convenes_meeting', 'parameter:issues_resolution'],
    parameters: [
      {
        id: 'parameter:convenes_meeting',
        provenance_expression: { op: 'count', channel_index: 3, args: [{ op: 'event_type', channel_index: 3 }] },
      },
      {
        id: 'parameter:issues_resolution',
        provenance_expression: { op: 'count', channel_index: 5 },
      },
    ],
    support_fraction: 0.71,
    transfer_gain: 0.34,
    membership_null: { schema: 'NullProtocol@1' },
    relative_effect: 0.39,
    n_propose: 412,
    n_holdout: 178,
    propose_members: ['entity:sha256:' + 'b'.repeat(64), 'entity:sha256:' + 'c'.repeat(64)],
    holdout_members: ['entity:sha256:' + 'd'.repeat(64)],
    ...overrides,
  };
}

function fakePocket(overrides = {}) {
  return {
    id: 'pocket:municipal-en:v2',
    label: 'Anglophone municipal record',
    n_sources: 8104,
    n_entities: 22391,
    date_range: ['2009-01-01', '2026-06-30'],
    ...overrides,
  };
}

async function makeVocabulary(overrides = {}) {
  return publishKindVocabulary({
    basisId: 'basis:sha256:' + 'e'.repeat(64),
    operatorEpoch: 'eo-2026-07',
    readerVersion: 'eoreader5@1.0.0',
    pocket: fakePocket(),
    candidates: [fakeCandidate()],
    ...overrides,
  });
}

// ── acceptance 1: schema validity, firewall, no roster ──────────────────────
test('KindVocabulary@1 validates against its schema', async () => {
  const schema = JSON.parse(fs.readFileSync('schemas/kind-vocabulary.schema.json', 'utf8'));
  const validate = ajv().compile(schema);
  const payload = await makeVocabulary();
  assert.equal(validate(payload), true, JSON.stringify(validate.errors));
  assert.equal(await validateKindVocabulary(payload), payload);
});

test('PriorSnapshot@1 channels admit kind-vocabulary', () => {
  const instance = ajv();
  const schema = JSON.parse(fs.readFileSync('schemas/prior-snapshot.schema.json', 'utf8'));
  const validate = instance.compile(schema);
  const snapshot = {
    schema: 'PriorSnapshot@1',
    snapshot_id: 'prior:sha256:' + 'a'.repeat(64),
    spec_version: '1.0.0',
    operator_epoch: 'eo-2026-07',
    engine_compatibility: 'eoreader5.0@1.0.0',
    scope: { media_types: ['text'], languages: ['en'], domains: ['municipal'], source_families: ['text'], limitations: [] },
    channels: ['priorMass', 'priorBond', 'priorProp', 'kind-vocabulary'],
    packs: [{ pack_id: 'pack:sha256:' + 'b'.repeat(64), pack_type: 'exemplar-basis', schema: 'ExemplarBasisPack@1', content_hash: 'sha256:' + 'c'.repeat(64) }],
    governance_head: ['event:sha256:' + 'd'.repeat(64)],
    build: { projector: 'eopriors@1.0.0', determinism: 'deterministic', policies: [], algorithms: ['kind-vocabulary@1.0.0'], corpus_splits: [], basis_ids: ['basis:sha256:' + 'e'.repeat(64)] },
    rights_manifest_id: 'rights:sha256:' + 'f'.repeat(64),
  };
  assert.equal(validate(snapshot), true, JSON.stringify(validate.errors));
});

test('provenance_expression firewall accepts a well-formed expression AST', () => {
  assert.doesNotThrow(() => assertNoFreeStringLiteral({ op: 'count', channel_index: 1, args: [{ op: 'event_type', channel_index: 1 }, 3, true] }));
});

test('provenance_expression firewall rejects a free string literal at the root', () => {
  assert.throws(() => assertNoFreeStringLiteral('the convening body'), FirewallViolationError);
});

test('provenance_expression firewall rejects a free string literal nested in args', () => {
  assert.throws(
    () => assertNoFreeStringLiteral({ op: 'count', args: [{ op: 'literal_quote', args: ['Springfield City Council'] }] }),
    FirewallViolationError,
  );
});

test('provenance_expression firewall rejects an unknown key smuggling content', () => {
  assert.throws(
    () => assertNoFreeStringLiteral({ op: 'count', note: 'convening body' }),
    FirewallViolationError,
  );
});

test('published KindVocabulary@1 never carries propose_members/holdout_members/members', async () => {
  const payload = await makeVocabulary();
  assert.doesNotThrow(() => assertNoMemberRoster(payload));
  for (const kind of payload.kinds) {
    assert.equal('propose_members' in kind, false);
    assert.equal('holdout_members' in kind, false);
    assert.equal('members' in kind, false);
  }
});

test('assertKindVocabularyFirewall rejects a payload where a roster leaked through', async () => {
  const payload = await makeVocabulary();
  const leaked = { ...payload, kinds: [{ ...payload.kinds[0], propose_members: ['entity:sha256:' + 'b'.repeat(64)] }] };
  assert.throws(() => assertKindVocabularyFirewall(leaked), FirewallViolationError);
});

// ── acceptance 2: republication determinism ──────────────────────────────────
test('republication with identical inputs produces identical content_hash', async () => {
  const first = await makeVocabulary();
  const second = await makeVocabulary();
  assert.equal(first.content_hash, second.content_hash);
  assert.equal(first.content_hash, await kindVocabularyContentHash(first));
});

test('republication with different pocket data changes content_hash', async () => {
  const first = await makeVocabulary();
  const second = await makeVocabulary({ pocket: fakePocket({ n_sources: 9000 }) });
  assert.notEqual(first.content_hash, second.content_hash);
});

// ── acceptance 3: reader_version mismatch refused loudly ────────────────────
test('reader_version match validates', async () => {
  const payload = await makeVocabulary();
  const result = validateReaderVersion(payload, 'eoreader5@1.0.0');
  assert.equal(result.valid, true);
});

test('reader_version mismatch is refused and names the mismatch', async () => {
  const payload = await makeVocabulary();
  const result = validateReaderVersion(payload, 'eoreader5@2.0.0');
  assert.equal(result.valid, false);
  assert.match(result.reason, /reader_version mismatch/);
  assert.equal(result.channelReaderVersion, 'eoreader5@1.0.0');
  assert.equal(result.engineReaderVersion, 'eoreader5@2.0.0');
});

test('assertReaderVersion throws loudly, naming both versions in the message', async () => {
  const payload = await makeVocabulary();
  assert.throws(
    () => assertReaderVersion(payload, 'eoreader5@2.0.0'),
    /reader_version refused.*eoreader5@1\.0\.0.*eoreader5@2\.0\.0/s,
  );
  assert.doesNotThrow(() => assertReaderVersion(payload, 'eoreader5@1.0.0'));
});

// ── §3.4 / acceptance 5: isReady pure predicate ─────────────────────────────
function readyCandidateChannel(overrides = {}) {
  return {
    entityHistories: { medianNSteps: 40 },
    splits: [
      { seed: 'a', recovered: true, transferGain: 0.3, membershipNullTransferGain: 0.05, relativeEffectHoldout: 0.2 },
      { seed: 'b', recovered: true, transferGain: 0.28, membershipNullTransferGain: 0.05, relativeEffectHoldout: 0.18 },
      { seed: 'c', recovered: true, transferGain: 0.31, membershipNullTransferGain: 0.05, relativeEffectHoldout: 0.22 },
    ],
    coreferenceFragmentation: 0.1,
    ...overrides,
  };
}

test('isReady passes a well-formed ready candidate channel', () => {
  const result = isReady(readyCandidateChannel());
  assert.equal(result.ready, true, JSON.stringify(result.reasons));
});

test('isReady fails on too few independent splits with a named reason', () => {
  const result = isReady(readyCandidateChannel({ splits: readyCandidateChannel().splits.slice(0, 2) }));
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.check === 'min_independent_splits'));
});

test('isReady fails when a split does not recover the kind', () => {
  const channel = readyCandidateChannel();
  channel.splits[1].recovered = false;
  const result = isReady(channel);
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.check === 'kind_recovers_across_splits'));
});

test('isReady fails when transfer gain does not clear the membership null', () => {
  const channel = readyCandidateChannel();
  channel.splits[0].transferGain = 0.01;
  const result = isReady(channel);
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.check === 'transfer_gain_clears_membership_null'));
});

test('isReady fails when median n_steps is not well above the 9-step floor', () => {
  const result = isReady(readyCandidateChannel({ entityHistories: { medianNSteps: 10 } }));
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.check === 'median_n_steps_above_floor'));
});

test('isReady fails when coreference fragmentation is at/above threshold', () => {
  const result = isReady(readyCandidateChannel({ coreferenceFragmentation: 0.9 }));
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.check === 'coreference_fragmentation_below_threshold'));
});

test('an unready pocket omits kind-vocabulary from PriorSnapshot.channels', () => {
  const baseChannels = ['priorMass', 'priorBond', 'priorProp'];
  const channels = selectPriorSnapshotChannels(baseChannels, readyCandidateChannel({ coreferenceFragmentation: 0.9 }));
  assert.deepEqual(channels, baseChannels);
  assert.equal(channels.includes('kind-vocabulary'), false);
});

test('a ready pocket includes kind-vocabulary in PriorSnapshot.channels', () => {
  const baseChannels = ['priorMass', 'priorBond', 'priorProp'];
  const channels = selectPriorSnapshotChannels(baseChannels, readyCandidateChannel());
  assert.equal(channels.includes('kind-vocabulary'), true);
  assert.deepEqual(channels, ['priorMass', 'priorBond', 'priorProp', 'kind-vocabulary']);
});

// ── acceptance 6: naming pipeline has no read path into induction ───────────
test('naming sidecar structural separation: induction.js does not import naming-sidecar.js', () => {
  const inductionSource = fs.readFileSync(path.join('src', 'kind-vocabulary', 'induction.js'), 'utf8');
  const importLines = inductionSource
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line) || /require\(/.test(line));
  const importsNamingSidecar = importLines.some((line) => line.includes('naming-sidecar'));
  assert.equal(importsNamingSidecar, false, `induction.js must not import naming-sidecar.js, found:\n${importLines.join('\n')}`);
});

test('naming sidecar structural separation: firewall.js has no import edge into naming-sidecar.js', () => {
  // firewall.js's own doc comments are allowed to reference naming-sidecar.js
  // in prose (explaining why the split exists) — what must never appear is an
  // actual import/require statement pulling it in.
  const firewallSource = fs.readFileSync(path.join('src', 'kind-vocabulary', 'firewall.js'), 'utf8');
  const importLines = firewallSource
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line) || /require\(/.test(line));
  const importsNamingSidecar = importLines.some((line) => line.includes('naming-sidecar'));
  assert.equal(importsNamingSidecar, false, `firewall.js must not import naming-sidecar.js, found:\n${importLines.join('\n')}`);
});

test('naming pipeline: name a kind, apply it as a display-only merge', async () => {
  const payload = await makeVocabulary();
  let sidecar = createNamingSidecar();
  sidecar = nameKind(sidecar, {
    kindId: payload.kinds[0].id,
    vocabularyContentHash: payload.content_hash,
    name: 'convening body',
    namedBy: 'curator:mfl',
    namedAt: '2026-07-24T00:00:00.000Z',
  });
  const displayed = withDisplayNames(payload, sidecar);
  assert.equal(displayed.kinds[0].external_name, 'convening body');
  assert.match(displayed.kinds[0].external_name_provenance, /^human, 2026-07-24T00:00:00\.000Z, curator:mfl, against sha256:/);
  // original publication artifact is untouched — naming is a later, separate act
  assert.equal('external_name' in payload.kinds[0], false);
});

test('naming pipeline: stale sidecar entry (content_hash mismatch) is dropped, not applied', async () => {
  const payload = await makeVocabulary();
  let sidecar = createNamingSidecar();
  sidecar = nameKind(sidecar, {
    kindId: payload.kinds[0].id,
    vocabularyContentHash: 'sha256:' + '9'.repeat(64), // stale on purpose
    name: 'convening body',
    namedBy: 'curator:mfl',
  });
  const displayed = withDisplayNames(payload, sidecar);
  assert.equal('external_name' in displayed.kinds[0], false);
});

test('external_name is display-only: engine-relevant kind fields exclude it', async () => {
  const payload = await makeVocabulary();
  let sidecar = createNamingSidecar();
  sidecar = nameKind(sidecar, {
    kindId: payload.kinds[0].id,
    vocabularyContentHash: payload.content_hash,
    name: 'convening body',
    namedBy: 'curator:mfl',
  });
  const displayed = withDisplayNames(payload, sidecar);
  const { stripDisplayOnlyFields } = await import('../src/kind-vocabulary/firewall.js');
  const engineKind = stripDisplayOnlyFields(displayed.kinds[0]);
  assert.equal('external_name' in engineKind, false);
  assert.equal('external_name_provenance' in engineKind, false);
  assert.equal(engineKind.vocabulary.length > 0, true);
});

// ── acceptance 7: round trip with a fixture municipal-style pocket ──────────
test('round trip: fixture municipal pocket publishes, validates, and strips its roster', async () => {
  const candidates = [
    fakeCandidate(),
    fakeCandidate({
      id: 'entity-kind:sha256:' + '1'.repeat(64),
      vocabulary: ['parameter:files_permit'],
      parameters: [{ id: 'parameter:files_permit', provenance_expression: { op: 'count', channel_index: 2 } }],
      propose_members: ['entity:sha256:' + '2'.repeat(64)],
      holdout_members: ['entity:sha256:' + '3'.repeat(64)],
    }),
  ];
  const payload = await publishKindVocabulary({
    basisId: 'basis:sha256:' + 'e'.repeat(64),
    operatorEpoch: 'eo-2026-07',
    readerVersion: 'eoreader5@1.0.0',
    pocket: fakePocket(),
    candidates,
  });

  const schema = JSON.parse(fs.readFileSync('schemas/kind-vocabulary.schema.json', 'utf8'));
  const validate = ajv().compile(schema);
  assert.equal(validate(payload), true, JSON.stringify(validate.errors));
  assert.equal(payload.kinds.length, 2);
  assert.deepEqual(publishedKindFromCandidate(candidates[0]).id, candidates[0].id);
  assert.doesNotThrow(() => assertNoMemberRoster(payload));
  await validateKindVocabulary(payload);
});

// ── supplementary: assertReaderVersion throws loudly, naming the mismatch ───
test('assertReaderVersion throws loudly on a reader_version mismatch, naming both versions', async () => {
  const payload = await makeVocabulary();
  assert.throws(
    () => assertReaderVersion(payload, 'eoreader5@2.0.0'),
    (err) => err.message.includes('eoreader5@1.0.0') && err.message.includes('eoreader5@2.0.0'),
  );
});

test('assertReaderVersion does not throw on a matching reader_version', async () => {
  const payload = await makeVocabulary();
  assert.doesNotThrow(() => assertReaderVersion(payload, 'eoreader5@1.0.0'));
});

// ── supplementary: selectPriorSnapshotChannels (pipeline/assembly seam) ─────
test('selectPriorSnapshotChannels omits kind-vocabulary for an unready candidate channel', () => {
  const unready = readyCandidateChannel({ coreferenceFragmentation: 0.9 });
  const baseChannels = ['priorMass', 'priorBond', 'priorProp'];
  const channels = selectPriorSnapshotChannels(baseChannels, unready);
  assert.deepEqual(channels, baseChannels);
});

test('selectPriorSnapshotChannels includes kind-vocabulary for a ready candidate channel', () => {
  const baseChannels = ['priorMass', 'priorBond', 'priorProp'];
  const channels = selectPriorSnapshotChannels(baseChannels, readyCandidateChannel());
  assert.deepEqual(channels, ['priorMass', 'priorBond', 'priorProp', 'kind-vocabulary']);
});

// ── supplementary: external_name inert/display-only, structural scan ────────
test('external_name is never a live identifier in the induction/readiness/reader-version modules (only naming-sidecar.js and firewall.js#stripDisplayOnlyFields may reference it)', () => {
  // firewall.js is excluded here because it defines stripDisplayOnlyFields,
  // the one sanctioned place external_name is named in "engine" code — and
  // it only ever appears there in a destructure-and-discard, never read for
  // a decision (see the dedicated stripDisplayOnlyFields tests above).
  // induction.js, ready.js, and reader-version.js are the modules an
  // actual matching/classification/publication decision path runs through;
  // none of them may reference the field name at all.
  const dir = path.join('src', 'kind-vocabulary');
  const engineFiles = ['induction.js', 'ready.js', 'reader-version.js'];
  for (const file of engineFiles) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const codeOnly = text.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    assert.equal(codeOnly.includes('external_name'), false, `${file} must not read/write external_name outside comments`);
  }
});

test('firewall.js references external_name only inside stripDisplayOnlyFields (destructure-and-discard, never read for a decision)', () => {
  const text = fs.readFileSync(path.join('src', 'kind-vocabulary', 'firewall.js'), 'utf8');
  const codeOnly = text.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const hits = [...codeOnly.matchAll(/external_name/g)];
  // Exactly the two destructured bindings inside stripDisplayOnlyFields:
  // `const { external_name, external_name_provenance, ...engineFields } = kind;`
  assert.equal(hits.length, 2, `expected exactly the two stripDisplayOnlyFields bindings, found ${hits.length}`);
  const fnBody = codeOnly.slice(codeOnly.indexOf('function stripDisplayOnlyFields'));
  assert.ok(fnBody.includes('external_name') && fnBody.includes('external_name_provenance'));
});

// ── acceptance 4: requires real induction — SKIP ─────────────────────────────
test('acceptance 4: full induction against real eoreader5 output', { skip: true }, () => {
  // TODO(eoreader5 04-engine-spec-entity-kinds.md): this acceptance item
  // requires a real induceEntityKind run producing genuine EntityKindCandidate@1
  // records, which depends on eoreader5's entity-kinds spec (not yet
  // built/merged, per task instructions built in parallel by another agent).
  // Per the task instructions, this repo does not fake induction logic — the
  // rest of this suite validates publication/firewall/readiness against
  // hand-built EntityKindCandidate@1-*shaped* fixtures instead.
});
