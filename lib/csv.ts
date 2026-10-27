/** RFC 4180 quoting, escaped quotes and embedded newlines; no silent column loss. */
export function parseUserCsv(source: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') { quoted = false; closed = true; } else cell += c; }
    else if (c === '"') { if (cell || closed) throw new Error("Unexpected quote in CSV field."); quoted = true; }
    else if (c === ",") { row.push(cell); cell = ""; closed = false; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; closed = false; }
    else { if (closed && c.trim()) throw new Error("Unexpected text after closing CSV quote."); if (!closed) cell += c; }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const headers = rows.shift()?.map(v => v.trim()) ?? [];
  if (!headers.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error("CSV needs nonempty, unique column headers.");
  if (!headers.includes("external_id") && !headers.includes("id")) throw new Error("Include an external_id or id column.");
  if (!rows.length || rows.length > 1000) throw new Error("Import between 1 and 1,000 user rows at a time.");
  const seen = new Set<string>();
  const records = rows.map((values, i) => { if (values.length !== headers.length) throw new Error(`Row ${i + 2} has ${values.length} columns; expected ${headers.length}.`); const record = Object.fromEntries(headers.map((h, index) => [h, values[index]])); const id = record.external_id ?? record.id; if (!id?.trim() || seen.has(id)) throw new Error(`Row ${i + 2} has an empty or duplicate external ID.`); seen.add(id); return record; });
  return { headers, rows: records };
}
