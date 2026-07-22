import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectExemplarBasis } from '../src/basis-select.js';

const CELLS = [
  'CON_Binding_Link', 'CON_Tending_Field', 'CON_Tracing_Network',
  'DEF_Clearing_Atmosphere', 'DEF_Dissecting_Lens', 'DEF_Unraveling_Paradigm',
  'EVA_Binding_Lens', 'EVA_Tending_Atmosphere', 'EVA_Tracing_Paradigm',
  'INS_Composing_Kind', 'INS_Cultivating_Void', 'INS_Making_Entity',
  'NUL_Clearing_Void', 'NUL_Dissecting_Entity', 'NUL_Unraveling_Kind',
  'REC_Composing_Paradigm', 'REC_Cultivating_Atmosphere', 'REC_Making_Lens',
  'SEG_Clearing_Field', 'SEG_Dissecting_Link', 'SEG_Unraveling_Network',
  'SIG_Binding_Entity', 'SIG_Tending_Void', 'SIG_Tracing_Kind',
  'SYN_Composing_Network', 'SYN_Cultivating_Field', 'SYN_Making_Link',
];

// A candidate that strongly attests exactly one cell (amplitude concentrated
// there), with a little noise spread over the rest — a stand-in for a real
// exemplar.candidate.scored measurement.
function candidateFor(id, strongCell) {
  const measurements = {};
  const noise = Math.floor(50_000 / (CELLS.length - 1));
  let allocated = 0;
  CELLS.forEach((cell, i) => {
    const isLast = i === CELLS.length - 1;
    const amplitude_ppm = cell === strongCell ? 950_000 : (isLast ? 1_000_000 - allocated - 950_000 : noise);
    if (cell !== strongCell) allocated += isLast ? 0 : amplitude_ppm;
    measurements[cell] = { amplitude_ppm, similarity_ppm: amplitude_ppm };
  });
  return { candidate_id: id, phasepost_measurements: measurements };
}

test('selectExemplarBasis covers every strongly-attested cell across a spread candidate pool', () => {
  const candidates = CELLS.map((cell, i) => candidateFor(`cand-${String(i).padStart(3, '0')}`, cell));
  const { selected, coverage } = selectExemplarBasis({ candidates, targetSize: 100 });
  assert.equal(coverage.cells_covered, CELLS.length);
  assert.ok(selected.length <= 100);
  assert.ok(selected.length >= CELLS.length, 'at least one candidate should be admitted per cell to cover all of them');
  const admittedCells = new Set(selected.map((s) => s.admitted_for_cell));
  assert.equal(admittedCells.size, CELLS.length);
});

test('selectExemplarBasis is deterministic given identical input', () => {
  const candidates = CELLS.map((cell, i) => candidateFor(`cand-${String(i).padStart(3, '0')}`, cell));
  const a = selectExemplarBasis({ candidates, targetSize: 50 });
  const b = selectExemplarBasis({ candidates, targetSize: 50 });
  assert.deepEqual(a, b);
});

test('selectExemplarBasis caps admissions per cell (perCellCap)', () => {
  // 10 candidates all strongly attesting the SAME single cell.
  const candidates = Array.from({ length: 10 }, (_, i) => candidateFor(`same-${i}`, 'INS_Making_Entity'));
  const { selected } = selectExemplarBasis({ candidates, targetSize: 100, perCellCap: 3 });
  const countForCell = selected.filter((s) => s.admitted_for_cell === 'INS_Making_Entity').length;
  assert.ok(countForCell <= 3, `expected at most 3 admissions credited to one cell, got ${countForCell}`);
});

test('selectExemplarBasis never exceeds targetSize', () => {
  const candidates = Array.from({ length: 60 }, (_, i) => candidateFor(`c${i}`, CELLS[i % CELLS.length]));
  const { selected } = selectExemplarBasis({ candidates, targetSize: 10, perCellCap: 100 });
  assert.ok(selected.length <= 10);
});
