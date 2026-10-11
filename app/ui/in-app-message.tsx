"use client";

import { useEffect, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, ChevronLeft, ChevronRight, Code2, Copy, Eye, GripVertical, Image as ImageIcon,
  LayoutDashboard, Languages, Link2, MousePointerClick, Plus, Redo2, Smartphone,
  Sparkles, Trash2, Type, Undo2, X,
} from "lucide-react";
import styles from "./in-app-message.module.css";

type InAppCampaign = {
  id: string;
  name: string;
  subject?: string;
  body?: string;
  config?: Record<string, unknown>;
};

type Device = "phonePortrait" | "phoneLandscape" | "tabletPortrait" | "tabletLandscape" | "desktop";
type EditorTab = "compose" | "settings" | "preview";
type BlockKind = "Title" | "Paragraph" | "Button" | "Image" | "Link" | "Spacer" | "Custom Code" | "Phone Capture" | "Email Capture" | "Radio Button" | "Short Text" | "Dropdown" | "Checkbox" | "Checkbox Group";

type ExtraBlock = { id: string; kind: BlockKind; text: string; src?: string; mapTo?: string; style?: { color?: string; fontSize?: number; align?: "left" | "center" | "right" } };
export type InAppButton = { id: string; text: string; behavior: "dismiss" | "deep_link" | "web_url"; href: string; style: "primary" | "secondary" };
type InAppPage = {
  id: string;
  name: string;
  title: string;
  body: string;
  buttonText: string;
  imageUrl: string;
  columns: number;
  extraBlocks: ExtraBlock[];
  buttons?: InAppButton[];
};
type InAppGlobalStyle = {
  displayType: "Modal" | "Slideup" | "Full screen";
  maxWidth: number;
  backgroundColor: string;
  backgroundImageEnabled: boolean;
  backgroundImageUrl: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  fontFamily: string;
  contentAlignment: "left" | "center" | "right";
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  closeAccessibleName: string;
  closePosition: "Inside modal" | "Outside modal";
  closeSize: number;
  closeColor: string;
  closeBackgroundColor: string;
  closeBorderColor: string;
  closeBorderWidth: number;
  closeRadius: number;
  overlayColor: string;
  overlayOpacity: number;
  slideupPosition: "top" | "bottom";
};
export type InAppDelivery = {
  triggerType: "Session start" | "Custom event" | "Specific time";
  triggerEventName: string;
  triggerEventProperty: string;
  triggerTime: string;
  durationStart: string;
  durationEnd: string;
  frequencyCapEnabled: boolean;
  frequencyCapLimit: number;
  frequencyCapDays: number;
};

const defaultDelivery: InAppDelivery = {
  triggerType: "Session start", triggerEventName: "", triggerEventProperty: "", triggerTime: "",
  durationStart: "", durationEnd: "", frequencyCapEnabled: false, frequencyCapLimit: 1, frequencyCapDays: 7,
};

type InAppVariant = {
  id: string;
  name: string;
  sendTo: "Both Mobile Apps & Web Browsers" | "Mobile Apps" | "Web Browsers";
  pages: InAppPage[];
  accessibilityLanguage: string;
  accessibilityLanguageLiquid?: string;
  global: InAppGlobalStyle;
  customCode?: boolean;
  customHtml?: string;
};

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

function defaultPage(index = 0, campaign?: InAppCampaign): InAppPage {
  return {
    id: `iam_page_${index + 1}`,
    name: index ? `Page ${index + 1}` : "Basic Modal",
    title: index ? `PAGE ${index + 1}` : campaign?.subject || "WELCOME",
    body: index ? "Add your message here." : campaign?.body || "Thanks for signing up! Use this offer code for 10% off your next order. WELCOME10",
    buttonText: "Shop Now",
    imageUrl: "",
    columns: 1,
    extraBlocks: [],
  };
}

const defaultGlobal: InAppGlobalStyle = {
  displayType: "Modal",
  maxWidth: 450,
  backgroundColor: "#ffffff",
  backgroundImageEnabled: false,
  backgroundImageUrl: "",
  borderWidth: 5,
  borderColor: "#ffffff",
  borderRadius: 8,
  fontFamily: "Arial",
  contentAlignment: "center",
  textColor: "#000000",
  buttonColor: "#008294",
  buttonTextColor: "#ffffff",
  closeAccessibleName: "Close Message",
  closePosition: "Inside modal",
  closeSize: 15,
  closeColor: "#c4c4c4",
  closeBackgroundColor: "#ffffff",
  closeBorderColor: "#ffffff",
  closeBorderWidth: 0,
  closeRadius: 0,
  overlayColor: "#333333",
  slideupPosition: "bottom",
  overlayOpacity: 75,
};

// A page has up to two buttons; older pages without the array migrate from buttonText.
function pageButtons(page: InAppPage): InAppButton[] {
  if (page.buttons?.length) return page.buttons;
  return [{ id: "iam_btn_primary", text: page.buttonText || "Shop Now", behavior: "dismiss", href: "", style: "primary" }];
}

function variantsFor(campaign: InAppCampaign): InAppVariant[] {
  const stored = campaign.config?.iamVariants;
  if (Array.isArray(stored) && stored.length) return (stored as InAppVariant[]).map(variant => ({ ...variant, global: { ...defaultGlobal, ...variant.global } }));
  const channelValues = (campaign.config?.channelValues ?? {}) as Record<string, unknown>;
  return [{
    id: "iam_variant_1",
    name: "Variant 1",
    sendTo: (channelValues.sendTo as InAppVariant["sendTo"]) ?? "Both Mobile Apps & Web Browsers",
    pages: [defaultPage(0, campaign)],
    accessibilityLanguage: String(channelValues.accessibilityLanguage ?? ""),
    accessibilityLanguageLiquid: String(channelValues.accessibilityLanguageLiquid ?? ""),
    global: { ...defaultGlobal, displayType: (channelValues.layout as InAppGlobalStyle["displayType"]) ?? "Modal" },
  }];
}

function deviceIcon(device: Device) {
  return device === "desktop" ? <LayoutDashboard size={15}/> : <Smartphone size={15}/>;
}

function blockIcon(kind: BlockKind) {
  if (kind === "Image") return <ImageIcon size={20}/>;
  if (kind === "Button") return <MousePointerClick size={20}/>;
  if (kind === "Link") return <Link2 size={20}/>;
  if (kind === "Custom Code") return <Code2 size={20}/>;
  if (["Phone Capture", "Email Capture", "Short Text"].includes(kind)) return <Type size={20}/>;
  return <LayoutDashboard size={20}/>;
}

function defaultCustomHtml(page: InAppPage) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: rgba(30, 30, 30, .72); font-family: Arial, sans-serif; }
      .message { width: min(390px, calc(100vw - 48px)); padding: 32px; border-radius: 8px; background: white; text-align: center; box-sizing: border-box; }
      h1 { margin: 0 0 14px; font-size: 26px; } p { line-height: 1.5; }
      button { margin-top: 12px; padding: 12px 22px; border: 0; border-radius: 5px; background: #008294; color: white; font-weight: 700; }
    </style>
  </head>
  <body>
    <main class="message"><h1>${page.title}</h1><p>${page.body}</p><button>${page.buttonText}</button></main>
  </body>
</html>`;
}

const liquidPreviewAttributes: Record<string, string> = {
  language: "en",
  country: "US",
  first_name: "Jordan",
  last_name: "Lee",
  email: "jordan@example.com",
  preferred_locale: "en-US",
};

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

function liquidVariable(expression: string) {
  const [source, ...filters] = expression.split("|").map(part => part.trim());
  const key = source.replace(/^\$?{?|}?$/g, "").replace(/^custom_attribute\.?/, "");
  let result = liquidPreviewAttributes[key] ?? "";
  for (const filter of filters) {
    const [name, rawArgument] = filter.split(":").map(part => part.trim());
    const argument = rawArgument?.replace(/^['"]|['"]$/g, "") ?? "";
    if (name === "default" && !result) result = argument;
    if (name === "upcase") result = result.toUpperCase();
    if (name === "downcase") result = result.toLowerCase();
  }
  return result;
}

function renderLanguageLiquid(value: string) {
  let output = value;
  output = output.replace(/{%\s*if\s+\$?{?(\w+)}?\s*==\s*['"]([^'"]+)['"]\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g, (_, key: string, expected: string, truthy: string, fallback: string) => liquidPreviewAttributes[key] === expected ? truthy : fallback);
  output = output.replace(/{{\s*([\s\S]*?)\s*}}/g, (_, expression: string) => liquidVariable(expression));
  return output.replace(/{%[^%]*%}/g, "").trim();
}

function InAppPreview({ page, global, device, editor = false, htmlLanguage, onDrop, onSelectBlock }: { page: InAppPage; global: InAppGlobalStyle; device: Device; editor?: boolean; htmlLanguage?: string; onDrop?: (kind: BlockKind) => void; onSelectBlock?: (id: string) => void }) {
  const frameStyle = { "--iam-overlay": `${global.overlayColor}${Math.round(global.overlayOpacity * 2.55).toString(16).padStart(2, "0")}` } as CSSProperties;
  const cardStyle: CSSProperties = {
    maxWidth: global.maxWidth,
    background: global.backgroundColor,
    border: `${global.borderWidth}px solid ${global.borderColor}`,
    borderRadius: global.borderRadius,
    color: global.textColor,
    fontFamily: global.fontFamily,
    textAlign: global.contentAlignment,
    backgroundImage: global.backgroundImageEnabled && global.backgroundImageUrl ? `url(${global.backgroundImageUrl})` : undefined,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
  const renderBlock = (block: ExtraBlock) => {
    if (block.kind === "Spacer") return <div key={block.id} style={{ height: 18 }}/>;
    if (block.kind === "Custom Code") return <div key={block.id} dangerouslySetInnerHTML={{ __html: block.text }} />;
    if (block.kind === "Image") return block.src ? <img key={block.id} src={block.src} alt={block.text || "Block image"} style={{ maxWidth: "100%", borderRadius: 6, ...block.style }}/> : <div key={block.id} style={{ minHeight: 60, display: "grid", placeItems: "center", border: "1px dashed #bcb4c5", borderRadius: 6, fontSize: 10, ...block.style }}>Image · add a URL</div>;
    const blockStyle: CSSProperties = { color: block.style?.color, fontSize: block.style?.fontSize, textAlign: block.style?.align };
    if (block.kind === "Short Text" || block.kind === "Email Capture" || block.kind === "Phone Capture") return <label key={block.id} className={styles.extraField} style={blockStyle}><span>{block.text}{block.mapTo ? <small> → writes {block.mapTo}</small> : null}</span><input type={block.kind === "Email Capture" ? "email" : block.kind === "Phone Capture" ? "tel" : "text"} placeholder={block.kind}/></label>;
    if (block.kind === "Dropdown") return <select key={block.id} className={styles.extraField} aria-label={block.text}><option value="">{block.text}</option>{block.text.split("|").slice(1).map(option => <option key={option}>{option.trim()}</option>)}</select>;
    if (block.kind === "Checkbox" || block.kind === "Checkbox Group" || block.kind === "Radio Button") return <label key={block.id} className={styles.extraCheck} style={blockStyle}><input type={block.kind === "Radio Button" ? "radio" : "checkbox"}/><span>{block.text}{block.mapTo ? <small> → writes {block.mapTo}</small> : null}</span></label>;
    if (block.kind === "Link") return <a key={block.id} style={blockStyle}><u>{block.text}</u></a>;
    if (block.kind === "Button") return <button type="button" key={block.id} className={styles.extraBlock} style={{ background: block.style?.color ?? "#008294", color: "#fff", ...block.style }}>{block.text}</button>;
    return <p key={block.id} style={blockStyle}>{block.text}</p>;
  };
  return <div className={`${styles.deviceFrame} ${styles[device]}`} style={frameStyle} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const kind = event.dataTransfer.getData("iam-block") as BlockKind; if (kind) onDrop?.(kind); }}>
    {global.closePosition === "Outside modal" && <button className={styles.messageClose} aria-label={global.closeAccessibleName || "Close Message"} style={{ color: global.closeColor, fontSize: global.closeSize, background: global.closeBackgroundColor, border: `${global.closeBorderWidth}px solid ${global.closeBorderColor}`, borderRadius: global.closeRadius }}><X size={global.closeSize}/></button>}
    <article lang={htmlLanguage || undefined} className={`${styles.messageCard} ${styles[global.displayType.replace(" ", "").toLowerCase()]}`} style={{ ...cardStyle, ...(global.displayType === "Slideup" && global.slideupPosition === "top" ? { alignSelf: "start", borderRadius: "0 0 10px 10px" } : undefined) }}>
      {global.closePosition !== "Outside modal" && <button className={styles.messageClose} aria-label={global.closeAccessibleName || "Close Message"} style={{ color: global.closeColor, fontSize: global.closeSize, background: global.closeBackgroundColor, border: `${global.closeBorderWidth}px solid ${global.closeBorderColor}`, borderRadius: global.closeRadius }}><X size={global.closeSize}/></button>}
      {page.imageUrl && <img src={page.imageUrl} alt="Message media"/>}
      <section className={styles.messageCopy}><h2>{page.title}</h2><p>{page.body}</p></section>
      <div style={page.columns > 1 ? { display: "grid", gridTemplateColumns: `repeat(${page.columns}, 1fr)`, gap: 10 } : undefined}>
        {page.extraBlocks.map(block => editor ? <span key={block.id} role={block.kind === "Spacer" || block.kind === "Custom Code" ? undefined : "button"} style={{ display: "block", cursor: "pointer" }} onClick={() => onSelectBlock?.(block.id)}>{renderBlock(block)}</span> : renderBlock(block))}
      </div>
      {pageButtons(page).slice(0, 2).map(button => button.style === "primary"
        ? <button key={button.id} className={styles.messageCta} title={button.behavior === "dismiss" ? "On click: dismiss message" : button.behavior === "deep_link" ? `On click: open deep link ${button.href}` : `On click: open ${button.href}`} style={{ background: global.buttonColor, color: global.buttonTextColor }}>{button.text}</button>
        : <button key={button.id} className={styles.messageCta} title={button.behavior === "dismiss" ? "On click: dismiss message" : button.behavior === "deep_link" ? `On click: open deep link ${button.href}` : `On click: open ${button.href}`} style={{ background: "transparent", border: `2px solid ${global.buttonColor}`, color: global.buttonColor }}>{button.text}</button>)}
      {editor && <div className={styles.canvasOutline}>Drop blocks into this message</div>}
    </article>
  </div>;
}

export default function InAppCampaignCompose({ draft, update, notify = () => {} }: { draft: InAppCampaign; update: (patch: Partial<InAppCampaign>) => void; notify?: (message: string) => void }) {
  const variants = variantsFor(draft);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [device, setDevice] = useState<Device>("phonePortrait");
  const [copied, setCopied] = useState(false);
  const [showDescription, setShowDescription] = useState(Boolean(draft.config?.description));
  const [tagsOpen, setTagsOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [templateSaved, setTemplateSaved] = useState(false);
  const current = variants[selectedVariant] ?? variants[0];
  const page = current.pages[previewPage] ?? current.pages[0] ?? defaultPage(0, draft);
  const description = typeof draft.config?.description === "string" ? draft.config.description : "";
  const tags = Array.isArray(draft.config?.tags) ? draft.config.tags as string[] : [];
  const toggleTag = (tag: string) => update({ config: { ...draft.config, tags: tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag] } });
  const currentHtmlLanguage = current.accessibilityLanguageLiquid ? renderLanguageLiquid(current.accessibilityLanguageLiquid) : current.accessibilityLanguage;
  const channelValues = (draft.config?.channelValues ?? {}) as Record<string, unknown>;
  const delivery: InAppDelivery = { ...defaultDelivery, ...((channelValues.iamDelivery ?? {}) as Partial<InAppDelivery>) };
  const updateDelivery = (patch: Partial<InAppDelivery>) => update({ config: { ...draft.config, channelValues: { ...channelValues, iamDelivery: { ...delivery, ...patch } } } });
  const saveTemplate = async () => {
    const response = await fetch("/api/resources/in-app-message-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name || "IAM template", description: `${current.global.displayType} · ${current.pages.length} page(s)`, data: { pages: current.pages, global: current.global, sendTo: current.sendTo } }) });
    setTemplateSaved(response.ok);
    notify(response.ok ? "Saved to In-App Message Templates." : "Could not save the template.");
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
          editorMode: active.customCode ? "Custom code" : "Drag-and-drop",
        },
      },
    });
  };
  const replaceCurrent = (nextVariant: InAppVariant) => {
    const next = [...variants];
    next[selectedVariant] = nextVariant;
    persistVariants(next);
  };
  const addVariant = () => {
    const nextVariant: InAppVariant = { ...current, id: `iam_variant_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}`, pages: current.pages.map(pageItem => ({ ...pageItem, id: `${pageItem.id}_${variants.length + 1}` })) };
    const next = [...variants, nextVariant];
    persistVariants(next, next.length - 1);
    setSelectedVariant(next.length - 1);
  };

  return <div className={styles.campaignPage}>
    <section className={styles.campaignDetails}>
      <h2>Campaign Details</h2>
      <label>Campaign Name<input value={draft.name} onChange={event => update({ name: event.target.value })} placeholder="Enter Campaign Name"/></label>
      {showDescription ? <label>Description<textarea value={description} onChange={event => update({ config: { ...draft.config, description: event.target.value } })} placeholder="Describe this campaign"/></label> : <button className={styles.inlineAction} onClick={() => setShowDescription(true)}><Plus size={16}/> Add description</button>}
      <div>
        <button className={styles.tagButton} aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>◆ &nbsp; Tags <ChevronDown size={13}/></button>
        {tags.map(tag => <span key={tag} style={{ display: "inline-block", margin: "4px 6px 0 0", padding: "3px 10px", borderRadius: 12, background: "#efeaf7", fontSize: 12.5 }}>{tag}</span>)}
        {tagsOpen && <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>{["Lifecycle", "Promotional", "Retention", "Onboarding"].map(tag => <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: "5px 12px", border: "1px solid #d9d5df", borderRadius: 16, background: tags.includes(tag) ? "#efeaf7" : "#fff", fontSize: 12.5 }}>{tags.includes(tag) ? "✓ " : ""}{tag}</button>)}</div>}
      </div>
      <div className={styles.idRow}><label>Campaign ID<input value={draft.id} readOnly/></label><button onClick={() => { void navigator.clipboard?.writeText(draft.id); setCopied(true); }}><Copy size={16}/>{copied ? "Copied" : "Copy"}</button></div>
    </section>

    <section className={styles.composerCard} aria-label="In-app message composer">
      <h2>Message Composer</h2>
      <div className={styles.variantSection}><h3>Variants</h3><div>{variants.map((variant, index) => <button key={variant.id} className={index === selectedVariant ? styles.selectedVariant : ""} onClick={() => setSelectedVariant(index)}>{variant.name}</button>)}<button aria-label="Add variant" onClick={addVariant}><Plus size={16}/></button></div></div>
      <label className={styles.sendTo}>Send To<select value={current.sendTo} onChange={event => replaceCurrent({ ...current, sendTo: event.target.value as InAppVariant["sendTo"] })}><option>Both Mobile Apps &amp; Web Browsers</option><option>Mobile Apps</option><option>Web Browsers</option></select></label>
      <div className={styles.composeHeading}><h3>Compose In-App Message</h3><button onClick={() => setEditorOpen(true)}><span>✎</span> Edit Message</button></div>
      <div className={styles.previewArea}>
        <aside><h4>Page Preview</h4><div className={styles.deviceTabs}>{devices.map(item => <button title={item.label} aria-label={item.label} className={device === item.id ? styles.activeDevice : ""} key={item.id} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}</div>{current.pages.map((pageItem, index) => <button className={styles.pageTile} key={pageItem.id} onClick={() => setPreviewPage(index)} style={index === previewPage ? { outline: "2px solid #008294" } : undefined}><span className={styles.pageThumb}><InAppPreview page={pageItem} global={current.global} device="phonePortrait" htmlLanguage={currentHtmlLanguage}/></span><b>{pageItem.name}</b><small>{current.pages.length}</small></button>)}</aside>
        <main><InAppPreview page={page} global={current.global} device={device} htmlLanguage={currentHtmlLanguage}/></main>
      </div>
      <p className={styles.previewNote}>Always test your messages on a real device, as actual rendering may vary.</p>
      <div className={styles.composerActions}><button disabled={current.customCode} onClick={() => setConversionOpen(true)}>{current.customCode ? "Custom code enabled" : "Switch/convert to custom code"}</button><a href="https://www.braze.com/docs/user_guide/message_building_by_channel/in-app_messages/drag_and_drop/" target="_blank">Docs</a><button onClick={() => void saveTemplate()}>{templateSaved ? "Template saved ✓" : "Update template"}</button></div>
    </section>
    {conversionOpen && <div className={styles.dialogBackdrop} role="presentation"><section className={styles.conversionDialog} role="dialog" aria-modal="true" aria-labelledby="iam-conversion-title"><button className={styles.dialogClose} aria-label="Close conversion dialog" onClick={() => setConversionOpen(false)}><X size={18}/></button><Code2 size={25}/><h2 id="iam-conversion-title">Switch to custom code?</h2><p>Your message will be converted to HTML. Continue editing and previewing it in the custom code editor.</p><div><button onClick={() => setConversionOpen(false)}>Cancel</button><button onClick={() => { replaceCurrent({ ...current, customCode: true, customHtml: current.customHtml || defaultCustomHtml(page) }); setConversionOpen(false); setEditorOpen(true); }}>Switch to custom code</button></div></section></div>}
    {editorOpen && typeof document !== "undefined" && createPortal(current.customCode ? <InAppCodeEditor initial={current} notify={notify} close={() => setEditorOpen(false)} done={next => { replaceCurrent(next); setEditorOpen(false); }}/> : <InAppEditor initial={current} notify={notify} close={() => setEditorOpen(false)} done={next => { replaceCurrent(next); setEditorOpen(false); }} delivery={delivery} updateDelivery={updateDelivery}/>, document.body)}
  </div>;
}

function InAppCodeEditor({ initial, notify = () => {}, close, done }: { initial: InAppVariant; notify?: (message: string) => void; close: () => void; done: (variant: InAppVariant) => void }) {
  const [html, setHtml] = useState(initial.customHtml || defaultCustomHtml(initial.pages[0]));
  const [preview, setPreview] = useState(false);
  return <section className={styles.codeEditor} aria-label="In-app custom code editor">
    <header><div><Code2 size={18}/><span><b>Custom code editor</b><small>{initial.name}</small></span></div><nav><button className={!preview ? styles.activeCodeTab : ""} onClick={() => setPreview(false)}>Compose</button><button className={preview ? styles.activeCodeTab : ""} onClick={() => setPreview(true)}>Preview</button></nav></header>
    <main>{preview ? <div className={styles.codePreview}><iframe title="Custom code preview" sandbox="allow-forms allow-popups" srcDoc={html}/></div> : <div className={styles.codeWorkspace}><aside><h3>HTML</h3><p>Build a fully custom in-app message with HTML and CSS.</p><button onClick={() => setHtml(defaultCustomHtml(initial.pages[0]))}>Reset starter code</button></aside><textarea aria-label="In-app message HTML" spellCheck={false} value={html} onChange={event => setHtml(event.target.value)}/></div>}</main>
    <footer className={styles.editorFooter}><button onClick={() => notify("Thanks — feedback is recorded in the local demo.")}>Send feedback</button><span/><button className={styles.cancel} onClick={close}>Cancel</button><button className={styles.done} onClick={() => done({ ...initial, customCode: true, customHtml: html })}>Done</button><button aria-label="BrazeAI Operator" onClick={() => notify("BrazeAI Operator™ is not available for custom code in this demo.")}><Sparkles size={18}/></button></footer>
  </section>;
}

function InAppEditor({ initial, notify = () => {}, close, done, delivery, updateDelivery }: { initial: InAppVariant; notify?: (message: string) => void; close: () => void; done: (variant: InAppVariant) => void; delivery?: InAppDelivery; updateDelivery?: (patch: Partial<InAppDelivery>) => void }) {
  const [tab, setTab] = useState<EditorTab>("compose");
  const [pages, setPages] = useState<InAppPage[]>(initial.pages);
  const [selectedPage, setSelectedPage] = useState(0);
  const [global, setGlobal] = useState<InAppGlobalStyle>(initial.global);
  const [language, setLanguage] = useState(initial.accessibilityLanguage);
  const [languageLiquid, setLanguageLiquid] = useState(initial.accessibilityLanguageLiquid ?? "");
  const [languageLiquidEnabled, setLanguageLiquidEnabled] = useState(Boolean(initial.accessibilityLanguageLiquid));
  const [device, setDevice] = useState<Device>("phonePortrait");
  const [scope, setScope] = useState<"all" | "page">("all");
  const [history, setHistory] = useState<InAppPage[][]>([]);
  const [future, setFuture] = useState<InAppPage[][]>([]);
  const [recipient, setRecipient] = useState("");
  const [testSent, setTestSent] = useState(false);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [previewUsers, setPreviewUsers] = useState<string[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewUser, setPreviewUser] = useState("Random user");
  useEffect(() => { void fetch("/api/users?limit=5").then(r => r.json()).then(d => setPreviewUsers(((d.data ?? []) as Array<{ id?: string }>).map(user => String(user.id ?? "")).filter(Boolean))).catch(() => {}); }, []);
  const page = pages[selectedPage] ?? pages[0];

  const commitPages = (next: InAppPage[]) => { setHistory(current => [...current, pages].slice(-30)); setPages(next); setFuture([]); };
  const updatePage = (patch: Partial<InAppPage>) => commitPages(pages.map((item, index) => index === selectedPage ? { ...item, ...patch } : item));
  const addPage = () => { const next = [...pages, defaultPage(pages.length)]; commitPages(next); setSelectedPage(next.length - 1); };
  const addBlock = (kind: BlockKind) => {
    if (kind === "Title") return updatePage({ title: page.title || "New title" });
    if (kind === "Paragraph") return updatePage({ body: `${page.body}${page.body ? "\n" : ""}Add your message here.` });
    if (kind === "Button") return updatePage({ buttons: pageButtons(page).slice(0, 1).concat([{ id: `iam_btn_${Date.now()}`, text: "Call to action", behavior: "dismiss", href: "", style: "secondary" }]) });
    if (kind === "Image") return updatePage({ imageUrl: page.imageUrl || "https://placehold.co/680x280/191919/ffffff?text=Campaign+image" });
    const nextBlock: ExtraBlock = { id: `iam_block_${crypto.randomUUID().slice(0, 8)}`, kind, text: kind === "Spacer" ? "" : kind === "Link" ? "Learn more" : kind === "Custom Code" ? "<p>Custom HTML</p>" : `${kind} field` };
    updatePage({ extraBlocks: [...page.extraBlocks, nextBlock] });
  };
  const undo = () => { if (!history.length) return; const previous = history[history.length - 1]; setFuture(current => [pages, ...current]); setPages(previous); setHistory(history.slice(0, -1)); setSelectedPage(Math.min(selectedPage, previous.length - 1)); };
  const redo = () => { if (!future.length) return; const next = future[0]; setHistory(current => [...current, pages]); setPages(next); setFuture(future.slice(1)); setSelectedPage(Math.min(selectedPage, next.length - 1)); };
  const removePage = (index: number) => { if (pages.length === 1) return; const next = pages.filter((_, itemIndex) => itemIndex !== index); commitPages(next); setSelectedPage(Math.max(0, Math.min(selectedPage, next.length - 1))); };
  const movePage = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return;
    const selectedId = pages[selectedPage]?.id;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitPages(next);
    setSelectedPage(Math.max(0, next.findIndex(item => item.id === selectedId)));
  };
  const htmlLanguage = languageLiquidEnabled && !validateLanguageLiquid(languageLiquid) ? renderLanguageLiquid(languageLiquid) : language;
  const save = () => done({ ...initial, pages, global, accessibilityLanguage: languageLiquidEnabled ? "" : language, accessibilityLanguageLiquid: languageLiquidEnabled ? languageLiquid : "" });

  return <section className={styles.editor} aria-label="In-app message editor">
    <header className={styles.editorTabs} role="tablist">{(["compose", "settings", "preview"] as const).map(value => <button role="tab" aria-selected={tab === value} className={tab === value ? styles.activeTab : ""} key={value} onClick={() => setTab(value)}>{value === "compose" ? "Compose" : value === "settings" ? "Settings" : "Preview & Test"}</button>)}</header>

    {tab === "settings" ? <InAppSettings language={language} setLanguage={setLanguage} liquidEnabled={languageLiquidEnabled} setLiquidEnabled={setLanguageLiquidEnabled} liquid={languageLiquid} setLiquid={setLanguageLiquid} delivery={delivery} updateDelivery={updateDelivery}/> : tab === "preview" ? <div className={styles.previewWorkspace}><PreviewSidebar pages={pages} selected={selectedPage} select={setSelectedPage}/><main><InAppPreview page={page} global={global} device={device} htmlLanguage={htmlLanguage}/><div className={styles.previewDevices}>{devices.filter(item => ["phonePortrait", "tabletPortrait", "desktop"].includes(item.id)).map(item => <button key={item.id} title={item.label} className={device === item.id ? styles.activeDevice : ""} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}</div></main><aside className={styles.testPanel}><h3>Test Recipients</h3><p>Select at least one Content Test Group or individual user to receive this test message.</p><label>Add individual users<input value={recipient} onChange={event => { setRecipient(event.target.value); setTestSent(false); }} placeholder="External ids, emails, or phone numbers"/></label><label className={styles.check}><input type="checkbox"/> Override recipients&apos; attributes with current preview user&apos;s attributes</label><button disabled={!recipient.trim()} onClick={() => setTestSent(true)}>Send Test</button>{testSent && <div className={styles.testSuccess}>Test message simulated for {recipient}.</div>}<label>Preview message as user<select value={previewUser} onChange={event => setPreviewUser(event.target.value)}><option>Random user</option>{previewUsers.map(user => <option key={user}>{user}</option>)}</select></label><button onClick={() => { if (!previewUsers.length) return; setPreviewUser(previewUsers[Math.floor(Math.random() * previewUsers.length)]); }}>Get random user</button></aside></div> : <div className={styles.composeWorkspace}>
      <aside className={styles.blockSidebar}><PagesPanel pages={pages} selected={selectedPage} select={setSelectedPage} add={addPage} remove={removePage} move={movePage}/><section><h3>Rows</h3><p>Drag a row into your message</p><div className={styles.rowChoices}>{[1, 2, 3].map(columns => <button key={columns} onClick={() => updatePage({ columns })}>{Array.from({ length: columns }, (_, index) => <i key={index}/>)}</button>)}</div></section>{blockGroups.map(group => <section key={group.title}><h3>{group.title}</h3><p>Drag and drop a block into a row</p><div className={styles.blockGrid}>{group.blocks.map(kind => <button draggable onDragStart={event => event.dataTransfer.setData("iam-block", kind)} onClick={() => addBlock(kind)} key={kind}>{blockIcon(kind)}<span>{kind}</span></button>)}</div></section>)}<button className={styles.manageLanguages} onClick={() => setTab("settings")}><Languages size={16}/> Manage languages</button></aside>
      <main className={styles.canvasStage}><div className={styles.canvasTools}><button disabled={!history.length} onClick={undo} title="Undo"><Undo2 size={17}/></button><button disabled={!future.length} onClick={redo} title="Redo"><Redo2 size={17}/></button>{devices.filter(item => ["phonePortrait", "tabletPortrait", "desktop"].includes(item.id)).map(item => <button key={item.id} title={item.label} className={device === item.id ? styles.activeDevice : ""} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}<button title="Add Personalization" onClick={() => setPersonalizationOpen(value => !value)}><Sparkles size={17}/></button></div>{personalizationOpen && <div className={styles.personalization}><b>Add Personalization</b>{["{{${first_name}}}", "{{${email}}}", "{{${language}}}"].map(token => <button key={token} onClick={() => { updatePage({ body: `${page.body} ${token}` }); setPersonalizationOpen(false); }}>{token}</button>)}</div>}<InAppPreview page={page} global={global} device={device} editor htmlLanguage={htmlLanguage} onDrop={addBlock} onSelectBlock={setSelectedBlockId}/></main>
      <aside className={styles.inspector}><div className={styles.scopeTabs}><button className={scope === "all" ? styles.activeScope : ""} onClick={() => setScope("all")}>All pages</button><button className={scope === "page" ? styles.activeScope : ""} onClick={() => setScope("page")}>Current page</button></div>{scope === "all" ? <GlobalInspector global={global} update={patch => setGlobal(current => ({ ...current, ...patch }))}/> : <PageInspector page={page} update={updatePage} selectedBlock={page.extraBlocks.find(block => block.id === selectedBlockId) ?? null} updateBlock={(blockId, patch) => updatePage({ extraBlocks: page.extraBlocks.map(block => block.id === blockId ? { ...block, ...patch } : block) })} onCloseBlock={() => setSelectedBlockId(null)}/>}</aside>
    </div>}
    <footer className={styles.editorFooter}><button onClick={() => notify("Thanks — feedback is recorded in the local demo.")}>Send feedback</button><span/><button className={styles.cancel} onClick={close}>Cancel</button><button className={styles.done} onClick={save}>Done</button><button aria-label="BrazeAI Operator" onClick={() => notify("BrazeAI Operator™ copywriting is not available in this demo editor.")}><Sparkles size={18}/></button></footer>
  </section>;
}

function InAppSettings({ language, setLanguage, liquidEnabled, setLiquidEnabled, liquid, setLiquid, delivery, updateDelivery }: { language: string; setLanguage: (value: string) => void; liquidEnabled: boolean; setLiquidEnabled: (value: boolean) => void; liquid: string; setLiquid: (value: string) => void; delivery?: InAppDelivery; updateDelivery?: (patch: Partial<InAppDelivery>) => void }) {
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [personalizationType, setPersonalizationType] = useState("Default Attributes");
  const [attribute, setAttribute] = useState("language");
  const [defaultValue, setDefaultValue] = useState("en");
  const [copied, setCopied] = useState(false);
  const attributeOptions = personalizationType === "Custom Attributes" ? [{ value: "preferred_locale", label: "preferred_locale" }, { value: "app_language", label: "app_language" }] : personalizationType === "Device Properties" ? [{ value: "language", label: "Device language" }, { value: "country", label: "Device country" }] : [{ value: "language", label: "Language" }, { value: "country", label: "Country" }, { value: "first_name", label: "First name" }, { value: "last_name", label: "Last name" }, { value: "email", label: "Email" }];
  const variable = personalizationType === "Custom Attributes" ? `\${custom_attribute.${attribute}}` : `\${${attribute}}`;
  const safeDefault = defaultValue.replaceAll("'", "\\'");
  const snippet = `{{${variable}${defaultValue ? ` | default: '${safeDefault}'` : ""}}}`;
  const issue = liquidEnabled ? validateLanguageLiquid(liquid) : "";
  const resolved = liquidEnabled && !issue ? renderLanguageLiquid(liquid) : "";
  const changeType = (next: string) => { setPersonalizationType(next); setAttribute(next === "Custom Attributes" ? "preferred_locale" : "language"); setCopied(false); };
  return <div className={styles.settingsPage}>
    <aside>Edit your in-app message settings</aside>
    <main className={styles.accessibilitySettings}>
      {delivery && updateDelivery && <><h2>Display Trigger</h2>
      <p>Choose when this in-app message displays for eligible users.</p>
      <label>Trigger<select aria-label="Display trigger" value={delivery.triggerType} onChange={event => updateDelivery({ triggerType: event.target.value as InAppDelivery["triggerType"] })}><option>Session start</option><option>Custom event</option><option>Specific time</option></select></label>
      {delivery.triggerType === "Custom event" && <label>Event name<input aria-label="Trigger event name" value={delivery.triggerEventName} onChange={event => updateDelivery({ triggerEventName: event.target.value })} placeholder="e.g. viewed_checkout"/></label>}
      {delivery.triggerType === "Custom event" && <label>Event property filter <small>(Optional)</small><input aria-label="Trigger event property" value={delivery.triggerEventProperty} onChange={event => updateDelivery({ triggerEventProperty: event.target.value })} placeholder="e.g. cart_value > 50"/></label>}
      {delivery.triggerType === "Specific time" && <label>Display at<input aria-label="Trigger time" type="datetime-local" value={delivery.triggerTime} onChange={event => updateDelivery({ triggerTime: event.target.value })}/></label>}
      <h2>Message Duration</h2>
      <p>The message stops displaying after the end date.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>Start date<input aria-label="Display start date" type="date" value={delivery.durationStart} onChange={event => updateDelivery({ durationStart: event.target.value })}/></label>
        <label>End date<input aria-label="Display end date" type="date" value={delivery.durationEnd} onChange={event => updateDelivery({ durationEnd: event.target.value })}/></label>
      </div>
      <h2>Frequency Capping</h2>
      <p>Limit how often a user sees this message.</p>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={delivery.frequencyCapEnabled} onChange={event => updateDelivery({ frequencyCapEnabled: event.target.checked })}/> Respect frequency capping</label>
      {delivery.frequencyCapEnabled && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>Max impressions per user<input aria-label="Frequency cap limit" type="number" min={1} value={delivery.frequencyCapLimit} onChange={event => updateDelivery({ frequencyCapLimit: Math.max(1, Number(event.target.value) || 1) })}/></label>
        <label>Window (days)<input aria-label="Frequency cap window" type="number" min={1} value={delivery.frequencyCapDays} onChange={event => updateDelivery({ frequencyCapDays: Math.max(1, Number(event.target.value) || 1) })}/></label>
      </div>}</>}
      <h2>Accessibility</h2>
      <p>Set the <a href="https://www.braze.com/docs/user_guide/message_building_by_channel/in-app_messages/" target="_blank">accessibility language</a> for your message&apos;s HTML. Screen readers and assistive tools use this to pronounce content with the correct language and dialect. Select a language or use Liquid to set it dynamically.</p>
      <label>Language <span className={styles.infoDot} title="Sets the HTML lang attribute">i</span><select aria-label="Accessibility language" disabled={liquidEnabled} value={language} onChange={event => setLanguage(event.target.value)}><option value="">Select...</option><option value="en">English</option><option value="zh-CN">Chinese (Simplified)</option><option value="ja">Japanese</option><option value="ko">Korean</option></select></label>
      {!liquidEnabled ? <button className={styles.liquidLanguage} onClick={() => { setLiquidEnabled(true); setLiquid(""); }}><Plus size={16}/> Add language with Liquid</button> : <section className={styles.liquidSection}>
        <label>Language attribute from Liquid <span className={styles.infoDot} title="The rendered value becomes the HTML lang attribute">i</span><span className={styles.liquidInput}><textarea aria-label="Liquid language expression" value={liquid} onChange={event => setLiquid(event.target.value)} placeholder="Type in a value"/><button aria-label="Add Liquid personalization" onClick={() => setPersonalizationOpen(value => !value)}><Plus size={16}/></button></span></label>
        {issue ? <p className={styles.liquidError}>{issue}</p> : <p className={styles.liquidValid}>Valid Liquid · Preview HTML language: <b>{resolved || "(empty)"}</b></p>}
        <button className={styles.removeLiquid} onClick={() => { setLiquidEnabled(false); setLiquid(""); setPersonalizationOpen(false); }}><Trash2 size={16}/> Remove Liquid</button>
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
  return <section className={styles.pagesPanel}><h3>Pages ({pages.length})</h3><p>Create and manage multi-page messages</p>{pages.map((page, index) => <div data-testid="iam-page-row" className={`${styles.pageRow} ${selected === index ? styles.pageSelected : ""} ${dragging === index ? styles.pageDragging : ""} ${dragOver === index && dragging !== index ? styles.pageDropTarget : ""}`} key={page.id} onDragOver={event => { if (!Array.from(event.dataTransfer.types).includes("iam-page-index")) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOver(index); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(current => current === index ? null : current); }} onDrop={event => { const rawIndex = event.dataTransfer.getData("iam-page-index"); if (!rawIndex) return; event.preventDefault(); const from = Number(rawIndex); if (Number.isInteger(from)) move(from, index); resetDrag(); }}>
    <span className={styles.dragHandle} draggable role="button" tabIndex={0} aria-label={`Drag ${page.name}`} aria-grabbed={dragging === index} title="Drag to reorder" onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("iam-page-index", String(index)); setDragging(index); }} onDragEnd={resetDrag}><GripVertical size={18}/></span>
    <button className={styles.pageMain} aria-label={`Select ${page.name} page`} onClick={() => select(index)}><span className={styles.pageMini}><i/><i/><i/></span><b>{page.name}</b><small>{index + 1}</small></button>
    <button className={styles.movePageButton} aria-label={`Move ${page.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ChevronLeft size={13}/></button><button className={styles.movePageButton} aria-label={`Move ${page.name} down`} disabled={index === pages.length - 1} onClick={() => move(index, index + 1)}><ChevronRight size={13}/></button><button className={styles.deletePage} aria-label={`Delete ${page.name}`} disabled={pages.length === 1} onClick={() => remove(index)}><Trash2 size={13}/></button>
  </div>)}<button className={styles.addPage} onClick={add}><Plus size={16}/> Add Page</button></section>;
}

function PreviewSidebar({ pages, selected, select }: { pages: InAppPage[]; selected: number; select: (index: number) => void }) {
  return <aside className={styles.previewSidebar}><h3>Pages ({pages.length})</h3>{pages.map((page, index) => <button className={selected === index ? styles.pageSelected : ""} key={page.id} onClick={() => select(index)}><span>{index + 1}</span><b>{page.name}</b></button>)}</aside>;
}

function GlobalInspector({ global, update }: { global: InAppGlobalStyle; update: (patch: Partial<InAppGlobalStyle>) => void }) {
  return <div className={styles.inspectorBody}><p>These styles apply to every page in your message. You can override them for individual pages.</p><h3>Message container</h3><small>Applies to every page in this message</small><label>Display type<select value={global.displayType} onChange={event => update({ displayType: event.target.value as InAppGlobalStyle["displayType"] })}><option>Modal</option><option>Slideup</option><option>Full screen</option></select></label>{global.displayType === "Slideup" && <label>Slideup position<select value={global.slideupPosition ?? "bottom"} onChange={event => update({ slideupPosition: event.target.value as "top" | "bottom" })}><option value="bottom">Bottom of screen</option><option value="top">Top of screen</option></select></label>}<label>Max width<div className={styles.numberUnit}><input type="number" value={global.maxWidth} onChange={event => update({ maxWidth: Number(event.target.value) })}/><span>px</span></div></label><ColorField label="Background color" value={global.backgroundColor} change={backgroundColor => update({ backgroundColor })}/><label className={styles.toggleField}><span>Background image</span><input type="checkbox" checked={global.backgroundImageEnabled} onChange={event => update({ backgroundImageEnabled: event.target.checked })}/></label>{global.backgroundImageEnabled && <label>Background image URL<input value={global.backgroundImageUrl} onChange={event => update({ backgroundImageUrl: event.target.value })} placeholder="https://"/></label>}<label>Border style<div className={styles.numberUnit}><input type="number" min="0" value={global.borderWidth} onChange={event => update({ borderWidth: Number(event.target.value) })}/><span>solid</span></div></label><ColorField label="Border color" value={global.borderColor} change={borderColor => update({ borderColor })}/><label>Border radius<input type="number" min="0" value={global.borderRadius} onChange={event => update({ borderRadius: Number(event.target.value) })}/></label><h3>Content</h3><label>Default font<select value={global.fontFamily} onChange={event => update({ fontFamily: event.target.value })}><option>Arial</option><option>Helvetica</option><option>Georgia</option><option>Times New Roman</option></select></label><label>Content alignment<select value={global.contentAlignment} onChange={event => update({ contentAlignment: event.target.value as InAppGlobalStyle["contentAlignment"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><ColorField label="Text color" value={global.textColor} change={textColor => update({ textColor })}/><ColorField label="Button color" value={global.buttonColor} change={buttonColor => update({ buttonColor })}/><ColorField label="Button text color" value={global.buttonTextColor} change={buttonTextColor => update({ buttonTextColor })}/><h3>Close button</h3><label>Accessible name<input value={global.closeAccessibleName} onChange={event => update({ closeAccessibleName: event.target.value })}/></label><label>Button position<select value={global.closePosition} onChange={event => update({ closePosition: event.target.value as InAppGlobalStyle["closePosition"] })}><option>Inside modal</option><option>Outside modal</option></select></label><label>Button size<input type="number" value={global.closeSize} onChange={event => update({ closeSize: Number(event.target.value) })}/></label><ColorField label="Fill color" value={global.closeColor} change={closeColor => update({ closeColor })}/><ColorField label="Background color" value={global.closeBackgroundColor} change={closeBackgroundColor => update({ closeBackgroundColor })}/><ColorField label="Border color" value={global.closeBorderColor} change={closeBorderColor => update({ closeBorderColor })}/><label>Border width<input type="number" min="0" value={global.closeBorderWidth} onChange={event => update({ closeBorderWidth: Number(event.target.value) })}/></label><label>Border radius<input type="number" min="0" value={global.closeRadius} onChange={event => update({ closeRadius: Number(event.target.value) })}/></label><h3>Overlay</h3><ColorField label="Background color" value={global.overlayColor} change={overlayColor => update({ overlayColor })}/><label>Opacity<input type="range" min="0" max="100" value={global.overlayOpacity} onChange={event => update({ overlayOpacity: Number(event.target.value) })}/><small>{global.overlayOpacity}%</small></label></div>;
}

function PageInspector({ page, update, selectedBlock, updateBlock, onCloseBlock }: { page: InAppPage; update: (patch: Partial<InAppPage>) => void; selectedBlock?: ExtraBlock | null; updateBlock?: (blockId: string, patch: Partial<ExtraBlock>) => void; onCloseBlock?: () => void }) {
  const buttons = pageButtons(page);
  const setButtons = (next: InAppButton[]) => update({ buttons: next.slice(0, 2), buttonText: next[0]?.text ?? page.buttonText });
  if (selectedBlock) return <BlockInspector block={selectedBlock} update={patch => updateBlock?.(selectedBlock.id, patch)} onClose={onCloseBlock}/>;
  return <div className={styles.inspectorBody}><p>These settings apply to the selected page.</p><h3>Page content</h3><label>Page name<input value={page.name} onChange={event => update({ name: event.target.value })}/></label><label>Title<input value={page.title} onChange={event => update({ title: event.target.value })}/></label><label>Message<textarea value={page.body} onChange={event => update({ body: event.target.value })}/></label><label>Image URL<input value={page.imageUrl} onChange={event => update({ imageUrl: event.target.value })} placeholder="https://"/></label><label>Columns<select value={page.columns} onChange={event => update({ columns: Number(event.target.value) })}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option></select></label>
    <h3>Buttons</h3><small>Up to two. On-click can dismiss the message or open a destination.</small>
    {buttons.map((button, index) => <div key={button.id} style={{ display: "grid", gap: 6, padding: 10, border: "1px solid #e3dfe6", borderRadius: 6, margin: "8px 0" }}>
      <label>Button {index + 1} text<input value={button.text} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, text: event.target.value } : item))}/></label>
      <label>On click<select value={button.behavior} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, behavior: event.target.value as InAppButton["behavior"] } : item))}><option value="dismiss">Dismiss message</option><option value="deep_link">Open deep link</option><option value="web_url">Open web URL</option></select></label>
      {button.behavior !== "dismiss" && <label>{button.behavior === "deep_link" ? "Deep link" : "Web URL"}<input value={button.href} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, href: event.target.value } : item))} placeholder={button.behavior === "deep_link" ? "myapp://products" : "https://"}/></label>}
      <label>Style<select value={button.style} onChange={event => setButtons(buttons.map(item => item.id === button.id ? { ...item, style: event.target.value as InAppButton["style"] } : item))}><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
      {buttons.length > 1 && <button style={{ border: 0, background: "transparent", color: "#a4474f", fontWeight: 750, textAlign: "left", cursor: "pointer" }} onClick={() => setButtons(buttons.filter(item => item.id !== button.id))}>Remove button</button>}
    </div>)}
    {buttons.length < 2 && <button style={{ border: 0, background: "transparent", color: "#6b2bd2", fontWeight: 750, textAlign: "left", cursor: "pointer" }} onClick={() => setButtons([...buttons, { id: `iam_btn_${Date.now()}`, text: "Secondary action", behavior: "dismiss", href: "", style: "secondary" }])}>+ Add secondary button</button>}
  </div>;
}

function ColorField({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  return <label>{label}<span className={styles.colorField}><input type="color" value={value} onChange={event => change(event.target.value)}/><input value={value.toUpperCase()} onChange={event => change(event.target.value)}/></span></label>;
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
