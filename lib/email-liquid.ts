import { Liquid } from "liquidjs";

// Braze names (${first_name}, custom_attribute.${key}) become ordinary Liquid lookups.
export function brazeLiquidSource(source: string) {
  return source.replace(/(custom_attribute|event_properties|api_trigger_properties|campaign|context)\.\$\{([^}]+)\}/g, (_m, scope,key) => `${scope}[${JSON.stringify(key)}]`).replace(/\$\{([^}]+)\}/g, (_m, key) => `braze[${JSON.stringify(key)}]`);
}
export class AbortMessageError extends Error {constructor(reason="Message aborted."){super(`Message aborted: ${reason}`);this.name="AbortMessageError";}}
export function registerBrazeRuntimeTags(engine:Liquid){
 engine.registerTag("abort_message",{parse(token){this.reason=token.args.replace(/^\(|\)$/g,"");},render(ctx){throw new AbortMessageError(String(engine.evalValueSync(String(this.reason),ctx)??"Message aborted."));}});
 engine.registerTag("connected_content",{parse(token){this.args=token.args;},render(ctx){const args=String(this.args),url=args.split(/\s/)[0].replace(/^['"]|['"]$/g,""),name=/:save\s+([a-zA-Z_]\w*)/.exec(args)?.[1]??"connected",responses=ctx.get(["__connectedContent"]) as Record<string,unknown>|undefined;if(!responses||!Object.hasOwn(responses,url))throw new Error(`Connected Content is unavailable for ${url}. Configure the allowed host and render on the server.`);ctx.bottom()[name]=responses[url];return"";}});
  engine.registerTag("catalog_items",{parse(token){this.args=token.args;},render(ctx){const args=String(this.args).match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map(s=>s.replace(/^['"]|['"]$/g,""))??[],name=args.shift()??"",catalogs=ctx.get(["__catalogs"]) as Record<string,Array<Record<string,unknown>>>|undefined;if(!catalogs?.[name])throw new Error(`Catalog ${name} is unavailable in this render context.`);ctx.bottom().items=args.map(id=>catalogs[name].find(row=>String(row.id)===id)).filter(Boolean);return"";}});
 return engine;
}
export function renderBrazeLiquid(source: string, profile: Record<string, unknown> = {}, variables: Record<string, unknown> = {}) {
  const engine = registerBrazeRuntimeTags(new Liquid({ strictFilters: true, strictVariables: false, ownPropertyOnly: true, outputEscape: undefined, renderLimit: 100, parseLimit: 1000000, memoryLimit: 10000000 }));

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
