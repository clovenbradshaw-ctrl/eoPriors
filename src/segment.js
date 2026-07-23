// src/segment.js — observation segmentation, shared by the reader surface and
// the agent (SPEC.md §9): "segment (src/segment.js — same segmenter the agent
// uses)". Produces candidate observation spans with exact character offsets
// into the given text, suitable for a selector.schema.json text_position.
//
// This is deliberately a light paragraph/sentence splitter, not a parser —
// eoPriors measures compression over spans, it does not need clause-level
// grammatical structure to do that. A v1 heuristic: known to under-split on
// abbreviations ("Mr. Smith") and decimal numbers ("3.14") the way a full NLP
// pipeline wouldn't. Stated here rather than silently passed off as exact.
//
// The sentence grain is for PROSE. Line-oriented content — source code,
// poetry, lists, tabular data — terminates statements with NEWLINES, not
// ./!/?, so under sentence grain a whole block collapses into one span (a
// 12-line import block reads as a single "sentence"). For that content use
// the LINE grain (segmentLines / segmentObservations().lines): one span per
// non-blank line, which is the natural observation unit there. The caller
// picks the grain the way the fold bridge picks a modality organ — segment.js
// does not sniff content type. Sentence-grain output is unchanged by this.

const trimSpan = (text, start, end) => {
  let s = start, e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return [s, e];
};

// Paragraphs: text between blank-line boundaries, trimmed, offsets absolute
// against the input text.
export function segmentParagraphs(text) {
  const spans = [];
  const boundary = /\n[ \t]*\n+/g;
  let start = 0;
  let m;
  const push = (s, e) => {
    const [ts, te] = trimSpan(text, s, e);
    if (te > ts) spans.push({ kind: 'paragraph', start: ts, end: te, text: text.slice(ts, te) });
  };
  while ((m = boundary.exec(text))) {
    push(start, m.index);
    start = boundary.lastIndex;
  }
  push(start, text.length);
  return spans;
}

// Sentences within a span of text: a boundary is a ./!/? (plus any
// immediately-trailing closing quote/bracket) followed by whitespace-then-
// capital-or-digit, or end of text. `baseOffset` shifts returned offsets so
// callers can segment a paragraph span and still get absolute offsets into
// the original text.
export function segmentSentences(text, baseOffset = 0) {
  const spans = [];
  const n = text.length;
  let start = 0;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let j = i + 1;
    while (j < n && /["'’”)\]]/.test(text[j])) j++;
    const rest = text.slice(j);
    const isBoundary = rest === '' || /^\s*$/.test(rest) || /^\s+[A-Z0-9]/.test(rest);
    if (!isBoundary) continue;
    const [ts, te] = trimSpan(text, start, j);
    if (te > ts) spans.push({ kind: 'sentence', start: ts + baseOffset, end: te + baseOffset, text: text.slice(ts, te) });
    start = j;
  }
  const [ts, te] = trimSpan(text, start, n);
  if (te > ts) spans.push({ kind: 'sentence', start: ts + baseOffset, end: te + baseOffset, text: text.slice(ts, te) });
  return spans;
}

// Lines within a span of text: one span per non-blank line, offsets absolute,
// blank lines dropped (they carry no content to compress). The line grain for
// content whose statement terminator is the newline, not ./!/? — see the file
// header. `baseOffset` shifts returned offsets so a caller can segment a
// paragraph span and still get absolute offsets into the original text.
export function segmentLines(text, baseOffset = 0) {
  const spans = [];
  let start = 0;
  const pushLine = (s, e) => {
    const [ts, te] = trimSpan(text, s, e);
    if (te > ts) spans.push({ kind: 'line', start: ts + baseOffset, end: te + baseOffset, text: text.slice(ts, te) });
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { pushLine(start, i); start = i + 1; }
  }
  pushLine(start, text.length);
  return spans;
}

// The convenience entry point: paragraph spans plus, nested under each, its
// sentence spans AND its line spans — every set returned flat so a caller can
// pick whichever grain fits the content (sentence for prose, line for
// code/poetry/lists). Every span's offsets are absolute against `text` (the
// representation the selector.schema.json text_position must be exact
// against). `sentences` is byte-identical to before this function grew a
// `lines` grain; `lines` is purely additive.
export function segmentObservations(text) {
  const paragraphs = segmentParagraphs(text);
  const sentences = [];
  const lines = [];
  paragraphs.forEach((p, paragraphIndex) => {
    for (const s of segmentSentences(p.text, p.start)) sentences.push({ ...s, paragraph_index: paragraphIndex });
    for (const l of segmentLines(p.text, p.start)) lines.push({ ...l, paragraph_index: paragraphIndex });
  });
  return { paragraphs, sentences, lines };
}
