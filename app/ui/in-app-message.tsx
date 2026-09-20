"use client";

import { useState, type CSSProperties, type DragEvent } from "react";
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

type ExtraBlock = { id: string; kind: BlockKind; text: string };
type InAppPage = {
  id: string;
  name: string;
  title: string;
  body: string;
  buttonText: string;
  imageUrl: string;
  columns: number;
  extraBlocks: ExtraBlock[];
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
};
type InAppVariant = {
  id: string;
  name: string;
  sendTo: "Both Mobile Apps & Web Browsers" | "Mobile Apps" | "Web Browsers";
  pages: InAppPage[];
  accessibilityLanguage: string;
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
  overlayOpacity: 75,
};

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

function InAppPreview({ page, global, device, editor = false, onDrop, onSelectBlock }: { page: InAppPage; global: InAppGlobalStyle; device: Device; editor?: boolean; onDrop?: (kind: BlockKind) => void; onSelectBlock?: (id: string) => void }) {
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
  return <div className={`${styles.deviceFrame} ${styles[device]}`} style={frameStyle} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const kind = event.dataTransfer.getData("iam-block") as BlockKind; if (kind) onDrop?.(kind); }}>
    <article className={`${styles.messageCard} ${styles[global.displayType.replace(" ", "").toLowerCase()]}`} style={cardStyle}>
      <button className={styles.messageClose} aria-label={global.closeAccessibleName || "Close Message"} style={{ color: global.closeColor, fontSize: global.closeSize, background: global.closeBackgroundColor, border: `${global.closeBorderWidth}px solid ${global.closeBorderColor}`, borderRadius: global.closeRadius }}><X size={global.closeSize}/></button>
      {page.imageUrl && <img src={page.imageUrl} alt="Message media"/>}
      <section className={styles.messageCopy}><h2>{page.title}</h2><p>{page.body}</p></section>
      {page.extraBlocks.map(block => <button type="button" key={block.id} className={styles.extraBlock} onClick={() => onSelectBlock?.(block.id)}>{block.kind === "Spacer" ? "Spacer" : block.text}</button>)}
      <button className={styles.messageCta} style={{ background: global.buttonColor, color: global.buttonTextColor }}>{page.buttonText}</button>
      {editor && <div className={styles.canvasOutline}>Drop blocks into this message</div>}
    </article>
  </div>;
}

export default function InAppCampaignCompose({ draft, update }: { draft: InAppCampaign; update: (patch: Partial<InAppCampaign>) => void }) {
  const variants = variantsFor(draft);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [device, setDevice] = useState<Device>("phonePortrait");
  const [copied, setCopied] = useState(false);
  const current = variants[selectedVariant] ?? variants[0];
  const page = current.pages[0] ?? defaultPage(0, draft);

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
      <button className={styles.inlineAction}><Plus size={16}/> Add description</button>
      <button className={styles.tagButton}>◆ &nbsp; Tags <ChevronDown size={13}/></button>
      <div className={styles.idRow}><label>Campaign ID<input value={draft.id} readOnly/></label><button onClick={() => { void navigator.clipboard?.writeText(draft.id); setCopied(true); }}><Copy size={16}/>{copied ? "Copied" : "Copy"}</button></div>
    </section>

    <section className={styles.composerCard} aria-label="In-app message composer">
      <h2>Message Composer</h2>
      <div className={styles.variantSection}><h3>Variants</h3><div>{variants.map((variant, index) => <button key={variant.id} className={index === selectedVariant ? styles.selectedVariant : ""} onClick={() => setSelectedVariant(index)}>{variant.name}</button>)}<button aria-label="Add variant" onClick={addVariant}><Plus size={16}/></button></div></div>
      <label className={styles.sendTo}>Send To<select value={current.sendTo} onChange={event => replaceCurrent({ ...current, sendTo: event.target.value as InAppVariant["sendTo"] })}><option>Both Mobile Apps &amp; Web Browsers</option><option>Mobile Apps</option><option>Web Browsers</option></select></label>
      <div className={styles.composeHeading}><h3>Compose In-App Message</h3><button onClick={() => setEditorOpen(true)}><span>✎</span> Edit Message</button></div>
      <div className={styles.previewArea}>
        <aside><h4>Page Preview</h4><div className={styles.deviceTabs}>{devices.map(item => <button title={item.label} aria-label={item.label} className={device === item.id ? styles.activeDevice : ""} key={item.id} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}</div><button className={styles.pageTile}><span className={styles.pageThumb}><InAppPreview page={page} global={current.global} device="phonePortrait"/></span><b>{page.name}</b><small>{current.pages.length}</small></button></aside>
        <main><InAppPreview page={page} global={current.global} device={device}/></main>
      </div>
      <p className={styles.previewNote}>Always test your messages on a real device, as actual rendering may vary.</p>
      <div className={styles.composerActions}><button disabled={current.customCode} onClick={() => setConversionOpen(true)}>{current.customCode ? "Custom code enabled" : "Switch/convert to custom code"}</button><a href="https://www.braze.com/docs/user_guide/message_building_by_channel/in-app_messages/drag_and_drop/" target="_blank">Docs</a><button disabled>Update template</button></div>
    </section>
    {conversionOpen && <div className={styles.dialogBackdrop} role="presentation"><section className={styles.conversionDialog} role="dialog" aria-modal="true" aria-labelledby="iam-conversion-title"><button className={styles.dialogClose} aria-label="Close conversion dialog" onClick={() => setConversionOpen(false)}><X size={18}/></button><Code2 size={25}/><h2 id="iam-conversion-title">Switch to custom code?</h2><p>Your message will be converted to HTML. Continue editing and previewing it in the custom code editor.</p><div><button onClick={() => setConversionOpen(false)}>Cancel</button><button onClick={() => { replaceCurrent({ ...current, customCode: true, customHtml: current.customHtml || defaultCustomHtml(page) }); setConversionOpen(false); setEditorOpen(true); }}>Switch to custom code</button></div></section></div>}
    {editorOpen && (current.customCode ? <InAppCodeEditor initial={current} close={() => setEditorOpen(false)} done={next => { replaceCurrent(next); setEditorOpen(false); }}/> : <InAppEditor initial={current} close={() => setEditorOpen(false)} done={next => { replaceCurrent(next); setEditorOpen(false); }}/>) }
  </div>;
}

function InAppCodeEditor({ initial, close, done }: { initial: InAppVariant; close: () => void; done: (variant: InAppVariant) => void }) {
  const [html, setHtml] = useState(initial.customHtml || defaultCustomHtml(initial.pages[0]));
  const [preview, setPreview] = useState(false);
  return <section className={styles.codeEditor} aria-label="In-app custom code editor">
    <header><div><Code2 size={18}/><span><b>Custom code editor</b><small>{initial.name}</small></span></div><nav><button className={!preview ? styles.activeCodeTab : ""} onClick={() => setPreview(false)}>Compose</button><button className={preview ? styles.activeCodeTab : ""} onClick={() => setPreview(true)}>Preview</button></nav></header>
    <main>{preview ? <div className={styles.codePreview}><iframe title="Custom code preview" sandbox="allow-forms allow-popups" srcDoc={html}/></div> : <div className={styles.codeWorkspace}><aside><h3>HTML</h3><p>Build a fully custom in-app message with HTML and CSS.</p><button onClick={() => setHtml(defaultCustomHtml(initial.pages[0]))}>Reset starter code</button></aside><textarea aria-label="In-app message HTML" spellCheck={false} value={html} onChange={event => setHtml(event.target.value)}/></div>}</main>
    <footer className={styles.editorFooter}><button>Send feedback</button><span/><button className={styles.cancel} onClick={close}>Cancel</button><button className={styles.done} onClick={() => done({ ...initial, customCode: true, customHtml: html })}>Done</button><button aria-label="BrazeAI Operator"><Sparkles size={18}/></button></footer>
  </section>;
}

function InAppEditor({ initial, close, done }: { initial: InAppVariant; close: () => void; done: (variant: InAppVariant) => void }) {
  const [tab, setTab] = useState<EditorTab>("compose");
  const [pages, setPages] = useState<InAppPage[]>(initial.pages);
  const [selectedPage, setSelectedPage] = useState(0);
  const [global, setGlobal] = useState<InAppGlobalStyle>(initial.global);
  const [language, setLanguage] = useState(initial.accessibilityLanguage);
  const [device, setDevice] = useState<Device>("phonePortrait");
  const [scope, setScope] = useState<"all" | "page">("all");
  const [history, setHistory] = useState<InAppPage[][]>([]);
  const [future, setFuture] = useState<InAppPage[][]>([]);
  const [recipient, setRecipient] = useState("");
  const [testSent, setTestSent] = useState(false);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const page = pages[selectedPage] ?? pages[0];

  const commitPages = (next: InAppPage[]) => { setHistory(current => [...current, pages].slice(-30)); setPages(next); setFuture([]); };
  const updatePage = (patch: Partial<InAppPage>) => commitPages(pages.map((item, index) => index === selectedPage ? { ...item, ...patch } : item));
  const addPage = () => { const next = [...pages, defaultPage(pages.length)]; commitPages(next); setSelectedPage(next.length - 1); };
  const addBlock = (kind: BlockKind) => {
    if (kind === "Title") return updatePage({ title: page.title || "New title" });
    if (kind === "Paragraph") return updatePage({ body: `${page.body}${page.body ? "\n" : ""}Add your message here.` });
    if (kind === "Button") return updatePage({ buttonText: page.buttonText || "Call to action" });
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
  const save = () => done({ ...initial, pages, global, accessibilityLanguage: language });

  return <section className={styles.editor} aria-label="In-app message editor">
    <header className={styles.editorTabs} role="tablist">{(["compose", "settings", "preview"] as const).map(value => <button role="tab" aria-selected={tab === value} className={tab === value ? styles.activeTab : ""} key={value} onClick={() => setTab(value)}>{value === "compose" ? "Compose" : value === "settings" ? "Settings" : "Preview & Test"}</button>)}</header>

    {tab === "settings" ? <div className={styles.settingsPage}><aside>Edit your in-app message settings</aside><main><h2>Accessibility</h2><p>Set the accessibility language for your message&apos;s HTML. Screen readers and assistive tools use this to pronounce content with the correct language and dialect.</p><label>Language<select aria-label="Accessibility language" value={language} onChange={event => setLanguage(event.target.value)}><option value="">Select...</option><option>English</option><option>Chinese (Simplified)</option><option>Japanese</option><option>Korean</option></select></label><button className={styles.liquidLanguage}><Plus size={16}/> Add language with Liquid</button></main></div> : tab === "preview" ? <div className={styles.previewWorkspace}><PreviewSidebar pages={pages} selected={selectedPage} select={setSelectedPage}/><main><InAppPreview page={page} global={global} device={device}/><div className={styles.previewDevices}>{devices.filter(item => ["phonePortrait", "tabletPortrait", "desktop"].includes(item.id)).map(item => <button key={item.id} title={item.label} className={device === item.id ? styles.activeDevice : ""} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}</div></main><aside className={styles.testPanel}><h3>Test Recipients</h3><p>Select at least one Content Test Group or individual user to receive this test message.</p><label>Add individual users<input value={recipient} onChange={event => { setRecipient(event.target.value); setTestSent(false); }} placeholder="External ids, emails, or phone numbers"/></label><label className={styles.check}><input type="checkbox"/> Override recipients&apos; attributes with current preview user&apos;s attributes</label><button disabled={!recipient.trim()} onClick={() => setTestSent(true)}>Send Test</button>{testSent && <div className={styles.testSuccess}>Test message simulated for {recipient}.</div>}<label>Preview message as user<select><option>Random user</option><option>user_1024</option></select></label><button>Get random user</button></aside></div> : <div className={styles.composeWorkspace}>
      <aside className={styles.blockSidebar}><PagesPanel pages={pages} selected={selectedPage} select={setSelectedPage} add={addPage} remove={removePage} move={movePage}/><section><h3>Rows</h3><p>Drag a row into your message</p><div className={styles.rowChoices}>{[1, 2, 3].map(columns => <button key={columns} onClick={() => updatePage({ columns })}>{Array.from({ length: columns }, (_, index) => <i key={index}/>)}</button>)}</div></section>{blockGroups.map(group => <section key={group.title}><h3>{group.title}</h3><p>Drag and drop a block into a row</p><div className={styles.blockGrid}>{group.blocks.map(kind => <button draggable onDragStart={event => event.dataTransfer.setData("iam-block", kind)} onClick={() => addBlock(kind)} key={kind}>{blockIcon(kind)}<span>{kind}</span></button>)}</div></section>)}<button className={styles.manageLanguages}><Languages size={16}/> Manage languages</button></aside>
      <main className={styles.canvasStage}><div className={styles.canvasTools}><button disabled={!history.length} onClick={undo} title="Undo"><Undo2 size={17}/></button><button disabled={!future.length} onClick={redo} title="Redo"><Redo2 size={17}/></button>{devices.filter(item => ["phonePortrait", "tabletPortrait", "desktop"].includes(item.id)).map(item => <button key={item.id} title={item.label} className={device === item.id ? styles.activeDevice : ""} onClick={() => setDevice(item.id)}>{deviceIcon(item.id)}</button>)}<button title="Add Personalization" onClick={() => setPersonalizationOpen(value => !value)}><Sparkles size={17}/></button></div>{personalizationOpen && <div className={styles.personalization}><b>Add Personalization</b>{["{{${first_name}}}", "{{${email}}}", "{{${language}}}"].map(token => <button key={token} onClick={() => { updatePage({ body: `${page.body} ${token}` }); setPersonalizationOpen(false); }}>{token}</button>)}</div>}<InAppPreview page={page} global={global} device={device} editor onDrop={addBlock}/></main>
      <aside className={styles.inspector}><div className={styles.scopeTabs}><button className={scope === "all" ? styles.activeScope : ""} onClick={() => setScope("all")}>All pages</button><button className={scope === "page" ? styles.activeScope : ""} onClick={() => setScope("page")}>Current page</button></div>{scope === "all" ? <GlobalInspector global={global} update={patch => setGlobal(current => ({ ...current, ...patch }))}/> : <PageInspector page={page} update={updatePage}/>}</aside>
    </div>}
    <footer className={styles.editorFooter}><button>Send feedback</button><span/><button className={styles.cancel} onClick={close}>Cancel</button><button className={styles.done} onClick={save}>Done</button><button aria-label="BrazeAI Operator"><Sparkles size={18}/></button></footer>
  </section>;
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
  return <div className={styles.inspectorBody}><p>These styles apply to every page in your message. You can override them for individual pages.</p><h3>Message container</h3><small>Applies to every page in this message</small><label>Display type<select value={global.displayType} onChange={event => update({ displayType: event.target.value as InAppGlobalStyle["displayType"] })}><option>Modal</option><option>Slideup</option><option>Full screen</option></select></label><label>Max width<div className={styles.numberUnit}><input type="number" value={global.maxWidth} onChange={event => update({ maxWidth: Number(event.target.value) })}/><span>px</span></div></label><ColorField label="Background color" value={global.backgroundColor} change={backgroundColor => update({ backgroundColor })}/><label className={styles.toggleField}><span>Background image</span><input type="checkbox" checked={global.backgroundImageEnabled} onChange={event => update({ backgroundImageEnabled: event.target.checked })}/></label>{global.backgroundImageEnabled && <label>Background image URL<input value={global.backgroundImageUrl} onChange={event => update({ backgroundImageUrl: event.target.value })} placeholder="https://"/></label>}<label>Border style<div className={styles.numberUnit}><input type="number" min="0" value={global.borderWidth} onChange={event => update({ borderWidth: Number(event.target.value) })}/><span>solid</span></div></label><ColorField label="Border color" value={global.borderColor} change={borderColor => update({ borderColor })}/><label>Border radius<input type="number" min="0" value={global.borderRadius} onChange={event => update({ borderRadius: Number(event.target.value) })}/></label><h3>Content</h3><label>Default font<select value={global.fontFamily} onChange={event => update({ fontFamily: event.target.value })}><option>Arial</option><option>Helvetica</option><option>Georgia</option><option>Times New Roman</option></select></label><label>Content alignment<select value={global.contentAlignment} onChange={event => update({ contentAlignment: event.target.value as InAppGlobalStyle["contentAlignment"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><ColorField label="Text color" value={global.textColor} change={textColor => update({ textColor })}/><ColorField label="Button color" value={global.buttonColor} change={buttonColor => update({ buttonColor })}/><ColorField label="Button text color" value={global.buttonTextColor} change={buttonTextColor => update({ buttonTextColor })}/><h3>Close button</h3><label>Accessible name<input value={global.closeAccessibleName} onChange={event => update({ closeAccessibleName: event.target.value })}/></label><label>Button position<select value={global.closePosition} onChange={event => update({ closePosition: event.target.value as InAppGlobalStyle["closePosition"] })}><option>Inside modal</option><option>Outside modal</option></select></label><label>Button size<input type="number" value={global.closeSize} onChange={event => update({ closeSize: Number(event.target.value) })}/></label><ColorField label="Fill color" value={global.closeColor} change={closeColor => update({ closeColor })}/><ColorField label="Background color" value={global.closeBackgroundColor} change={closeBackgroundColor => update({ closeBackgroundColor })}/><ColorField label="Border color" value={global.closeBorderColor} change={closeBorderColor => update({ closeBorderColor })}/><label>Border width<input type="number" min="0" value={global.closeBorderWidth} onChange={event => update({ closeBorderWidth: Number(event.target.value) })}/></label><label>Border radius<input type="number" min="0" value={global.closeRadius} onChange={event => update({ closeRadius: Number(event.target.value) })}/></label><h3>Overlay</h3><ColorField label="Background color" value={global.overlayColor} change={overlayColor => update({ overlayColor })}/><label>Opacity<input type="range" min="0" max="100" value={global.overlayOpacity} onChange={event => update({ overlayOpacity: Number(event.target.value) })}/><small>{global.overlayOpacity}%</small></label></div>;
}

function PageInspector({ page, update }: { page: InAppPage; update: (patch: Partial<InAppPage>) => void }) {
  return <div className={styles.inspectorBody}><p>These settings apply to the selected page.</p><h3>Page content</h3><label>Page name<input value={page.name} onChange={event => update({ name: event.target.value })}/></label><label>Title<input value={page.title} onChange={event => update({ title: event.target.value })}/></label><label>Message<textarea value={page.body} onChange={event => update({ body: event.target.value })}/></label><label>Button text<input value={page.buttonText} onChange={event => update({ buttonText: event.target.value })}/></label><label>Image URL<input value={page.imageUrl} onChange={event => update({ imageUrl: event.target.value })} placeholder="https://"/></label><label>Columns<select value={page.columns} onChange={event => update({ columns: Number(event.target.value) })}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option></select></label></div>;
}

function ColorField({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  return <label>{label}<span className={styles.colorField}><input type="color" value={value} onChange={event => change(event.target.value)}/><input value={value.toUpperCase()} onChange={event => change(event.target.value)}/></span></label>;
}
