// src/record-mining.js — repeated-record mining on the fold reading, not the DOM.
//
// MDR's useful move was to find repeated record structures; its brittle move
// was requiring those records to be adjacent DOM siblings. The fold already
// gives eoPriors a modality-neutral unit stream, so the alignment step belongs
// here: compare consecutive unit windows by their operator/grain signatures and
// group compatible records even when unrelated units are interleaved between
// them. This is intentionally deterministic and heuristic — a DEPTA-shaped
// alignment primitive, not a learned page-type classifier.

const DEFAULT_MIN_RECORDS = 2;
const DEFAULT_MIN_UNITS = 2;
const DEFAULT_MAX_UNITS = 8;
const DEFAULT_SIMILARITY = 0.6;
const DEFAULT_MAX_GAP = 3;

const stableUnique = (xs) => [...new Set(xs)];

export function foldSignature(fold, { includeSources = false } = {}) {
  const events = fold?.operator_events || [];
  return stableUnique(events
    .filter((e) => e.op && e.grain)
    .map((e) => includeSources && e.source ? `${e.op}:${e.grain}:${e.source}` : `${e.op}:${e.grain}`)
    .sort());
}

export function unitSignature(unit, opts = {}) {
  if (Array.isArray(unit?.signature)) return stableUnique(unit.signature).sort();
  if (unit?.fold) return foldSignature(unit.fold, opts);
  return [];
}

export function jaccard(a, b) {
  const as = new Set(a);
  const bs = new Set(b);
  const union = new Set([...as, ...bs]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const x of as) if (bs.has(x)) intersection++;
  return intersection / union.size;
}

export function windowSignature(signatures, start, length) {
  return stableUnique(signatures.slice(start, start + length).flat()).sort();
}

function compatibleWindows(signatures, a, b, length, threshold) {
  return jaccard(windowSignature(signatures, a, length), windowSignature(signatures, b, length)) >= threshold;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function hasOverlap(candidate, records) {
  return records.some((r) => overlaps(candidate, r));
}

function groupScore(signatures, records, length) {
  if (records.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      total += jaccard(
        windowSignature(signatures, records[i].start, length),
        windowSignature(signatures, records[j].start, length),
      );
      pairs++;
    }
  }
  return pairs ? total / pairs : 0;
}

export function mineRepeatingRecords(units, {
  minRecords = DEFAULT_MIN_RECORDS,
  minUnits = DEFAULT_MIN_UNITS,
  maxUnits = DEFAULT_MAX_UNITS,
  similarity = DEFAULT_SIMILARITY,
  maxGap = DEFAULT_MAX_GAP,
} = {}) {
  const signatures = units.map((u) => unitSignature(u));
  const groups = [];
  const n = signatures.length;
  const upper = Math.min(maxUnits, Math.floor(n / minRecords) || maxUnits);

  for (let length = upper; length >= minUnits; length--) {
    for (let start = 0; start <= n - length; start++) {
      const seed = { start, end: start + length };
      const records = [seed];
      let cursor = seed.end;
      while (cursor <= n - length) {
        let found = null;
        const limit = Math.min(n - length, cursor + maxGap);
        for (let probe = cursor; probe <= limit; probe++) {
          const candidate = { start: probe, end: probe + length };
          if (!hasOverlap(candidate, records) && compatibleWindows(signatures, start, probe, length, similarity)) {
            found = candidate;
            break;
          }
        }
        if (!found) break;
        records.push(found);
        cursor = found.end;
      }
      if (records.length >= minRecords) {
        groups.push({
          kind: 'repeating-records',
          unit_count: length,
          records,
          confidence: Number(groupScore(signatures, records, length).toFixed(6)),
          signature: windowSignature(signatures, start, length),
        });
      }
    }
  }

  return groups
    .sort((a, b) => (b.records.length * b.unit_count * b.confidence) - (a.records.length * a.unit_count * a.confidence))
    .filter((group, idx, arr) => idx === arr.findIndex((other) =>
      other.unit_count === group.unit_count &&
      JSON.stringify(other.records) === JSON.stringify(group.records)
    ));
}
