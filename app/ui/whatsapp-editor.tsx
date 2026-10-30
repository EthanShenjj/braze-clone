"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Copy, FileText, Image as ImageIcon, Info, Link2, List,
  LockKeyhole, MessageCircle, MessageSquareText, MousePointerClick, Plus, RefreshCw,
  Trash2, Video,
} from "lucide-react";
import {
  whatsAppComposeStage, getWhatsAppTemplate, normalizeWhatsAppVariants, prepareWhatsAppMessage, validateWhatsAppCampaign, validateWhatsAppTemplate, whatsAppTemplateVariables,
  customWhatsAppTemplates, renderWhatsAppVariant, upsertCustomWhatsAppTemplate, whatsappTemplates,
  type WhatsAppResponseLayout, type WhatsAppTemplate, type WhatsAppVariant,
  type WhatsAppCampaignLike,
} from "@/lib/whatsapp-model";
import { smsLanguages } from "@/lib/sms-model";
import { LiquidButton } from "./channel-personalization";
import styles from "./whatsapp-editor.module.css";

type CampaignLike = { id?: string; body?: string; config?: Record<string, unknown> };

const responseLayouts: Array<{ value: WhatsAppResponseLayout; label: string; help: string; icon: typeof MessageCircle }> = [
  { value: "quick_reply", label: "Quick Reply", help: "Add up to three quick reply buttons and optional media", icon: MousePointerClick },
  { value: "text", label: "Text Message", help: "Send a message with up to 4,096 characters", icon: MessageSquareText },
  { value: "media", label: "Media Message", help: "Send an image, video, document, or audio file and optional caption", icon: ImageIcon },
  { value: "cta", label: "Call-to-action Button", help: "Add a button that links to a website URL", icon: Link2 },
  { value: "list", label: "List Message", help: "Show a list with up to 10 options for users to pick from", icon: List },
  { value: "carousel", label:"Carousel Message",help:"Send up to 10 cards, each with media, text, and buttons",icon:ImageIcon },
  { value: "flow", label:"Flow Message",help:"Prompt users to complete a form or interactive task in WhatsApp",icon:List },
  { value: "product", label:"Meta Product Messages",help:"Share a single product, multiple products, or an entire Meta catalog",icon:MessageSquareText },
];

function displayTemplate(templateId: string, extras?: ReturnType<typeof customWhatsAppTemplates>) {
  const template = getWhatsAppTemplate(templateId, extras);
  return `${template.name} · ${template.language}`;
}

export default function WhatsAppEditor({ draft, update, notify = () => {}, canvasId, nodeId }: { canvasId?: string; nodeId?: string; draft: CampaignLike; update: (patch: { body?: string; config?: Record<string, unknown> }) => void; notify?: (m: string) => void }) {
  const channelValues = (draft.config?.channelValues ?? {}) as Record<string, unknown>;
  const variants = normalizeWhatsAppVariants(draft);
  const customTemplates = customWhatsAppTemplates(draft);
  const templateFor = (id: string) => getWhatsAppTemplate(id, customTemplates);
  const [selected, setSelected] = useState(0);
  const [providerConfigured,setProviderConfigured]=useState(false),[syncError,setSyncError]=useState("");
  useEffect(()=>{fetch("/api/whatsapp/templates?capability=true").then(r=>r.json()).then(p=>setProviderConfigured(p.configured===true)).catch(()=>{});},[]);
  const [tab, setTab] = useState("compose");
  const [groups, setGroups] = useState<Array<{ id: string; name: string; channel: string; businessAccountName?: string }>>([]);
  const [layout, setLayout] = useState<WhatsAppResponseLayout | null>(null);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/subscription-groups?status=Active", { signal: controller.signal }).then(response => response.json()).then(result => setGroups((result.data ?? []).filter((group: { channel: string }) => group.channel === "WhatsApp"))).catch(() => {}); return () => controller.abort(); }, []);
  const active = variants[selected] ?? variants[0];
  const stage = whatsAppComposeStage(draft, active);

  const saveVariants = (next: WhatsAppVariant[], nextSelected = selected, templates = customTemplates, setupStage = draft.config?.whatsappSetupStage) => {
    const first = next[0];
    const template = getWhatsAppTemplate(first.templateId, templates);
    update({
      body: renderWhatsAppVariant(first, templates),
      config: {
        ...draft.config,
        whatsappVariants: next,
        whatsappSetupStage: setupStage,
        whatsappCustomTemplates: templates,
        channelValues: {
          ...((draft.config?.channelValues ?? {}) as Record<string, unknown>),
          messageMode: first.mode,
          businessAccount: first.businessAccount,
          template: `${template.name} · ${template.status}`,
          language: first.language,
          headerMedia: first.headerType === "image" ? "Image" : "None",
        },
      },
    });
    setSelected(Math.min(nextSelected, next.length - 1));
  };

  const patchActive = (patch: Partial<WhatsAppVariant>) => saveVariants(variants.map((variant, index) => index === selected ? { ...variant, ...patch } : variant),selected,customTemplates,patch.responseLayoutChosen ? "editor" : draft.config?.whatsappSetupStage);
  const chooseTemplate = (templateId: string) => {
    const template = templateFor(templateId);
    patchActive({
      templateId,
      language: template.language,
      headerType: template.headerType,
      variables: template.variables.map(variable => ({ ...variable, value: variable.example })),
      buttonUrl: template.button.url ?? "",
    });
  };
  const addVariant = () => {
    if(variants.length>=8)return;
    const next = { ...active, id: `wa_variant_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}` };
    saveVariants([...variants, next], variants.length);
  };
  const duplicateVariant = () => {
    if(variants.length>=8)return;
    const next = { ...active, id: `wa_variant_${crypto.randomUUID().slice(0, 8)}`, name: `${active.name} copy` };
    saveVariants([...variants, next], variants.length);
  };
  const removeVariant = () => {
    if (variants.length === 1) return;
    const next = variants.filter((_, index) => index !== selected);
    saveVariants(next, Math.max(0, selected - 1));
  };

  const selectType = (mode: WhatsAppVariant["mode"]) => { saveVariants(variants.map((variant,index)=>index===selected?{...variant,mode,messageTypeChosen:true,...(mode==="response"&&!variant.messageTypeChosen?{responseBody:"",language:"en"}:{})}:variant),selected,customTemplates,mode==="response"&&!active.responseLayoutChosen?"layout":"editor"); setTab("compose"); };
  const templateComposer = (management = false) => <TemplateComposer management={management} variant={active} patch={patchActive} chooseTemplate={chooseTemplate} customTemplates={customTemplates} draft={draft} update={update} onTemplateCreated={template => { const templates = upsertCustomWhatsAppTemplate(draft, template); const next = variants.map((variant, index) => index === selected ? { ...variant, templateId: template.id, language: template.language, headerType: template.headerType, variables: template.variables.map(variable => ({ ...variable, value: variable.example })), buttonUrl: template.button.url ?? "" } : variant); saveVariants(next, selected, templates); }}/ >;
  const accountName = groups.find(group=>group.id===draft.config?.subscriptionGroupId)?.businessAccountName ?? String(channelValues.businessAccountName ?? (active.businessAccount === "demo_waba" ? "Not specified" : active.businessAccount));
  return <div className={styles.workspace}>
    <p className={styles.composeHelp}>{active.mode === "response" ? "Compose a response to a user message within a 24-hour window." : "Send an approved WhatsApp template."}</p>
    <div className={styles.variantBar}><div><h3>Variants</h3><div className={styles.variantTabs} role="tablist" aria-label="WhatsApp variants">{variants.map((variant,index)=><button type="button" role="tab" aria-selected={index===selected} className={index===selected?styles.activeTab:""} onClick={()=>{setSelected(index);setLayout(null);}} key={variant.id}>{variant.name}</button>)}<button type="button" className={styles.addTab} aria-label="Add variant" disabled={variants.length>=8} onClick={addVariant}><Plus size={16}/></button></div></div><div className={styles.variantActions}><button type="button" className={styles.iconAction} aria-label="Duplicate variant" disabled={variants.length>=8} onClick={duplicateVariant}><Copy size={15}/></button><button type="button" className={styles.iconAction} aria-label="Delete variant" disabled={variants.length===1} onClick={removeVariant}><Trash2 size={15}/></button></div></div>
    <section className={styles.sendingIdentity}><label>Subscription Group<select aria-label="WhatsApp subscription group" value={String(draft.config?.subscriptionGroupId??"")} onChange={event=>{const group=groups.find(item=>item.id===event.target.value);update({config:{...draft.config,subscriptionGroupId:group?.id,whatsappVariants:variants.map(variant=>({...variant,subscriptionGroup:group?.name??""}))}});}}><option value="">Select a subscription group</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{stage!=="subscription"&&<div><span>WhatsApp business account</span><p>{accountName}</p></div>}</section>
    {(stage==="type"||stage==="layout")&&<><section className={styles.typeSelection}><h3>Message type</h3><div className={styles.modeCards} role="radiogroup" aria-label="Message type">{[{mode:"template" as const,label:"WhatsApp Template Message",help:"Required to start a business-initiated conversation. Pre-selected Liquid variables and media can be added to approved templates."},{mode:"response" as const,label:"Response Message",help:"Compose responses to user messages within a 24-hour window with images, Liquid variables, and quick replies."}].map(item=><button type="button" role="radio" aria-checked={stage!=="type"&&active.mode===item.mode} className={stage!=="type"&&active.mode===item.mode?styles.selectedMode:""} onClick={()=>selectType(item.mode)} key={item.mode}><span className={styles.radioDot}/><span><b>{item.label}</b><small>{item.help}</small></span></button>)}</div></section>{stage==="layout"&&<section className={styles.layoutSelection}><h3>Select a Response Message layout</h3><div className={styles.layoutGrid} role="radiogroup" aria-label="Response Message layout">{responseLayouts.map(item=>{const Icon=item.icon;return <button type="button" role="radio" aria-checked={layout===item.value} className={layout===item.value?styles.selectedLayout:""} onClick={()=>setLayout(item.value)} key={item.value}><Icon size={28}/><b>{item.value==="carousel"&&<em>New</em>}{item.label}</b><small>{item.help}</small></button>;})}</div><div className={styles.layoutFooter}><button type="button" className="primary" disabled={!layout} onClick={()=>patchActive({responseLayout:layout!,responseLayoutChosen:true})}>Select layout</button></div></section>}</>}
    {stage==="editor"&&<><div className={styles.typeControl}><label>{active.mode==="response"?"Response Message layout":"Message type"}{active.mode==="response"?<select aria-label="Response Message layout" value={active.responseLayout} onChange={event=>patchActive({responseLayout:event.target.value as WhatsAppResponseLayout,responseLayoutChosen:true})}>{responseLayouts.map(item=><option key={item.value} value={item.value}>{item.label.replace(" Message","")}</option>)}</select>:<p>WhatsApp Template Message</p>}</label><button type="button" className="secondary" onClick={()=>saveVariants(variants,selected,customTemplates,"type")}>Change message type</button></div>{active.mode==="response"&&<p className={styles.responseRule}>Response messages can only be sent in response to a user message within a 24 hour window.</p>}
    <div className={styles.composer}><WhatsAppPreview variant={active} templates={customTemplates}/><div className={styles.formColumn}><nav className={styles.composerTabs} aria-label="WhatsApp composer sections"><button type="button" aria-pressed={tab==="compose"} onClick={()=>setTab("compose")}>Compose</button><button type="button" aria-pressed={tab==="test"} onClick={()=>setTab("test")}>Test</button></nav>{tab==="compose"?(active.mode==="template"?templateComposer():<ResponseComposer key={active.id} variant={active} patch={patchActive}/>):<><WhatsAppTest draft={draft} variant={active} canvasId={canvasId} nodeId={nodeId}/><details className={styles.connectionTools}><summary>Connection and template tools</summary><p>{providerConfigured?"Meta template management is configured.":"Meta template management is not configured."}</p><label>Saved business account reference<input value={active.businessAccount} onChange={event=>patchActive({businessAccount:event.target.value})}/></label><button type="button" className="secondary" onClick={async()=>{setSyncError("");try{const response=await fetch("/api/whatsapp/templates"),payload=await response.json();if(!response.ok)throw new Error(payload.error);update({config:{...draft.config,whatsappCustomTemplates:payload.templates,channelValues:{...channelValues,lastTemplateSync:payload.syncedAt}}});notify(`${payload.templates.length} templates synchronized from Meta.`);}catch(error){setSyncError(error instanceof Error?error.message:"Synchronization failed.");}}}><RefreshCw size={15}/> Sync templates</button>{syncError&&<p role="alert">{syncError}</p>}{templateComposer(true)}</details></>}</div></div></>}
  </div>;
}

function TemplateComposer({ management = false, variant, patch, chooseTemplate, customTemplates, draft, update, onTemplateCreated }: { management?: boolean; onTemplateCreated: (template: WhatsAppTemplate) => void; variant: WhatsAppVariant; patch: (patch: Partial<WhatsAppVariant>) => void; chooseTemplate: (templateId: string) => void; customTemplates: WhatsAppTemplate[]; draft: WhatsAppCampaignLike; update: (patch: { body?: string; config?: Record<string, unknown> }) => void }) {
  const template = getWhatsAppTemplate(variant.templateId, customTemplates);
  const [listOpen, setListOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const allTemplates = [...customTemplates, ...whatsappTemplates];
  const [form, setForm] = useState({ name: "", category: "Marketing", language: "English (US)", headerType: "none" as WhatsAppTemplate["headerType"], body: "Hi {{1}}, here is your offer: {{2}}", footer: "", headerText: "" });
  const [formError, setFormError] = useState("");
  const submitTemplate = async () => {
    if (!form.name.trim() || !form.body.trim()) return;
    const id = `custom_${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20)}_${Date.now().toString(36).slice(-4)}`;
    const variableKeys = whatsAppTemplateVariables(form.body);
    const next: WhatsAppTemplate = { id, name: form.name.trim(), language: form.language, category: form.category as WhatsAppTemplate["category"], status: "Pending", headerType: form.headerType, headerText: form.headerText, body: form.body, footer: form.footer, variables: variableKeys.map(key => ({ key, label: `Variable ${key}`, example: "example", fallback: "" })), button: { type: "quick_reply", label: "OK" } };
    const issues = validateWhatsAppTemplate(next);
    if (issues.length) { setFormError(issues.join(" ")); return; }
    setFormError("");
    try {const response=await fetch("/api/whatsapp/templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)}),result=await response.json();if(!response.ok)throw new Error(result.error);onTemplateCreated(result);setSubmitOpen(false);}catch(e){setFormError(e instanceof Error?e.message:"Submission failed.");}
  };
  return <>
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><h3>Approved template</h3><p>Each language is a separate approved template.</p></div>{management && <button type="button" className={styles.textButton} aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>Manage templates</button>}</div>
      {listOpen && <div className={styles.templateMeta} style={{ display: "block", marginBottom: 10 }}>
        {allTemplates.map(item => <button type="button" key={item.id} className={styles.textButton} style={{ display: "flex", width: "100%", justifyContent: "space-between", padding: "8px 4px" }} onClick={() => { chooseTemplate(item.id); setListOpen(false); }}>
          <span><b>{item.name}</b> · {item.language}</span>
          <span>{item.category}{variant.templateId === item.id ? " · ✓ in use" : ""}</span>
        </button>)}
      </div>}
      <label>Template<select value={variant.templateId} onChange={event => chooseTemplate(event.target.value)}>{allTemplates.map(item => <option value={item.id} key={item.id}>{displayTemplate(item.id, customTemplates)} · {item.category} · {item.status}</option>)}</select></label>
      {management && <button type="button" className={styles.textButton} style={{ fontWeight: 750, padding: "8px 4px" }} onClick={() => setSubmitOpen(!submitOpen)}>{submitOpen ? "Cancel submission" : "+ Submit template"}</button>}
      {management && customTemplates.length > 0 && <div style={{ display: "grid", gap: 6, margin: "10px 0" }}>{customTemplates.filter(item => item.status === "Pending").map(item => <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #e3dfe6", borderRadius: 6, fontSize: 11 }}>
        <span style={{ flex: 1 }}><b>{item.name}</b> · {item.category} · <span style={{ color: "#a2701d" }}>Pending Meta review</span></span>
      </div>)}</div>}
      {management && <div className={styles.templateMeta}><span className={template.status === "Approved" ? styles.approved : styles.notReady}><Info size={14}/> {template.status}</span><span>{template.category}</span><span>{template.language}</span><span>{draft.config?.channelValues && (draft.config.channelValues as Record<string,unknown>).lastTemplateSync?`Last synced ${new Date(String((draft.config.channelValues as Record<string,unknown>).lastTemplateSync)).toLocaleString()}`:"Not synchronized"}</span></div>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><h3>Template content</h3><p>Approved copy is locked. Map each variable to recipient data or a fallback.</p></div><LockKeyhole size={16}/></div>
      {template.headerType === "text" && <div className={styles.lockedCopy}>{template.headerText}</div>}
      {template.headerType === "image" && <div className={styles.contentGroup}><div className={styles.contentLabel}><span><ImageIcon size={16}/> Header image</span><small>PNG or JPG · under 5 MB in production</small></div><label>Image URL<input value={variant.headerUrl} onChange={event => patch({ headerUrl: event.target.value })} placeholder="https://..."/></label></div>}
      <div className={styles.contentGroup}><div className={styles.contentLabel}><span><MessageSquareText size={16}/> Body</span><small>Approved template copy</small></div><div className={styles.lockedCopy}>{template.body}</div></div>
      <div className={styles.variableList}>{variant.variables.map((variable, index) => <div className={styles.variableRow} key={variable.key}><span className={styles.variableToken}>{`{{${variable.key}}}`}</span><div><b>{variable.label}</b><small>Example: {template.variables[index]?.example}</small></div><label>Value<input value={variable.value} onChange={event => patch({ variables: variant.variables.map(item => item.key === variable.key ? { ...item, value: event.target.value } : item) })}/></label><label>Fallback<input value={variable.fallback} onChange={event => patch({ variables: variant.variables.map(item => item.key === variable.key ? { ...item, fallback: event.target.value } : item) })}/></label></div>)}</div>
      {template.footer && <div className={styles.contentGroup}><div className={styles.contentLabel}><span><FileText size={16}/> Footer</span></div><div className={styles.lockedCopy}>{template.footer}</div></div>}
      <div className={styles.contentGroup}><div className={styles.contentLabel}><span><MousePointerClick size={16}/> Button</span><small>{template.button.type.replaceAll("_", " ")}</small></div><div className={styles.buttonConfig}><span>{template.button.label}</span>{template.button.type === "website" && <label>Destination URL<input value={variant.buttonUrl} onChange={event => patch({ buttonUrl: event.target.value })} placeholder="https://example.com/path/{{1}}"/></label>}</div></div>
      {template.status === "Pending" && <p style={{ color: "#a2701d", fontSize: 11, fontWeight: 750 }}>This template is pending Meta review and cannot be sent until approved.</p>}
      {submitOpen && <section className={styles.liquidSection} style={{ marginTop: 14 }}>
        <h3>Submit template for approval</h3>
        <label>Template name<input aria-label="Template name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. shipping_update"/></label>
        <label>Category<select aria-label="Template category" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option>Marketing</option><option>Utility</option><option>Authentication</option></select></label>
        <label>Language<select aria-label="Template language" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}><option>English (US)</option><option>Chinese (Simplified)</option><option>Japanese</option><option>Korean</option></select></label>
        <label>Header<select aria-label="Header type" value={form.headerType} onChange={event => setForm({ ...form, headerType: event.target.value as WhatsAppTemplate["headerType"] })}><option value="none">None</option><option value="text">Text</option><option value="image">Image</option></select></label>
        {form.headerType === "text" && <label>Header text<input aria-label="Template header text" maxLength={60} value={form.headerText} onChange={event => setForm({ ...form, headerText: event.target.value })}/></label>}<label>Body <small>(use {'{{1}}'}, {'{{2}}'}… for variables)</small><textarea aria-label="Template body" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })}/></label>
        <label>Footer <small>(Optional)</small><input aria-label="Template footer" value={form.footer} onChange={event => setForm({ ...form, footer: event.target.value })}/></label>
        {formError && <p role="alert">{formError}</p>}<div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="primary small" disabled={!form.name.trim() || !form.body.trim()} onClick={()=>void submitTemplate()}>Submit for approval</button>
          <button type="button" className="secondary small" onClick={() => setSubmitOpen(false)}>Cancel</button>
        </div>
      </section>}
    </section>
  </>;
}

function WhatsAppLanguages({languages,active,change}:{languages:string[];active:string;change:(languages:string[],active:string)=>void}) {
  const [open,setOpen] = useState(false);
  return <div className={styles.languageControl}><div><h3>Language</h3><button type="button" className={styles.textButton} aria-expanded={open} onClick={()=>setOpen(!open)}><Plus size={16}/> Add languages</button></div>{languages.length>1&&<select aria-label="Message language" value={active} onChange={event=>change(languages,event.target.value)}>{languages.map(code=><option key={code} value={code}>{smsLanguages.find(([id])=>id===code)?.[1]??code}</option>)}</select>}{open&&<fieldset><legend>Message languages</legend>{smsLanguages.map(([code,label])=><label key={code}><input type="checkbox" disabled={code==="en"} checked={languages.includes(code)} onChange={event=>{const next=event.target.checked?[...languages,code]:languages.filter(value=>value!==code);change(next,next.includes(active)?active:"en");}}/>{label}</label>)}</fieldset>}</div>;
}

function ResponseComposer({ variant, patch }: { variant: WhatsAppVariant; patch: (patch: Partial<WhatsAppVariant>) => void }) {
  const [language,setLanguage]=useState((variant.responseLanguages??["en"]).includes(variant.language)?variant.language:"en");
  const body = language==="en" ? variant.responseBody : variant.responseTranslations?.[language]??"";
  const patchBody = (value:string) => patch(language==="en"?{responseBody:value}:{responseTranslations:{...variant.responseTranslations,[language]:value}});
  return <section className={styles.section}><WhatsAppLanguages languages={variant.responseLanguages??["en"]} active={language} change={(responseLanguages,active)=>{patch({responseLanguages,language:active});setLanguage(active);}}/><div className={styles.contentHeading}><h3>Content</h3><LiquidButton insert={token=>patchBody(body+token)}/></div><label>Body<textarea rows={6} value={body} maxLength={variant.responseLayout==="text"?4096:1024} onChange={event=>patchBody(event.target.value)} placeholder="Your message"/><small className={styles.bodyCount}>{body.length}/{variant.responseLayout==="text"?4096:1024}</small></label>
    {variant.responseLayout === "media" && <div className={styles.twoColumns}><label>Media type<select value={variant.responseMediaType} onChange={event => patch({ responseMediaType: event.target.value as WhatsAppVariant["responseMediaType"] })}><option value="image">Image</option><option value="video">Video</option><option value="document">Document</option><option value="audio">Audio</option></select></label><label>Media URL<input value={variant.responseMediaUrl} onChange={event => patch({ responseMediaUrl: event.target.value })} placeholder="https://..."/></label></div>}
    {variant.responseLayout === "cta" && <div className={styles.twoColumns}><label>Button text<input value={variant.responseButtonText} onChange={event => patch({ responseButtonText: event.target.value })}/></label><label>Destination URL<input value={variant.responseButtonUrl} onChange={event => patch({ responseButtonUrl: event.target.value })}/></label></div>}
    {variant.responseLayout === "quick_reply" && <EditableOptions title="Quick replies" help="Up to 3 options" values={variant.quickReplies} limit={3} onChange={quickReplies => patch({ quickReplies })}/>} 
    {variant.responseLayout === "list" && <EditableOptions title="List options" help="Up to 10 options" values={variant.listOptions} limit={10} onChange={listOptions => patch({ listOptions })}/>} 
    {variant.responseLayout!=="text"&&<><label>Header text<input value={variant.responseHeaderText} maxLength={60} onChange={e=>patch({responseHeaderText:e.target.value})}/></label><label>Footer<input value={variant.responseFooter} maxLength={60} onChange={e=>patch({responseFooter:e.target.value})}/></label></>}
    {variant.responseLayout==="text"&&<div className={styles.linkOptions}><h3>URL preview</h3><label><input type="checkbox" checked={variant.urlPreview===true} onChange={e=>patch({urlPreview:e.target.checked})}/> Include a preview of the URL in the message</label></div>}<div className={styles.linkOptions}><h3>Link options</h3><label><input type="checkbox" checked={variant.clickTracking} onChange={e=>patch({clickTracking:e.target.checked})}/> Click Tracking</label><p>Track clicks on links included in your message.</p></div>
    {variant.responseLayout === "carousel" && <><div className={styles.twoColumns}><label>Card media type<select value={variant.carouselMediaType} onChange={e=>patch({carouselMediaType:e.target.value as "image"|"video"})}><option>image</option><option>video</option></select></label><label>Card button type<select value={variant.carouselButtonType} onChange={e=>patch({carouselButtonType:e.target.value as "website"|"quick_reply"})}><option value="website">Website</option><option value="quick_reply">Quick reply</option></select></label></div>{variant.carouselCards.map((card,i)=><fieldset key={card.id}><legend>Card {i+1}</legend><label>Media URL<input value={card.mediaUrl} onChange={e=>patch({carouselCards:variant.carouselCards.map((c,j)=>i===j?{...c,mediaUrl:e.target.value}:c)})}/></label><label>Card body<textarea maxLength={160} value={card.body} onChange={e=>patch({carouselCards:variant.carouselCards.map((c,j)=>i===j?{...c,body:e.target.value}:c)})}/></label>{card.buttons.map((b,j)=><div key={j}><label>Button text<input maxLength={20} value={b.label} onChange={e=>patch({carouselCards:variant.carouselCards.map((c,k)=>i===k?{...c,buttons:c.buttons.map((a,n)=>j===n?{...a,label:e.target.value}:a)}:c)})}/></label>{variant.carouselButtonType==="website"&&<label>Button URL<input value={b.url} onChange={e=>patch({carouselCards:variant.carouselCards.map((c,k)=>i===k?{...c,buttons:c.buttons.map((a,n)=>j===n?{...a,url:e.target.value}:a)}:c)})}/></label>}<button type="button" className={styles.textButton} onClick={()=>patch({carouselCards:variant.carouselCards.map((c,k)=>i===k?{...c,buttons:c.buttons.filter((_,n)=>j!==n)}:c)})}>Remove button</button></div>)}<button className={styles.textButton} disabled={card.buttons.length>=(variant.carouselButtonType==="website"?1:2)} onClick={()=>patch({carouselCards:variant.carouselCards.map((c,j)=>i===j?{...c,buttons:[...c.buttons,{label:"Open",url:"https://"}]}:c)})}>+ Add button</button><button className={styles.textButton} onClick={()=>patch({carouselCards:variant.carouselCards.filter((_,j)=>i!==j)})}>Remove card</button></fieldset>)}<button className={styles.textButton} disabled={variant.carouselCards.length>=10} onClick={()=>patch({carouselCards:[...variant.carouselCards,{id:crypto.randomUUID(),body:"",mediaUrl:"",buttons:[{label:"Open",url:"https://"}]}]})}>+ Add card</button></>}
    {variant.responseLayout === "flow" && <><label>Published Flow ID<input value={variant.flowId??""} onChange={e=>patch({flowId:e.target.value})}/></label><label>Flow button label<input value={variant.flowCta??"Open"} maxLength={20} onChange={e=>patch({flowCta:e.target.value})}/></label><label>Flow token<input value={variant.flowToken??""} onChange={e=>patch({flowToken:e.target.value})}/></label><label>Opening screen<input value={variant.flowScreen??""} onChange={e=>patch({flowScreen:e.target.value})}/></label></>}
    {variant.responseLayout === "product" && <><label>Product layout<select value={variant.productLayout} onChange={e=>patch({productLayout:e.target.value as WhatsAppVariant["productLayout"]})}><option value="catalog">Catalog</option><option value="single">Single product</option><option value="multi">Multiple products</option></select></label><label>Meta catalog ID<input value={variant.catalogId??""} onChange={e=>patch({catalogId:e.target.value})}/></label>{variant.productLayout!=="catalog"&&<label>Product retailer IDs (one per line)<textarea value={variant.productIds?.join("\n")??""} onChange={e=>patch({productIds:e.target.value.split("\n").filter(Boolean)})}/></label>}</>}
  </section>;
}

function EditableOptions({ title, help, values, limit, onChange }: { title: string; help: string; values: string[]; limit: number; onChange: (values: string[]) => void }) {
  return <div className={styles.optionsEditor}><div className={styles.contentLabel}><span><List size={16}/> {title}</span><small>{help}</small></div>{values.map((value, index) => <div key={index}><span>{index + 1}</span><input aria-label={`${title} option ${index + 1}`} maxLength={title === "Quick replies" ? 20 : 24} value={value} onChange={event => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><button type="button" aria-label={`Remove ${title} option ${index + 1}`} disabled={values.length === 1} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14}/></button></div>)}<button type="button" className={styles.textButton} disabled={values.length >= limit} onClick={() => onChange([...values, `Option ${values.length + 1}`])}><Plus size={14}/> Add option</button></div>;
}

function WhatsAppPreview({ variant, templates = [] }: { variant: WhatsAppVariant; templates?: WhatsAppTemplate[] }) {
  const template = getWhatsAppTemplate(variant.templateId, templates);
  const message = useMemo(() => { try { return prepareWhatsAppMessage(variant, templates, { language: variant.language??"en" }).message; } catch { return renderWhatsAppVariant(variant, templates); } }, [variant, templates]);
  const buttons = variant.mode === "template" ? [template.button.label] : variant.responseLayout === "quick_reply" ? variant.quickReplies : variant.responseLayout === "list" ? ["View options"] : variant.responseLayout === "cta" ? [variant.responseButtonText] : [];
  return <aside className={styles.previewColumn} aria-label="WhatsApp message preview"><h3 className={styles.sourcePreviewTitle}>Preview</h3><div className={styles.sourcePreview}><div className={styles.placeholderBubble} aria-hidden="true"/><article className={styles.bubble}>
          {variant.mode === "template" && template.headerType === "image" && <div className={styles.mediaPreview}>{variant.headerUrl ? <><ImageIcon size={30}/><span>Header image</span><small>{variant.headerUrl.replace(/^https?:\/\//, "").slice(0, 32)}</small></> : <><ImageIcon size={30}/><span>Add a header image</span></>}</div>}
          {variant.mode === "response" && variant.responseLayout === "media" && <div className={styles.mediaPreview}>{variant.responseMediaType === "video" ? <Video size={30}/> : variant.responseMediaType === "document" ? <FileText size={30}/> : <ImageIcon size={30}/>}<span>{variant.responseMediaType} attachment</span></div>}
          {variant.mode === "template" && template.headerType === "text" && <b>{template.headerText}</b>}<p>{message}</p>
          {variant.mode === "template" && template.footer && <small className={styles.footerText}>{template.footer}</small>}
          <time>8:21 AM</time>
          {buttons.filter(Boolean).map(button => <button type="button" key={button}>{variant.responseLayout === "list" ? <List size={14}/> : <Link2 size={14}/>} {button}</button>)}
          {variant.mode === "response" && variant.responseLayout === "list" && <div className={styles.listPreview}>{variant.listOptions.slice(0, 3).map(item => <span key={item}>{item}</span>)}</div>}
        </article>
  </div></aside>;
}

function WhatsAppTest({ draft, variant, canvasId, nodeId }: { draft: CampaignLike; variant: WhatsAppVariant; canvasId?: string; nodeId?: string }) {
  const [recipient, setRecipient] = useState("");
  const [attributes, setAttributes] = useState('{"first_name":"Carla","language":"en"}');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const extras = customWhatsAppTemplates(draft);
  const issues = validateWhatsAppCampaign({ config: { ...draft.config, whatsappVariants: [variant] } });
  if (!draft.config?.subscriptionGroupId) issues.push("Select an active WhatsApp subscription group.");
  let profile: Record<string, unknown> = {};
  let jsonError = "";
  try { const parsed = JSON.parse(attributes); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); profile = parsed; } catch { jsonError = "Enter a JSON object for preview user attributes."; }
  let preview = "";
  try { preview = prepareWhatsAppMessage(variant, extras, profile).message; } catch (cause) { preview = cause instanceof Error ? cause.message : "Unable to render preview."; }
  const send = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/whatsapp/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canvasId, nodeId, campaignId: canvasId ? undefined : draft.id, config: draft.config, variantId: variant.id, recipients: recipient.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean), override, profile }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare WhatsApp test.");
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare WhatsApp test."); }
    finally { setBusy(false); }
  };
  return <section className={styles.section} aria-label="WhatsApp Test">
    <div className={styles.sectionHeading}><div><h3>Preview and test · {variant.name}</h3><p>Preview the selected message and prepare a local test for individual recipients.</p></div></div>
    <div className={styles.twoColumns}><div>
      <label>Test recipients<input aria-label="WhatsApp test recipients" value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="External ids, emails, or phone numbers"/></label>
      <label className={styles.override}><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)}/> Override recipients&apos; attributes with preview user attributes</label>
      <label>Preview user attributes<textarea aria-label="WhatsApp preview user attributes" value={attributes} onChange={event => setAttributes(event.target.value)}/></label>
      {jsonError && <p role="alert">{jsonError}</p>}
      {issues.length > 0 && <ul className={styles.issues}>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <button className={styles.testButton} disabled={busy || !recipient.trim() || Boolean(issues.length) || Boolean(jsonError) || !canvasId && !draft.id} onClick={() => void send()}>{busy ? "Preparing…" : "Send Test"}</button>
    </div><div><h4>Rendered message</h4><pre className={styles.testPreview}>{preview}</pre>{result && <div role="status"><b>Test prepared. No WhatsApp message was delivered.</b><pre className={styles.testPreview}>{JSON.stringify(result.tests, null, 2)}</pre></div>}{error && <p role="alert">{error}</p>}</div></div>
  </section>;
}
