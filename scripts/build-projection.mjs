#!/usr/bin/env node
// scripts/build-projection.mjs — the Node entry point build-projection.yml
// runs (SPEC.md §11). All the actual logic is in src/replay.js (pure) and
// src/emergence.js; this script is only I/O: read batches/** + config/**,
// call replay, write projections/** + artifacts/**, then (if configured)
// tell the gateway's head cache about the new manifest.

import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import {
  loadAllEvents, loadPolicies, loadActiveBasisId,
  loadPreviousHolonsByLens, loadPreviousManifest, REPO_ROOT,
} from './lib/load-ledger.mjs';
import { buildProjection, diffHolons } from '../src/replay.js';

const holonShard = (holonId) => {
  const hex = holonId.replace(/^holon:sha256:/, '');
  return { shard: hex.slice(0, 2) || '00', file: `${hex}.json` };
};

// projection_id is "projection:sha256:<hex>" — strip BOTH prefixes before
// using it as a directory/URL path segment. A bare .replace(/^projection:/, '')
// still leaves the colon from "sha256:" behind, which is invalid on
// Windows/NTFS and awkward in a URL path.
const projectionDirName = (projectionId) => projectionId.replace(/^projection:sha256:/, '');

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const [{ events, batchFileCount }, { policyTexts, emergencePolicy, libraryYaml }, activeBasisId, previousHolonsByLens] =
    await Promise.all([loadAllEvents(), loadPolicies(), loadActiveBasisId(), loadPreviousHolonsByLens()]);

  const determinism = process.env.EOPRIORS_DETERMINISM_GRADE || libraryYaml?.default_determinism_grade || 'attested';

  const { lenses, manifests, ledgerHead } = await buildProjection({
    events,
    activeBasisId,
    previousHolonsByLens,
    policyTexts,
    emergencePolicy,
    determinism,
    batchesFolded: batchFileCount,
  });

  // Deliberately does NOT delete a lens directory that falls out of scope
  // (e.g. a superseded basis's lens) — projections/current/manifest.json's
  // own `lenses` list is authoritative for what's in scope (invariant 11),
  // and an orphaned lens directory is still a legitimate historical/
  // comparison view, not garbage. Cleaning those up, if ever wanted, is a
  // separate, explicit retention decision — not a side effect of a routine
  // build.
  const currentDir = path.join(REPO_ROOT, 'projections', 'current');
  const lensIndex = [];

  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i];
    const manifest = manifests[i];
    const lensDir = path.join(currentDir, lens.lens_id);

    const previousManifest = await loadPreviousManifest(lens.lens_id);
    const diff = diffHolons(previousHolonsByLens[lens.lens_id] || [], lens.holons);

    await rm(path.join(lensDir, 'holons'), { recursive: true, force: true });
    for (const holon of lens.holons) {
      const { shard, file } = holonShard(holon.holon_id);
      await writeJson(path.join(lensDir, 'holons', shard, file), holon);
    }

    await writeJson(path.join(lensDir, 'manifest.json'), manifest);
    await writeJson(path.join(lensDir, 'salience.json'), {
      lens_id: lens.lens_id,
      basis_id: lens.basis_id,
      observation_count: lens.observationCount,
      holon_counts: manifest.counts,
      identity_rebound_count: lens.identityReboundAudits.length,
      generated_at: manifest.built_at,
    });
    await writeJson(path.join(lensDir, 'diff.json'), {
      diff_of: previousManifest?.projection_id ?? null,
      ...diff,
      identity_rebound_audits: lens.identityReboundAudits,
    });

    await cp(lensDir, path.join(REPO_ROOT, 'projections', 'snapshots', projectionDirName(manifest.projection_id), lens.lens_id), { recursive: true });

    await writeJson(
      path.join(REPO_ROOT, 'artifacts', 'compressor-packs', projectionDirName(manifest.projection_id), lens.lens_id, 'pack.json'),
      {
        projection_id: manifest.projection_id,
        lens_id: lens.lens_id,
        basis_id: lens.basis_id,
        classifier: 'eo-lexical-analysis-2.0',
        embedding_model: libraryYaml?.embedding_model ?? null,
        holon_count: lens.holons.length,
        built_at: manifest.built_at,
      },
    );

    lensIndex.push({ lens_id: lens.lens_id, basis_id: lens.basis_id, manifest_path: `current/${lens.lens_id}/manifest.json` });
  }

  // projections/current/manifest.json is a default-view POINTER, not a
  // per-lens manifest — it does not itself validate against
  // schemas/projection-manifest.schema.json (invariant 11).
  await writeJson(path.join(currentDir, 'manifest.json'), {
    note: 'A default view, not the library\'s one true state (SPEC.md invariant 11). Every lens listed below carries its own full manifest at manifest_path.',
    default_lens_id: lensIndex[0]?.lens_id ?? null,
    lenses: lensIndex,
    ledger_head: ledgerHead,
    generated_at: new Date().toISOString(),
  });

  const publishUrl = process.env.GATEWAY_HEAD_PUBLISH_URL;
  const publishPassword = process.env.GATEWAY_HEAD_PUBLISH_PASSWORD;
  if (publishUrl && publishPassword) {
    const res = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${publishPassword}` },
      body: JSON.stringify({ lenses: lensIndex, ledger_head: ledgerHead }),
    });
    if (!res.ok) console.error(`head/publish responded ${res.status}: ${await res.text().catch(() => '')}`);
  } else {
    console.log('GATEWAY_HEAD_PUBLISH_URL/_PASSWORD not set — skipping head/publish POST (the gateway is external to this repo, SPEC.md §8).');
  }

  console.log(`Built ${lenses.length} lens projection(s) from ${batchFileCount} batch file(s), ${events.length} raw events.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
