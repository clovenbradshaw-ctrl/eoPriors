// scripts/lib/load-ledger.mjs — filesystem glue shared by build-projection.mjs
// and verify-determinism.mjs, so both call the exact same loading logic
// before handing off to the pure src/replay.js core. Node-only (this is the
// GitHub Action side, never imported by index.html).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const REPO_ROOT = path.resolve(new URL('../../', import.meta.url).pathname);

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.join(e.path ?? dir, e.name));
}

// Every batch file under batches/**, flattened to one array of raw event
// objects. A batch file is `{ batch_id, submitted_at, events: [...] }`
// (SPEC.md §10 step 2 — the wrapper the gateway's create-only PUT writes;
// not schema'd separately since SPEC.md §3 lists exactly six schemas and a
// batch is just "one file per submission" of that shape).
export async function loadAllEvents() {
  const batchesDir = path.join(REPO_ROOT, 'batches');
  const files = (await walk(batchesDir)).filter((f) => f.endsWith('.json')).sort();
  const events = [];
  for (const file of files) {
    const batch = JSON.parse(await readFile(file, 'utf8'));
    for (const event of batch.events || []) events.push(event);
  }
  return { events, batchFileCount: files.length };
}

export async function loadPolicies() {
  const configDir = path.join(REPO_ROOT, 'config');
  const [libraryText, rightsText, emergenceText] = await Promise.all([
    readFile(path.join(configDir, 'library.yaml'), 'utf8'),
    readFile(path.join(configDir, 'rights-policy.yaml'), 'utf8'),
    readFile(path.join(configDir, 'emergence-policy.yaml'), 'utf8'),
  ]);
  const policyTexts = { library: libraryText, 'rights-policy': rightsText, 'emergence-policy': emergenceText };
  const emergenceYaml = yaml.load(emergenceText) || {};
  const libraryYaml = yaml.load(libraryText) || {};
  const emergencePolicy = {
    mintOverheadBits: emergenceYaml.mint_overhead_bits,
    threshold: emergenceYaml.identity_overlap_threshold,
    maxRounds: emergenceYaml.max_merge_rounds,
  };
  return { policyTexts, emergencePolicy, libraryYaml };
}

export async function loadActiveBasisId() {
  const p = path.join(REPO_ROOT, 'config', 'exemplar-basis', 'active.json');
  const doc = JSON.parse(await readFile(p, 'utf8'));
  return doc.basis_id ?? null;
}

// Previous holons, by lens directory, from the currently-published
// projection — so a rebuild can offer emergence.js's identity matcher
// something to match against (SPEC.md §6 last paragraph). Absent on a
// first-ever build; that is a normal, valid starting state, not an error.
export async function loadPreviousHolonsByLens() {
  const currentDir = path.join(REPO_ROOT, 'projections', 'current');
  let lensDirs;
  try {
    lensDirs = (await readdir(currentDir, { withFileTypes: true })).filter((e) => e.isDirectory());
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  const byLens = {};
  for (const dirent of lensDirs) {
    const holonsDir = path.join(currentDir, dirent.name, 'holons');
    const files = (await walk(holonsDir)).filter((f) => f.endsWith('.json'));
    byLens[dirent.name] = [];
    for (const file of files) {
      byLens[dirent.name].push(JSON.parse(await readFile(file, 'utf8')));
    }
  }
  return byLens;
}

export async function loadPreviousManifest(lensId) {
  const p = path.join(REPO_ROOT, 'projections', 'current', lensId, 'manifest.json');
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export { REPO_ROOT };
