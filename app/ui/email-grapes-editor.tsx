"use client";

import "grapesjs/dist/css/grapes.min.css";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Component, Editor } from "grapesjs";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, Code2, Copy, Eye, Image as ImageIcon,
  Italic, LayoutGrid, Link2, List as ListIcon, Mail, Minus, Monitor, PanelTop, Plus, Redo2,
  Rows3, Smartphone, Sparkles, Strikethrough, Trash2, Type, Underline, Undo2, X,
} from "lucide-react";
import styles from "./email-dnd.module.css";
import {
  blockText, defaultStyle, downloadHtmlFile, emailFontFamilies, escapeHtml, liquidTokens,
  normalizeRows, normalizeStyle, type EmailBlock, type EmailRow, type EmailStyle, type MenuItem, type SocialItem,
} from "@/lib/email-editor-model";
import { translate, type Locale } from "@/lib/i18n";

type CampaignLike = { id: string; name: string; subject?: string; body?: string; config?: Record<string, unknown> };
type SavePatch = { subject?: string; body?: string; config?: Record<string, unknown> };
type EditorSnapshot = { project: Record<string, unknown>; mjml: string; html: string };
type SelectedState = { cid: string; type: string; label: string; attributes: Record<string, string> } | null;
type CatalogSummary = { id: string; name: string; data?: { fields?: string[] } };
type CatalogItem = { id: string; name: string; fields?: Record<string, unknown> };
type CatalogSelection = { name: string; description?: string };

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

function attr(value: unknown) {
  return escapeHtml(String(value ?? "")).replaceAll('"', "&quot;");
}

function mjmlAttributes(values: Record<string, unknown>) {
  return Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => `${key}="${attr(value)}"`).join(" ");
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

export function legacyRowsToMjml(rowsValue: unknown, styleValue: unknown, fallbackContent = "") {
  const rows = normalizeRows(rowsValue, undefined);
  const style = normalizeStyle(styleValue);
  const body = rows.map(row => `<mj-section ${mjmlAttributes({ "background-color": row.bg || style.contentBg, padding: `${row.padding ?? 10}px` })}>${row.cells.map(cell => `<mj-column width="${cell.width}%">${cell.blocks.map(block => blockToMjml(block, style)).join("")}</mj-column>`).join("")}</mj-section>`).join("");
  const bodyMatch = fallbackContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const fallbackHtml = bodyMatch?.[1] ?? fallbackContent;
  const fallbackBody = fallbackHtml
    ? /<\/?[a-z][\s\S]*>/i.test(fallbackHtml)
      ? `<mj-raw>${fallbackHtml}</mj-raw>`
      : `<mj-text color="${attr(style.textColor)}" font-family="${attr(style.fontFamily)}" font-size="15px" line-height="1.5" padding="10px">${escapeHtml(fallbackHtml).replaceAll("\n", "<br>")}</mj-text>`
    : `<mj-text color="${attr(style.textColor)}" font-family="${attr(style.fontFamily)}" font-size="15px" line-height="1.5" padding="10px">Add your message here.</mj-text>`;
  const fallback = `<mj-section background-color="${attr(style.contentBg)}"><mj-column>${fallbackBody}</mj-column></mj-section>`;
  return `<mjml><mj-head></mj-head><mj-body width="${style.contentWidth}px" background-color="${attr(style.canvasBg)}">${body || fallback}</mj-body></mjml>`;
}

function normalizeMjml(source: string) {
  const normalized = source.replace(
    /<mj-all([^>]*)><mj-text([^>]*)><mj-class([^>]*)><\/mj-class><\/mj-text><\/mj-all>/g,
    "<mj-all$1 /><mj-text$2 /><mj-class$3 />",
  );
  const documentEnd = normalized.lastIndexOf("</mjml>");
  if (documentEnd < 0 || !normalized.slice(documentEnd + 7).trim()) return normalized;
  const document = normalized.slice(0, documentEnd + 7);
  const trailing = normalized.slice(documentEnd + 7).trim();
  const bodyEnd = document.lastIndexOf("</mj-body>");
  return bodyEnd < 0 ? normalized : `${document.slice(0, bodyEnd)}${trailing}${document.slice(bodyEnd)}`;
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

function CatalogPanel({ onClose, onInsert }: { onClose: () => void; onInsert: (value: string) => void }) {
  const data = useCatalogs(true);
  const [method, setMethod] = useState<"items" | "selection">("items");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [selectionName, setSelectionName] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const catalog = data.catalogs.find(item => item.id === data.catalogId);
  const availableFields = useMemo(() => [...new Set(["id", ...(catalog?.data?.fields ?? []), ...data.items.flatMap(item => Object.keys(item.fields ?? {}))])], [catalog?.data?.fields, data.items]);
  const complete = Boolean(catalog && fields.length && (method === "items" ? itemIds.length : selectionName));
  const command = !catalog ? "{% catalog_items %}" : method === "items" ? `{% catalog_items ${catalog.name}${itemIds.length ? ` ${itemIds.join(" ")}` : ""} %}` : `{% catalog_selection_items ${catalog.name}${selectionName ? ` ${selectionName}` : ""} %}`;
  const itemExpressions = method === "items"
    ? itemIds.flatMap((_, index) => fields.map(field => `{{ items[${index}].${field} }}`)).join("\n")
    : fields.length ? `{% for item in items %}\n${fields.map(field => `{{ item.${field} }}`).join("\n")}\n{% endfor %}` : "";
  const snippet = `${command}${itemExpressions ? `\n${itemExpressions}` : ""}`;
  const toggle = (values: string[], value: string, limit?: number) => values.includes(value) ? values.filter(item => item !== value) : limit && values.length >= limit ? values : [...values, value];
  return <section className={styles.personalizationPanel}>
    <header className={styles.personalizationHead}><h2>Add Personalization</h2><button aria-label="Close" onClick={onClose}><X /></button></header>
    <div className={styles.personalizationForm}>
      <label>Personalization type<select value="Catalog Items" disabled><option>Catalog Items</option></select></label>
      <label>Catalog name<select className={!data.catalogId ? styles.placeholderSelect : undefined} value={data.catalogId} onChange={event => { data.setCatalogId(event.target.value); setItemIds([]); setSelectionName(""); setFields([]); }}><option value="">Select a Catalog</option>{data.catalogs.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      {data.loading && <p className={styles.personalizationEmpty}>Loading catalog data…</p>}
      {data.error && <p className={styles.personalizationError}>{data.error}</p>}
      {catalog && <label>Source<select value={method} onChange={event => { setMethod(event.target.value as typeof method); setItemIds([]); setSelectionName(""); }}><option value="items">Specific catalog items</option><option value="selection">Selection</option></select></label>}
      {catalog && method === "items" && <fieldset className={styles.optionFieldset}><legend>Catalog items <span>Up to 3</span></legend><div className={styles.checkList}>{data.items.length ? data.items.map(item => <label key={item.id} className={itemIds.includes(item.id) ? styles.checkedOption : undefined}><input type="checkbox" checked={itemIds.includes(item.id)} onChange={() => setItemIds(toggle(itemIds, item.id, 3))}/><span><b>{item.name || item.id}</b><small>{item.id}</small></span></label>) : <p>This catalog has no items.</p>}</div></fieldset>}
      {catalog && method === "selection" && <label>Selection<select value={selectionName} onChange={event => setSelectionName(event.target.value)}><option value="">Select a Selection</option>{data.selections.map(item => <option key={item.name}>{item.name}</option>)}</select></label>}
      {catalog && <fieldset className={styles.optionFieldset}><legend>Fields <span>Select output fields</span></legend><div className={styles.fieldGrid}>{availableFields.map(field => <label key={field} className={fields.includes(field) ? styles.checkedOption : undefined}><input type="checkbox" checked={fields.includes(field)} onChange={() => setFields(toggle(fields, field))}/><span>{field}</span></label>)}</div></fieldset>}
      <label className={styles.snippetLabel}>Liquid Snippet<div className={styles.snippetField}><code>{snippet}</code><button aria-label="Copy Liquid snippet" onClick={() => { void navigator.clipboard.writeText(snippet); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}><Copy /></button></div></label>
      {copied && <span className={styles.copyFeedback}>Copied</span>}
      {complete && <button className={styles.insertSnippet} onClick={() => onInsert(snippet)}>Insert into message</button>}
    </div>
  </section>;
}

function Stepper({ value, min = 0, max = 200, onChange }: { value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <span className={styles.stepper}><button onClick={() => onChange(Math.max(min, value - 1))}><Minus size={12}/></button><span>{value}</span><button onClick={() => onChange(Math.min(max, value + 1))}><Plus size={12}/></button></span>;
}

export default function GrapesEmailEditor({ locale, draft, variantName, save, onClose, onSendingSettings, onOpenTest }: {
  locale: Locale; draft: CampaignLike; variantName: string; save: (patch: SavePatch) => Promise<boolean>;
  onClose: () => void; onSendingSettings: () => void; onOpenTest: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [leftMode, setLeftMode] = useState<"content" | "personalization" | "languages">("content");
  const [rightTab, setRightTab] = useState<"content" | "rows" | "settings">("content");
  const [device, setDevice] = useState<"Desktop" | "Mobile">("Desktop");
  const [selected, setSelected] = useState<SelectedState>(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [autocomplete, setAutocomplete] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [globalStyle, setGlobalStyle] = useState<EmailStyle>(() => normalizeStyle(draft.config?.emailStyle));
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const blocksRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const readyRef = useRef(false);
  const snapshotRef = useRef<EditorSnapshot>({ project: {}, mjml: "", html: draft.body ?? "" });
  const savedProject = draft.config?.emailGrapesProject as Record<string, unknown> | undefined;
  const canLoadSavedProject = draft.config?.emailGrapesSchemaVersion === 1;
  const initialMjml = useMemo(() => normalizeMjml(typeof draft.config?.emailMjml === "string" ? draft.config.emailMjml : legacyRowsToMjml(draft.config?.emailRows, draft.config?.emailStyle, draft.body)), [draft.body, draft.config?.emailMjml, draft.config?.emailRows, draft.config?.emailStyle]);

  const capture = useCallback((editor = editorRef.current) => {
    if (!editor || !readyRef.current) return snapshotRef.current;
    const mjml = normalizeMjml(String(editor.runCommand("mjml-code") ?? editor.getHtml()));
    let html = draft.body ?? "";
    try { html = htmlFromResult(editor.runCommand("mjml-code-to-html", { mjml }), html); } catch (error) { console.error("MJML compilation failed", error); }
    let project = snapshotRef.current.project;
    try { project = editor.getProjectData() as Record<string, unknown>; } catch (error) { console.error("GrapesJS project serialization failed", error); }
    snapshotRef.current = { project, mjml, html };
    return snapshotRef.current;
  }, [draft.body]);

  const queueCapture = useCallback(() => {
    if (!readyRef.current) return;
    if (captureTimerRef.current) window.clearTimeout(captureTimerRef.current);
    captureTimerRef.current = window.setTimeout(() => { capture(); setRevision(value => value + 1); }, 180);
  }, [capture]);

  useEffect(() => {
    let cancelled = false;
    let editor: Editor | null = null;
    async function initialize() {
      if (!editorHostRef.current || !blocksRef.current) return;
      try {
        const [{ default: grapesjs }, { default: grapesJSMJML }] = await Promise.all([import("grapesjs"), import("grapesjs-mjml")]);
        if (cancelled || !editorHostRef.current || !blocksRef.current) return;
        const pluginsOpts: Record<string, unknown> = {};
        pluginsOpts[grapesJSMJML as unknown as string] = { resetBlocks: true, resetDevices: true, useCustomTheme: false, useXmlParser: true, columnsPadding: "0 5px" };
        editor = grapesjs.init({
          container: editorHostRef.current,
          height: "100%",
          width: "auto",
          fromElement: false,
          storageManager: false,
          panels: { defaults: [] },
          blockManager: { appendTo: blocksRef.current },
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
        const blocks: Array<[string, string, string, string]> = [
          ["braze-title", "TITLE", "CONTENT", '<mj-text font-size="34px" font-weight="700" line-height="1.2" padding="10px">I\'m a new title block</mj-text>'],
          ["braze-text", "TEXT", "CONTENT", '<mj-text font-size="15px" line-height="1.55" padding="10px">Add your message here.</mj-text>'],
          ["braze-image", "IMAGE", "CONTENT", '<mj-image src="https://placehold.co/600x260/e9e4f4/4b3a86?text=Image" alt="Image" padding="10px" />'],
          ["braze-button", "BUTTON", "CONTENT", '<mj-button background-color="#6136cc" color="#ffffff" border-radius="4px" padding="12px" href="https://">Button</mj-button>'],
          ["braze-divider", "DIVIDER", "CONTENT", '<mj-divider border-color="#dcd9e0" border-width="1px" padding="20px" />'],
          ["braze-spacer", "SPACER", "CONTENT", '<mj-spacer height="44px" />'],
          ["braze-social", "SOCIAL", "CONTENT", '<mj-social align="center"><mj-social-element name="facebook" href="https://"></mj-social-element><mj-social-element name="instagram" href="https://"></mj-social-element></mj-social>'],
          ["braze-menu", "MENU", "CONTENT", '<mj-navbar><mj-navbar-link href="https://">Menu item</mj-navbar-link></mj-navbar>'],
          ["braze-html", "HTML", "CONTENT", '<mj-raw><div style="padding:10px">Custom HTML</div></mj-raw>'],
        ];
        blocks.forEach(([id, label, category, content]) => blockManager.add(id, { label, category, content, activate: true, select: true }));

        const updateSelected = (component?: Component) => setSelected(selectedState(component ?? editor?.getSelected()));
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
          capture(editor);
          const doc = editor.Canvas.getDocument();
          if (!doc) return;
          doc.addEventListener("keyup", event => {
            if (event.key !== "{") { if (event.key === "Escape") setAutocomplete(false); return; }
            const selection = editor?.Canvas.getWindow().getSelection();
            if (!selection?.rangeCount) return;
            const range = selection.getRangeAt(0).cloneRange();
            const container = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer as Element;
            if (!container) return;
            const before = range.cloneRange(); before.selectNodeContents(container); before.setEnd(range.startContainer, range.startOffset);
            setAutocomplete(before.toString().endsWith("{{"));
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

  const persist = useCallback(async () => {
    const snapshot = capture();
    setSaveState("saving");
    const ok = await save({
      subject,
      body: snapshot.html,
      config: {
        ...draft.config,
        emailEditorMode: "drag",
        emailEditorEngine: "grapesjs-mjml",
        emailGrapesSchemaVersion: 1,
        emailGrapesProject: snapshot.project,
        emailMjml: snapshot.mjml,
        emailStyle: globalStyle,
      },
    });
    setSaveState(ok ? "saved" : "unsaved");
    return ok;
  }, [capture, draft.config, globalStyle, save, subject]);

  useEffect(() => {
    if (!ready || revision === 0) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => { void persist(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [persist, ready, revision]);

  const settingsFirst = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (settingsFirst.current) { settingsFirst.current = false; return; }
    const editor = editorRef.current;
    const body = editor?.getWrapper()?.findType("mj-body")[0];
    body?.addAttributes({ "background-color": globalStyle.canvasBg, width: `${globalStyle.contentWidth}px` });
    setRevision(value => value + 1);
  }, [globalStyle, ready, subject]);

  const updateSelectedAttributes = (patch: Record<string, string | number>) => {
    const component = editorRef.current?.getSelected();
    if (!component) return;
    component.addAttributes(Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, String(value)])));
    setSelected(selectedState(component));
    queueCapture();
  };
  const selectedAttr = (key: string, fallback = "") => selected?.attributes[key] ?? fallback;
  const selectedNumber = (key: string, fallback: number) => Number.parseFloat(selectedAttr(key)) || fallback;
  const addRow = (columns: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const width = Math.floor(100 / columns);
    const body = editor.getWrapper()?.findType("mj-body")[0];
    body?.append(`<mj-section background-color="#ffffff" padding="10px">${Array.from({ length: columns }, (_, index) => `<mj-column width="${index === columns - 1 ? 100 - width * (columns - 1) : width}%"><mj-text padding="10px">Add your message here.</mj-text></mj-column>`).join("")}</mj-section>`);
    queueCapture();
  };
  const removeSelected = () => { editorRef.current?.getSelected()?.remove(); editorRef.current?.select(); setSelected(null); queueCapture(); };
  const duplicateSelected = () => {
    const component = editorRef.current?.getSelected();
    const parent = component?.parent();
    if (!component || !parent) return;
    const collection = parent.components();
    const index = collection.models.indexOf(component);
    const copy = collection.add(component.toJSON(), { at: index + 1 });
    if (copy) editorRef.current?.select(copy);
    queueCapture();
  };
  const setDeviceMode = (next: "Desktop" | "Mobile") => { setDevice(next); editorRef.current?.setDevice(next); };
  const insertText = (value: string, stripTrigger = false) => {
    const editor = editorRef.current;
    if (!editor) return;
    const frameWindow = editor.Canvas.getWindow();
    const selection = frameWindow.getSelection();
    const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const activeNode = activeRange?.commonAncestorContainer;
    const activeElement = activeNode ? (activeNode.nodeType === 1 ? activeNode as Element : activeNode.parentElement) : null;
    const editable = activeElement?.closest<HTMLElement>("[contenteditable='true']");
    if (selection?.rangeCount && editable) {
      const range = selection.getRangeAt(0);
      if (stripTrigger) {
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE && range.startOffset >= 2 && node.textContent?.slice(range.startOffset - 2, range.startOffset) === "{{") range.setStart(node, range.startOffset - 2);
      }
      range.deleteContents();
      const lines = value.split("\n");
      const fragment = frameWindow.document.createDocumentFragment();
      let last: Node | null = null;
      lines.forEach((line, index) => { if (index) fragment.append(frameWindow.document.createElement("br")); last = frameWindow.document.createTextNode(line); fragment.append(last); });
      range.insertNode(fragment);
      if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
      const inputEvent = frameWindow.document.createEvent("Event");
      inputEvent.initEvent("input", true, false);
      editable.dispatchEvent(inputEvent);
      const component = editor.getSelected();
      if (component?.get("type") === "mj-text") component.components(editable.innerHTML);
      queueCapture();
    } else {
      const component = editor.getSelected();
      if (component?.get("type") === "mj-text") component.append(escapeHtml(value).replaceAll("\n", "<br>"));
      else editor.addComponents(`<mj-section><mj-column><mj-text padding="10px">${escapeHtml(value).replaceAll("\n", "<br>")}</mj-text></mj-column></mj-section>`);
      queueCapture();
    }
    setAutocomplete(false);
  };
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
      <button className={styles.headerButton} onClick={onClose}><ChevronLeft size={15}/>{translate(locale, "Back")}</button>
      <div className={styles.headerTitle}><Mail size={17}/><b>{variantName}</b><small>GrapesJS + MJML</small></div>
      <span className={styles.saveState}>{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "All changes saved"}</span>
      <button className={styles.headerButton} onClick={onOpenTest}><Eye size={15}/>{translate(locale, "Preview and test")}</button>
      <button className={styles.headerButton} onClick={() => void saveAndSending()}>{translate(locale, "Sending info")}</button>
    </header>
    {leftMode !== "personalization" && <nav className={styles.iconRail}><button onClick={onClose} aria-label="Back"><ChevronLeft size={19}/></button></nav>}
    <aside className={styles.leftRail}>
      {leftMode === "personalization" ? <CatalogPanel onClose={() => setLeftMode("content")} onInsert={insertText}/> : <>
        <div className={styles.leftTitle}>MESSAGE</div>
        <button className={leftMode === "content" ? styles.leftActive : undefined} onClick={() => setLeftMode("content")}>Content</button>
        <button onClick={() => setLeftMode("personalization")}>Personalization</button>
        <button className={leftMode === "languages" ? styles.leftActive : undefined} onClick={() => setLeftMode("languages")}>Languages</button>
        <small>Subject</small>
        <div className={styles.leftPanel}><input aria-label="Email subject" value={subject} onChange={event => setSubject(event.target.value)} style={{ width: "100%", border: 0, outline: 0, font: "inherit" }}/></div>
        <button className={styles.styleLink} onClick={() => setRightTab("settings")}>Edit default styles</button>
      </>}
    </aside>
    <main className={cx(styles.canvasArea, styles.grapesCanvasArea)} style={pageStyle}>
      <div className={styles.deviceModes}><button className={device === "Desktop" ? styles.deviceActive : undefined} onClick={() => setDeviceMode("Desktop")}><Monitor size={15}/></button><button className={device === "Mobile" ? styles.deviceActive : undefined} onClick={() => setDeviceMode("Mobile")}><Smartphone size={15}/></button></div>
      <div className={styles.textToolbar}>
        <select value={selectedAttr("font-family", globalStyle.fontFamily)} onChange={event => updateSelectedAttributes({ "font-family": event.target.value })}>{emailFontFamilies.map(font => <option key={font}>{font}</option>)}</select>
        <select value={Math.round(selectedNumber("font-size", 15))} onChange={event => updateSelectedAttributes({ "font-size": `${event.target.value}px` })}>{[10, 12, 14, 15, 16, 18, 22, 28, 34, 42].map(size => <option key={size}>{size}</option>)}</select>
        <span className={styles.sep}/><button title="Bold" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("bold")}><Bold size={15}/></button><button title="Italic" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("italic")}><Italic size={15}/></button><button title="Underline" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("underline")}><Underline size={15}/></button><button title="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("strikeThrough")}><Strikethrough size={15}/></button>
        <span className={styles.sep}/><button title="Link" onMouseDown={event => event.preventDefault()} onClick={() => { const url = window.prompt("Link URL", "https://"); if (url) richCommand("createLink", url); }}><Link2 size={15}/></button><button title="Clear formatting" onMouseDown={event => event.preventDefault()} onClick={() => richCommand("removeFormat")}><Code2 size={15}/></button>
        <span className={styles.sep}/><button onClick={() => updateSelectedAttributes({ align: "left" })}><AlignLeft size={15}/></button><button onClick={() => updateSelectedAttributes({ align: "center" })}><AlignCenter size={15}/></button><button onClick={() => updateSelectedAttributes({ align: "right" })}><AlignRight size={15}/></button>
      </div>
      {autocomplete && <div className={styles.liquidAutocomplete}><b>Dynamic variables</b>{liquidTokens.slice(0, 10).map(token => <button key={token.label} onMouseDown={event => event.preventDefault()} onClick={() => insertText(token.value, true)}><span>{token.label}</span><code>{token.value}</code></button>)}</div>}
      {!ready && !editorError && <div className={styles.grapesLoading}>Loading GrapesJS email editor…</div>}
      {editorError && <div className={styles.grapesError}>{editorError}</div>}
      <div ref={editorHostRef} className={styles.grapesHost}/>
      <div className={styles.canvasHistory}><span><button disabled={!ready} onClick={() => editorRef.current?.UndoManager.undo()}><Undo2 size={16}/></button><button disabled={!ready} onClick={() => editorRef.current?.UndoManager.redo()}><Redo2 size={16}/></button></span></div>
    </main>
    <aside className={styles.rightPanel}>
      <div className={styles.rightTabs}>{(["content", "rows", "settings"] as const).map(name => { const Icon = name === "content" ? LayoutGrid : name === "rows" ? Rows3 : PanelTop; return <button key={name} className={rightTab === name ? styles.rightActive : undefined} onClick={() => { editorRef.current?.select(); setSelected(null); setRightTab(name); }}><Icon size={18}/><span>{name.toUpperCase()}</span></button>; })}</div>
      {selected ? <div className={styles.properties}>
        <div className={styles.propertyHead}><b>{selected.label} PROPERTIES</b><button onClick={removeSelected}><Trash2 size={15}/></button><button onClick={duplicateSelected}><Copy size={15}/></button><button onClick={() => { editorRef.current?.select(); setSelected(null); }}><X size={16}/></button></div>
        {selected.type === "mj-image" && <><label className={styles.propertyColumn}>Image URL<input value={selectedAttr("src")} onChange={event => updateSelectedAttributes({ src: event.target.value })}/></label><label className={styles.propertyColumn}>Alt text<input value={selectedAttr("alt")} onChange={event => updateSelectedAttributes({ alt: event.target.value })}/></label><label className={styles.propertyColumn}>Link URL<input value={selectedAttr("href")} onChange={event => updateSelectedAttributes({ href: event.target.value })}/></label></>}
        {selected.type === "mj-button" && <label className={styles.propertyColumn}>Link URL<input value={selectedAttr("href")} onChange={event => updateSelectedAttributes({ href: event.target.value })}/></label>}
        {(selected.type === "mj-text" || selected.type === "mj-button") && <><div className={styles.propertyRow}><span>Text color</span><span className={styles.colorControl}><input type="color" value={selectedAttr("color", selected.type === "mj-button" ? "#ffffff" : globalStyle.textColor)} onChange={event => updateSelectedAttributes({ color: event.target.value })}/><code>{selectedAttr("color", globalStyle.textColor)}</code></span></div><div className={styles.propertyRow}><span>Line height</span><select value={selectedAttr("line-height", "1.2")} onChange={event => updateSelectedAttributes({ "line-height": event.target.value })}><option>1</option><option>1.2</option><option>1.5</option><option>1.8</option><option>2</option></select></div><div className={styles.propertyRow}><span>Letter spacing</span><Stepper value={selectedNumber("letter-spacing", 0)} min={-4} max={20} onChange={value => updateSelectedAttributes({ "letter-spacing": `${value}px` })}/></div></>}
        {selected.type === "mj-button" && <div className={styles.propertyRow}><span>Background</span><input type="color" value={selectedAttr("background-color", "#6136cc")} onChange={event => updateSelectedAttributes({ "background-color": event.target.value })}/></div>}
        {(selected.type === "mj-section" || selected.type === "mj-column") && <div className={styles.propertyRow}><span>Background</span><input type="color" value={selectedAttr("background-color", "#ffffff")} onChange={event => updateSelectedAttributes({ "background-color": event.target.value })}/></div>}
        <div className={styles.propertySection}>BLOCK OPTIONS</div>
        <label className={styles.propertyColumn}>Padding<input value={selectedAttr("padding", "10px")} onChange={event => updateSelectedAttributes({ padding: event.target.value })}/></label>
        <label className={styles.propertyColumn}>CSS class<input value={selectedAttr("css-class")} onChange={event => updateSelectedAttributes({ "css-class": event.target.value })}/></label>
      </div> : <>
        <div className={cx(styles.catalogPane, styles.grapesBlockPane, rightTab !== "content" && styles.grapesPaneHidden)}><h3>CONTENT</h3><p>Drag content into the email canvas.</p><div ref={blocksRef} className={styles.grapesBlocks}/></div>
        <div className={cx(styles.catalogPane, rightTab !== "rows" && styles.grapesPaneHidden)}><h3>ROWS</h3><p>Add an MJML row, then drag content into its columns.</p><div className={styles.rowCatalog}>{[1, 2, 3, 4].map(columns => <button key={columns} onClick={() => addRow(columns)}>{columns} column{columns > 1 ? "s" : ""}<span>{Array.from({ length: columns }, (_, index) => <i key={index}/>)}</span></button>)}</div></div>
        <div className={cx(styles.catalogPane, rightTab !== "settings" && styles.grapesPaneHidden)}><h3>SETTINGS</h3><label className={styles.settingField}>Canvas background<input type="color" value={globalStyle.canvasBg} onChange={event => setGlobalStyle({ ...globalStyle, canvasBg: event.target.value })}/></label><label className={styles.settingField}>Content background<input type="color" value={globalStyle.contentBg} onChange={event => setGlobalStyle({ ...globalStyle, contentBg: event.target.value })}/></label><label className={styles.settingField}>Default font<select value={globalStyle.fontFamily} onChange={event => setGlobalStyle({ ...globalStyle, fontFamily: event.target.value })}>{emailFontFamilies.map(font => <option key={font}>{font}</option>)}</select></label><label className={styles.settingField}>Content width<input type="number" min="320" max="800" value={globalStyle.contentWidth} onChange={event => setGlobalStyle({ ...globalStyle, contentWidth: Number(event.target.value) || 600 })}/></label></div>
      </>}
    </aside>
    <footer className={styles.footer}><button className={styles.download} onClick={download}>Download file</button><button className={styles.done} onClick={() => void saveAndClose()}>Done</button></footer>
  </section>;
}
