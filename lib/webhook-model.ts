export type WebhookMethod = "POST" | "GET" | "PUT" | "DELETE";
export type WebhookBodyType = "json" | "text";
export type WebhookHeader = { id: string; key: string; value: string };
export type WebhookJsonPair = { id: string; key: string; value: string };
export type WebhookVariant = {
  id: string;
  name: string;
  url: string;
  method: WebhookMethod;
  bodyType: WebhookBodyType;
  body: string;
  jsonPairs: WebhookJsonPair[];
  headers: WebhookHeader[];
  locales: string[];
  translations: Record<string, Record<string, string>>;
};

type WebhookCampaignLike = { body?: string; config?: Record<string, unknown> };

export const webhookPreviewUser = {
  user_id: "user_1024",
  external_id: "user_1024",
  email: "user1024@example.test",
  first_name: "Customer 1024",
  language: "en",
  country: "US",
};

function headerId(index: number) { return `header_${index + 1}`; }

export function defaultWebhookVariant(body = ""): WebhookVariant {
  return {
    id: "var_1",
    name: "Variant 1",
    url: "",
    method: "POST",
    bodyType: "json",
    body,
    jsonPairs: jsonPairsFromBody(body),
    headers: [{ id: headerId(0), key: "Content-Type", value: "application/json" }],
    locales: ["en"],
    translations: {},
  };
}

export function normalizeWebhookVariants(campaign: WebhookCampaignLike): WebhookVariant[] {
  const values = (campaign.config?.channelValues ?? {}) as Record<string, unknown>;
  const stored = values.webhookVariants;
  if (Array.isArray(stored) && stored.length) {
    return stored.map((value, index) => normalizeVariant(value as Partial<WebhookVariant>, index, campaign.body ?? ""));
  }
  const legacyHeaders = typeof values.headers === "string"
    ? String(values.headers).split("\n").map((line, index) => {
        const split = line.indexOf(":");
        return { id: headerId(index), key: split < 0 ? line.trim() : line.slice(0, split).trim(), value: split < 0 ? "" : line.slice(split + 1).trim() };
      }).filter(header => header.key)
    : undefined;
  return [normalizeVariant({
    id: "var_1",
    name: "Variant 1",
    url: typeof values.url === "string" ? values.url : "",
    method: isMethod(values.method) ? values.method : "POST",
    body: campaign.body ?? "",
    headers: legacyHeaders,
  }, 0, campaign.body ?? "")];
}

function normalizeVariant(value: Partial<WebhookVariant>, index: number, fallbackBody: string): WebhookVariant {
  const fallback = defaultWebhookVariant(fallbackBody);
  return {
    id: value.id || `var_${index + 1}`,
    name: value.name || `Variant ${index + 1}`,
    url: value.url ?? "",
    method: isMethod(value.method) ? value.method : "POST",
    bodyType: value.bodyType === "text" ? "text" : "json",
    body: value.body ?? fallback.body,
    jsonPairs: Array.isArray(value.jsonPairs) ? value.jsonPairs.map((pair, pairIndex) => ({ id: pair.id || `pair_${pairIndex + 1}`, key: pair.key ?? "", value: pair.value ?? "" })) : jsonPairsFromBody(value.body ?? fallback.body),
    headers: Array.isArray(value.headers) && value.headers.length
      ? value.headers.map((header, headerIndex) => ({ id: header.id || headerId(headerIndex), key: header.key ?? "", value: header.value ?? "" }))
      : fallback.headers,
    locales: Array.isArray(value.locales) && value.locales.length ? value.locales : ["en"],
    translations: value.translations && typeof value.translations === "object" ? value.translations : {},
  };
}

function jsonPairsFromBody(body: string): WebhookJsonPair[] {
  if (!body.trim()) return [];
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, unknown>).map(([key, value], index) => ({ id: `pair_${index + 1}`, key, value: typeof value === "string" ? value : JSON.stringify(value) }));
  } catch { return []; }
}

export function webhookJsonBody(pairs: WebhookJsonPair[]) {
  const output: Record<string, unknown> = {};
  for (const pair of pairs) {
    if (!pair.key.trim()) continue;
    const value = pair.value.trim();
    if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
      try { output[pair.key] = JSON.parse(value); continue; } catch {}
    }
    output[pair.key] = pair.value;
  }
  return JSON.stringify(output, null, 2);
}

function isMethod(value: unknown): value is WebhookMethod {
  return value === "POST" || value === "GET" || value === "PUT" || value === "DELETE";
}

function lookup(path: string, context: Record<string, unknown>): unknown {
  const normalized = path.replace(/^\$\{/, "").replace(/\}$/, "").replace(/^custom_attribute\.\$\{/, "attributes.").replace(/\}$/, "");
  return normalized.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, context);
}

export function renderWebhookText(input: string, context: Record<string, unknown>, locale = "en", translations: Record<string, Record<string, string>> = {}) {
  const localized = input.replace(/{%\s*translation\s+([\w.-]+)\s*%}([\s\S]*?){%\s*endtranslation\s*%}/g, (_match, key: string, fallback: string) => translations[locale]?.[key] ?? fallback);
  return localized.replace(/{{\s*((?:custom_attribute\.)?\$\{[^}]+\}|[\w.]+)\s*(?:\|\s*default\s*:\s*(['"])(.*?)\2\s*)?}}/g, (_match, rawPath: string, _quote: string, defaultValue: string) => {
    const value = lookup(rawPath.trim(), context);
    return value === undefined || value === null || value === "" ? defaultValue ?? "" : String(value);
  });
}

export function validateWebhookVariant(variant: WebhookVariant, context: Record<string, unknown> = webhookPreviewUser): string[] {
  const issues: string[] = [];
  if (!variant.url.trim()) issues.push(`${variant.name}: Enter a webhook URL.`);
  const missingDefaults = [...`${variant.url}\n${variant.body}\n${variant.headers.map(header => header.value).join("\n")}`.matchAll(/{{\s*((?:custom_attribute\.)?\$\{[^}]+\})[\s\S]*?}}/g)]
    .filter(match => !match[0].includes("default"));
  if (missingDefaults.length) issues.push(`${variant.name}: Add a default value to every personalized Liquid variable.`);
  const renderedUrl = renderWebhookText(variant.url, context, "en", variant.translations);
  try {
    const parsed = new URL(renderedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) issues.push(`${variant.name}: Webhook URL must use HTTP or HTTPS.`);
    if (parsed.username || parsed.password) issues.push(`${variant.name}: Put credentials in an Authorization header, not in the URL.`);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    if (port !== "80" && port !== "443") issues.push(`${variant.name}: Webhook URL must use port 80 or 443.`);
  } catch { if (variant.url.trim()) issues.push(`${variant.name}: Enter a valid webhook URL.`); }
  const seen = new Set<string>();
  for (const header of variant.headers) {
    const key = header.key.trim();
    if (!key) { issues.push(`${variant.name}: Header names cannot be empty.`); continue; }
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) issues.push(`${variant.name}: Header “${key}” is invalid.`);
    if (seen.has(key.toLowerCase())) issues.push(`${variant.name}: Header “${key}” is duplicated.`);
    seen.add(key.toLowerCase());
    if (/[\r\n]/.test(header.value)) issues.push(`${variant.name}: Header “${key}” contains an invalid line break.`);
  }
  if (variant.method === "GET" && variant.body.trim()) issues.push(`${variant.name}: GET webhooks cannot include a request body.`);
  if (variant.bodyType === "json" && variant.body.trim() && variant.method !== "GET") {
    try { JSON.parse(renderWebhookText(variant.body, context, "en", variant.translations)); }
    catch { issues.push(`${variant.name}: Request body must be valid JSON after personalization.`); }
  }
  return [...new Set(issues)];
}

export function redactHeaders(headers: WebhookHeader[]) {
  return headers.map(header => ({ ...header, value: /authorization|token|secret|api[-_]?key/i.test(header.key) ? "••••••••" : header.value }));
}
