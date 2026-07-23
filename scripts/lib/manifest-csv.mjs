// scripts/lib/manifest-csv.mjs — a real CSV parser for
// scripts/gutenberg-corpus.py's manifest.csv, not a line-split. Some
// Gutenberg titles contain an embedded newline inside a quoted field (e.g. a
// subtitle on its own line: `"The Lathe & Its Uses\nOr, Instruction in the
// Art of Turning"`), which a naive "split on \n, then split each line on ,"
// parser breaks — it treats the newline as a row separator even though it's
// still inside an open quote, silently shifting every subsequent field for
// that row (caught for real: several rows' subject_key read back as
// `undefined` instead of the true value). Track quote state across the
// WHOLE file instead of line by line.

export function parseManifestCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const [headers, ...dataRows] = rows;
  const byId = {};
  for (const r of dataRows) byId[r[headers.indexOf('id')]] = Object.fromEntries(headers.map((h, i) => [h, r[i]]));
  return byId;
}
