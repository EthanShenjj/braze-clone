"use client";

import "grapesjs/dist/css/grapes.min.css";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Component, Editor } from "grapesjs";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronLeft, Code2, Copy, Eye, Image as ImageIcon,
  Info, Italic, Link2, Mail, Monitor, Redo2, Smartphone, Strikethrough, Underline, Undo2, X,
} from "lucide-react";
import styles from "./email-dnd.module.css";
import GrapesSidebar from "./email-grapes-sidebar";
import { grapesImport, emailRowLayouts, grapesRowMarkup } from "@/lib/email-grapes-template";
import {
  blockText, downloadHtmlFile, emailFontFamilies, escapeHtml,
  normalizeRows, normalizeStyle, type EmailBlock, type EmailStyle, type MenuItem, type SocialItem,
} from "@/lib/email-editor-model";
import { hasHtmlStyleVoidTags, normalizeMjmlDocument, normalizeXmlVoidTags } from "@/lib/email-mjml";
import { translate, type Locale } from "@/lib/i18n";
import { normalizeEmailPreferences, type TextTheme } from "@/lib/email-preferences";

type CampaignLike = { id: string; name: string; subject?: string; body?: string; config?: Record<string, unknown> };
type SavePatch = { subject?: string; body?: string; config?: Record<string, unknown> };
type EditorSnapshot = { project: Record<string, unknown>; mjml: string; html: string };
type SelectedState = { cid: string; type: string; label: string; attributes: Record<string, string> } | null;
type CatalogSummary = { id: string; name: string; data?: { fields?: string[] } };
type CatalogItem = { id: string; name: string; fields?: Record<string, unknown> };
type CatalogSelection = { name: string; description?: string };

const personalizationTypes = [
  "Default Attributes", "Custom Attributes", "Nested Custom Attributes", "Most Recent Device Attributes",
  "Content Blocks", "Preference Center", "Landing Page", "Campaign Attributes", "Event Properties",
  "Email Properties", "API Trigger Properties", "SMS Properties", "WhatsApp Properties", "Catalog Items",
  "Item Recommendation", "Advanced Event Properties", "Message Extras", "Translation Tags",
] as const;
type PersonalizationType = (typeof personalizationTypes)[number];

const defaultAttributes = [
  "first_name", "last_name", "email_address", "language", "country", "user_id", "most_recent_location",
  "date_of_birth", "phone_number", "gender", "city", "created_at", "last_used_app_date",
  "most_recent_app_version", "time_zone", "most_recent_locale", "braze_id", "random_bucket_number", "line_id",
];

const personalizationAttributes: Partial<Record<PersonalizationType, string[]>> = {
  "Most Recent Device Attributes": ["model", "os", "carrier", "device_id", "ad_tracking_enabled"],
  "Content Blocks": ["email_header", "email_footer", "legal_disclaimer"],
  "Preference Center": ["preference_center_url", "preference_center_name"],
  "Landing Page": ["landing_page_url", "landing_page_name"],
  "Campaign Attributes": ["name", "api_id", "message_name", "variation_name"],
  "Event Properties": ["name", "category", "product_id", "price"],
  "Email Properties": ["subject", "from_address", "reply_to"],
  "API Trigger Properties": ["name", "value", "campaign_id"],
  "SMS Properties": ["from_phone_number", "subscription_group_id"],
  "WhatsApp Properties": ["phone_number", "template_name", "language"],
  "Item Recommendation": ["recommendation_name", "item_id", "score"],
  "Advanced Event Properties": ["name", "properties", "time"],
  "Message Extras": ["key", "value"],
  "Translation Tags": ["translation_key", "locale"],
};

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

function attr(value: unknown) {
  return escapeHtml(String(value ?? "")).replaceAll('"', "&quot;");
}

function mjmlAttributes(values: Record<string, unknown>) {
  return Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => `${key}="${attr(value)}"`).join(" ");
}

function themeAttributes(theme: TextTheme, fontFamily: string) {
  return mjmlAttributes({ "font-family": fontFamily, "font-size": `${theme.fontSize}px`, color: theme.color, align: theme.align, "container-background-color": undefined, "font-weight": theme.weight, "line-height": theme.lineHeight, "letter-spacing": `${theme.letterSpacing}px`, padding: `${theme.paddingTop}px ${theme.paddingRight}px ${theme.paddingBottom}px ${theme.paddingLeft}px` });
}

function blockToMjml(block: EmailBlock, globalStyle: EmailStyle) {
  const s = block.style ?? {};
  const common = {
    padding: `${s.padding ?? 10}px`,
    align: s.align ?? "left",
    color: s.color ?? globalStyle.textColor,
    "font-size": `${s.fontSize ?? (block.kind === "Title" ? 34 : 15)}px`,
    "font-family": globalStyle.fontFamily,
  };
  if (block.kind === "Title") return `<mj-text ${mjmlAttributes({ ...common, "font-weight": 700, "line-height": "1.2" })}>${blockText(block, "en")}</mj-text>`;
  if (block.kind === "Paragraph") return `<mj-text ${mjmlAttributes({ ...common, "line-height": "1.55" })}>${blockText(block, "en")}</mj-text>`;
  if (block.kind === "List") {
    const tag = block.ordered ? "ol" : "ul";
    const items = blockText(block, "en").split("\n").filter(Boolean).map(item => `<li>${escapeHtml(item)}</li>`).join("");
    return `<mj-text ${mjmlAttributes({ ...common, "line-height": "1.55" })}><${tag}>${items}</${tag}></mj-text>`;
  }
  if (block.kind === "Image") return `<mj-image ${mjmlAttributes({ src: block.src, alt: block.alt, href: block.href, width: `${block.width ?? 100}%`, align: s.align ?? "center", padding: `${s.padding ?? 10}px`, "border-radius": `${s.radius ?? 0}px` })} />`;
  if (block.kind === "Button") return `<mj-button ${mjmlAttributes({ href: block.href, align: s.align ?? "center", color: s.color ?? "#ffffff", "background-color": s.bgColor ?? "#6136cc", "border-radius": `${s.radius ?? 4}px`, "font-size": `${s.fontSize ?? 14}px`, padding: `${s.padding ?? 12}px`, "font-family": globalStyle.fontFamily })}>${blockText(block, "en")}</mj-button>`;
  if (block.kind === "Divider") return `<mj-divider ${mjmlAttributes({ "border-color": s.color ?? "#dcd9e0", "border-width": `${s.thickness ?? 1}px`, padding: `${s.padding ?? 20}px` })} />`;
  if (block.kind === "Spacer") return `<mj-spacer height="${s.height ?? 44}px" />`;
  if (block.kind === "Social") {
    const items = (block.items ?? []) as SocialItem[];
    return `<mj-social align="${s.align ?? "center"}">${items.map(item => `<mj-social-element name="${attr(item.network.toLowerCase().replace("linkedin", "linkedin"))}" href="${attr(item.href)}"></mj-social-element>`).join("")}</mj-social>`;
  }
  if (block.kind === "Menu") {
    const items = (block.items ?? []) as MenuItem[];
    return `<mj-navbar align="${s.align ?? "center"}">${items.map(item => `<mj-navbar-link href="${attr(item.href)}">${escapeHtml(item.label)}</mj-navbar-link>`).join("")}</mj-navbar>`;
  }
  if (block.kind === "HTML") return `<mj-raw>${block.text ?? ""}</mj-raw>`;
  if (block.kind === "Video") return `<mj-image ${mjmlAttributes({ src: block.src, alt: block.alt, href: block.href, padding: `${s.padding ?? 10}px` })} />`;
  return `<mj-text ${mjmlAttributes(common)}>${blockText(block, "en") || block.kind}</mj-text>`;
}

export function legacyRowsToMjml(rowsValue: unknown, styleValue: unknown, themeValue?: unknown) {
  const theme = themeValue ? normalizeEmailPreferences({ editor: themeValue }).editor : undefined;
  const rows = normalizeRows(rowsValue, undefined);
  const style = normalizeStyle(styleValue);
  const body = rows.map(row => `<mj-section ${mjmlAttributes({ "background-color": row.bg || style.contentBg, padding: `${row.padding ?? 10}px` })}>${row.cells.map(cell => `<mj-column width="${cell.width}%">${cell.blocks.map(block => blockToMjml(block, style)).join("")}</mj-column>`).join("")}</mj-section>`).join("");
  const fallback = `<mj-section background-color="${attr(style.contentBg)}"><mj-column><mj-text ${theme ? themeAttributes(theme.paragraph, style.fontFamily) : mjmlAttributes({ color: style.textColor, "font-family": style.fontFamily, "font-size": "15px", "line-height": "1.5", padding: "10px" })}><p style="margin:0 0 ${theme?.paragraph.spacing ?? 0}px;direction:${theme?.paragraph.direction ?? "ltr"}">Add your message here.</p></mj-text></mj-column></mj-section>`;
  return `<mjml><mj-head></mj-head><mj-body width="${style.contentWidth}px" background-color="${attr(style.canvasBg)}">${body || fallback}</mj-body></mjml>`;
}

function selectedState(component: Component | undefined): SelectedState {
  if (!component) return null;
  const type = String(component.get("type") ?? component.get("tagName") ?? "component");
  const labels: Record<string, string> = { "mj-text": "TEXT", "mj-image": "IMAGE", "mj-button": "BUTTON", "mj-divider": "DIVIDER", "mj-spacer": "SPACER", "mj-section": "ROW", "mj-column": "COLUMN", "mj-social": "SOCIAL", "mj-navbar": "MENU", "mj-raw": "HTML" };
  const raw = component.getAttributes() as Record<string, unknown>;
  return { cid: component.cid, type, label: labels[type] ?? type.toUpperCase(), attributes: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value ?? "")])) };
}

function htmlFromResult(result: unknown, fallback: string) {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "html" in result && typeof (result as { html?: unknown }).html === "string") return (result as { html: string }).html;
  return fallback;
}

function useCatalogs(open: boolean) {
  const [catalogs, setCatalogs] = useState<CatalogSummary[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selections, setSelections] = useState<CatalogSelection[]>([]);
  const [catalogId, setCatalogId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || catalogs.length) return;
    setLoading(true);
    void fetch("/api/catalogs").then(response => response.ok ? response.json() : Promise.reject()).then(payload => setCatalogs(payload.data ?? [])).catch(() => setError("Catalogs could not be loaded.")).finally(() => setLoading(false));
  }, [catalogs.length, open]);
  useEffect(() => {
    setItems([]); setSelections([]); setError("");
    if (!catalogId) return;
    setLoading(true);
    void Promise.all([
      fetch(`/api/catalogs/${encodeURIComponent(catalogId)}/items`).then(response => response.ok ? response.json() : Promise.reject()),
      fetch(`/api/catalogs/${encodeURIComponent(catalogId)}/selections`).then(response => response.ok ? response.json() : Promise.reject()),
    ]).then(([itemPayload, selectionPayload]) => { setItems(itemPayload.data ?? []); setSelections(selectionPayload.data ?? []); }).catch(() => setError("Catalog items and selections could not be loaded.")).finally(() => setLoading(false));
  }, [catalogId]);
  return { catalogs, items, selections, catalogId, setCatalogId, loading, error };
}

function useUserAttributes(open: boolean) {
  const [attributes, setAttributes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || loaded || loading) return;
    setLoading(true);
    void fetch("/api/users/attributes")
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(payload => setAttributes(Array.isArray(payload.data) ? payload.data : []))
      .catch(() => setError("Custom attributes could not be loaded."))
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [loaded, loading, open]);
  return { attributes, loading, error };
}

function AttributeCombobox({ value, options, loading, onChange }: { value: string; options: string[]; loading?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  useEffect(() => setQuery(value), [value]);
  const visible = options.filter(option => option.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60);
  return <div className={styles.attributeCombobox}>
    <input
      aria-label="Attribute"
      role="combobox"
      aria-expanded={open}
      aria-controls="personalization-attribute-options"
      autoComplete="off"
      placeholder={loading ? "Loading attributes…" : "Search for an attribute"}
      value={query}
      onFocus={() => { setOpen(true); if (value) setQuery(""); }}
      onChange={event => { setQuery(event.target.value); setOpen(true); if (value) onChange(""); }}
      onBlur={() => window.setTimeout(() => setOpen(false), 100)}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}
    />
    <ChevronDown aria-hidden="true" />
    {open && <div className={styles.attributeOptions} id="personalization-attribute-options" role="listbox">
      {visible.map(option => <button key={option} type="button" role="option" aria-selected={option === value} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option); setQuery(option); setOpen(false); }}>{option}</button>)}
      {!visible.length && <span>No matching attributes</span>}
    </div>}
  </div>;
}

function liquidSnippet(type: PersonalizationType, attribute: string, fallback: string) {
  if (!attribute) return "";
  const namespaces: Partial<Record<PersonalizationType, string>> = {
    "Custom Attributes": "custom_attribute", "Nested Custom Attributes": "custom_attribute",
    "Most Recent Device Attributes": "most_recently_used_device", "Content Blocks": "content_blocks",
    "Preference Center": "preference_center", "Landing Page": "landing_pages", "Campaign Attributes": "campaign",
    "Event Properties": "event_properties", "Email Properties": "email_properties",
    "API Trigger Properties": "api_trigger_properties", "SMS Properties": "sms_properties",
    "WhatsApp Properties": "whatsapp_properties", "Item Recommendation": "recommendations",
    "Advanced Event Properties": "event_properties", "Message Extras": "message_extras",
  };
  if (type === "Translation Tags") return `{% translation ${attribute} %}`;
  const namespace = namespaces[type];
  const base = namespace ? `{{${namespace}.\${${attribute}}}}` : `{{\${${attribute}}}}`;
  if (!fallback) return base;
  const safeFallback = fallback.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  return `${base.slice(0, -2)} | default: '${safeFallback}'` + "}}";
}

function PersonalizationPanel({ onClose, onInsert, customAttributes }: { onClose: () => void; onInsert: (value: string) => void; customAttributes: ReturnType<typeof useUserAttributes> }) {
  const data = useCatalogs(true);
  const [type, setType] = useState<PersonalizationType>("Default Attributes");
  const [attribute, setAttribute] = useState("");
  const [fallback, setFallback] = useState("");
  const [method, setMethod] = useState<"items" | "selection">("items");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [selectionName, setSelectionName] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const catalog = data.catalogs.find(item => item.id === data.catalogId);
  const availableFields = useMemo(() => [...new Set(["id", ...(catalog?.data?.fields ?? []), ...data.items.flatMap(item => Object.keys(item.fields ?? {}))])], [catalog?.data?.fields, data.items]);
  const catalogComplete = Boolean(catalog && fields.length && (method === "items" ? itemIds.length : selectionName));
  const command = !catalog ? "{% catalog_items %}" : method === "items" ? `{% catalog_items ${catalog.name}${itemIds.length ? ` ${itemIds.join(" ")}` : ""} %}` : `{% catalog_selection_items ${catalog.name}${selectionName ? ` ${selectionName}` : ""} %}`;
  const itemExpressions = method === "items"
    ? itemIds.flatMap((_, index) => fields.map(field => `{{ items[${index}].${field} }}`)).join("\n")
    : fields.length ? `{% for item in items %}\n${fields.map(field => `{{ item.${field} }}`).join("\n")}\n{% endfor %}` : "";
  const catalogSnippet = `${command}${itemExpressions ? `\n${itemExpressions}` : ""}`;
  const snippet = type === "Catalog Items" ? catalogSnippet : liquidSnippet(type, attribute, fallback);
  const complete = type === "Catalog Items" ? catalogComplete : Boolean(attribute);
  const attributeOptions = type === "Default Attributes"
    ? defaultAttributes
    : type === "Custom Attributes" || type === "Nested Custom Attributes"
      ? customAttributes.attributes
      : personalizationAttributes[type] ?? [];
  const toggle = (values: string[], value: string, limit?: number) => values.includes(value) ? values.filter(item => item !== value) : limit && values.length >= limit ? values : [...values, value];
  const changeType = (next: PersonalizationType) => {
    setType(next); setAttribute(""); setFallback(""); setCopied(false);
    setItemIds([]); setSelectionName(""); setFields([]); setMethod("items");
  };
  const copy = () => {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true); window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => setCopied(false));
  };
  return <section className={styles.personalizationPanel} role="dialog" aria-label="Add Personalization">
    <header className={styles.personalizationHead}><h2>Add Personalization</h2><button aria-label="Close" onClick={onClose}><X /></button></header>
    <div className={styles.personalizationForm}>
      <label>Personalization type<select aria-label="Personalization type" autoFocus value={type} onChange={event => changeType(event.target.value as PersonalizationType)}>{personalizationTypes.map(option => <option key={option}>{option}</option>)}</select></label>
      {type !== "Catalog Items" && <>
        <label>Attribute<AttributeCombobox value={attribute} options={attributeOptions} loading={(type === "Custom Attributes" || type === "Nested Custom Attributes") && customAttributes.loading} onChange={setAttribute}/></label>
        {customAttributes.error && (type === "Custom Attributes" || type === "Nested Custom Attributes") && <p className={styles.personalizationError}>{customAttributes.error}</p>}
        <label><span className={styles.personalizationLabel}>Default value <span className={styles.optionalLabel}>(Optional)</span><span className={styles.infoIcon} title="Used when the selected attribute is empty."><Info aria-hidden="true" /></span></span><input aria-label="Default value" placeholder="Enter default value" value={fallback} onChange={event => setFallback(event.target.value)}/></label>
      </>}
      {type === "Catalog Items" && <><label>Catalog name<select className={!data.catalogId ? styles.placeholderSelect : undefined} value={data.catalogId} onChange={event => { data.setCatalogId(event.target.value); setItemIds([]); setSelectionName(""); setFields([]); }}><option value="">Select a Catalog</option>{data.catalogs.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      {data.loading && <p className={styles.personalizationEmpty}>Loading catalog data…</p>}
      {data.error && <p className={styles.personalizationError}>{data.error}</p>}
      {catalog && <label>Source<select value={method} onChange={event => { setMethod(event.target.value as typeof method); setItemIds([]); setSelectionName(""); }}><option value="items">Specific catalog items</option><option value="selection">Selection</option></select></label>}
      {catalog && method === "items" && <fieldset className={styles.optionFieldset}><legend>Catalog items <span>Up to 3</span></legend><div className={styles.checkList}>{data.items.length ? data.items.map(item => <label key={item.id} className={itemIds.includes(item.id) ? styles.checkedOption : undefined}><input type="checkbox" checked={itemIds.includes(item.id)} onChange={() => setItemIds(toggle(itemIds, item.id, 3))}/><span><b>{item.name || item.id}</b><small>{item.id}</small></span></label>) : <p>This catalog has no items.</p>}</div></fieldset>}
      {catalog && method === "selection" && <label>Selection<select value={selectionName} onChange={event => setSelectionName(event.target.value)}><option value="">Select a Selection</option>{data.selections.map(item => <option key={item.name}>{item.name}</option>)}</select></label>}
      {catalog && <fieldset className={styles.optionFieldset}><legend>Fields <span>Select output fields</span></legend><div className={styles.fieldGrid}>{availableFields.map(field => <label key={field} className={fields.includes(field) ? styles.checkedOption : undefined}><input type="checkbox" checked={fields.includes(field)} onChange={() => setFields(toggle(fields, field))}/><span>{field}</span></label>)}</div></fieldset>}
      </>}
      <label className={styles.snippetLabel}>Liquid Snippet<div className={styles.snippetField}><code>{snippet}</code><button type="button" aria-label="Copy Liquid snippet" onClick={copy}><Copy /></button></div></label>
      {copied && <span className={styles.copyFeedback}>Copied</span>}
      {complete && <button type="button" className={styles.insertSnippet} onClick={() => onInsert(snippet)}>Insert into message</button>}
    </div>
  </section>;
}

export default function GrapesEmailEditor({ locale, draft, variantName, save, onClose, onSendingSettings, onOpenTest }: {
  locale: Locale; draft: CampaignLike; variantName: string; save: (patch: SavePatch) => Promise<boolean>;
  onClose: () => void; onSendingSettings: () => void; onOpenTest: () => void;
}) {
  const [linkAliases, setLinkAliases] = useState<Array<{ url: string; alias: string; tracking: boolean }>>(() => Array.isArray(draft.config?.emailLinkAliases) ? draft.config.emailLinkAliases as Array<{ url: string; alias: string; tracking: boolean }> : []);
  const linkAliasesRef = useRef(linkAliases); linkAliasesRef.current = linkAliases;
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [leftMode, setLeftMode] = useState<"content" | "personalization" | "languages" | "links">("content");
  const [rightTab, setRightTab] = useState<"content" | "rows" | "settings">("content");
  const [device, setDevice] = useState<"Desktop" | "Mobile">("Desktop");
  const [selected, setSelected] = useState<SelectedState>(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [autocomplete, setAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [migration] = useState(() => grapesImport(draft.config, draft.body));
  const [editorError, setEditorError] = useState(migration.error);
  const [saveError, setSaveError] = useState("");
  const savingRef = useRef<Promise<boolean> | null>(null);
  const changeRef = useRef(0);
  const lastSavedChange = useRef(0);
  const [globalStyle, setGlobalStyle] = useState<EmailStyle>(() => normalizeStyle(draft.config?.emailStyle));
  const customAttributes = useUserAttributes(leftMode === "personalization" || autocomplete);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const readyRef = useRef(false);
  const snapshotRef = useRef<EditorSnapshot>({ project: {}, mjml: "", html: draft.body ?? "" });
  const savedProject = migration.imported ? undefined : draft.config?.emailGrapesProject as Record<string, unknown> | undefined;
  const savedMjml = migration.imported ? migration.mjml : typeof draft.config?.emailMjml === "string" ? draft.config.emailMjml : "";
  const serializedProject = savedProject ? JSON.stringify(savedProject) : "";
  const canLoadSavedProject = draft.config?.emailGrapesSchemaVersion === 1 && !hasHtmlStyleVoidTags(savedMjml) && !hasHtmlStyleVoidTags(serializedProject) && !serializedProject.includes("<parsererror");
  const initialMjml = useMemo(() => normalizeMjmlDocument(savedMjml || legacyRowsToMjml(draft.config?.emailRows, draft.config?.emailStyle, draft.config?.emailBlockTheme)), [draft.config?.emailRows, draft.config?.emailStyle, draft.config?.emailBlockTheme, savedMjml]);

  const capture = useCallback((editor = editorRef.current) => {
    if (!editor || !readyRef.current) throw new Error("The email editor is not ready.");
    const mjml = normalizeMjmlDocument(String(editor.runCommand("mjml-code") ?? editor.getHtml()));
    let html = draft.body ?? "";
    const compiled = editor.runCommand("mjml-code-to-html", { mjml });
    html = htmlFromResult(compiled, "");
    if (!html.trim() || !mjml.includes("<mj-body")) throw new Error("The email could not be exported. Your saved design has not been changed.");
    let project = snapshotRef.current.project;
    project = editor.getProjectData() as Record<string, unknown>;
    const theme = normalizeEmailPreferences({ editor: draft.config?.emailBlockTheme }).editor;
    const css = `<style>.email-hide-desktop{display:none!important}@media(max-width:480px){.email-hide-mobile{display:none!important}.email-hide-desktop{display:block!important}}a:not([data-custom-color]){color:${globalStyle.linkColor}}p{margin-top:0;margin-bottom:${theme.paragraph.spacing}px}li{margin-bottom:${theme.list.spacing}px}.braze-icon-mobile{font-size:${theme.icon.fontSize}px;text-align:${theme.icon.align}}@media(max-width:480px){.braze-icon-mobile{font-size:${theme.icon.mobileFontSize}px!important;text-align:${theme.icon.mobileAlign}!important;padding:${theme.icon.mobilePadding.top}px ${theme.icon.mobilePadding.right}px ${theme.icon.mobilePadding.bottom}px ${theme.icon.mobilePadding.left}px!important}}</style>`;
    html = html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : css + html;
    html = html.replace(/<a\b[^>]*>/gi, tag => { const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]; const alias = linkAliasesRef.current.find(row => row.url === href); return alias?.alias ? tag.replace(/>$/, ` data-link-alias="${attr(alias.alias)}" data-link-tracking="${alias.tracking}">`) : tag; });
    snapshotRef.current = { project, mjml, html };
    return snapshotRef.current;
  }, [draft.body, draft.config?.emailBlockTheme, globalStyle.linkColor]);

  const queueCapture = useCallback(() => {
    if (!readyRef.current) return;
    changeRef.current++; setSaveState(previous => previous === "saving" ? previous : "unsaved");
    if (captureTimerRef.current) window.clearTimeout(captureTimerRef.current);
    captureTimerRef.current = window.setTimeout(() => { try { capture(); setRevision(value => value + 1); } catch (error) { setSaveError(error instanceof Error ? error.message : "Unable to export email."); } }, 180);
  }, [capture]);

  useEffect(() => {
    let cancelled = false;
    let editor: Editor | null = null;
    async function initialize() {
      if (!editorHostRef.current || migration.error) return;
      try {
        const [{ default: grapesjs }, { default: grapesJSMJML }] = await Promise.all([import("grapesjs"), import("grapesjs-mjml")]);
        if (cancelled || !editorHostRef.current) return;
        const pluginsOpts: Record<string, unknown> = {};
        pluginsOpts[grapesJSMJML as unknown as string] = { resetBlocks: true, resetDevices: true, useCustomTheme: false, useXmlParser: false, columnsPadding: "0 5px" };
        editor = grapesjs.init({
          container: editorHostRef.current,
          height: "100%",
          width: "auto",
          fromElement: false,
          storageManager: false,
          panels: { defaults: [] },
          blockManager: { custom: true },
          telemetry: false,
          selectorManager: { componentFirst: true },
          plugins: [grapesJSMJML],
          pluginsOpts,
          canvas: { styles: ["https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"] },
        });
        editorRef.current = editor;
        if (canLoadSavedProject && savedProject && Object.keys(savedProject).length) {
          try { editor.loadProjectData(savedProject); } catch { editor.setComponents(initialMjml); }
        } else editor.setComponents(initialMjml);

        const blockManager = editor.Blocks;
        blockManager.getAll().reset();
        const theme = draft.config?.emailBlockTheme ? normalizeEmailPreferences({ editor: draft.config.emailBlockTheme }).editor : undefined;
        const titleAttributes = theme ? themeAttributes(theme.headers[0], globalStyle.fontFamily) : 'font-size="34px" font-weight="700" line-height="1.2" padding="10px"';
        const paragraphAttributes = theme ? themeAttributes(theme.paragraph, globalStyle.fontFamily) : 'font-size="15px" line-height="1.55" padding="10px"';
        const buttonAttributes = theme ? `${themeAttributes(theme.button, globalStyle.fontFamily)} ${mjmlAttributes({ "inner-padding": `${theme.button.innerPadding.top}px ${theme.button.innerPadding.right}px ${theme.button.innerPadding.bottom}px ${theme.button.innerPadding.left}px`, "background-color": theme.button.background, "border-radius": `${theme.button.radius}px`, border: `${theme.button.borderWidth}px solid ${theme.button.borderColor}` })}` : 'background-color="#6136cc" color="#ffffff" border-radius="4px" padding="12px"';
        const blocks: Array<[string, string, string, string]> = [
          ["braze-title", "TITLE", "CONTENT", `<mj-text ${titleAttributes}><h1 style="font:inherit;margin:0;direction:${theme?.headers[0].direction ?? "ltr"}">I'm a new title block</h1></mj-text>`],
          ["braze-text", "TEXT", "CONTENT", `<mj-text ${paragraphAttributes}><p style="margin:0 0 ${theme?.paragraph.spacing ?? 0}px;direction:${theme?.paragraph.direction ?? "ltr"}">Add your message here.</p></mj-text>`],
          ["braze-image", "IMAGE", "CONTENT", '<mj-image src="https://placehold.co/600x260/e9e4f4/4b3a86?text=Image" alt="Image" padding="10px" />'],
          ["braze-button", "BUTTON", "CONTENT", `<mj-button ${buttonAttributes} href="https://">Button</mj-button>`],
          ["braze-divider", "DIVIDER", "CONTENT", '<mj-divider border-color="#dcd9e0" border-width="1px" padding="20px" />'],
          ["braze-spacer", "SPACER", "CONTENT", '<mj-spacer height="60px" />'],
          ["braze-social", "SOCIAL", "CONTENT", '<mj-social align="center"><mj-social-element name="facebook" href="https://"></mj-social-element><mj-social-element name="instagram" href="https://"></mj-social-element></mj-social>'],
          ["braze-menu", "MENU", "CONTENT", '<mj-navbar><mj-navbar-link href="https://">Menu item</mj-navbar-link></mj-navbar>'],
          ["braze-html", "HTML", "CONTENT", '<mj-raw><div style="padding:10px">Custom HTML</div></mj-raw>'],
        ];
        if (theme) {
          theme.headers.slice(1).forEach((header, index) => blocks.push([`braze-h${index + 2}`, `H${index + 2}`, "CONTENT", `<mj-text ${themeAttributes(header, globalStyle.fontFamily)}><h${index+2} style="font:inherit;margin:0;direction:${header.direction}">Heading ${index+2}</h${index+2}></mj-text>`]));
          const list = theme.list; const listTag = list.listType === "ol" ? "ol" : "ul";
          blocks.push(["braze-list", "LIST", "CONTENT", `<mj-text ${themeAttributes(list, globalStyle.fontFamily)}><${listTag} start="${list.start}" style="margin:0;padding-left:${list.indent}px;list-style-type:${list.marker};direction:${list.direction}"><li style="margin-bottom:${list.spacing}px">List item 1</li><li>List item 2</li></${listTag}></mj-text>`]);
          blocks.push(["braze-icon", "ICONS", "CONTENT", `<mj-text ${themeAttributes(theme.icon, globalStyle.fontFamily)}><div class="braze-icon-mobile" style="direction:${theme.icon.direction}"><span style="padding:${theme.icon.padding.top}px ${theme.icon.padding.right}px ${theme.icon.padding.bottom}px ${theme.icon.padding.left}px;margin-right:${theme.icon.itemSpacing}px;font-size:${theme.icon.height}px">●</span>Icon text</div></mj-text>`]);
        }
        if (!blocks.some(([id]) => id === "braze-list")) blocks.push(["braze-list", "LIST", "BASIC BLOCKS", '<mj-text css-class="braze-list" padding="10px"><ul><li>List item 1</li><li>List item 2</li></ul></mj-text>']);
        if (!blocks.some(([id]) => id === "braze-icon")) blocks.push(["braze-icon", "ICONS", "MEDIA", '<mj-text css-class="braze-icon" align="center" padding="10px"><span>★</span> Icon text</mj-text>']);
        blocks.push(["braze-video", "VIDEO", "MEDIA", '<mj-image css-class="braze-video" src="https://placehold.co/600x338/e9e4f4/4b3a86?text=Video" alt="Video thumbnail" href="https://" padding="10px" />']);
        emailRowLayouts.forEach((widths, index) => blocks.push([`braze-row-${index}`, "ROW", "ROWS", grapesRowMarkup(widths, globalStyle.contentBg)]));
        blocks.forEach(([id, label, category, content]) => blockManager.add(id, { label, category, content, activate: true, select: true }));

        const updateSelected = (component?: Component) => {
          let target = component ?? editor?.getSelected();
          while (target && !String(target.get("type")).startsWith("mj-")) target = target.parent();
          if (target?.get("type") === "mj-body" || target?.get("type") === "mj-mjml") target = undefined;
          if (target && target !== editor?.getSelected()) { editor?.select(target); return; }
          setSelected(selectedState(target));
        };
        editor.on("component:selected", updateSelected);
        editor.on("component:deselected", () => setSelected(null));
        editor.on("component:update", queueCapture);
        editor.on("component:add", queueCapture);
        editor.on("component:remove", queueCapture);
        editor.on("styleable:change", queueCapture);
        editor.on("undo", queueCapture);
        editor.on("redo", queueCapture);
        editor.on("load", () => editor?.setDevice("Desktop"));
        editor.onReady(() => {
          if (cancelled || !editor) return;
          readyRef.current = true;
          setReady(true);
          try { capture(editor); } catch (error) { setEditorError(error instanceof Error ? error.message : "Unable to export email."); setReady(false); readyRef.current = false; }
          const doc = editor.Canvas.getDocument();
          if (!doc) return;
          doc.addEventListener("keyup", event => {
            if (event.key === "Escape") { setAutocomplete(false); return; }
            const selection = editor?.Canvas.getWindow().getSelection();
            if (!selection?.rangeCount) return;
            const range = selection.getRangeAt(0).cloneRange();
            const container = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer as Element;
            if (!container) return;
            const before = range.cloneRange(); before.selectNodeContents(container); before.setEnd(range.startContainer, range.startOffset);
            const match = before.toString().match(/\{\{([^}]*)$/);
            setAutocomplete(Boolean(match));
            setAutocompleteQuery(match?.[1]?.trim().replace(/[${}]/g, "").toLowerCase() ?? "");
          });
        });
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : "The email editor could not be loaded.");
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      readyRef.current = false;
      if (captureTimerRef.current) window.clearTimeout(captureTimerRef.current);
      editor?.destroy();
      editorRef.current = null;
    };
  // The editor owns its initial document for the lifetime of this screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((): Promise<boolean> => {
    if (savingRef.current) return savingRef.current;
    if (!readyRef.current || editorError) return Promise.resolve(false);
    const task = (async () => {
      setSaveState("saving"); setSaveError("");
      const savingRevision = changeRef.current;
      try {
        const snapshot = capture();
        const config = { ...draft.config, emailEditorMode: "drag", emailEditorEngine: "grapesjs-mjml", emailGrapesSchemaVersion: 1, emailGrapesProject: snapshot.project, emailMjml: snapshot.mjml, emailStyle: globalStyle, emailLinkAliases: linkAliasesRef.current,
          ...(migration.imported && !draft.config?.emailGrapesMigration ? { emailGrapesMigration: { source: draft.config?.emailEditorEngine ?? "html", originalHtml: draft.body ?? "", mode: "html-block" } } : {}) };
        const ok = await save({ subject, body: snapshot.html, config });
        const clean = savingRevision === changeRef.current;
        if (ok && clean) lastSavedChange.current = savingRevision;
        setSaveState(ok && clean ? "saved" : "unsaved");
        if (!ok) setSaveError("Unable to save email. Please try again.");
        return ok && clean;
      } catch (error) { setSaveState("unsaved"); setSaveError(error instanceof Error ? error.message : "Unable to save email."); return false; }
    })();
    savingRef.current = task;
    void task.finally(() => { if (savingRef.current === task) savingRef.current = null; });
    return task;
  }, [capture, draft.config, draft.body, editorError, globalStyle, migration.imported, save, subject]);

  useEffect(() => {
    if (!ready || revision === 0 || lastSavedChange.current === changeRef.current || saveState === "saving" || saveError) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => { void persist(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [persist, ready, revision, saveState, saveError]);

  useEffect(() => {
    if (saveState === "saved") return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [saveState]);
  const previousStyle = useRef(globalStyle);
  useEffect(() => {
    const previous = previousStyle.current; previousStyle.current = globalStyle;
    if (!ready || previous === globalStyle) return;
    const editor = editorRef.current, body = editor?.getWrapper()?.findType("mj-body")[0];
    body?.addAttributes({ "background-color": globalStyle.canvasBg, width: `${globalStyle.contentWidth}px` });
    body?.onAll(component => {
      const attrs = component.getAttributes(); const patch: Record<string, string> = {};
      if (component.get("type") === "mj-section" && (!attrs["background-color"] || attrs["background-color"] === previous.contentBg)) patch["background-color"] = globalStyle.contentBg;
      if (["mj-text", "mj-button"].includes(String(component.get("type"))) && (!attrs["font-family"] || attrs["font-family"] === previous.fontFamily)) patch["font-family"] = globalStyle.fontFamily;
      if (component.get("type") === "mj-text" && (!attrs.color || attrs.color === previous.textColor)) patch.color = globalStyle.textColor;
      if (Object.keys(patch).length) component.addAttributes(patch);
    });
    queueCapture();
  }, [globalStyle, ready, queueCapture]);

  const updateSelectedAttributes = (patch: Record<string, string | number>) => {
    const component = editorRef.current?.getSelected();
    if (!component) return;
    component.addAttributes(Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, String(value)])));
    setSelected(selectedState(component));
    queueCapture();
  };
  const selectedAttr = (key: string, fallback = "") => selected?.attributes[key] ?? fallback;
  const selectedNumber = (key: string, fallback: number) => Number.parseFloat(selectedAttr(key)) || fallback;
  const setDeviceMode = (next: "Desktop" | "Mobile") => { setDevice(next); editorRef.current?.setDevice(next); };
  const insertText = (value: string, stripTrigger = false) => {
    const editor = editorRef.current;
    if (!editor) return;
    const frameWindow = editor.Canvas.getWindow();
    const selection = frameWindow.getSelection();
    const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : savedRangeRef.current;
    const activeNode = activeRange?.commonAncestorContainer;
    const activeElement = activeNode ? (activeNode.nodeType === 1 ? activeNode as Element : activeNode.parentElement) : null;
    const editable = activeElement?.closest<HTMLElement>("[contenteditable='true']");
    if (activeRange && editable) {
      const range = activeRange;
      if (stripTrigger) {
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const start = node.textContent?.slice(0, range.startOffset).lastIndexOf("{{") ?? -1;
          if (start >= 0) range.setStart(node, start);
        }
      }
      range.deleteContents();
      const lines = value.split("\n");
      const fragment = frameWindow.document.createDocumentFragment();
      let last: Node | null = null;
      lines.forEach((line, index) => { if (index) fragment.append(frameWindow.document.createElement("br")); last = frameWindow.document.createTextNode(line); fragment.append(last); });
      range.insertNode(fragment);
      if (last) { range.setStartAfter(last); range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range); savedRangeRef.current = range.cloneRange(); }
      const component = editor.getSelected();
      if (component?.get("type") === "mj-text") component.components(normalizeXmlVoidTags(editable.innerHTML));
      queueCapture();
    } else {
      const component = editor.getSelected();
      if (component?.get("type") === "mj-text") component.append(escapeHtml(value).replaceAll("\n", "<br />"));
      else editor.addComponents(`<mj-section><mj-column><mj-text padding="10px">${escapeHtml(value).replaceAll("\n", "<br />")}</mj-text></mj-column></mj-section>`);
      queueCapture();
    }
    setAutocomplete(false);
  };
  const openPersonalization = () => {
    const editor = editorRef.current;
    const selection = editor?.Canvas.getWindow().getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      savedRangeRef.current = element?.closest("[contenteditable='true']") ? range.cloneRange() : null;
    }
    setLeftMode("personalization");
  };
  const autocompleteTokens = useMemo(() => {
    const tokens = [
      ...defaultAttributes.map(name => ({ label: name.replaceAll("_", " "), value: `{{\${${name}}}}` })),
      ...customAttributes.attributes.map(name => ({ label: name, value: `{{custom_attribute.\${${name}}}}` })),
    ];
    if (!autocompleteQuery) return tokens.slice(0, 12);
    return tokens.filter(token => `${token.label} ${token.value}`.toLowerCase().includes(autocompleteQuery)).slice(0, 12);
  }, [autocompleteQuery, customAttributes.attributes]);
  const richCommand = (command: string, value?: string) => {
    const doc = editorRef.current?.Canvas.getDocument();
    doc?.execCommand(command, false, value);
    queueCapture();
  };
  const saveAndClose = async () => { if (await persist()) onClose(); };
  const saveAndSending = async () => { if (await persist()) onSendingSettings(); };
  const download = () => { const snapshot = capture(); downloadHtmlFile("email.html", snapshot.html); };
  const pageStyle = { background: globalStyle.canvasBg } as CSSProperties;

  return <section className={cx(styles.page, leftMode === "personalization" && styles.personalizationPage)}>
    <header className={styles.header}>
      <button className={styles.headerButton} disabled={saveState === "saving"} onClick={() => ready ? void saveAndClose() : onClose()}><ChevronLeft size={15}/>{translate(locale, "Back")}</button>
      <div className={styles.headerTitle}><Mail size={17}/><b>{variantName}</b></div>
      <span className={styles.saveState}>{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "All changes saved"}</span>
      <button className={styles.headerButton} disabled={!ready || saveState === "saving"} onClick={() => { void persist().then(ok => { if (ok) onOpenTest(); }); }}><Eye size={15}/>{translate(locale, "Preview and test")}</button>
      <button className={styles.headerButton} disabled={!ready || saveState === "saving"} onClick={() => void saveAndSending()}>{translate(locale, "Sending info")}</button>
    </header>
    {leftMode !== "personalization" && <nav className={styles.iconRail}><button disabled={saveState === "saving"} onClick={() => ready ? void saveAndClose() : onClose()} aria-label="Back"><ChevronLeft size={19}/></button></nav>}
    <aside className={styles.leftRail}>
      {leftMode === "personalization" ? <PersonalizationPanel onClose={() => setLeftMode("content")} onInsert={insertText} customAttributes={customAttributes}/> : <>
        <div className={styles.leftTitle}>MESSAGE</div>
        <button className={leftMode === "content" ? styles.leftActive : undefined} onClick={() => setLeftMode("content")}>Content</button>
        <button onClick={openPersonalization}>Personalization</button>
        <button className={leftMode === "links" ? styles.leftActive : undefined} onClick={() => setLeftMode("links")}>Link Management</button>
        {leftMode === "links" && <div className={styles.leftPanel}><b>Link Management</b><p>Give links aliases to track clicks in user profiles and reports.</p>{[...new Set([...snapshotRef.current.html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match => match[1]))].map(url => { const entry = linkAliases.find(row => row.url === url); const update = (patch: Partial<{ alias: string; tracking: boolean }>) => { setLinkAliases(current => { const rows = current.some(row => row.url === url) ? current.map(row => row.url === url ? { ...row, ...patch } : row) : [...current, { url, alias: "", tracking: true, ...patch }]; linkAliasesRef.current = rows; return rows; }); queueCapture(); }; return <div key={url} className={styles.linkRow}><small>{url}</small><label>Link alias<input aria-label={`Alias for ${url}`} value={entry?.alias ?? ""} onChange={event => update({ alias: event.target.value })}/></label><label><input type="checkbox" checked={entry?.tracking ?? true} onChange={event => update({ tracking: event.target.checked })}/> Track this alias</label></div>; })}</div>}
        <button className={leftMode === "languages" ? styles.leftActive : undefined} onClick={() => setLeftMode("languages")}>Languages</button>
        <small>Subject</small>
        <div className={styles.leftPanel}><input aria-label="Email subject" value={subject} onChange={event => { setSubject(event.target.value); queueCapture(); }} style={{ width: "100%", border: 0, outline: 0, font: "inherit" }}/></div>
        <button className={styles.styleLink} onClick={() => setRightTab("settings")}>Edit default styles</button>
      </>}
    </aside>
    <main className={cx(styles.canvasArea, styles.grapesCanvasArea)} style={pageStyle}>
      <div className={styles.deviceModes}><button aria-label="Desktop preview" className={device === "Desktop" ? styles.deviceActive : undefined} onClick={() => setDeviceMode("Desktop")}><Monitor size={15}/></button><button aria-label="Mobile preview" className={device === "Mobile" ? styles.deviceActive : undefined} onClick={() => setDeviceMode("Mobile")}><Smartphone size={15}/></button></div>
      <div className={styles.textToolbar}>
        <select value={selectedAttr("font-family", globalStyle.fontFamily)} onChange={event => updateSelectedAttributes({ "font-family": event.target.value })}>{[...new Set([globalStyle.fontFamily, ...emailFontFamilies])].map(font => <option key={font}>{font}</option>)}</select>
        <select value={Math.round(selectedNumber("font-size", 15))} onChange={event => updateSelectedAttributes({ "font-size": `${event.target.value}px` })}>{[10, 12, 13, 14, 15, 16, 18, 22, 28, 34, 42].map(size => <option key={size}>{size}</option>)}</select>
        <span className={styles.sep}/><button title="Bold" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("bold")}><Bold size={15}/></button><button title="Italic" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("italic")}><Italic size={15}/></button><button title="Underline" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("underline")}><Underline size={15}/></button><button title="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("strikeThrough")}><Strikethrough size={15}/></button>
        <span className={styles.sep}/><button title="Link" onMouseDown={event => event.preventDefault()} onClick={() => { const url = window.prompt("Link URL", "https://"); if (url) richCommand("createLink", url); }}><Link2 size={15}/></button><button title="Clear formatting" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("removeFormat")}><Code2 size={15}/></button>
        <span className={styles.sep}/><button onClick={() => updateSelectedAttributes({ align: "left" })}><AlignLeft size={15}/></button><button onClick={() => updateSelectedAttributes({ align: "center" })}><AlignCenter size={15}/></button><button onClick={() => updateSelectedAttributes({ align: "right" })}><AlignRight size={15}/></button>
      </div>
      {autocomplete && <div className={styles.liquidAutocomplete}><b>Dynamic variables</b>{autocompleteTokens.map(token => <button key={token.value} onMouseDown={event => event.preventDefault()} onClick={() => insertText(token.value, true)}><span>{token.label}</span><code>{token.value}</code></button>)}{!autocompleteTokens.length && <small>No matching variables</small>}</div>}
      {!ready && !editorError && <div className={styles.grapesLoading}>Loading GrapesJS email editor…</div>}
      {editorError && <div className={styles.grapesError} role="alert">{editorError}</div>}
      <div ref={editorHostRef} className={styles.grapesHost}/>
      <div className={styles.canvasHistory}><span><button aria-label="Undo" disabled={!ready} onClick={() => editorRef.current?.UndoManager.undo()}><Undo2 size={16}/></button><button aria-label="Redo" disabled={!ready} onClick={() => editorRef.current?.UndoManager.redo()}><Redo2 size={16}/></button></span></div>
    </main>
    <GrapesSidebar editor={ready ? editorRef.current : null} selected={selected} tab={rightTab} onTab={setRightTab} globalStyle={globalStyle} setGlobalStyle={setGlobalStyle} onChange={() => { setSelected(selectedState(editorRef.current?.getSelected())); queueCapture(); }}/>
    {saveError && <div className={styles.grapesSaveError} role="alert">{saveError}</div>}
    {migration.imported && ready && <div className={styles.grapesMigration} role="note">Existing email imported as an HTML block. Original design data is preserved.</div>}
    <footer className={styles.footer}><button className={styles.download} disabled={!ready} onClick={download}>Download file</button><button className={styles.done} disabled={!ready || saveState === "saving"} onClick={() => void saveAndClose()}>Done</button></footer>
  </section>;
}
