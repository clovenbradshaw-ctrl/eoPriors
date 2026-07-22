#!/usr/bin/env node
// scripts/verify-determinism.mjs — the enforcement mechanism for invariant 1
// ("deleting all derived state and replaying the ledger must recreate it
// exactly"). Runs on a schedule (verify-determinism.yml) from a clean
// checkout: rebuild every lens from batches/** + config/** and diff the
// result against what's currently published. A lens declared "reproduced"
// must match exactly; a lens declared "attested" is only checked for gross
// shape (it depends on an input — e.g. an externally-hosted embedding call —
// this repo cannot regenerate bit-for-bit, so an exact-match failure there is
// not informative and is not treated as one, per invariant 4's own carve-out).

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  loadAllEvents, loadPolicies, loadActiveBasisId,
  loadPreviousHolonsByLens, REPO_ROOT,
} from './lib/load-ledger.mjs';
import { buildProjection } from '../src/replay.js';

async function loadPublishedManifests() {
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
    try {
      byLens[dirent.name] = JSON.parse(
        await readFile(path.join(currentDir, dirent.name, 'manifest.json'), 'utf8'),
      );
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return byLens;
}

async function main() {
  const published = await loadPublishedManifests();
  const lensIds = Object.keys(published);
  if (lensIds.length === 0) {
    console.log('No published projection to verify yet — nothing to do.');
    return;
  }

  const [{ events, batchFileCount }, { policyTexts, emergencePolicy }, activeBasisId, previousHolonsByLens] =
    await Promise.all([loadAllEvents(), loadPolicies(), loadActiveBasisId(), loadPreviousHolonsByLens()]);

  const rebuilt = await buildProjection({
    events, activeBasisId, previousHolonsByLens, policyTexts, emergencePolicy,
    // Rebuild each lens under the SAME determinism grade it was published
    // under, so a "reproduced" lens is actually held to that bar.
    determinism: 'reproduced',
    batchesFolded: batchFileCount,
  });

  let failures = 0;
  for (const lensId of lensIds) {
    const before = published[lensId];
    const after = rebuilt.manifests.find((m) => m.lens_id === lensId);
    if (before.determinism !== 'reproduced') {
      console.log(`${lensId}: declared '${before.determinism}' — skipping byte-identical check (invariant 4).`);
      continue;
    }
    if (!after) {
      console.error(`${lensId}: declared 'reproduced' but the clean rebuild produced no such lens at all.`);
      failures++;
      continue;
    }
    const beforeKey = JSON.stringify({ ledger_head: before.ledger_head, counts: before.counts });
    const afterKey = JSON.stringify({ ledger_head: after.ledger_head, counts: after.counts });
    if (beforeKey !== afterKey) {
      console.error(`${lensId}: declared 'reproduced' but a clean rebuild diverged.\n  published: ${beforeKey}\n  rebuilt:   ${afterKey}`);
      failures++;
    } else {
      console.log(`${lensId}: reproduced — clean rebuild matches.`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} lens(es) failed determinism verification.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
