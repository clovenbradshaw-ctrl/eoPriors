import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, sha256Hex } from '../src/event.js';

const root = process.cwd();
const publishedDirs = ['artifacts/packs', 'artifacts/snapshots'];
const forbiddenImport = /\b(import|require)\s*(?:\(|[^\n;]*from\s*)['"](?:eoreaderapp|@?eoreaderapp[^'"]*)['"]/;
const implicitLatest = /\b(latest\b|@latest\b|main\b|HEAD\b)/i;
const engineSourceDir = path.join(root, 'src/vendor/eoreader');
let failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

for (const rel of publishedDirs) {
  for (const file of walk(path.join(root, rel))) {
    if (/\.(mjs|cjs|js|ts|sh|py|wasm)$/i.test(file)) failures.push(`${path.relative(root, file)}: published packs/snapshots must contain data only`);
    const text = fs.readFileSync(file, 'utf8');
    if (forbiddenImport.test(text)) failures.push(`${path.relative(root, file)}: imports eoreaderapp`);
    if (implicitLatest.test(text)) failures.push(`${path.relative(root, file)}: contains an implicit latest/main/HEAD reference`);
    if (file.endsWith('.json')) {
      const json = JSON.parse(text);
      const id = json.snapshot_id || json.pack_id;
      if (id && /:sha256:0{64}$/.test(id)) failures.push(`${path.relative(root, file)}: unresolved all-zero content id`);
    }
  }
}

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (!/\.(js|mjs|cjs|ts|json|yaml|yml|md)$/.test(rel)) continue;
  if (rel.startsWith('schemas/') || rel === 'scripts/validate-prior-contracts.mjs' || rel.startsWith('.github/')) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (forbiddenImport.test(text)) failures.push(`${rel}: imports eoreaderapp`);
}

if (fs.existsSync(engineSourceDir)) {
  const manifest = path.join(engineSourceDir, 'README.md');
  const ok = fs.existsSync(manifest) && fs.readFileSync(manifest, 'utf8').includes('pinned read-only evaluation fixture');
  if (!ok) failures.push('src/vendor/eoreader: vendored engine source lacks pinned read-only fixture declaration');
}

if (failures.length) {
  console.error('Prior contract validation failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Prior contract validation passed.');
