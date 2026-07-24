// src/fold-cells.js — the 27 phasepost cell keys and the near-universal
// operators, in one dependency-free place.
//
// data/phasepost-cells.json is the AUTHORITY on the (operator, grain) → cell
// mapping (fold.js loads it, and asserts against it). These constants are the
// same 27 keys in fixed order — the list basis-select.js's CELL_KEYS already
// hand-repeats — pulled out here so prior-fit.js (and a browser caller that
// cannot read a file at import time) can name the cell space synchronously.
// assertCellKeys() below checks this list against a loaded bundle so the two
// can never silently drift (the same guarantee data/phasepost-cells.json's own
// "must never drift apart" comment asks for).

export const CELL_KEYS = Object.freeze([
  'NUL_Clearing_Void', 'NUL_Dissecting_Entity', 'NUL_Unraveling_Kind',
  'SEG_Clearing_Field', 'SEG_Dissecting_Link', 'SEG_Unraveling_Network',
  'DEF_Clearing_Atmosphere', 'DEF_Dissecting_Lens', 'DEF_Unraveling_Paradigm',
  'SIG_Tending_Void', 'SIG_Binding_Entity', 'SIG_Tracing_Kind',
  'CON_Tending_Field', 'CON_Binding_Link', 'CON_Tracing_Network',
  'EVA_Tending_Atmosphere', 'EVA_Binding_Lens', 'EVA_Tracing_Paradigm',
  'INS_Cultivating_Void', 'INS_Making_Entity', 'INS_Composing_Kind',
  'SYN_Cultivating_Field', 'SYN_Making_Link', 'SYN_Composing_Network',
  'REC_Cultivating_Atmosphere', 'REC_Making_Lens', 'REC_Composing_Paradigm',
]);

// EVA_Binding_Lens and REC_Making_Lens are the reader's own always-on
// evaluate / predict acts — they fire on ~every span and carry the bulk of any
// corpus prior's mass (see priors/corpus-prior.json), so they tell you almost
// nothing about which prior fits which source. Every genre / cross-modal /
// crossval experiment in scripts/ silences them for the discriminating
// "content-cell" view; prior-fit.js does the same by default.
export const EXCLUDED_UNIVERSAL_CELLS = Object.freeze(['EVA_Binding_Lens', 'REC_Making_Lens']);

// The three Ground channels a prior seeds (README.md, SPEC.md §4.4a): the
// Ground-grain cell for each of the three EO domains, one per prior channel.
//   priorMass → Void, priorBond → Field, priorProp → Atmosphere.
export const GROUND_CHANNEL_CELLS = Object.freeze({
  priorMass: Object.freeze(['NUL_Clearing_Void', 'SIG_Tending_Void', 'INS_Cultivating_Void']),
  priorBond: Object.freeze(['SEG_Clearing_Field', 'CON_Tending_Field', 'SYN_Cultivating_Field']),
  priorProp: Object.freeze(['DEF_Clearing_Atmosphere', 'EVA_Tending_Atmosphere', 'REC_Cultivating_Atmosphere']),
});

// Guard: confirm this hand-listed key set is exactly the loaded bundle's cells.
// Throws (loudly) on any drift so a change to data/phasepost-cells.json that
// isn't mirrored here can't pass silently.
export function assertCellKeys(cellsBundle) {
  const loaded = Object.keys(cellsBundle?.cells || {});
  const listed = new Set(CELL_KEYS);
  const missing = loaded.filter((c) => !listed.has(c));
  const extra = CELL_KEYS.filter((c) => !loaded.includes(c));
  if (loaded.length !== CELL_KEYS.length || missing.length || extra.length) {
    throw new Error(
      `fold-cells: CELL_KEYS drifted from data/phasepost-cells.json — ` +
      `missing [${missing.join(', ')}], extra [${extra.join(', ')}]`
    );
  }
  return true;
}
