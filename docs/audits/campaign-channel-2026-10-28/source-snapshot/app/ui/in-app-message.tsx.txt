"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Code2, Copy, Eye, GripVertical, Image as ImageIcon,
  LayoutDashboard, Languages, Link2, MousePointerClick, Plus, Redo2, Smartphone,
  Sparkles, Trash2, Type, Undo2, X,
} from "lucide-react";
import styles from "./in-app-message.module.css";
import TagPicker from "./tag-picker";
import TraditionalComposer, { TraditionalPreview } from "./in-app-traditional";
import { createTraditionalVariant, describeInAppAction } from "@/lib/in-app-traditional";
import { defaultPage, defaultGlobal, pageButtons, variantsFor, validateInAppVariant, appendTemplatePages, deleteInAppPage, compileInAppHtml, type BlockKind, type ExtraBlock, type InAppButton, type InAppPage, type InAppGlobalStyle, type InAppDelivery, type InAppVariant } from "@/lib/in-app-model";
import { inAppTemplates, type InAppTemplate } from "@/lib/in-app-templates";
export type { InAppButton, InAppDelivery } from "@/lib/in-app-model";

type InAppCampaign = {
  id: string;
  name: string;
  subject?: string;
  body?: string;
  config?: Record<string, unknown>;
};

type Device = "phonePortrait" | "phoneLandscape" | "tabletPortrait" | "tabletLandscape" | "desktop";
type EditorTab = "compose" | "settings" | "preview";
const devices: Array<{ id: Device; label: string }> = [
  { id: "phonePortrait", label: "Phone portrait" },
  { id: "phoneLandscape", label: "Phone landscape" },
  { id: "tabletPortrait", label: "Tablet portrait" },
  { id: "tabletLandscape", label: "Tablet landscape" },
  { id: "desktop", label: "Desktop" },
];

const blockGroups: Array<{ title: string; blocks: BlockKind[] }> = [
  { title: "Blocks", blocks: ["Title", "Paragraph", "Button", "Image", "Link", "Spacer", "Custom Code"] },
  { title: "Form Blocks", blocks: ["Phone Capture", "Email Capture", "Radio Button", "Short Text", "Dropdown", "Checkbox", "Checkbox Group"] },
];

function SourceIcon({ name, size = 17 }: { name: string; size?: number }) { return <img src={`/braze-iam/${name}.svg`} width={size} height={size} alt=""/>; }
function deviceIcon(device: Device) { return <SourceIcon name={device === "desktop" ? "laptop" : device.startsWith("tablet") ? "tablet-screen-button" : "mobile-screen-button"} size={15}/>; }

function blockIcon(kind: BlockKind) { return <img width={24} height={24} src={`/braze-iam/block-${kind.toLowerCase().replaceAll(" ", "-")}.svg`} alt=""/>; }
function validateLanguageLiquid(value: string) {
  if (!value.trim()) return "Enter a Liquid expression.";
  const openOutputs = (value.match(/{{/g) ?? []).length;
  const closeOutputs = (value.match(/}}/g) ?? []).length;
  if (openOutputs !== closeOutputs) return "Liquid output braces are not balanced.";
  const stack: string[] = [];
  const paired: Record<string, string> = { endif: "if", endcase: "case", endunless: "unless" };
  for (const match of value.matchAll(/{%\s*(if|case|unless|endif|endcase|endunless)\b[^%]*%}/g)) {
    const tag = match[1];
    if (tag in paired) {
      if (stack.pop() !== paired[tag]) return `Unexpected ${tag} tag.`;
    } else stack.push(tag);
  }
  if (stack.length) return `Missing end${stack[stack.length - 1]} tag.`;
  return "";
}

function inAppColor(color: string, opacity = 100) { return /^#[a-f0-9]{6}$/i.test(color) ? `${color}${Math.round(opacity * 2.55).toString(16).padStart(2, "0")}` : color; }

function InAppPreview({ page, global: inherited, device, editor = false, htmlLanguage, onDrop, onSelectBlock, onAction, onDismiss }: { onAction?: (button: InAppButton) => void; onDismiss?: () => void; page: InAppPage; global: InAppGlobalStyle; device: Device; editor?: boolean; htmlLanguage?: string; onDrop?: (kind: BlockKind) => void; onSelectBlock?: (id: string) => void }) {
  const global = { ...inherited, ...page.styleOverrides };
  const frameStyle = { "--iam-accent": inAppColor(global.accentColor ?? global.buttonColor, global.accentOpacity), "--iam-overlay": `${global.overlayColor}${Math.round(global.overlayOpacity * 2.55).toString(16).padStart(2, "0")}` } as CSSProperties;
  const cardStyle: CSSProperties = {
    maxWidth: global.maxWidthUnit === "%" ? `${global.maxWidth}%` : global.maxWidth,
    background: inAppColor(global.backgroundColor, global.backgroundOpacity),
    border: `${global.borderWidth}px ${global.borderStyle ?? "solid"} ${global.borderColor}`,
    borderRadius: global.borderRadius,
    color: inAppColor(global.textColor, global.textOpacity),
    fontFamily: global.fontFamily,
    textAlign: global.contentAlignment,
    backgroundImage: global.backgroundImageEnabled && global.backgroundImageUrl ? `url(${global.backgroundImageUrl})` : undefined,
    backgroundPosition: "center",
    backgroundSize: "cover",
    ...(page.contentStyle?.topPadding ? { paddingTop: page.contentStyle.topPadding } : {}),
  };
  const renderBlock = (block: ExtraBlock) => {
    if (block.kind === "Spacer") return <div key={block.id} style={{ height: 18 }}/>;
    if (block.kind === "Custom Code") return <iframe key={block.id} title="Custom HTML block" sandbox="" className={styles.customBlock} srcDoc={block.text}/>;
    if (block.kind === "Image") return block.src ? <img key={block.id} src={block.src} alt={block.text || "Block image"} style={{ maxWidth: "100%", borderRadius: 6, ...block.style }}/> : <div key={block.id} style={{ minHeight: 60, display: "grid", placeItems: "center", border: "1px dashed #bcb4c5", borderRadius: 6, fontSize: 10, ...block.style }}>Image · add a URL</div>;
    const blockStyle: CSSProperties = { color: block.style?.color, fontSize: block.style?.fontSize, textAlign: block.style?.align };
    if (block.kind === "Short Text" || block.kind === "Email Capture" || block.kind === "Phone Capture") return <label key={block.id} className={styles.extraField} style={blockStyle}><span>{block.text}</span><input required={block.kind === "Email Capture" || block.kind === "Phone Capture"} type={block.kind === "Email Capture" ? "email" : block.kind === "Phone Capture" ? "tel" : "text"} placeholder={block.kind}/></label>;
    if (block.kind === "Dropdown") return <select key={block.id} className={styles.extraField} aria-label={block.text}><option value="">{block.text}</option>{block.text.split("|").slice(1).map(option => <option key={option}>{option.trim()}</option>)}</select>;
    if (block.kind === "Checkbox" || block.kind === "Checkbox Group" || block.kind === "Radio Button") return <label key={block.id} className={styles.extraCheck} style={blockStyle}><input type={block.kind === "Radio Button" ? "radio" : "checkbox"}/><span>{block.text}</span></label>;
    if (block.kind === "Link") return <a key={block.id} style={blockStyle}><u>{block.text}</u></a>;
    if (block.kind === "Button") return <button type="button" key={block.id} className={styles.extraBlock} style={{ background: block.style?.color ?? "#008294", color: "#fff", ...block.style }}>{block.text}</button>;
    return <p key={block.id} style={blockStyle}>{block.text}</p>;
  };
  return <div className={`${styles.deviceFrame} ${styles[device]}`} style={frameStyle} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const kind = event.dataTransfer.getData("iam-block") as BlockKind; if (kind) onDrop?.(kind); event.stopPropagation(); }}>
    {global.closePosition === "Outside modal" && <button className={styles.messageClose} onClick={onDismiss} aria-label={global.closeAccessibleName || "Close Message"} style={{ color: inAppColor(global.closeColor, global.closeOpacity), fontSize: global.closeSize, background: inAppColor(global.closeBackgroundColor, global.closeBackgroundOpacity), border: `${global.closeBorderWidth}px solid ${global.closeBorderColor}`, borderRadius: global.closeRadius }}><SourceIcon name="xmark" size={global.closeSize}/></button>}
    <article lang={htmlLanguage || undefined} className={`${styles.messageCard} ${(styles[global.displayType.replace(" ", "").toLowerCase()] ?? "")}`} style={{ ...cardStyle, ...(global.displayType === "Slideup" && global.slideupPosition === "top" ? { alignSelf: "start", borderRadius: "0 0 10px 10px" } : undefined) }}>
      {global.closePosition !== "Outside modal" && <button className={styles.messageClose} onClick={onDismiss} aria-label={global.closeAccessibleName || "Close Message"} style={{ color: inAppColor(global.closeColor, global.closeOpacity), fontSize: global.closeSize, background: inAppColor(global.closeBackgroundColor, global.closeBackgroundOpacity), border: `${global.closeBorderWidth}px solid ${global.closeBorderColor}`, borderRadius: global.closeRadius }}><SourceIcon name="xmark" size={global.closeSize}/></button>}
      {page.imageUrl && <img src={page.imageUrl} alt="Message media" onClick={() => onSelectBlock?.("__content")}/>}
      <section className={styles.messageCopy} style={{ marginInline: page.contentStyle?.copyInset }} onClick={() => onSelectBlock?.("__content")}><h2 style={{ fontSize: page.contentStyle?.titleSize, lineHeight: page.contentStyle?.titleLineHeight }}>{page.title}</h2><p style={{ fontSize: page.contentStyle?.bodySize }}>{page.body}</p></section>
      <div style={page.columns > 1 ? { display: "grid", gridTemplateColumns: `repeat(${page.columns}, 1fr)`, gap: 10 } : undefined}>
        {page.extraBlocks.map(block => editor ? <span key={block.id} role={block.kind === "Spacer" || block.kind === "Custom Code" ? undefined : "button"} style={{ display: "block", cursor: "pointer" }} onClick={() => onSelectBlock?.(block.id)}>{renderBlock(block)}</span> : renderBlock(block))}
      </div>
      <div className={styles.messageButtons} style={{ marginInline: page.contentStyle?.copyInset }}>{pageButtons(page).map(button => button.style === "primary"
        ? <button key={button.id} onClick={event => { const inputs = event.currentTarget.closest("article")?.querySelectorAll("input"); if (inputs && [...inputs].some(input => !input.reportValidity())) return; if (onSelectBlock) onSelectBlock(`button:${button.id}`); else onAction?.(button); }} className={styles.messageCta} title={button.behavior === "dismiss" ? "On click: dismiss message" : button.behavior === "deep_link" ? `On click: open deep link ${button.href}` : `On click: open ${button.href}`} style={{ background: inAppColor(global.buttonColor, global.buttonOpacity), color: inAppColor(global.buttonTextColor, global.buttonTextOpacity) }}>{button.text}</button>
        : <button key={button.id} onClick={event => { const inputs = event.currentTarget.closest("article")?.querySelectorAll("input"); if (inputs && [...inputs].some(input => !input.reportValidity())) return; if (onSelectBlock) onSelectBlock(`button:${button.id}`); else onAction?.(button); }} className={styles.messageCta} title={button.behavior === "dismiss" ? "On click: dismiss message" : button.behavior === "deep_link" ? `On click: open deep link ${button.href}` : `On click: open ${button.href}`} style={{ fontWeight: 400, background: "transparent", border: `1px solid ${global.buttonColor}`, color: global.buttonColor }}>{button.text}</button>)}</div>
      {editor && <div className={styles.canvasOutline}>Drop blocks into this message</div>}
    </article>
  </div>;
}

export default function InAppCampaignCompose({ draft, update, saveCampaign, notify = () => {} }: { saveCampaign?: (patch: Partial<InAppCampaign>) => Promise<boolean>; draft: InAppCampaign; update: (patch: Partial<InAppCampaign>) => void; notify?: (message: string) => void }) {
  const variants = variantsFor(draft);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [device, setDevice] = useState<Device>("phonePortrait");
  const [copied, setCopied] = useState(false);
  const [showDescription, setShowDescription] = useState(Boolean(draft.config?.description));
  const [previewPage, setPreviewPage] = useState(0);
  const [templateSaved, setTemplateSaved] = useState(false);
  const current = variants[selectedVariant] ?? variants[0];
  const page = current.pages[previewPage] ?? current.pages[0] ?? defaultPage(0, draft);
  const description = typeof draft.config?.description === "string" ? draft.config.description : "";
  const tags = Array.isArray(draft.config?.tags) ? draft.config.tags as string[] : [];
  const currentHtmlLanguage = current.accessibilityLanguage;
  const [templateBusy, setTemplateBusy] = useState(false);
  const saveTemplate = async () => {
    const issues = validateInAppVariant(current);
    if (issues.length) { notify(issues.join(" ")); return; }
    setTemplateBusy(true);
    try {
      if (saveCampaign && !await saveCampaign({ config: { ...draft.config, iamVariants: variants } })) throw new Error("Save the campaign before saving a template.");
      const response = await fetch("/api/resources/in-app-message-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name || "IAM template", description: `${current.global.displayType} · ${current.pages.length} page(s)`, data: { schemaVersion: 1, variant: current, pages: current.pages, global: current.global, sendTo: current.sendTo, tags } }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setTemplateSaved(true); notify("Saved to In-App Message Templates.");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "Could not save the template."); }
    finally { setTemplateBusy(false); }
  };

  const persistVariants = (next: InAppVariant[], activeIndex = selectedVariant) => {
    const active = next[activeIndex] ?? next[0];
    const first = active.pages[0];
    const channelValues = (draft.config?.channelValues ?? {}) as Record<string, unknown>;
    update({
      subject: first?.title ?? draft.subject,
      body: first?.body ?? draft.body,
      config: {
        ...draft.config,
        iamVariants: next,
        channelValues: {
          ...channelValues,
          sendTo: active.sendTo,
          layout: active.global.displayType,
          accessibilityLanguage: active.accessibilityLanguage,
          accessibilityLanguageLiquid: active.accessibilityLanguageLiquid ?? "",
          pageCount: active.pages.length,
          editorMode: active.editorMode === "traditional" ? "Traditional" : active.customCode ? "Custom code" : "Drag-and-drop",
        },
      },
    });
  };
  const replaceCurrent = (nextVariant: InAppVariant) => {
    const next = [...variants];
    next[selectedVariant] = nextVariant;
    persistVariants(next);
  };
  const addTraditionalVariant = () => {
    const nextVariant = createTraditionalVariant(current, `iam_variant_${crypto.randomUUID().slice(0, 8)}`, `Variant ${variants.length + 1}`);
    const next = [...variants, nextVariant]; persistVariants(next, next.length - 1); setSelectedVariant(next.length - 1); setPreviewPage(0);
  };
  const addVariant = () => {
    const nextVariant: InAppVariant = { ...current, id: `iam_variant_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}`, pages: appendTemplatePages([], current.pages, `variant_${crypto.randomUUID()}`) };
    const next = [...variants, nextVariant];
    persistVariants(next, next.length - 1);
    setSelectedVariant(next.length - 1);
  };

  return <div className={styles.campaignPage}>
    <section className={styles.campaignDetails}>
      <h2>Campaign Details</h2>
      <label>Campaign Name<input value={draft.name} onChange={event => update({ name: event.target.value })} placeholder="Enter Campaign Name"/></label>
      {showDescription ? <label>Description<textarea value={description} onChange={event => update({ config: { ...draft.config, description: event.target.value } })} placeholder="Describe this campaign"/></label> : <button className={styles.inlineAction} onClick={() => setShowDescription(true)}><Plus size={16}/> Add description</button>}
      <TagPicker value={tags} onChange={tags => update({ config: { ...draft.config, tags } })}/>
      <div className={styles.idRow}><label>Campaign ID<input value={draft.id} readOnly/></label><button onClick={() => { void navigator.clipboard?.writeText(draft.id); setCopied(true); }}><Copy size={16}/>{copied ? "Copied" : "Copy"}</button></div>
    </section>

    <section className={styles.composerCard} aria-label="In-app message composer">
      <h2>Message Composer</h2>
      <div className={styles.variantSection}><h3>Variants</h3><div>{variants.map((variant, index) => <button key={variant.id} className={index === selectedVariant ? styles.selectedVariant : ""} onClick={() => setSelectedVariant(index)}>{variant.name}</button>)}<button aria-label="Add variant" onClick={addVariant}><Plus size={16}/></button></div></div>
      <label className={styles.sendTo}>Send To<select value={current.sendTo} onChange={event => replaceCurrent({ ...current, sendTo: event.target.value as InAppVariant["sendTo"] })}><option>Both Mobile Apps &amp; Web Browsers</option><option>Mobile Apps</option><option>Web Browsers</option></select></label>
      <label className={styles.sendTo}>Editing Experience<select aria-label="Editing experience" value={current.editorMode === "traditional" ? "traditional" : "drag-and-drop"} onChange={event => { if (event.target.value === "traditional") addTraditionalVariant(); else { const index = variants.findIndex(item => item.editorMode !== "traditional"); if (index >= 0) setSelectedVariant(index); } }}><option value="drag-and-drop">Drag-And-Drop Editor</option><option value="traditional">Traditional Editor</option></select></label>
      {current.editorMode === "traditional" ? <TraditionalComposer value={current} update={replaceCurrent} liquid={insert => <LiquidInsert compact insert={insert}/>} renderSettings={(value, update) => <InAppSettings value={value} update={update}/>} renderTest={value => <InAppTestWorkspace variant={value} campaignId={draft.id} selected={0} select={() => {}} device={device} setDevice={setDevice}/>}/> : <>
      <div className={styles.composeHeading}><h3>Compose In-App Message</h3><button onClick={() => setEditorOpen(true)}><span>✎</span> Edit Message</button></div>
      <div className={styles.previewArea}>
        <aside><h4>Page Preview</h4><div className={styles.deviceTabs}>{devices.map(item => <button title={item.label} aria-label={item.label} className={device === item.id ? styles.activeDevice : ""} key={item.id} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}</div>{current.pages.map((pageItem, index) => <div role="button" tabIndex={0} className={styles.pageTile} key={pageItem.id} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPreviewPage(index); } }} onClick={() => setPreviewPage(index)} style={index === previewPage ? { outline: "2px solid #008294" } : undefined}><span className={styles.pageThumb} aria-hidden inert><InAppPreview page={pageItem} global={current.global} device="phonePortrait" htmlLanguage={currentHtmlLanguage}/></span><b>{pageItem.name}</b><small>{index + 1}</small></div>)}</aside>
        <main>{current.customCode ? <iframe className={styles.customPreview} sandbox="" title="Custom in-app message" srcDoc={current.customHtml}/> : <InAppPreview page={page} global={current.global} device={device} htmlLanguage={currentHtmlLanguage} onAction={button => { if (button.behavior === "page") { const index = current.pages.findIndex(item => item.id === button.href); if (index >= 0) setPreviewPage(index); } }}/>}</main>
      </div>
      </>}
      <p className={styles.previewNote}>Always test your messages on a real device, as actual rendering may vary.</p>
      <div className={styles.composerActions}><button disabled={current.customCode || current.editorMode === "traditional"} onClick={() => setConversionOpen(true)}>{current.customCode ? "Custom code enabled" : "Switch/convert to custom code"}</button><a href="https://www.braze.com/docs/user_guide/message_building_by_channel/in-app_messages/drag_and_drop/" target="_blank">Docs</a><button disabled={templateBusy} onClick={() => void saveTemplate()}>{templateSaved ? "Template saved ✓" : "Save as template"}</button></div>
    </section>
    {conversionOpen && <div className={styles.dialogBackdrop} role="presentation"><section className={styles.conversionDialog} role="dialog" aria-modal="true" aria-labelledby="iam-conversion-title"><button className={styles.dialogClose} aria-label="Close conversion dialog" onClick={() => setConversionOpen(false)}><X size={18}/></button><Code2 size={25}/><h2 id="iam-conversion-title">Switch to custom code?</h2><p>Your message will be converted to HTML. Continue editing and previewing it in the custom code editor.</p><div><button onClick={() => setConversionOpen(false)}>Cancel</button><button onClick={() => { const issues = validateInAppVariant(current); if (issues.length) { notify(issues.join(" ")); return; } replaceCurrent({ ...current, customCode: true, customHtml: current.customHtml || compileInAppHtml(current) }); setConversionOpen(false); setEditorOpen(true); }}>Switch to custom code</button></div></section></div>}
    {editorOpen && typeof document !== "undefined" && createPortal(current.customCode ? <InAppCodeEditor initial={current} notify={notify} close={() => setEditorOpen(false)} done={next => { replaceCurrent(next); setEditorOpen(false); }}/> : <InAppEditor initial={current} notify={notify} close={() => setEditorOpen(false)} done={next => { replaceCurrent(next); setEditorOpen(false); }} campaignId={draft.id}/>, document.body)}
  </div>;
}

function InAppCodeEditor({ initial, notify = () => {}, close, done }: { initial: InAppVariant; notify?: (message: string) => void; close: () => void; done: (variant: InAppVariant) => void }) {
  const [html, setHtml] = useState(initial.customHtml || compileInAppHtml(initial));
  const [preview, setPreview] = useState(false);
  return <section className={styles.codeEditor} aria-label="In-app custom code editor">
    <header><div><Code2 size={18}/><span><b>Custom code editor</b><small>{initial.name}</small></span></div><nav><button className={!preview ? styles.activeCodeTab : ""} onClick={() => setPreview(false)}>Compose</button><button className={preview ? styles.activeCodeTab : ""} onClick={() => setPreview(true)}>Preview</button></nav></header>
    <main>{preview ? <div className={styles.codePreview}><iframe title="Custom code preview" sandbox="" srcDoc={html}/></div> : <div className={styles.codeWorkspace}><aside><h3>HTML</h3><p>Build a fully custom in-app message with HTML and CSS.</p><button onClick={() => setHtml(compileInAppHtml(initial))}>Reset starter code</button></aside><textarea aria-label="In-app message HTML" spellCheck={false} value={html} onChange={event => setHtml(event.target.value)}/></div>}</main>
    <footer className={styles.editorFooter}><button onClick={() => notify("Feedback is unavailable in the local workspace.")}><SourceIcon name="comment-dots" size={16}/> Send feedback</button><span/><button className={styles.cancel} onClick={close}>Cancel</button><button className={styles.done} onClick={() => done({ ...initial, customCode: true, customHtml: html })}>Done</button><button aria-label="BrazeAI Operator" onClick={() => notify("BrazeAI Operator™ is not available for custom code in this demo.")}><Sparkles size={18}/></button></footer>
  </section>;
}

function InAppEditor({ initial, campaignId, notify = () => {}, close, done }: { initial: InAppVariant; campaignId: string; notify?: (message: string) => void; close: () => void; done: (variant: InAppVariant) => void }) {
  const [tab, setTab] = useState<EditorTab>("compose");
  const [value, setValue] = useState<InAppVariant>(() => structuredClone(initial));
  const [selectedPage, setSelectedPage] = useState(0);
  const [device, setDevice] = useState<Device>("desktop");
  const [scope, setScope] = useState<"all" | "page">("all");
  const [history, setHistory] = useState<InAppVariant[]>([]);
  const [future, setFuture] = useState<InAppVariant[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [outlines, setOutlines] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"blocks" | "canvas" | "styles">("canvas");
  const [error, setError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const { pages, global } = value;
  const page = pages[selectedPage] ?? pages[0];
  const commit = (next: InAppVariant) => { setHistory(current => [...current, value].slice(-50)); setValue(next); setFuture([]); setError(""); };
  const updatePage = (patch: Partial<InAppPage>) => commit({ ...value, pages: pages.map(item => item.id === page.id ? { ...item, ...patch } : item) });
  const addBlock = (kind: BlockKind) => {
    const block: ExtraBlock = { id: `block_${crypto.randomUUID()}`, kind, text: kind === "Spacer" || kind === "Image" ? "" : kind === "Custom Code" ? "<p>Custom HTML</p>" : kind === "Title" ? "New title" : kind === "Paragraph" ? "Add your message here." : kind === "Button" ? "Call to action" : kind === "Link" ? "Learn more" : kind };
    if (kind === "Button") { updatePage({ buttons: [...pageButtons(page), { id: block.id, text: block.text, behavior: "dismiss", href: "", style: "primary" }] }); setSelectedBlockId(null); }
    else { updatePage({ extraBlocks: [...page.extraBlocks, block] }); setSelectedBlockId(block.id); }
    setScope("page"); setMobilePanel("styles");
  };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture(current => [value, ...current]); setValue(previous); setHistory(history.slice(0, -1)); setSelectedPage(Math.min(selectedPage, previous.pages.length - 1)); };
  const redo = () => { const next = future[0]; if (!next) return; setHistory(current => [...current, value]); setValue(next); setFuture(future.slice(1)); setSelectedPage(Math.min(selectedPage, next.pages.length - 1)); };
  const removePage = (index: number) => { if (pages.length === 1) return; commit({ ...value, pages: deleteInAppPage(pages, pages[index].id) }); setSelectedPage(Math.max(0, Math.min(selectedPage, pages.length - 2))); };
  const movePage = (from: number, to: number) => {
    if (from === to || to < 0 || to >= pages.length) return;
    const next = [...pages]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    commit({ ...value, pages: next }); setSelectedPage(next.findIndex(item => item.id === page.id));
  };
  const addTemplate = (template: InAppTemplate) => {
    if (!template.pages) return;
    try { const next = appendTemplatePages(pages, template.pages, `page_${crypto.randomUUID()}`); commit({ ...value, pages: next }); setSelectedPage(pages.length); setTemplateOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add template."); }
  };
  const save = async () => {
    const issues = validateInAppVariant(value); if (issues.length) { setError(issues.join(" ")); return; }
    setSaveBusy(true);
    try { const response = await fetch("/api/iam/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant: value, mode: "custom", validateOnly: true }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); done(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save message."); }
    finally { setSaveBusy(false); }
  };
  const cancel = () => JSON.stringify(value) === JSON.stringify(initial) ? close() : setDiscardOpen(true);
  const htmlLanguage = value.accessibilityLanguage;
  const currentStyle = { ...global, ...page.styleOverrides };
  const pageConnected = selectedPage === 0 || pages.some(item => pageButtons(item).some(button => button.behavior === "page" && button.href === page.id));
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const editor = document.querySelector<HTMLElement>(`.${styles.editor}`)!;
    const siblings = [...document.body.children].filter(child => !child.contains(editor)) as HTMLElement[];
    const previousInert = siblings.map(child => child.inert);
    siblings.forEach(child => { child.inert = true; });
    document.body.style.overflow = "hidden";
    editor.querySelector<HTMLElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelRef.current(); }
      if (event.key === "Tab") {
        const controls = [...editor.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length && !element.closest("[inert]"));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; siblings.forEach((child, index) => { child.inert = previousInert[index]; }); document.removeEventListener("keydown", keydown); previousFocus?.focus(); };
  }, []);
  return <section className={styles.editor} role="dialog" aria-modal="true" aria-label="In-app message editor">
    <header className={styles.editorTabs} role="tablist">{(["compose", "settings", "preview"] as const).map(next => <button role="tab" aria-selected={tab === next} className={tab === next ? styles.activeTab : ""} key={next} onClick={() => setTab(next)}>{next === "compose" ? "Compose" : next === "settings" ? "Settings" : "Preview & Test"}</button>)}</header>
    {tab === "settings" ? <InAppSettings value={value} update={patch => commit({ ...value, ...patch })}/> : tab === "preview" ? <InAppTestWorkspace variant={value} campaignId={campaignId} selected={selectedPage} select={setSelectedPage} device={device} setDevice={setDevice}/> : <div className={styles.composeWorkspace} data-panel={mobilePanel}>
      <nav className={styles.mobilePanels}>{(["blocks", "canvas", "styles"] as const).map(panel => <button key={panel} aria-pressed={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>{panel}</button>)}</nav>
      <aside className={styles.blockSidebar}><PagesPanel pages={pages} selected={selectedPage} select={index => { setSelectedPage(index); setSelectedBlockId(null); }} add={() => setTemplateOpen(true)} remove={removePage} move={movePage}/><section><h3>Rows</h3><p>Drag a row into your message</p><div className={styles.rowChoices}>{[1, 2, 3].map(columns => <button key={columns} aria-label={`${columns} column row`} draggable onDragStart={event => event.dataTransfer.setData("iam-columns", String(columns))} onClick={() => updatePage({ columns })}><img src={`/braze-iam/row-${columns}.svg`} alt=""/></button>)}</div></section>{blockGroups.map(group => <section key={group.title}><h3>{group.title}</h3><p>Drag and drop a block into a row</p><div className={styles.blockGrid}>{group.blocks.map(kind => <button draggable onDragStart={event => event.dataTransfer.setData("iam-block", kind)} onClick={() => addBlock(kind)} key={kind}>{blockIcon(kind)}<span>{kind}</span></button>)}</div></section>)}<button className={styles.manageLanguages} onClick={() => setTab("settings")}><Languages size={16}/> Manage languages</button></aside>
      <main className={styles.canvasStage} onDragOver={event => event.preventDefault()} onDrop={event => { const columns = Number(event.dataTransfer.getData("iam-columns")); if ([1, 2, 3].includes(columns)) updatePage({ columns }); }}><div className={styles.canvasTools}><button disabled={!history.length} onClick={undo} title="Undo"><SourceIcon name="arrow-rotate-left"/></button><button disabled={!future.length} onClick={redo} title="Redo"><SourceIcon name="arrow-rotate-right"/></button>{devices.filter(item => ["phonePortrait", "tabletPortrait", "desktop"].includes(item.id)).map(item => <button key={item.id} title={item.label} aria-label={item.label} className={device === item.id ? styles.activeDevice : ""} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}<button title={outlines ? "Hide Outlines" : "Show Outlines"} aria-pressed={outlines} onClick={() => setOutlines(!outlines)}><SourceIcon name="eye-slash"/></button><button title="Add Personalization" onClick={() => setPersonalizationOpen(!personalizationOpen)}><Sparkles size={17}/></button></div>{personalizationOpen && <div className={styles.personalization}><b>Add Personalization</b>{["{{${first_name}}}", "{{${email}}}", "{{${language}}}"].map(token => <button key={token} onClick={() => { updatePage({ body: `${page.body} ${token}` }); setPersonalizationOpen(false); }}>{token}</button>)}</div>}{!pageConnected && <p className={styles.pageWarning}>This page is not connected to any other pages. Add on-click behavior to link this page to the flow so your users don&apos;t miss any content.</p>}<InAppPreview page={page} global={currentStyle} device={device} editor={outlines} htmlLanguage={htmlLanguage} onDrop={addBlock} onSelectBlock={id => { setSelectedBlockId(id); setScope("page"); setMobilePanel("styles"); }}/></main>
      <aside className={styles.inspector}><div className={styles.scopeTabs}><button className={scope === "all" ? styles.activeScope : ""} onClick={() => setScope("all")}>All pages</button><button className={scope === "page" ? styles.activeScope : ""} onClick={() => { setScope("page"); setSelectedBlockId(null); }}>Current page</button></div>{scope === "all" ? <GlobalInspector global={global} update={patch => commit({ ...value, global: { ...global, ...patch } })}/> : <>{!selectedBlockId && <><div className={styles.inspectorBody}><p>This page only. Any changes here override the all-page styles for this specific page.</p><h3>{page.name}</h3><button className={styles.inlineAction} disabled={!Object.keys(page.styleOverrides ?? {}).length} onClick={() => updatePage({ styleOverrides: {} })}>Reset page styles</button></div><GlobalInspector pageOnly global={currentStyle} update={patch => updatePage({ styleOverrides: { ...page.styleOverrides, ...patch } })}/></>}{selectedBlockId && <PageInspector pages={pages} page={page} update={updatePage} selectedBlock={page.extraBlocks.find(block => block.id === selectedBlockId)} updateBlock={(id, patch) => updatePage({ extraBlocks: page.extraBlocks.map(block => block.id === id ? { ...block, ...patch } : block) })} onCloseBlock={() => setSelectedBlockId(null)}/>}{page.extraBlocks.some(block => block.id === selectedBlockId) && <div className={styles.inspectorBody}><button className={styles.inlineAction} onClick={() => { updatePage({ extraBlocks: page.extraBlocks.filter(block => block.id !== selectedBlockId) }); setSelectedBlockId(null); }}>Remove block</button><button className={styles.inlineAction} onClick={() => { const block = page.extraBlocks.find(item => item.id === selectedBlockId); if (block) updatePage({ extraBlocks: [...page.extraBlocks, { ...structuredClone(block), id: crypto.randomUUID() }] }); }}>Duplicate block</button></div>}</>}</aside>
    </div>}
    {error && <div role="alert" className={styles.editorError}>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={14}/></button></div>}
    <footer className={styles.editorFooter}><button onClick={() => notify("Feedback is unavailable in the local workspace.")}><SourceIcon name="comment-dots" size={16}/> Send feedback</button><span/><button className={styles.cancel} onClick={cancel}>Cancel</button><button className={styles.done} disabled={saveBusy} onClick={() => void save()}>{saveBusy ? "Saving…" : "Done"}</button><button aria-label="BrazeAI Operator" onClick={() => notify("BrazeAI Operator requires a connected Braze account.")}><Sparkles size={18}/></button></footer>
    {templateOpen && <InAppTemplatePicker close={() => setTemplateOpen(false)} select={addTemplate}/>}
    {discardOpen && <div className={styles.dialogBackdrop}><section role="alertdialog" aria-modal="true" className={styles.conversionDialog}><h2>Discard changes?</h2><p>You will lose all changes made to this message.</p><div><button onClick={() => setDiscardOpen(false)}>Continue editing</button><button onClick={close}>Discard changes</button></div></section></div>}
  </section>;
}

function InAppSettings({ value, update }: { value: InAppVariant; update: (patch: Partial<InAppVariant>) => void }) {
  const [section, setSection] = useState("Key-value pairs");
  const pairs = value.keyValuePairs ?? [];
  return <div className={styles.settingsShell}><aside><h2>Settings</h2>{["Key-value pairs", "Accessibility"].map(name => <button key={name} aria-pressed={section === name} onClick={() => setSection(name)}>{name}</button>)}</aside>{section === "Accessibility" ? <AccessibilitySettings language={value.accessibilityLanguage} setLanguage={accessibilityLanguage => update({ accessibilityLanguage })} liquidEnabled={value.accessibilityLanguageLiquid !== undefined} setLiquidEnabled={enabled => update({ accessibilityLanguageLiquid: enabled ? "" : undefined })} liquid={value.accessibilityLanguageLiquid ?? ""} setLiquid={accessibilityLanguageLiquid => update({ accessibilityLanguageLiquid })}/> : <main className={styles.kvpSettings} data-empty={!pairs.length}>{!pairs.length && <><h2>Add custom metadata with key-value pairs</h2><p>Use key-value pairs (KVPs) to add custom metadata, such as tracking parameters, custom tags, or behavior triggers, to this message.</p></>}{pairs.map((pair, index) => <section key={pair.id} className={styles.kvpRow}><ArrowRight className={styles.kvpConnector} size={18}/>{(["key", "value"] as const).map(field => <label key={field}>{field === "key" ? "Key" : "Value"}<input aria-label={`${field === "key" ? "Key" : "Value"} ${index + 1}`} value={pair[field]} placeholder="Type in a value" onChange={event => update({ keyValuePairs: pairs.map(item => item.id === pair.id ? { ...item, [field]: event.target.value } : item) })}/><LiquidInsert compact insert={token => update({ keyValuePairs: pairs.map(item => item.id === pair.id ? { ...item, [field]: item[field] + token } : item) })}/></label>)}<button aria-label={`Remove pair ${index + 1}`} onClick={() => update({ keyValuePairs: pairs.filter(item => item.id !== pair.id) })}><Trash2 size={17}/></button></section>)}<button className={styles.inlineAction} onClick={() => update({ keyValuePairs: [...pairs, { id: crypto.randomUUID(), key: "", value: "" }] })}><Plus size={16}/> Add new pair</button></main>}</div>;
}

function AccessibilitySettings({ language, setLanguage, liquidEnabled, setLiquidEnabled, liquid, setLiquid, delivery, updateDelivery }: { language: string; setLanguage: (value: string) => void; liquidEnabled: boolean; setLiquidEnabled: (value: boolean) => void; liquid: string; setLiquid: (value: string) => void; delivery?: InAppDelivery; updateDelivery?: (patch: Partial<InAppDelivery>) => void }) {
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [personalizationType, setPersonalizationType] = useState("Default Attributes");
  const [attribute, setAttribute] = useState("language");
  const [defaultValue, setDefaultValue] = useState("en");
  const [copied, setCopied] = useState(false);
  const attributeOptions = personalizationType === "Custom Attributes" ? [{ value: "preferred_locale", label: "preferred_locale" }, { value: "app_language", label: "app_language" }] : personalizationType === "Device Properties" ? [{ value: "language", label: "Device language" }, { value: "country", label: "Device country" }] : [{ value: "language", label: "Language" }, { value: "country", label: "Country" }, { value: "first_name", label: "First name" }, { value: "last_name", label: "Last name" }, { value: "email", label: "Email" }];
  const variable = personalizationType === "Custom Attributes" ? `custom_attribute.\${${attribute}}` : `\${${attribute}}`;
  const safeDefault = defaultValue.replaceAll("'", "\\'");
  const snippet = `{{${variable}${defaultValue ? ` | default: '${safeDefault}'` : ""}}}`;
  const issue = liquidEnabled ? validateLanguageLiquid(liquid) : "";
  const resolved = "Resolved using the selected user in Preview & Test";
  const changeType = (next: string) => { setPersonalizationType(next); setAttribute(next === "Custom Attributes" ? "preferred_locale" : "language"); setCopied(false); };
  return <div className={styles.settingsPage}>
    <aside>Edit your in-app message settings</aside>
    <main className={styles.accessibilitySettings}>
      <h2>Accessibility</h2>
      <p>Set the <a href="https://www.braze.com/docs/user_guide/message_building_by_channel/in-app_messages/" target="_blank">accessibility language</a> for your message&apos;s HTML. Screen readers and assistive tools use this to pronounce content with the correct language and dialect. Select a language or use Liquid to set it dynamically.</p>
      <label>Language <span className={styles.infoDot} title="Sets the HTML lang attribute">i</span><select aria-label="Accessibility language" disabled={liquidEnabled} value={language} onChange={event => setLanguage(event.target.value)}><option value="">Select...</option><option value="en">English</option><option value="zh-CN">Chinese (Simplified)</option><option value="ja">Japanese</option><option value="ko">Korean</option></select></label>
      {!liquidEnabled ? <button className={styles.liquidLanguage} onClick={() => setLiquidEnabled(true)}><Plus size={16}/> Add language with Liquid</button> : <section className={styles.liquidSection}>
        <label>Language attribute from Liquid <span className={styles.infoDot} title="The rendered value becomes the HTML lang attribute">i</span><span className={styles.liquidInput}><textarea aria-label="Liquid language expression" value={liquid} onChange={event => setLiquid(event.target.value)} placeholder="Type in a value"/><button aria-label="Add Liquid personalization" onClick={() => setPersonalizationOpen(value => !value)}><Plus size={16}/></button></span></label>
        {issue ? <p className={styles.liquidError}>{issue}</p> : <p className={styles.liquidValid}>Liquid syntax check · <b>{resolved || "(empty)"}</b></p>}
        <button className={styles.removeLiquid} onClick={() => { setLiquidEnabled(false); setPersonalizationOpen(false); }}><Trash2 size={16}/> Remove Liquid</button>
        {personalizationOpen && <aside className={styles.liquidPersonalization} role="dialog" aria-label="Add Personalization">
          <button className={styles.personalizationClose} aria-label="Close personalization" onClick={() => setPersonalizationOpen(false)}><X size={17}/></button>
          <h3>Add Personalization</h3>
          <label>Personalization type<select aria-label="Personalization type" value={personalizationType} onChange={event => changeType(event.target.value)}><option>Default Attributes</option><option>Custom Attributes</option><option>Device Properties</option></select></label>
          <label>Attribute<select aria-label="Liquid attribute" value={attribute} onChange={event => { setAttribute(event.target.value); setCopied(false); }}>{attributeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Default value <span>(Optional)</span><input aria-label="Liquid default value" value={defaultValue} onChange={event => { setDefaultValue(event.target.value); setCopied(false); }} placeholder="Enter default value"/></label>
          <label>Liquid Snippet<span className={styles.snippetField}><code>{snippet}</code><button aria-label="Copy Liquid snippet" onClick={() => { void navigator.clipboard?.writeText(snippet); setCopied(true); }}><Copy size={18}/></button></span></label>
          {copied && <small>Copied to clipboard</small>}
          <button className={styles.insertLiquid} onClick={() => { setLiquid(snippet); setPersonalizationOpen(false); }}>Insert Liquid Snippet</button>
        </aside>}
      </section>}
    </main>
  </div>;
}

function PagesPanel({ pages, selected, select, add, remove, move }: { pages: InAppPage[]; selected: number; select: (index: number) => void; add: () => void; remove: (index: number) => void; move: (from: number, to: number) => void }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const resetDrag = () => { setDragging(null); setDragOver(null); };
  return <section className={styles.pagesPanel}><h3>Pages ({pages.length})</h3><p>Create and manage multi-page messages</p><div>{pages.map((page, index) => <div data-testid="iam-page-row" className={`${styles.pageRow} ${selected === index ? styles.pageSelected : ""} ${dragging === index ? styles.pageDragging : ""} ${dragOver === index && dragging !== index ? styles.pageDropTarget : ""}`} key={page.id} onDragOver={event => { if (!Array.from(event.dataTransfer.types).includes("iam-page-index")) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOver(index); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(current => current === index ? null : current); }} onDrop={event => { const rawIndex = event.dataTransfer.getData("iam-page-index"); if (!rawIndex) return; event.preventDefault(); const from = Number(rawIndex); if (Number.isInteger(from)) move(from, index); resetDrag(); }}>
    <span className={styles.dragHandle} draggable role="button" tabIndex={0} aria-label={`Drag ${page.name}`} aria-grabbed={dragging === index} title="Drag to reorder" onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("iam-page-index", String(index)); setDragging(index); }} onDragEnd={resetDrag}><SourceIcon name="grip-vertical" size={12}/></span>
    <div role="button" tabIndex={0} className={styles.pageMain} aria-label={`Select ${page.name} page`} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(index); } }} onClick={() => select(index)}><span className={styles.pageMini} aria-hidden inert><InAppPreview page={page} global={defaultGlobal} device="phonePortrait"/></span><b>{page.name}</b><small>{index + 1}</small></div>
    <button className={styles.movePageButton} aria-label={`Move ${page.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ChevronLeft size={13}/></button><button className={styles.movePageButton} aria-label={`Move ${page.name} down`} disabled={index === pages.length - 1} onClick={() => move(index, index + 1)}><ChevronRight size={13}/></button><button className={styles.deletePage} aria-label={`Delete ${page.name}`} disabled={pages.length === 1} onClick={() => remove(index)}><Trash2 size={13}/></button>
  </div>)}</div><button className={styles.addPage} onClick={add}><Plus size={16}/> Add Page</button></section>;
}

function PreviewSidebar({ pages, selected, select }: { pages: InAppPage[]; selected: number; select: (index: number) => void }) {
  return <aside className={styles.previewSidebar}><h3>Pages ({pages.length})</h3><div className={styles.previewPageList}>{pages.map((page, index) => <div role="button" tabIndex={0} aria-label={`Preview ${page.name}`} className={selected === index ? styles.pageSelected : ""} key={page.id} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(index); } }} onClick={() => select(index)}><span className={styles.previewMini} aria-hidden inert><InAppPreview page={page} global={defaultGlobal} device="phonePortrait"/></span><b>{page.name}</b><small>{index + 1}</small></div>)}</div></aside>;
}

function StyleSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <details className={styles.styleSection} open><summary>{title}<ChevronDown size={16}/></summary><small>{subtitle}</small>{children}</details>;
}
function GlobalInspector({ global, update, pageOnly = false }: { global: InAppGlobalStyle; update: (patch: Partial<InAppGlobalStyle>) => void; pageOnly?: boolean }) {
  const [customFont, setCustomFont] = useState(false);
  const [fontName, setFontName] = useState("");
  const color = (label: string, field: keyof InAppGlobalStyle, opacityField?: keyof InAppGlobalStyle) => <ColorField label={label} value={String(global[field] ?? "#000000")} change={value => update({ [field]: value })} opacity={opacityField ? Number(global[opacityField] ?? 100) : undefined} changeOpacity={opacityField ? value => update({ [opacityField]: value }) : undefined}/>;
  const number = (label: string, field: keyof InAppGlobalStyle, max = 2000) => <label>{label}<input type="number" min={0} max={max} value={Number(global[field] ?? 0)} onChange={event => update({ [field]: Math.max(0, Math.min(max, Number(event.target.value))) })}/></label>;
  return <div className={styles.inspectorBody}>{!pageOnly && <p>These styles apply to every page in your message. You can override them for individual pages.</p>}<StyleSection title="Message container" subtitle={pageOnly ? "Customize this page" : "Applies to every page in this message"}>
    {!pageOnly && <><label>Display type<select value={global.displayType} onChange={event => update({ displayType: event.target.value as InAppGlobalStyle["displayType"] })}><option>Modal</option><option>Full screen</option></select></label><label>Max width<div className={styles.numberUnit}><input type="number" min={1} max={global.maxWidthUnit === "%" ? 100 : 2000} value={global.maxWidth} onChange={event => update({ maxWidth: Math.max(1, Math.min(global.maxWidthUnit === "%" ? 100 : 2000, Number(event.target.value))) })}/><select aria-label="Max width unit" value={global.maxWidthUnit ?? "px"} onChange={event => update({ maxWidthUnit: event.target.value as "px" | "%", maxWidth: event.target.value === "%" ? Math.min(100, global.maxWidth) : global.maxWidth })}><option>px</option><option>%</option></select></div></label></>}
    {color("Background color", "backgroundColor", "backgroundOpacity")}<label className={styles.toggleField}><span>Background image</span><input type="checkbox" checked={global.backgroundImageEnabled} onChange={event => update({ backgroundImageEnabled: event.target.checked })}/></label>{global.backgroundImageEnabled && <label>Background image URL<input value={global.backgroundImageUrl} onChange={event => update({ backgroundImageUrl: event.target.value })} placeholder="https://"/></label>}
    <label>Border style<div className={styles.numberUnit}><input aria-label="Container border width" type="number" min={0} max={100} value={global.borderWidth} onChange={event => update({ borderWidth: Math.max(0, Math.min(100, Number(event.target.value))) })}/><select aria-label="Container border style" value={global.borderStyle ?? "solid"} onChange={event => update({ borderStyle: event.target.value as InAppGlobalStyle["borderStyle"] })}>{["solid", "dashed", "dotted", "none"].map(style => <option key={style}>{style}</option>)}</select></div></label>{global.borderWidth > 0 && color("Border color", "borderColor")}{number("Border radius", "borderRadius", 200)}
  </StyleSection><StyleSection title="Content" subtitle="Style the body of the message"><label>Default font family<select value={global.fontFamily} onChange={event => update({ fontFamily: event.target.value })}><option value="">Select...</option>{["Arial", "Helvetica", "Georgia", "Times New Roman", ...(global.customFonts ?? [])].map(font => <option key={font}>{font}</option>)}</select></label><button className={styles.addFont} onClick={() => setCustomFont(!customFont)}>+ Add Custom Font</button>{customFont && <div className={styles.fontEntry}><input aria-label="Custom font family" placeholder="Font family name" value={fontName} onChange={event => setFontName(event.target.value)}/><button disabled={!fontName.trim()} onClick={() => { const font = fontName.trim(); update({ customFonts: [...new Set([...(global.customFonts ?? []), font])], fontFamily: font }); setFontName(""); setCustomFont(false); }}>Add</button><small>The font must be available on the target device.</small></div>}<label>Content alignment<span className={styles.alignmentButtons}>{(["left", "center", "right"] as const).map(align => <button key={align} aria-label={align[0].toUpperCase() + align.slice(1)} aria-pressed={global.contentAlignment === align} onClick={() => update({ contentAlignment: align })}><img alt="" src={`/braze-iam/align-${align}.svg`}/></button>)}</span></label>{color("Text color", "textColor", "textOpacity")}{color("Button color", "buttonColor", "buttonOpacity")}{color("Button text color", "buttonTextColor", "buttonTextOpacity")}{color("Accent color", "accentColor", "accentOpacity")}</StyleSection><StyleSection title="Close button" subtitle="Customize the close X icon button"><label>Accessible name<input value={global.closeAccessibleName} onChange={event => update({ closeAccessibleName: event.target.value })}/></label><LiquidInsert insert={token => update({ closeAccessibleName: global.closeAccessibleName + token })}/>{!pageOnly && <label>Button position<select value={global.closePosition} onChange={event => update({ closePosition: event.target.value as InAppGlobalStyle["closePosition"] })}><option>Inside modal</option><option>Outside modal</option></select></label>}{number("Button size", "closeSize", 100)}{color("Fill color", "closeColor", "closeOpacity")}{color("Background color", "closeBackgroundColor", "closeBackgroundOpacity")}{number("Border width", "closeBorderWidth", 100)}{color("Border color", "closeBorderColor")}{number("Border radius", "closeRadius", 200)}</StyleSection>{!pageOnly && <StyleSection title="Overlay" subtitle="Style the overlay behind the message">{color("Background color", "overlayColor", "overlayOpacity")}</StyleSection>}</div>;
}

function LiquidInsert({ insert, compact = false }: { insert: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [attribute, setAttribute] = useState("first_name");
  const [fallback, setFallback] = useState("");
  const [type, setType] = useState("Default Attributes");
  const token = type === "Custom Attributes" ? `{{custom_attribute.\u0024{${attribute}}${fallback ? ` | default: '${fallback.replaceAll("'", "\\'")}'` : ""}}}` : `{{\u0024{${attribute}}${fallback ? ` | default: '${fallback.replaceAll("'", "\\'")}'` : ""}}}`;
  return <div className={styles.liquidInsert}><button type="button" aria-label="Add Liquid" className={compact ? styles.liquidCompact : styles.inlineAction} onClick={() => setOpen(!open)}>{compact ? <SourceIcon name="circle-plus" size={15}/> : "Add Liquid"}</button>{open && <section role="dialog" aria-label="Add Personalization" className={styles.liquidPersonalization}><button className={styles.personalizationClose} aria-label="Close personalization" onClick={() => setOpen(false)}><X size={16}/></button><h3>Add Personalization</h3><label>Personalization type<select value={type} onChange={event => setType(event.target.value)}><option>Default Attributes</option><option>Custom Attributes</option><option>Device Properties</option></select></label><label>Attribute{type === "Custom Attributes" ? <input value={attribute} onChange={event => setAttribute(event.target.value)}/> : <select value={attribute} onChange={event => setAttribute(event.target.value)}>{["first_name", "last_name", "email", "language", "country", "user_id", "phone"].map(name => <option key={name}>{name}</option>)}</select>}</label><label>Default value (Optional)<input value={fallback} onChange={event => setFallback(event.target.value)}/></label><code>{token}</code><button className={styles.insertLiquid} disabled={!attribute.trim()} onClick={() => { insert(token); setOpen(false); }}>Insert Liquid Snippet</button></section>}</div>;
}

function PageInspector({ page, pages, update, selectedBlock, updateBlock, onCloseBlock }: { pages: InAppPage[]; page: InAppPage; update: (patch: Partial<InAppPage>) => void; selectedBlock?: ExtraBlock | null; updateBlock?: (blockId: string, patch: Partial<ExtraBlock>) => void; onCloseBlock?: () => void }) {
  const buttons = pageButtons(page);
  const setButtons = (next: InAppButton[]) => update({ buttons: next, buttonText: next[0]?.text ?? page.buttonText });
  if (selectedBlock) return <BlockInspector block={selectedBlock} update={patch => updateBlock?.(selectedBlock.id, patch)} onClose={onCloseBlock}/>;
  return <div className={styles.inspectorBody}><p>These settings apply to the selected page.</p><h3>Page content</h3><label>Page name<input value={page.name} onChange={event => update({ name: event.target.value })}/></label><label>Title<input value={page.title} onChange={event => update({ title: event.target.value })}/></label><label>Message<textarea value={page.body} onChange={event => update({ body: event.target.value })}/></label><label>Image URL<input value={page.imageUrl} onChange={event => update({ imageUrl: event.target.value })} placeholder="https://"/></label><label>Columns<select value={page.columns} onChange={event => update({ columns: Number(event.target.value) })}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option></select></label>
    <h3>Buttons</h3><small>Connect pages or choose an on-click destination.</small>
    {buttons.map((button, index) => <div key={button.id} style={{ display: "grid", gap: 6, padding: 10, border: "1px solid #e3dfe6", borderRadius: 6, margin: "8px 0" }}>
      <label>Button {index + 1} text<input value={button.text} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, text: event.target.value } : item))}/></label>
      <label>On click<select value={button.behavior} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, behavior: event.target.value as InAppButton["behavior"] } : item))}><option value="page">Go to page</option><option value="dismiss">Dismiss message</option><option value="deep_link">Open deep link</option><option value="web_url">Open web URL</option></select></label>
      {button.behavior === "page" && <label>Page<select value={button.href} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, href: event.target.value } : item))}><option value="">Select page</option>{pages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{["web_url", "deep_link"].includes(button.behavior) && <label>{button.behavior === "deep_link" ? "Deep link" : "Web URL"}<input value={button.href} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, href: event.target.value } : item))} placeholder={button.behavior === "deep_link" ? "myapp://products" : "https://"}/></label>}
      <label>Style<select value={button.style} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, style: event.target.value as InAppButton["style"] } : item))}><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
      {buttons.length > 0 && <button style={{ border: 0, background: "transparent", color: "#a4474f", fontWeight: 750, textAlign: "left", cursor: "pointer" }} onClick={() => setButtons(buttons.filter(item => item.id !== button.id))}>Remove button</button>}
    </div>)}
    {buttons.length < 20 && <button style={{ border: 0, background: "transparent", color: "#6b2bd2", fontWeight: 750, textAlign: "left", cursor: "pointer" }} onClick={() => setButtons([...buttons, { id: `iam_btn_${Date.now()}`, text: "Secondary action", behavior: "dismiss", href: "", style: "secondary" }])}>+ Add secondary button</button>}
  </div>;
}

function ColorField({ label, value, change, opacity, changeOpacity }: { label: string; value: string; change: (value: string) => void; opacity?: number; changeOpacity?: (value: number) => void }) {
  return <label>{label}<span className={styles.colorField}><input aria-label={`${label} swatch`} type="color" value={/^#[a-f0-9]{6}$/i.test(value) ? value : "#000000"} onChange={event => change(event.target.value)}/><span><input aria-label={`${label} hex`} value={value.toUpperCase()} onChange={event => change(event.target.value)}/>{changeOpacity && <span className={styles.opacityField}>Opacity <input aria-label={`${label} opacity`} type="number" min={0} max={100} value={opacity ?? 100} onChange={event => changeOpacity(Math.min(100, Math.max(0, Number(event.target.value))))}/>%</span>}</span></span></label>;
}

function BlockInspector({ block, update, onClose }: { block: ExtraBlock; update: (patch: Partial<ExtraBlock>) => void; onClose?: () => void }) {
  const style = block.style ?? {};
  const isForm = ["Phone Capture", "Email Capture", "Short Text", "Dropdown", "Radio Button", "Checkbox", "Checkbox Group"].includes(block.kind);
  const isImage = block.kind === "Image";
  return <div className={styles.inspectorBody}>
    <p>Editing <b>{block.kind}</b> block.</p>
    <button style={{ border: 0, background: "transparent", color: "#6b2bd2", fontWeight: 750, cursor: "pointer", padding: 0, marginBottom: 10 }} onClick={() => onClose?.()}>← Back to page</button>
    <h3>Content</h3>
    {isImage
      ? <label>Image URL<input value={block.src ?? ""} onChange={event => update({ src: event.target.value })} placeholder="https:// or pick from Media Library"/></label>
      : <label>{block.kind === "Dropdown" ? "Placeholder | options" : "Text"}<textarea value={block.text} onChange={event => update({ text: event.target.value })}/></label>}
    {isForm && <label>Writes to user attribute<input value={block.mapTo ?? ""} onChange={event => update({ mapTo: event.target.value })} placeholder={block.kind === "Email Capture" ? "email" : block.kind === "Phone Capture" ? "phone" : "attribute_name"}/></label>}
    <h3>Style</h3>
    {isImage
      ? <label>Width %<input type="number" min={20} max={100} value={Number(block.style?.fontSize ?? 100)} onChange={event => update({ style: { ...style, fontSize: Math.min(100, Math.max(20, Number(event.target.value) || 100)) } })}/></label>
      : <><label>Text color<span className={styles.colorField}><input type="color" value={style.color ?? "#1c1b20"} onChange={event => update({ style: { ...style, color: event.target.value } })}/><input value={style.color ?? "#1c1b20"} onChange={event => update({ style: { ...style, color: event.target.value } })}/></span></label>
      <label>Font size (px)<input type="number" min={9} max={40} value={style.fontSize ?? (block.kind === "Title" ? 18 : 12)} onChange={event => update({ style: { ...style, fontSize: Math.max(9, Math.min(40, Number(event.target.value) || 12)) } })}/></label></>}
    <label>Align<select value={style.align ?? "left"} onChange={event => update({ style: { ...style, align: event.target.value as "left" | "center" | "right" } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
  </div>;
}

function InAppTemplatePicker({ close, select }: { close: () => void; select: (template: InAppTemplate) => void }) {
  const [tab, setTab] = useState("Braze Templates");
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [tag, setTag] = useState("");
  const [filters, setFilters] = useState(false);
  const [multiOnly, setMultiOnly] = useState(false);
  const [saved, setSaved] = useState<InAppTemplate[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; void fetch("/api/resources/in-app-message-templates").then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (alive) setSaved((result.data ?? []).map((row: { id: string; name: string; description: string; updatedAt: string; data: { variant?: InAppVariant; pages?: InAppPage[]; global?: InAppGlobalStyle; tags?: string[] } }) => ({ id: row.id, name: row.name, description: row.description, updatedAt: row.updatedAt, variant: row.data.variant, pages: row.data.variant?.pages ?? row.data.pages, global: row.data.variant?.global ?? row.data.global, tags: row.data.tags ?? [] }))); }).catch(cause => { if (alive) setError(String(cause.message)); }); return () => { alive = false; }; }, []);
  const source = tab === "Braze Templates" ? inAppTemplates : saved;
  const tags = [...new Set(source.flatMap(template => template.tags ?? []))];
  const templates = source.filter(template => `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase()) && (!tag || template.tags?.includes(tag)) && (!multiOnly || (template.pages?.length ?? 0) > 1));
  return <div className={styles.dialogBackdrop}><section className={styles.templateDialog} role="dialog" aria-modal="true" aria-label="Select a template"><header><h2>Select a template</h2><button className={styles.inlineAction} onClick={() => select(inAppTemplates.find(item => item.name === "Blank")!)}>Build from scratch</button><button aria-label="Close template picker" onClick={close}><X size={20}/></button></header><div className={styles.templateFilters}><label>Tags<select aria-label="Template tags" value={tag} onChange={event => setTag(event.target.value)}><option value="">All Tags</option>{tags.map(name => <option key={name}>{name}</option>)}</select></label><button aria-expanded={filters} onClick={() => setFilters(!filters)}>Filters</button><input aria-label="Search templates" placeholder="Search templates" value={query} onChange={event => setQuery(event.target.value)}/></div>{filters && <label className={styles.templateFilterOption}><input type="checkbox" checked={multiOnly} onChange={event => setMultiOnly(event.target.checked)}/> Multi-page templates</label>}<nav className={styles.templateTabs}>{["Braze Templates", "Your Templates"].map(name => <button key={name} aria-pressed={tab === name} onClick={() => { setTab(name); setTag(""); }}>{name}</button>)}<span/><button aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)}><Type size={16}/></button><button aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)}><LayoutDashboard size={16}/></button></nav><div className={styles.templateList} data-grid={grid}>{!grid && <div className={styles.templateListHeading}><span>Preview</span><span>Name</span><span>Description</span><span>Last edited</span></div>}{templates.map(template => <div role="button" tabIndex={template.pages ? 0 : -1} key={template.id} className={styles.templateItem} aria-disabled={!template.pages} onKeyDown={event => { if (template.pages && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(template); } }} title={!template.pages ? "This template is currently unavailable." : undefined} onClick={() => { if (template.pages) select(template); }}><span className={styles.templateThumb} aria-hidden inert>{template.pages?.[0] && <InAppPreview page={template.pages[0]} global={template.global ?? defaultGlobal} device="phonePortrait"/>}</span><b>{template.name}</b><span>{template.description}{!template.pages && <small>Unavailable</small>}</span><time>{template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("en-US") : "Aug 24, 2026"}</time></div>)}{!templates.length && <p className={styles.emptyTemplates}>{error || "No templates found."}</p>}</div><footer><button onClick={close}>Cancel</button></footer></section></div>;
}

const previewProfileFields = [["user_id", "User ID"], ["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"], ["country", "Country"], ["city", "City"], ["language", "Language"], ["phone", "Phone number"], ["gender", "Gender"], ["time_zone", "Time Zone"], ["latitude", "Most recent location latitude"], ["longitude", "Most recent location longitude"], ["device_locale", "Most Recent Device Locale"], ["app_version", "Most recent app version"]];
function InAppTestWorkspace({ variant, campaignId, selected, select, device, setDevice }: { variant: InAppVariant; campaignId: string; selected: number; select: (index: number) => void; device: Device; setDevice: (device: Device) => void }) {
  const [mode, setMode] = useState("random");
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [resolvedProfile, setResolvedProfile] = useState<Record<string, unknown>>({});
  const [rendered, setRendered] = useState<InAppVariant>(variant);
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Array<{ id: string; email: string }>>([]);
  const [recipient, setRecipient] = useState("");
  const [groups, setGroups] = useState<Array<{ id: string; name: string; data: { recipients?: string[]; userIds?: string[]; emails?: string[] } }>>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testId, setTestId] = useState("");
  const [closed, setClosed] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [readyKey, setReadyKey] = useState("");
  const [destination, setDestination] = useState("");
  const [nonce, setNonce] = useState(0);
  const previewKey = JSON.stringify({ variant, mode, profile, userId, nonce });
  useEffect(() => { let alive = true; void fetch("/api/resources/internal-groups").then(response => response.json()).then(result => { if (alive) setGroups(result.data ?? []); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => { const abort = new AbortController(); const timer = setTimeout(() => { void fetch(`/api/users?limit=20&q=${encodeURIComponent(query)}`, { signal: abort.signal }).then(response => response.json()).then(result => setUsers(result.data ?? [])).catch(() => {}); }, 250); return () => { clearTimeout(timer); abort.abort(); }; }, [query]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => { setPreviewBusy(true); void fetch("/api/iam/preview", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant, mode, userId, profile }) }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!abort.signal.aborted) { setRendered(result.variant); setResolvedProfile(result.profile); setReadyKey(previewKey); setError(""); } }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); }).finally(() => { if (!abort.signal.aborted) setPreviewBusy(false); }); }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [variant, mode, userId, profile, nonce]);
  const recipients = [...new Set([...recipient.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean), ...groups.filter(group => groupIds.includes(group.id)).flatMap(group => group.data.recipients ?? group.data.userIds ?? group.data.emails ?? [])])];
  const send = async () => {
    setBusy(true); setError(""); setTestId("");
    try { const response = await fetch("/api/iam/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, variant, recipients, override, profile: resolvedProfile }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setTestId(result.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to prepare test."); }
    finally { setBusy(false); }
  };
  const page = rendered.pages[selected] ?? rendered.pages[0];
  const navigate = (button: InAppButton) => { if (button.behavior === "page") { const index = rendered.pages.findIndex(item => item.id === button.href); if (index >= 0) select(index); } else if (button.behavior === "dismiss") setClosed(true); else setDestination(describeInAppAction(button)); };
  return <div className={styles.previewWorkspace}><aside className={styles.previewSidebar}><PreviewSidebar pages={variant.pages} selected={selected} select={index => { select(index); setClosed(false); }}/><section className={styles.testPanel}><h3>Test Recipients</h3><p>Select at least one Content Test Group or individual user to receive this test message. Messages will be customized with recipients&apos; attributes by default.</p><label>Add content test group<select aria-label="Add content test group" value="" onChange={event => { if (event.target.value) setGroupIds([...new Set([...groupIds, event.target.value])]); }}><option value="">Select Content Test Groups</option>{groups.filter(group => !groupIds.includes(group.id)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{groupIds.map(id => <button key={id} onClick={() => setGroupIds(groupIds.filter(item => item !== id))}>{groups.find(group => group.id === id)?.name} <X size={12}/></button>)}<label>Add individual users<input aria-label="Test recipients" value={recipient} onChange={event => { setRecipient(event.target.value); setTestId(""); }} placeholder="External ids, emails, or phone numbers"/></label><label className={styles.check}><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)}/>Override recipients&apos; attributes with current preview user&apos;s attributes</label><button disabled={!recipients.length || busy || previewBusy || readyKey !== previewKey} onClick={() => void send()}>{busy ? "Preparing…" : "Send Test"}</button>{testId && <p role="status" className={styles.testSuccess}>Test prepared locally for {recipients.length} recipient(s). No SDK delivery. Record: {testId}</p>}<label>Preview message as user<select aria-label="Preview message as user" value={mode} onChange={event => setMode(event.target.value)}><option value="random">Random user</option><option value="existing">Select existing user</option><option value="custom">Custom user</option><option value="language">Multi-language user</option></select></label>{mode === "random" && <button onClick={() => setNonce(nonce + 1)}>Get random user</button>}{mode === "existing" && <><input aria-label="Search existing users" placeholder="Search users" value={query} onChange={event => setQuery(event.target.value)}/><select aria-label="Existing preview user" value={userId} onChange={event => setUserId(event.target.value)}><option value="">Select user</option>{users.map(user => <option key={user.id} value={user.id}>{user.email} ({user.id})</option>)}</select></>}{["custom", "language"].includes(mode) && <details open><summary>Profile</summary>{previewProfileFields.filter(([key]) => mode !== "language" || ["user_id", "language", "country"].includes(key)).map(([key, label]) => <label key={key}>{label}<input value={String(profile[key] ?? "")} onChange={event => setProfile({ ...profile, [key]: event.target.value })}/></label>)}<h4>Targeted Device Properties</h4><label>Platform<select value={String(profile.platform ?? "web")} onChange={event => setProfile({ ...profile, platform: event.target.value })}><option value="web">Web</option><option value="ios">iOS</option><option value="android">Android</option></select></label></details>}{error && <p role="alert" className={styles.liquidError}>{error}</p>}</section></aside><main aria-busy={previewBusy}>{closed ? <button className={styles.restartPreview} onClick={() => { setClosed(false); select(0); }}>Restart preview</button> : rendered.customCode ? <iframe title="Custom in-app preview" sandbox="" className={styles.customPreview} srcDoc={rendered.customHtml}/> : rendered.editorMode === "traditional" ? <TraditionalPreview variant={rendered} device={device} interactive onAction={navigate} onDismiss={() => setClosed(true)}/> : <InAppPreview page={page} global={rendered.global} device={device} htmlLanguage={rendered.accessibilityLanguage} onAction={navigate} onDismiss={() => setClosed(true)}/>}<div className={styles.previewDevices}>{devices.filter(item => ["phonePortrait", "tabletPortrait", "desktop"].includes(item.id)).map(item => <button key={item.id} title={item.label} aria-label={item.label} className={device === item.id ? styles.activeDevice : ""} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}</div>{destination && <div className={styles.destinationNotice}>Destination: <a href={/^https?:\/\//i.test(destination) ? destination : undefined} target="_blank" rel="noreferrer">{destination}</a><button onClick={() => setDestination("")}>Close</button></div>}</main></div>;
}
