// Migration keeps vendor source JSON in config and uses its exported HTML verbatim.
// Import as one MJML raw block: vendor design schemas cannot be converted losslessly.
export function htmlToGrapesMjml(html: string) {
  const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(match => match[0]).join("\n");
  const body = /<body\b/i.test(html) ? `${styles}\n${html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ""}` : html.replace(/<!doctype[^>]*>/gi, "").replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, "").replace(/<\/?html\b[^>]*>/gi, "");
  return `<mjml><mj-head></mj-head><mj-body width="600px"><mj-raw>${body}</mj-raw></mj-body></mjml>`;
}

export function grapesImport(config: Record<string, unknown> = {}, html = "") {
  const vendor = ["unlayer", "beefree"].includes(String(config.emailEditorEngine));
  const hasGrapes = config.emailEditorEngine === "grapesjs-mjml" || !vendor && (config.emailMjml || config.emailGrapesProject || Array.isArray(config.emailRows) && config.emailRows.length);
  if (hasGrapes) return { imported: false, mjml: "", error: "" };
  if (html.trim()) return { imported: true, mjml: htmlToGrapesMjml(html), error: "" };
  if (config.emailUnlayerJson || config.emailBeefreeJson) return { imported: false, mjml: "", error: "This saved design has no exported HTML. Export its HTML before migrating to GrapesJS. The original design has been preserved." };
  return { imported: false, mjml: "", error: "" };
}

export const emailRowLayouts = [[100], [25, 75], [33, 67], [50, 50], [67, 33], [75, 25], [33, 34, 33], [25, 50, 25], [25, 25, 25, 25], [20, 20, 20, 20, 20], [16, 17, 17, 17, 17, 16]];
export function grapesRowMarkup(widths: number[], background = "#ffffff") {
  if (!widths.length || widths.some(width => !Number.isFinite(width) || width <= 0) || Math.abs(widths.reduce((a, b) => a + b, 0) - 100) > .01) throw new Error("Column widths must add up to 100%.");
  return `<mj-section background-color="${background.replaceAll('"', '')}" padding="0px">${widths.map(width => `<mj-column width="${width}%" padding="0px"><mj-text padding="10px">Add your message here.</mj-text></mj-column>`).join("")}</mj-section>`;
}
