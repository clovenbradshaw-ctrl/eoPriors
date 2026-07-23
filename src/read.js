// src/read.js — real reading, not a regex split. Wraps the vendored
// eoreader4.2 parser (src/vendor/eoreader/perceiver/parse/index.js) and
// narrows its output down to the two shapes eoPriors' event vocabulary
// already has a home for: a SEG argspan (subject–verb–object, with a real
// reader and a measured confidence) becomes an evidence.relation.observed
// candidate; a corroborated SYN/EVA coreference merge becomes an
// evidence.equivalence.proposed candidate. Everything else parseText()
// emits — NUL span markers, bare mentions, DEF attributes, uncorroborated
// merges — is real signal with no ledger-writable shape yet, so it is left
// out here rather than forced into the wrong event type (SPEC.md invariant
// 9: no unlabeled assertion ships).
//
// Sentence segmentation itself also comes from parseText() now, in place of
// src/segment.js's regex splitter — the parser's own boundary detection
// (perceiver/parse/sentences.js) already handles the abbreviation/decimal
// cases segment.js's own header flagged as out of scope for a v1 heuristic.

import { parseText } from './vendor/eoreader/perceiver/parse/index.js';

// Named after the vendored package's own declared version (see
// src/vendor/eoreader/README.md for the exact commit pinned), not eoPriors'
// own semver — eoPriors makes no changes to the parser itself.
export const EXTRACTION_PROTOCOL = 'eoreader-parse@0.1.0';

// parseText() returns sentences as exact substrings of `text`, in order, but
// without their own document-absolute offsets — every span it DOES report
// (SEG argspan subject/verb/object) is relative to its own sentence, per a
// live trace against the vendored parser. A moving cursor makes the
// doc-absolute recovery exact even when two sentences are identical text.
export function absoluteSentenceOffsets(text, sentences) {
  const offsets = [];
  let cursor = 0;
  for (const s of sentences) {
    const idx = text.indexOf(s, cursor);
    const start = idx >= 0 ? idx : cursor;
    offsets.push({ start, end: start + s.length });
    cursor = start + s.length;
  }
  return offsets;
}

export function extractReading(text) {
  const doc = parseText(text);
  const events = doc.log.events;
  const sentenceOffsets = absoluteSentenceOffsets(text, doc.sentences);

  const sentences = doc.sentences.map((sentText, index) => ({
    index, text: sentText, start: sentenceOffsets[index].start, end: sentenceOffsets[index].end,
  }));

  const relations = events
    .filter((e) => e.op === 'SEG' && e.kind === 'argspan' && e.subject && e.object)
    .map((e) => {
      const base = sentenceOffsets[e.sentIdx]?.start ?? 0;
      const toAbsolute = (span) => ({
        text: span.text, entitySlug: span.id || null,
        start: base + span.start, end: base + span.end,
      });
      return {
        sentIdx: e.sentIdx,
        subject: toAbsolute(e.subject),
        verb: e.verb ? { text: e.verb.text, start: base + e.verb.start, end: base + e.verb.end } : null,
        object: toAbsolute(e.object),
        relationType: e.depicts || null,
        reader: e.reader || null,
        confidence: typeof e.confidence === 'number' ? e.confidence : null,
        notation: e.eo?.notation || null,
      };
    });

  // Only a corroborated merge is a proposal worth submitting — indeterminate
  // or contradicted is the coref engine declining to merge (core/verdicts.js:
  // "Contradicted is a hard refusal; indeterminate is held"), not evidence.
  const corroboratedMergeSeqs = new Set(
    events
      .filter((e) => e.op === 'EVA' && e.site === 'merge' && e.verdict === 'corroborated')
      .map((e) => e.ref),
  );
  const equivalences = events
    .filter((e) => e.op === 'SYN' && e.kind === 'alias' && corroboratedMergeSeqs.has(e.seq))
    .map((e) => {
      const base = sentenceOffsets[e.sentIdx]?.start ?? 0;
      const sentText = doc.sentences[e.sentIdx] || '';
      const label = e.label || e.from || '';
      const localIdx = label ? sentText.indexOf(label) : -1;
      return {
        sentIdx: e.sentIdx,
        label,
        // Best-effort exact position — recovered by locating the mention's
        // own label text within its sentence, since the SYN alias event
        // itself carries no offsets. null when even that fails; the caller
        // falls back to a text_quote-only selector (selector.schema.json
        // supports exactly this: "a quote is robust ... an offset is exact").
        start: localIdx >= 0 ? base + localIdx : null,
        end: localIdx >= 0 ? base + localIdx + label.length : null,
        entitySlug: e.to,
        warrant: e.warrant || null,
        matchKind: e.match || null,
      };
    });

  return { sentences, relations, equivalences };
}
