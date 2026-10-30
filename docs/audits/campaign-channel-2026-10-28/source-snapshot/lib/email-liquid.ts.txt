import { Liquid } from "liquidjs";

// Braze names (${first_name}, custom_attribute.${key}) become ordinary Liquid lookups.
export function brazeLiquidSource(source: string) {
  return source.replace(/custom_attribute\.\$\{([^}]+)\}/g, (_m, key) => `custom_attribute[${JSON.stringify(key)}]`).replace(/\$\{([^}]+)\}/g, (_m, key) => `braze[${JSON.stringify(key)}]`);
}
export function renderBrazeLiquid(source: string, profile: Record<string, unknown> = {}, variables: Record<string, unknown> = {}) {
  const engine = new Liquid({ strictFilters: true, strictVariables: false, ownPropertyOnly: true, outputEscape: undefined, renderLimit: 100, parseLimit: 1000000, memoryLimit: 10000000 });
  const attributes = { ...(profile.attributes as Record<string, unknown> ?? {}), ...profile };
  return String(engine.parseAndRenderSync(brazeLiquidSource(source), { ...attributes, braze: attributes, custom_attribute: attributes, ...variables }));
}
export function validateLiquidHttps(source: string) {
  try {
    // Check each literal URL branch. At delivery time the resolved URL is validated again.
    new Liquid().parse(brazeLiquidSource(source));
    const branches = source.replace(/\{%[\s\S]*?%\}/g, "\n").split("\n").map(value => value.trim()).filter(Boolean);
    return branches.length > 0 && branches.every(branch => /^https:\/\//i.test(branch) && !/[\r\n<>]/.test(branch));
  } catch { return false; }
}
export function htmlToPlainText(html: string) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)").replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function workspaceContentBlockHtml(content: string, width?: unknown) {
  if (width === undefined) return content;
  const maxWidth = typeof width === "number" && Number.isFinite(width) && width >= 1 && width <= 2000 ? `${width}px` : "100%";
  return `<div style="width:100%;max-width:${maxWidth};margin-left:auto;margin-right:auto">${content}</div>`;
}
