#!/usr/bin/env node
// scripts/validate-batches.mjs — the CI checks SPEC.md §12 names explicitly:
// reject any batch containing a §4.3 event type, a ledger_position field, a
// float in payload, or a mismatched event_id; also catches duplicate
// event_ids across the ledger. This mirrors what the gateway validator (§8)
// already checks before a batch ever reaches GitHub — CI is the second,
// independent enforcement of the same rules for anything that lands via a
// PR (an agent's own commit path, a manual fixture, etc.), not a substitute
// for the gateway.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { verifyEventId, isProjectorOnly } from '../src/event.js';

const REPO_ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const SCHEMAS_DIR = path.join(REPO_ROOT, 'schemas');
const BATCHES_DIR = path.join(REPO_ROOT, 'batches');

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.path ?? dir, e.name));
}

function assertNoLedgerPosition(value, filePath, trail = '') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoLedgerPosition(v, filePath, `${trail}[${i}]`));
  } else if (value && typeof value === 'object') {
    if ('ledger_position' in value) {
      throw new Error(`${filePath}${trail}: contains a ledger_position field — never legal on any event (SPEC.md invariant 2, §12).`);
    }
    for (const [k, v] of Object.entries(value)) assertNoLedgerPosition(v, filePath, `${trail}.${k}`);
  }
}

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schemaFiles = (await readdir(SCHEMAS_DIR)).filter((f) => f.endsWith('.schema.json'));
  for (const file of schemaFiles) {
    const schema = JSON.parse(await readFile(path.join(SCHEMAS_DIR, file), 'utf8'));
    ajv.addSchema(schema, schema.$id || file);
  }
  const validateEvent = ajv.getSchema('event.schema.json');

  const batchFiles = (await walk(BATCHES_DIR)).filter((f) => f.endsWith('.json')).sort();
  const seenEventIds = new Map(); // event_id -> first file that used it
  let errorCount = 0;
  const fail = (msg) => { console.error(`FAIL  ${msg}`); errorCount++; };

  for (const file of batchFiles) {
    const rel = path.relative(REPO_ROOT, file);
    let batch;
    try {
      batch = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      fail(`${rel}: not valid JSON (${err.message})`);
      continue;
    }
    assertNoLedgerPosition(batch, rel);

    for (const event of batch.events || []) {
      if (isProjectorOnly(event.event_type)) {
        fail(`${rel}: event_type "${event.event_type}" is projector-only (SPEC.md §4.3) — never legal in a batch.`);
        continue;
      }
      if (!validateEvent(event)) {
        for (const e of validateEvent.errors) fail(`${rel}: ${event.event_type} ${e.instancePath} ${e.message}`);
        continue;
      }
      if (!(await verifyEventId(event))) {
        fail(`${rel}: event_id does not match sha256(canonical_json(envelope minus event_id)) for ${event.event_type}.`);
      }
      if (seenEventIds.has(event.event_id)) {
        fail(`${rel}: duplicate event_id ${event.event_id} (first seen in ${seenEventIds.get(event.event_id)}).`);
      } else {
        seenEventIds.set(event.event_id, rel);
      }
    }
  }

  if (errorCount > 0) {
    console.error(`\n${errorCount} error(s) across ${batchFiles.length} batch file(s).`);
    process.exitCode = 1;
  } else {
    console.log(`OK — ${batchFiles.length} batch file(s), ${seenEventIds.size} event(s), no violations.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
