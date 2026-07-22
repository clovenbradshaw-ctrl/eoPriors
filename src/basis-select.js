// src/basis-select.js — exemplar-selection@1.0.0 (SPEC.md §5.3): greedy
// admission over a scored candidate pool. Each pass admits whichever
// unadmitted candidate most reduces the largest remaining coverage gap
// across the 27 phasepost cells, capped per-cell so one strongly-attested
// cell's candidates can't crowd out a weak one. Deterministic given its
// inputs (ties broken by candidate_id) — acceptance criterion #17: the same
// candidate pool + classifier + embedding model + algorithm version must
// reproduce the same selection.

export const SELECTION_ALGORITHM = 'exemplar-selection@1.0.0';

const PPM = 1_000_000;
const CELL_KEYS = [
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

/**
 * @param candidates  [{ candidate_id, phasepost_measurements }], each
 *                    phasepost_measurements shaped like compress.js's output
 *                    ({ [cell]: { amplitude_ppm, similarity_ppm } }).
 * @param targetSize  the basis size ("100 texts" throughout SPEC.md) — a cap,
 *                    not a quota; selection may stop earlier once every cell
 *                    clears minCellConfidencePpm.
 * @param perCellCap  how many candidates may be credited to (admitted_for)
 *                    the same cell before its further gap-reduction reads as
 *                    zero, forcing the next pass to look elsewhere.
 * @param minCellConfidencePpm  once every cell's best-seen amplitude clears
 *                    this, selection can stop before targetSize is reached.
 */
export function selectExemplarBasis({
  candidates,
  targetSize = 100,
  perCellCap = Math.ceil(100 / CELL_KEYS.length) + 1, // 4 — headroom over an even 100/27 split
  minCellConfidencePpm = 950_000,
}) {
  const perCellBestConfidence = Object.fromEntries(CELL_KEYS.map((c) => [c, 0]));
  const perCellCount = Object.fromEntries(CELL_KEYS.map((c) => [c, 0]));
  const remaining = [...candidates].sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : a.candidate_id > b.candidate_id ? 1 : 0));
  const selected = [];
  const admittedIds = new Set();

  const allCellsCovered = () => CELL_KEYS.every((c) => perCellBestConfidence[c] >= minCellConfidencePpm);

  while (selected.length < targetSize && remaining.length && !allCellsCovered()) {
    let best = null; // { candidate, index, totalReduction, bestCell, bestCellReduction }
    remaining.forEach((candidate, index) => {
      if (admittedIds.has(candidate.candidate_id)) return;
      let totalReduction = 0;
      let bestCell = null;
      let bestCellReduction = -1;
      for (const cell of CELL_KEYS) {
        if (perCellCount[cell] >= perCellCap) continue; // capped — contributes nothing further
        const amplitude = candidate.phasepost_measurements?.[cell]?.amplitude_ppm ?? 0;
        const reduction = Math.max(0, amplitude - perCellBestConfidence[cell]);
        totalReduction += reduction;
        if (reduction > bestCellReduction) { bestCellReduction = reduction; bestCell = cell; }
      }
      if (!best || totalReduction > best.totalReduction
        || (totalReduction === best.totalReduction && candidate.candidate_id < best.candidate.candidate_id)) {
        best = { candidate, index, totalReduction, bestCell };
      }
    });

    if (!best || best.totalReduction <= 0) break; // nothing left would improve coverage at all

    const { candidate, bestCell } = best;
    admittedIds.add(candidate.candidate_id);
    for (const cell of CELL_KEYS) {
      const amplitude = candidate.phasepost_measurements?.[cell]?.amplitude_ppm ?? 0;
      if (amplitude > perCellBestConfidence[cell]) perCellBestConfidence[cell] = amplitude;
    }
    perCellCount[bestCell] += 1;
    selected.push({
      candidate_id: candidate.candidate_id,
      phasepost_scores: Object.fromEntries(
        CELL_KEYS.map((c) => [c, candidate.phasepost_measurements?.[c]?.amplitude_ppm ?? 0]),
      ),
      admitted_for_cell: bestCell,
    });
  }

  const cells_covered = CELL_KEYS.filter((c) => perCellBestConfidence[c] > 0).length;
  const min_cell_confidence_ppm = Math.min(...CELL_KEYS.map((c) => perCellBestConfidence[c]));

  return {
    selected,
    coverage: {
      cells_covered,
      min_cell_confidence_ppm,
      per_cell_count: perCellCount,
    },
  };
}
