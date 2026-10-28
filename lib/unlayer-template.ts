// Unlayer Full design schema: https://docs.unlayer.com/design-schema/design-object
export const unlayerBuilderVersion = "1.489.0";
export type UnlayerDesign = { counters: Record<string, number>; body: { id?: string; rows: Array<Record<string, unknown>>; values: Record<string, unknown> }; schemaVersion?: number };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function isUnlayerDesign(value: unknown): value is UnlayerDesign {
  if (!object(value) || !object(value.counters) || !Object.values(value.counters).every(n => typeof n === "number" && Number.isFinite(n)) || !object(value.body) || !object(value.body.values) || !Array.isArray(value.body.rows)) return false;
  const validRows = (rows: unknown[]) => rows.every(row => object(row) && Array.isArray(row.cells) && Array.isArray(row.columns) && row.cells.length === row.columns.length && row.cells.every(cell => typeof cell === "number" && cell > 0) && object(row.values) && row.columns.every(column => object(column) && object(column.values) && Array.isArray(column.contents) && column.contents.every(content => object(content) && typeof content.type === "string" && object(content.values))));
  return validRows(value.body.rows) && (!value.body.headers || Array.isArray(value.body.headers) && validRows(value.body.headers)) && (!value.body.footers || Array.isArray(value.body.footers) && validRows(value.body.footers));
}

export function blankUnlayerDesign(): UnlayerDesign {
  return { schemaVersion: 21, counters: { u_row: 1, u_column: 1, u_content_html: 0 }, body: { id: "body", rows: [{ id: "u_row_1", cells: [12], columns: [{ id: "u_column_1", contents: [], values: { backgroundColor: "#ffffff", padding: "0px", border: {} } }], values: { columnsBackgroundColor: "#ffffff", backgroundColor: "", padding: "0px", hideDesktop: false, hideMobile: false } }], values: { backgroundColor: "#f4f2f7", contentWidth: "600px", fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" }, textColor: "#101b24", linkStyle: { body: true, linkColor: "#6736d8", linkHoverColor: "#6736d8", linkUnderline: true, linkHoverUnderline: true } } } };
}

export function htmlUnlayerDesign(html: string): UnlayerDesign {
  const design = blankUnlayerDesign();
  // Keep head styles with the body fragment; avoid nesting a complete HTML document
  // inside the Unlayer-generated document. Original HTML remains in migration metadata.
  const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(match => match[0]).join("\n");
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html.replace(/<!doctype[^>]*>/gi, "").replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, "").replace(/<\/?html\b[^>]*>/gi, "");
  const fragment = html.includes("<body") || /<body\b/i.test(html) ? `${styles}\n${body}` : body;
  const columns = design.body.rows[0].columns as Array<{ contents: unknown[] }>;
  columns[0].contents.push({ id: "u_content_html_1", type: "html", values: { html: fragment, containerPadding: "0px", hideDesktop: false, hideMobile: false, _meta: { htmlID: "u_content_html_1", htmlClassNames: "u_content_html" } } });
  design.counters.u_content_html = 1;
  return design;
}

export function initialUnlayerDesign(config: Record<string, unknown> = {}, html = "") {
  let saved: unknown = config.emailUnlayerJson;
  if (typeof saved === "string") { try { saved = JSON.parse(saved); } catch { throw new Error("The saved Unlayer design is invalid. Your existing email has not been changed."); } }
  if (saved !== undefined && saved !== null) {
    if (!isUnlayerDesign(saved)) throw new Error("The saved Unlayer design is invalid. Your existing email has not been changed.");
    return { design: structuredClone(saved), imported: false };
  }
  if (html.trim()) return { design: htmlUnlayerDesign(html), imported: true };
  if (config.emailBeefreeJson) throw new Error("This legacy design has no exported HTML. Export its HTML before opening it in Unlayer; the original design is preserved.");
  return { design: blankUnlayerDesign(), imported: false };
}

export function unlayerSavePatch(config: Record<string, unknown>, subject: string, exported: { design: unknown; html: unknown }, version = unlayerBuilderVersion) {
  if (!isUnlayerDesign(exported.design) || typeof exported.html !== "string" || !exported.html.trim()) throw new Error("Unlayer returned an incomplete export. Your saved email has not been changed.");
  return { subject, body: exported.html, config: { ...config, emailEditorMode: "drag", emailEditorEngine: "unlayer", emailUnlayerJson: exported.design, emailUnlayerVersion: version } };
}

// A non-primary variant must not overwrite the primary design mirrored in config.
export function preservePrimaryEmailDesign(base: Record<string, unknown>, patch: Record<string, unknown>, variant: number) {
  const result = { ...base, ...patch };
  if (variant !== 0) for (const key of ["emailEditorMode", "emailRows", "emailStyle", "emailSending", "emailEditorEngine", "emailGrapesProject", "emailGrapesSchemaVersion", "emailGrapesMigration", "emailMjml", "emailBeefreeJson", "emailBeefreeVersion", "emailUnlayerJson", "emailUnlayerVersion", "emailUnlayerMigration"]) { if (key in base) result[key] = base[key]; else delete result[key]; }
  return result;
}
