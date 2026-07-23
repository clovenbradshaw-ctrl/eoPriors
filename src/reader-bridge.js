// src/reader-bridge.js — the fold seam (SPEC.md §4.4a), actually soldered:
// turns an eoreader4.2 reading into a fold (schemas/representation.schema.json)
// using ONLY signals eoreader4.2 already computes for real. Nothing here is
// synthesized to fill a cell that has no genuine evidence behind it.
//
// eoreader4.2 is a sibling repository, not an npm dependency of this one — the
// two are version-coupled exactly as representation.schema.json's
// `reader_version` doc comment describes ("regenerating the pool with a
// different reader_version is a new basis, not an update to the old one").
// loadReader() isolates that coupling behind a single lazy, overridable
// import so requiring this module never requires eoreader4.2 to be present —
// only calling loadReader() does. readingToFold/synEventsAt are pure
// functions over an already-produced doc/reading pair and need no import at
// all, which is what test/reader-bridge.test.js exercises without the
// sibling checkout.
//
// THE MAPPING — all nine operators, all from real per-span reader output:
//
//   INS/CON/SIG/DEF   reading.surprises        (eoreader4.2 reading.js:274-280)
//   SEG               reading.surprises        (reading.js:281-282, focus-shift)
//   SYN               doc.log events, op:'SYN' at this sentIdx — real coref/
//                      identity merges the parser already emits (pipeline.js,
//                      unnamed-referent.js, referents/index.js), not the
//                      derived `bridge` scalar (bridge.js tags its OWN act as
//                      EVA in its file header — using it for SYN would be
//                      borrowing an ambiguous signal when an unambiguous one,
//                      the raw merge event, already exists on the log)
//   REC               reading.predicted        (reading.js:304) — the reading's
//                      own prediction act, present whenever there is any prior
//                      mass to predict from
//   EVA               reading.evaluation       (reading.js:305) — the reading's
//                      own evaluation act, present on every single span
//   NUL               explicit, when held===true and none of INS/CON/SIG/DEF/
//                      SEG/SYN fired — "nothing existence-wise transformed."
//                      Added explicitly here rather than left to fold.js's own
//                      NUL fallback: that fallback only triggers on a fully
//                      EMPTY operator_events array, and EVA now populates that
//                      array on every span, so the fallback would otherwise
//                      never fire again.
//
// Every operator_events entry is Figure grain. representation.schema.json's
// own grainKey doc comment is explicit that Ground and Pattern are NOT a
// single reader pass's to claim — Ground is an ambient/prior condition
// (the exemplar-basis machinery's job), Pattern is emergence.js's own
// Figure→Pattern condensation. A per-span bridge that fabricated Ground or
// Pattern evidence to light up more of the cube would be exactly the
// cosine-in-a-costume move this seam exists to avoid.
//
// Equal weight per event: reading.js gives no per-event confidence to split
// by, so equal-split is the neutral first-cut policy, not a tuned one.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const DEFAULT_EOREADER_PATH = path.resolve(REPO_ROOT, '..', 'eoreader4.2');

export const READER_VERSION = 'eoreader4.2@1.0.0';

// Lazily imports eoreader4.2's createParser + readingAt from a sibling
// checkout. Override with { eoreaderPath } or the EOREADER_PATH env var if
// the two repos aren't checked out side by side.
export async function loadReader({ eoreaderPath } = {}) {
  const root = eoreaderPath || process.env.EOREADER_PATH || DEFAULT_EOREADER_PATH;
  let parseMod, readingMod;
  try {
    [parseMod, readingMod] = await Promise.all([
      import(path.join(root, 'src/perceiver/parse/index.js')),
      import(path.join(root, 'src/perceiver/reading.js')),
    ]);
  } catch (err) {
    throw new Error(
      `reader-bridge: couldn't load eoreader4.2 from "${root}" — checkout it as a ` +
      `sibling of this repo, or set eoreaderPath/EOREADER_PATH. (${err.message})`
    );
  }
  return { createParser: parseMod.createParser, readingAt: readingMod.readingAt };
}

// Lazily imports eoreader4.2's MUSIC path — the same modality-blind readingAt,
// but fed by the music organ (ingestMusic) instead of the text parser, and
// parseMidi to decode Standard MIDI File bytes into notes first. This is the
// concrete "same core, different perceiver" seam: ingestMusic emits INS + CON
// onto the SAME EO log text uses (src/organs/in/music.js — each note an INS
// at its pitch class, each consecutive interval a CON), so readingToFold and
// measureFold consume a music doc identically to a text doc.
//
// Caveat worth knowing before interpreting music folds: the music organ emits
// ONLY INS + CON (plus readingToFold's always-on EVA, conditional REC, and
// held-NUL). It structurally cannot produce SEG/DEF/SYN/SIG folds — so a
// music-vs-text comparison that finds "music lacks DEF" is partly reading the
// organ's operator vocabulary, not a deep truth about music. Differences
// WITHIN the shared INS/CON/NUL cells (e.g. music being far more CON-heavy)
// are the non-tautological signal.
export async function loadMusicReader({ eoreaderPath } = {}) {
  const root = eoreaderPath || process.env.EOREADER_PATH || DEFAULT_EOREADER_PATH;
  let musicMod, midiMod, readingMod;
  try {
    [musicMod, midiMod, readingMod] = await Promise.all([
      import(path.join(root, 'src/organs/in/music.js')),
      import(path.join(root, 'src/rooms/reader/midi.js')),
      import(path.join(root, 'src/perceiver/reading.js')),
    ]);
  } catch (err) {
    throw new Error(
      `reader-bridge: couldn't load eoreader4.2 music path from "${root}" — checkout it ` +
      `as a sibling of this repo, or set eoreaderPath/EOREADER_PATH. (${err.message})`
    );
  }
  return { ingestMusic: musicMod.ingestMusic, parseMidi: midiMod.parseMidi, readingAt: readingMod.readingAt };
}

// MIDI bytes -> a music doc ready for readingAt, via the recipe
// eoreader4.2's own import-file.js uses (parseMidi -> note objects ->
// ingestMusic). Returns { doc, notesParsed }.
export async function midiBytesToDoc(bytes, { name = 'midi', eoreaderPath } = {}) {
  const { ingestMusic, parseMidi } = await loadMusicReader({ eoreaderPath });
  const parsed = parseMidi(bytes);
  const doc = ingestMusic({
    name,
    notes: parsed.notes.map((n) => ({ name: n.name, midi: n.midi, start: n.start, dur: n.dur, velocity: n.velocity, track: n.track, channel: n.channel })),
  });
  return { doc, notesParsed: parsed.notes.length };
}

// Lazily imports eoreader4.2's DNA path — the same modality-blind readingAt,
// fed by the codon organ. parseFasta strips the ">" header and returns a bare
// ACGT string; codonsOf splits it into triplets; ingestCodons emits INS per
// codon + CON to the previous codon onto the SAME EO log (src/organs/in/
// codon.js). All three live in the organs barrel; readingAt is the same one
// text and music use.
//
// Caveat worth knowing before interpreting DNA folds: the codon organ gives
// each codon a POSITIONAL id (n0, n1, ...), not a recurring class the way
// music's id is the pitch class. So every codon reads as a brand-new entity
// bonded to the previous by the constant via 'next' — DNA folds are nearly
// uniform (INS + CON + the always-on EVA/REC), with none of the recurrence
// structure that gives music and text their variety. That is a property of
// how this organ models a reading frame (pure sequence, no recurrence), not a
// bug — and it is itself the interesting cross-modal finding.
export async function loadDnaReader({ eoreaderPath } = {}) {
  const root = eoreaderPath || process.env.EOREADER_PATH || DEFAULT_EOREADER_PATH;
  let organsMod, readingMod;
  try {
    [organsMod, readingMod] = await Promise.all([
      import(path.join(root, 'src/organs/in/index.js')),
      import(path.join(root, 'src/perceiver/reading.js')),
    ]);
  } catch (err) {
    throw new Error(
      `reader-bridge: couldn't load eoreader4.2 DNA path from "${root}" — checkout it ` +
      `as a sibling of this repo, or set eoreaderPath/EOREADER_PATH. (${err.message})`
    );
  }
  return { parseFasta: organsMod.parseFasta, codonsOf: organsMod.codonsOf, ingestCodons: organsMod.ingestCodons, readingAt: readingMod.readingAt };
}

// FASTA text -> a codon doc ready for readingAt, via the chain eoreader4.2's
// locus.js/codon.js expose (parseFasta -> codonsOf -> ingestCodons). Returns
// { doc, codonsParsed }. `frame` selects the reading frame (0/1/2).
export async function fastaToDoc(fastaText, { name = 'dna', frame = 0, eoreaderPath } = {}) {
  const { parseFasta, codonsOf, ingestCodons } = await loadDnaReader({ eoreaderPath });
  const seq = parseFasta(fastaText);
  const codons = codonsOf(seq, frame);
  const doc = ingestCodons({ codons, name });
  return { doc, codonsParsed: codons.length };
}

export function synEventsAt(doc, at) {
  const events = typeof doc.log.snapshot === 'function' ? doc.log.snapshot() : (doc.log.events || []);
  return events.filter((e) => e.op === 'SYN' && e.sentIdx === at);
}

// The three Ground terrains, one per EO domain, are the three "Cultivating"
// Ground cells — cultivating is exactly the stance of MAINTAINING a standing
// prior, which is what each channel is. reading.js's opt-in `ground` block
// (opts.terrains) exposes the amplitudes; these map them to the cube:
//   void       (priorMass, Existence)      -> INS_Cultivating_Void
//   field      (priorBond, Structure)      -> SYN_Cultivating_Field
//   atmosphere (priorProp, Interpretation) -> REC_Cultivating_Atmosphere
const GROUND_TERRAIN_OPS = { void: 'INS', field: 'SYN', atmosphere: 'REC' };

export function readingToFold(doc, at, reading) {
  // Each entry is { op, grain, units }; units are normalized to weight_ppm at
  // the end. A Figure surprise, a held NUL, REC, and EVA each weigh one unit.
  const events = [];
  for (const s of (reading.surprises || [])) events.push({ op: s.op, grain: 'Figure', units: 1 });
  for (const _syn of synEventsAt(doc, at)) events.push({ op: 'SYN', grain: 'Figure', units: 1 });
  const hadContent = events.length > 0;
  if (reading.held && !hadContent) events.push({ op: 'NUL', grain: 'Figure', units: 1 });

  const predicted = reading.predicted;
  if (predicted && (predicted.figures?.length || predicted.bonds?.length)) events.push({ op: 'REC', grain: 'Figure', units: 1 });
  // reading.evaluation is unconditionally present (reading.js) — the reading
  // evaluates every line, held or not.
  events.push({ op: 'EVA', grain: 'Figure', units: 1 });

  // THE TERRAINS (Ground grain). Present only when reading was produced with
  // { terrains: true }; absent otherwise, keeping the pre-terrains fold
  // byte-identical. The standing prior enters as ONE collective unit (the
  // ambient facet the span is read AGAINST, per the schema's Ground grain),
  // its internal split across the three terrains reflecting the actual
  // priorMass/priorBond/priorProp composition. A span with no standing prior
  // yet (the opening) gets no Ground events — correct, there is no prior to
  // ride. Raw channel amplitudes are on the reader's own scales (γ-mass vs
  // bond count); using them directly is honest to how the reader represents
  // the prior, not a claim they share a unit.
  const g = reading.ground;
  if (g) {
    const total = (g.void || 0) + (g.field || 0) + (g.atmosphere || 0);
    if (total > 0) {
      for (const [channel, op] of Object.entries(GROUND_TERRAIN_OPS)) {
        if ((g[channel] || 0) > 0) events.push({ op, grain: 'Ground', units: (g[channel] / total) });
      }
    }
  }

  const totalUnits = events.reduce((s, e) => s + e.units, 0);
  let allocated = 0;
  const operator_events = events.map((e, i) => {
    const isLast = i === events.length - 1;
    const weight_ppm = isLast ? 1_000_000 - allocated : Math.round((e.units / totalUnits) * 1_000_000);
    if (!isLast) allocated += weight_ppm;
    return { op: e.op, grain: e.grain, weight_ppm };
  });

  return {
    reader_version: READER_VERSION,
    lens_id: reading.lens,
    operator_events,
    surprisal_bits: Math.round((reading.surprisalBits || 0) * 1e6),
    bayes_bits: Math.round((reading.bayesBits || 0) * 1e6),
    held: !!reading.held,
  };
}
