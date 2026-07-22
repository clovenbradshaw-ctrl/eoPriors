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

export function synEventsAt(doc, at) {
  const events = typeof doc.log.snapshot === 'function' ? doc.log.snapshot() : (doc.log.events || []);
  return events.filter((e) => e.op === 'SYN' && e.sentIdx === at);
}

export function readingToFold(doc, at, reading) {
  const contentEvents = (reading.surprises || []).map((s) => ({ op: s.op, grain: 'Figure' }));
  for (const _syn of synEventsAt(doc, at)) contentEvents.push({ op: 'SYN', grain: 'Figure' });

  const events = [...contentEvents];
  if (reading.held && contentEvents.length === 0) events.push({ op: 'NUL', grain: 'Figure' });

  const predicted = reading.predicted;
  if (predicted && (predicted.figures?.length || predicted.bonds?.length)) {
    events.push({ op: 'REC', grain: 'Figure' });
  }
  // reading.evaluation is unconditionally present (reading.js:305) — the
  // reading evaluates every line, held or not.
  events.push({ op: 'EVA', grain: 'Figure' });

  const weightEach = Math.floor(1_000_000 / events.length);
  const operator_events = events.map((e, i) => ({
    ...e,
    // last event absorbs rounding so the split still sums to exactly 1e6
    weight_ppm: i === events.length - 1 ? 1_000_000 - weightEach * (events.length - 1) : weightEach,
  }));

  return {
    reader_version: READER_VERSION,
    lens_id: reading.lens,
    operator_events,
    surprisal_bits: Math.round((reading.surprisalBits || 0) * 1e6),
    bayes_bits: Math.round((reading.bayesBits || 0) * 1e6),
    held: !!reading.held,
  };
}
