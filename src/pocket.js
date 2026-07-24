// src/pocket.js — Pocket artifact firewall and compatibility checks.
// A Pocket is distribution-only prior data: it may change what is surprising,
// but it must never surface source content or cross reader/basis boundaries.

import { canonicalJson, sha256Hex } from './event.js';

export const POCKET_SCHEMA = 'Pocket@1';

const FORBIDDEN_CONTENT_KEYS = new Set([
  'text',
  'source_text',
  'sentence',
  'sentences',
  'excerpt',
  'quote',
  'quotes',
  'body',
  'document',
  'documents',
  'work',
  'works',
  'page',
  'pages',
  'paragraph',
  'paragraphs',
]);

export function readerMajor(readerVersion) {
  const match = String(readerVersion || '').match(/^([a-z][a-z0-9_-]*)(\d+)(?:\.|@|$)/i);
  if (!match) throw new Error(`Pocket reader_version is not major-versioned: ${readerVersion}`);
  return `${match[1].toLowerCase()}${match[2]}`;
}

export function assertReaderCompatible(pocket, engineReaderVersion) {
  const pocketMajor = readerMajor(pocket.reader_version);
  const engineMajor = readerMajor(engineReaderVersion);
  if (pocketMajor !== engineMajor) {
    throw new Error(`Refusing pocket ${pocket.pocket_id || '<unknown>'}: reader_version ${pocket.reader_version} is incompatible with engine reader ${engineReaderVersion}`);
  }
  return true;
}

export function assertBasisComparable(pockets) {
  const basisIds = new Set(pockets.map((p) => p.basis_id));
  if (basisIds.size > 1) throw new Error(`Cannot mix pockets on different bases: ${[...basisIds].join(', ')}`);
  return true;
}

function scanForRenderableSourceText(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanForRenderableSourceText(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_CONTENT_KEYS.has(lower)) {
      throw new Error(`Pocket firewall violation at ${path}.${key}: renderable source text key is forbidden`);
    }
    scanForRenderableSourceText(child, `${path}.${key}`);
  }
}

export function assertPocketFirewall(pocket) {
  if (pocket.role !== 'corpus') throw new Error(`Pocket ${pocket.pocket_id || '<unknown>'} must declare role: 'corpus'`);
  scanForRenderableSourceText(pocket.distributions, '$.distributions');
  return true;
}

export async function pocketContentHash(pocket) {
  const unsigned = { ...pocket };
  delete unsigned.content_hash;
  return `sha256:${await sha256Hex(canonicalJson(unsigned))}`;
}

export async function assertPocketHash(pocket) {
  if (!pocket.content_hash) throw new Error(`Pocket ${pocket.pocket_id || '<unknown>'} is missing content_hash`);
  const actual = await pocketContentHash(pocket);
  if (pocket.content_hash !== actual) throw new Error(`Pocket ${pocket.pocket_id || '<unknown>'} hash mismatch: expected ${pocket.content_hash}, computed ${actual}`);
  return true;
}

export async function validatePocket(pocket, { engineReaderVersion, verifyHash = true } = {}) {
  if (!pocket || pocket.schema !== POCKET_SCHEMA) throw new Error(`Unsupported pocket schema: ${pocket && pocket.schema}`);
  assertPocketFirewall(pocket);
  if (engineReaderVersion) assertReaderCompatible(pocket, engineReaderVersion);
  if (verifyHash) await assertPocketHash(pocket);
  return pocket;
}
