import { canonicalJson, sha256Ref } from './event.js';

const IDENTIFIER_STRING_PATHS = new Set([
  'schema',
  'basis_id',
  'operator_epoch',
  'content_hash',
  'reader_version',
  'pocket.id',
  'pocket.version',
  'pocket.date_range[]',
  'expectations[].exemplar_id',
]);

function normalizedPath(path) {
  return path.replace(/\[\d+\]/g, '[]');
}

export function roleExpectationContentHash(payload) {
  const clone = structuredClone(payload);
  delete clone.content_hash;
  return sha256Ref(canonicalJson(clone));
}

export function assertRoleExpectationFirewall(value, path = '') {
  if (typeof value === 'string') {
    const normalized = normalizedPath(path);
    if (!IDENTIFIER_STRING_PATHS.has(normalized)) {
      throw new Error(`RoleExpectation firewall violation: string at ${path || '<root>'} is not an allowed identifier field`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertRoleExpectationFirewall(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertRoleExpectationFirewall(entry, path ? `${path}.${key}` : key);
    }
  }
}

export async function validateRoleExpectation(payload, { requireCurrentHash = true } = {}) {
  if (!payload || payload.schema !== 'RoleExpectation@1') throw new Error('RoleExpectation payload must declare schema: RoleExpectation@1');
  assertRoleExpectationFirewall(payload);
  if (payload.ballast?.ungated_fraction_ppm < payload.ballast?.floor_ppm) throw new Error('RoleExpectation ballast fraction is below its floor');
  if (requireCurrentHash) {
    const expected = await roleExpectationContentHash(payload);
    if (payload.content_hash !== expected) throw new Error(`RoleExpectation content hash mismatch: expected ${expected}, got ${payload.content_hash}`);
  }
  return payload;
}
