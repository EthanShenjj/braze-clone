"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Languages, Plus, Save, Trash2 } from "lucide-react";
import {
  defaultWebhookVariant,
  normalizeWebhookVariants,
  redactHeaders,
  renderWebhookText,
  validateWebhookVariant,
  webhookJsonBody,
  webhookPreviewUser,
  type WebhookHeader,
  type WebhookJsonPair,
  type WebhookVariant,
} from "@/lib/webhook-model";

type CampaignLike = { body?: string; config?: Record<string, unknown> };
type TemplateRecord = { id: string; name: string; description: string; data?: { variant?: WebhookVariant } };

const builtInTemplates: Array<{ name: string; description: string; variant: Partial<WebhookVariant> }> = [
  { name: "Blank webhook", description: "Start from an empty JSON request.", variant: {} },
  { name: "Braze users/track", description: "Post a personalized custom event to Braze.", variant: { url: "https://rest.iad-01.braze.com/users/track", method: "POST", bodyType: "json", body: '{\n  "events": [{\n    "external_id": "{{${user_id} | default: \'unknown\'}}",\n    "name": "webhook_event",\n    "time": "{{${time} | default: \'2026-01-01T00:00:00Z\'}}"\n  }]\n}', headers: [{ id: "header_1", key: "Content-Type", value: "application/json" }, { id: "header_2", key: "Authorization", value: "Bearer YOUR_REST_API_KEY" }] } },
  { name: "Form-encoded request", description: "Send a URL-encoded body.", variant: { bodyType: "text", body: "user={{${user_id} | default: 'unknown'}}&event=campaign_sent", headers: [{ id: "header_1", key: "Content-Type", value: "application/x-www-form-urlencoded" }] } },
];

function field(label: string, child: ReactNode, help?: string) {
  return <label className="field"><span>{label}</span>{child}{help && <small>{help}</small>}</label>;
}

export default function WebhookEditor({ draft, update, openTest }: { draft: CampaignLike; update: (patch: { body?: string; config?: Record<string, unknown> }) => void; openTest: () => void }) {
  const variants = useMemo(() => normalizeWebhookVariants(draft), [draft]);
  const [selected, setSelected] = useState(0);
  const [locale, setLocale] = useState("en");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<TemplateRecord[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [customPreview, setCustomPreview] = useState(JSON.stringify(webhookPreviewUser, null, 2));
  const [capability, setCapability] = useState<{ enabled: boolean; allowedHosts: string[] } | null>(null);
  const variant = variants[Math.min(selected, variants.length - 1)] ?? variants[0];

  useEffect(() => { void fetch("/api/webhooks/capability").then(response => response.json()).then(setCapability).catch(() => {}); }, []);
  useEffect(() => { void fetch("/api/resources/webhook-templates").then(response => response.json()).then(result => setSavedTemplates(result.data ?? [])).catch(() => {}); }, []);

  const persist = (next: WebhookVariant[], nextSelected = selected) => {
    const values = (draft.config?.channelValues ?? {}) as Record<string, unknown>;
    update({ body: next[0]?.body ?? "", config: { ...draft.config, channelValues: { ...values, webhookVariants: next, method: next[0]?.method, url: next[0]?.url } } });
    setSelected(Math.max(0, Math.min(nextSelected, next.length - 1)));
  };
  const patchVariant = (patch: Partial<WebhookVariant>) => persist(variants.map((item, index) => index === selected ? { ...item, ...patch } : item));
  const addVariant = () => {
    const next = { ...defaultWebhookVariant(variant.body), id: `var_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}`, url: variant.url, headers: variant.headers.map(header => ({ ...header, id: crypto.randomUUID() })) };
    persist([...variants, next], variants.length);
  };
  const removeVariant = () => { if (variants.length > 1) persist(variants.filter((_, index) => index !== selected), Math.max(0, selected - 1)); };
  const patchHeader = (id: string, patch: Partial<WebhookHeader>) => patchVariant({ headers: variant.headers.map(header => header.id === id ? { ...header, ...patch } : header) });
  const addHeader = () => patchVariant({ headers: [...variant.headers, { id: crypto.randomUUID(), key: "", value: "" }] });
  const addAuthorization = (scheme: "Bearer" | "Basic") => {
    const existing = variant.headers.find(header => header.key.toLowerCase() === "authorization");
    if (existing) patchHeader(existing.id, { value: `${scheme} ` });
    else patchVariant({ headers: [...variant.headers, { id: crypto.randomUUID(), key: "Authorization", value: `${scheme} ` }] });
  };
  const applyTemplate = (templateVariant: Partial<WebhookVariant>) => {
    const base = defaultWebhookVariant("");
    const normalized = normalizeWebhookVariants({ body: templateVariant.body ?? "", config: { channelValues: { webhookVariants: [{ ...base, ...templateVariant }] } } })[0];
    patchVariant({ ...normalized, id: variant.id, name: variant.name, headers: templateVariant.headers ?? normalized.headers });
    setTemplateOpen(false);
  };
  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    const response = await fetch("/api/resources/webhook-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: templateName.trim(), description: `Reusable ${variant.method} webhook`, status: "Active", data: { variant } }) });
    if (response.ok) { const saved = await response.json(); setSavedTemplates(current => [saved, ...current]); setTemplateName(""); }
  };
  const addLocale = () => { const next = window.prompt("Locale code", "zh-CN")?.trim(); if (next && !variant.locales.includes(next)) patchVariant({ locales: [...variant.locales, next] }); };
  const setTranslation = (key: string, value: string) => patchVariant({ translations: { ...variant.translations, [locale]: { ...(variant.translations[locale] ?? {}), [key]: value } } });
  const setJsonPairs = (pairs: WebhookJsonPair[]) => patchVariant({ jsonPairs: pairs, body: webhookJsonBody(pairs) });
  const patchJsonPair = (id: string, patch: Partial<WebhookJsonPair>) => setJsonPairs(variant.jsonPairs.map(pair => pair.id === id ? { ...pair, ...patch } : pair));
  const insertBodyToken = (token: string) => {
    if (variant.bodyType === "text") { patchVariant({ body: `${variant.body}${variant.body ? "\n" : ""}${token}` }); return; }
    const last = variant.jsonPairs.at(-1);
    if (last) patchJsonPair(last.id, { value: `${last.value}${last.value ? " " : ""}${token}` });
    else setJsonPairs([{ id: crypto.randomUUID(), key: "message", value: token }]);
  };
  const translationKeys = [...new Set([...variant.url.matchAll(/{%\s*translation\s+([\w.-]+)/g), ...variant.body.matchAll(/{%\s*translation\s+([\w.-]+)/g)].map(match => match[1]))];
  let previewContext: Record<string, unknown> = webhookPreviewUser;
  try { previewContext = JSON.parse(customPreview) as Record<string, unknown>; } catch {}
  const renderedUrl = renderWebhookText(variant.url, previewContext, locale, variant.translations);
  const renderedBody = renderWebhookText(variant.body, previewContext, locale, variant.translations);
  const renderedHeaders = redactHeaders(variant.headers.map(header => ({ ...header, value: renderWebhookText(header.value, previewContext, locale, variant.translations) })));
  const issues = validateWebhookVariant(variant, previewContext);

  return <div className="webhook-editor">
    <div className="webhook-toolbar">
      <div className="webhook-variants"><b>Variants</b>{variants.map((item, index) => <button type="button" key={item.id} className={index === selected ? "selected" : ""} onClick={() => setSelected(index)}>{item.name}</button>)}<button type="button" aria-label="Add webhook variant" onClick={addVariant}><Plus size={14}/></button></div>
      <div className="webhook-template-actions"><button type="button" className="secondary small" onClick={() => setTemplateOpen(!templateOpen)}>Templates</button><button type="button" className="secondary small" disabled={variants.length === 1} onClick={removeVariant}><Trash2 size={13}/> Remove</button></div>
    </div>
    {templateOpen && <section className="webhook-template-picker"><h3>Webhook templates</h3>{builtInTemplates.map(template => <button type="button" key={template.name} onClick={() => applyTemplate(template.variant)}><b>{template.name}</b><small>{template.description}</small></button>)}{savedTemplates.filter(template => template.data?.variant).map(template => <button type="button" key={template.id} onClick={() => applyTemplate(template.data!.variant!)}><b>{template.name}</b><small>{template.description}</small></button>)}</section>}
    <div className={capability?.enabled ? "webhook-capability enabled" : "webhook-capability"}><b>{capability?.enabled ? "Live webhook delivery enabled" : "Live webhook delivery disabled"}</b><span>{capability?.enabled ? `Allowed hosts: ${capability.allowedHosts.join(", ") || "none"}` : "Preview works locally. Set WEBHOOK_DELIVERY_ENABLED and WEBHOOK_ALLOWED_HOSTS to send tests or launches."}</span></div>
    <div className="form-grid">{field("Variant name", <input value={variant.name} onChange={event => patchVariant({ name: event.target.value })}/>)}{field("HTTP method", <select value={variant.method} onChange={event => patchVariant({ method: event.target.value as WebhookVariant["method"], body: event.target.value === "GET" ? "" : variant.body })}><option>POST</option><option>GET</option><option>PUT</option><option>DELETE</option></select>)}</div>
    {field("Webhook URL", <input aria-label="Webhook URL" value={variant.url} onChange={event => patchVariant({ url: event.target.value })} placeholder="https://api.example.com/events"/>, "Supports Liquid and translation tags. Only ports 80 and 443 are accepted.")}
    <div className="webhook-language-row"><Languages size={16}/><b>Languages</b>{variant.locales.map(item => <button type="button" className={locale === item ? "selected" : ""} key={item} onClick={() => setLocale(item)}>{item}</button>)}<button type="button" onClick={addLocale}><Plus size={13}/> Add language</button></div>
    <h3>Request headers</h3><div className="webhook-quick-auth"><span>Quick authentication:</span><button type="button" onClick={() => addAuthorization("Bearer")}>Bearer token</button><button type="button" onClick={() => addAuthorization("Basic")}>Basic</button></div>
    <div className="webhook-headers">{variant.headers.map(header => <div key={header.id}><input aria-label="Header name" value={header.key} onChange={event => patchHeader(header.id, { key: event.target.value })} placeholder="Header name"/><input aria-label={`${header.key || "Header"} value`} type={/authorization|token|secret|api[-_]?key/i.test(header.key) ? "password" : "text"} value={header.value} onChange={event => patchHeader(header.id, { value: event.target.value })} placeholder="Value"/><button type="button" aria-label={`Remove ${header.key || "header"}`} onClick={() => patchVariant({ headers: variant.headers.filter(item => item.id !== header.id) })}><Trash2 size={14}/></button></div>)}<button type="button" className="inline-link" onClick={addHeader}><Plus size={14}/> Add header</button></div>
    <div className="webhook-body-title"><h3>Request body</h3><div className="segmented"><button type="button" className={variant.bodyType === "json" ? "selected" : ""} onClick={() => patchVariant({ bodyType: "json" })}>JSON key/value</button><button type="button" className={variant.bodyType === "text" ? "selected" : ""} onClick={() => patchVariant({ bodyType: "text" })}>Raw text</button></div></div>
    {variant.bodyType === "json" ? <div className="webhook-json-pairs">{variant.jsonPairs.map(pair => <div key={pair.id}><input aria-label="JSON key" disabled={variant.method === "GET"} value={pair.key} onChange={event => patchJsonPair(pair.id, { key: event.target.value })} placeholder="Key"/><textarea aria-label={`${pair.key || "JSON"} value`} disabled={variant.method === "GET"} value={pair.value} onChange={event => patchJsonPair(pair.id, { value: event.target.value })} placeholder="Value"/><button type="button" aria-label={`Remove ${pair.key || "JSON pair"}`} onClick={() => setJsonPairs(variant.jsonPairs.filter(item => item.id !== pair.id))}><Trash2 size={14}/></button></div>)}<button type="button" className="inline-link" disabled={variant.method === "GET"} onClick={() => setJsonPairs([...variant.jsonPairs, { id: crypto.randomUUID(), key: "", value: "" }])}><Plus size={14}/> Add key/value pair</button><pre>{variant.body || "{}"}</pre></div> : <textarea aria-label="Webhook request body" className="webhook-body" disabled={variant.method === "GET"} value={variant.body} onChange={event => patchVariant({ body: event.target.value })} placeholder={variant.method === "GET" ? "GET requests do not support a request body." : "Raw text, XML, or form-encoded content"}/>} 
    <div className="webhook-personalization"><span>Insert personalization:</span>{[["First name", "{{${first_name} | default: 'there'}}"], ["Email", "{{${email} | default: 'unknown@example.com'}}"], ["External ID", "{{${user_id} | default: 'unknown'}}"], ["Translation", "{% translation greeting %}Hello{% endtranslation %}"]].map(([label, token]) => <button type="button" key={label} onClick={() => insertBodyToken(token)}>{label}</button>)}</div>
    {translationKeys.length > 0 && <section className="webhook-translations"><h3>Translations · {locale}</h3>{translationKeys.map(key => <div key={key}>{field(key, <input value={variant.translations[locale]?.[key] ?? ""} onChange={event => setTranslation(key, event.target.value)} placeholder="Use source text"/>)}</div>)}</section>}
    {issues.length > 0 && <div className="review-issues" role="alert"><b>Complete before launch</b>{issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
    <section className="webhook-preview"><div><h3>Preview as custom user</h3><textarea aria-label="Webhook preview user JSON" value={customPreview} onChange={event => setCustomPreview(event.target.value)}/></div><pre><b>{variant.method} {renderedUrl || "[missing URL]"}</b>{"\n"}{renderedHeaders.map(header => `${header.key}: ${header.value}`).join("\n")}{renderedBody ? `\n\n${renderedBody}` : ""}</pre></section>
    <div className="webhook-footer-actions"><div><input aria-label="Webhook template name" value={templateName} onChange={event => setTemplateName(event.target.value)} placeholder="Template name"/><button type="button" className="secondary small" onClick={() => void saveTemplate()}><Save size={13}/> Save as template</button></div><button type="button" className="primary" onClick={openTest}>Test webhook</button></div>
  </div>;
}
