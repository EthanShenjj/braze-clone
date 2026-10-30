"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check, CheckCircle2, Copy, FileText, Image as ImageIcon, Info, Link2, List,
  LockKeyhole, MessageCircle, MessageSquareText, MousePointerClick, Phone, Plus, RefreshCw,
  Trash2, Video,
} from "lucide-react";
import {
  getWhatsAppTemplate, normalizeWhatsAppVariants, prepareWhatsAppMessage, validateWhatsAppCampaign, validateWhatsAppTemplate, whatsAppTemplateVariables,
  customWhatsAppTemplates, renderWhatsAppVariant, upsertCustomWhatsAppTemplate, whatsappAccounts, whatsappTemplates,
  type WhatsAppResponseLayout, type WhatsAppTemplate, type WhatsAppVariant,
  type WhatsAppCampaignLike,
} from "@/lib/whatsapp-model";
import styles from "./whatsapp-editor.module.css";

type CampaignLike = { id?: string; body?: string; config?: Record<string, unknown> };

const responseLayouts: Array<{ value: WhatsAppResponseLayout; label: string; help: string; icon: typeof MessageCircle }> = [
  { value: "text", label: "Text message", help: "A simple reply inside the conversation window", icon: MessageSquareText },
  { value: "quick_reply", label: "Quick reply", help: "Offer up to three tap-to-reply options", icon: MousePointerClick },
  { value: "media", label: "Media message", help: "Reply with an image, video, or document", icon: ImageIcon },
  { value: "cta", label: "Call-to-action", help: "Send one website action", icon: Link2 },
  { value: "list", label: "List message", help: "Present up to ten selectable options", icon: List },
];

function displayTemplate(templateId: string, extras?: ReturnType<typeof customWhatsAppTemplates>) {
  const template = getWhatsAppTemplate(templateId, extras);
  return `${template.name} · ${template.language}`;
}

export default function WhatsAppEditor({ draft, update, notify = () => {}, canvasId, nodeId }: { canvasId?: string; nodeId?: string; draft: CampaignLike; update: (patch: { body?: string; config?: Record<string, unknown> }) => void; notify?: (m: string) => void }) {
  const channelValues = (draft.config?.channelValues ?? {}) as Record<string, unknown>;
  const variants = normalizeWhatsAppVariants(draft);
  const customTemplates = customWhatsAppTemplates(draft);
  const allTemplates = [...customTemplates, ...whatsappTemplates];
  const templateFor = (id: string) => getWhatsAppTemplate(id, customTemplates);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState("compose");
  const [groups, setGroups] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/subscription-groups?status=Active", { signal: controller.signal }).then(response => response.json()).then(result => setGroups((result.data ?? []).filter((group: { channel: string }) => group.channel === "WhatsApp"))).catch(() => {}); return () => controller.abort(); }, []);
  const active = variants[selected] ?? variants[0];
  const ready = Boolean(draft.config?.subscriptionGroupId) && validateWhatsAppCampaign({ config: { ...draft.config, whatsappVariants: [active] } }).length === 0;

  const saveVariants = (next: WhatsAppVariant[], nextSelected = selected, templates = customTemplates) => {
    const first = next[0];
    const template = getWhatsAppTemplate(first.templateId, templates);
    update({
      body: renderWhatsAppVariant(first, templates),
      config: {
        ...draft.config,
        whatsappVariants: next,
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

  const patchActive = (patch: Partial<WhatsAppVariant>) => saveVariants(variants.map((variant, index) => index === selected ? { ...variant, ...patch } : variant));
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
    const next = { ...active, id: `wa_variant_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}` };
    saveVariants([...variants, next], variants.length);
  };
  const duplicateVariant = () => {
    const next = { ...active, id: `wa_variant_${crypto.randomUUID().slice(0, 8)}`, name: `${active.name} copy` };
    saveVariants([...variants, next], variants.length);
  };
  const removeVariant = () => {
    if (variants.length === 1) return;
    const next = variants.filter((_, index) => index !== selected);
    saveVariants(next, Math.max(0, selected - 1));
  };

  return <div className={styles.workspace}>
    <div className={styles.demoNotice}><Info size={17}/><div><b>WhatsApp demo mode</b><span>Composer behavior and validation are local. No message is sent to Meta or WhatsApp.</span></div><span className={styles.connection}><i/> Demo account connected</span></div>

    <div className={styles.variantBar}>
      <div><h3>Message variants</h3><p>Test different WhatsApp content while keeping the same audience and schedule.</p></div>
      <div className={styles.variantActions}>
        <div className={styles.variantTabs}>{variants.map((variant, index) => <button type="button" className={index === selected ? styles.activeTab : ""} onClick={() => setSelected(index)} key={variant.id}>{variant.name}<small>{variant.mode === "template" ? "Template" : "Response"}</small></button>)}<button type="button" className={styles.addTab} aria-label="Add WhatsApp variant" onClick={addVariant}><Plus size={16}/></button></div>
        <button type="button" className={styles.iconAction} title={`Sync ${allTemplates.length} templates from the local registry`} aria-label="Sync templates" onClick={() => { const at = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); update({ config: { ...draft.config, channelValues: { ...channelValues, lastTemplateSync: new Date().toISOString() } } }); notify(`${allTemplates.length} local WhatsApp templates synced (${at}).`); }}><RefreshCw size={15}/></button>
        <button type="button" className={styles.iconAction} aria-label="Duplicate variant" onClick={duplicateVariant}><Copy size={15}/></button>
        <button type="button" className={styles.iconAction} aria-label="Delete variant" disabled={variants.length === 1} onClick={removeVariant}><Trash2 size={15}/></button>
      </div>
    </div>

    <nav className={styles.composerTabs} aria-label="WhatsApp composer sections"><button aria-pressed={tab === "compose"} onClick={() => setTab("compose")}>Compose</button><button aria-pressed={tab === "test"} onClick={() => setTab("test")}>Test</button></nav>
    {tab === "test" ? <WhatsAppTest draft={draft} variant={active} canvasId={canvasId} nodeId={nodeId}/> : <div className={styles.composer}>
      <div className={styles.formColumn}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><h3>Sending configuration</h3><p>Choose the demo business identity and subscription group.</p></div><span className={ready ? styles.approved : styles.notReady}><Info size={14}/> {ready ? "Ready" : "Incomplete"}</span></div>
          <div className={styles.twoColumns}>
            <label>WhatsApp Business Account<select value={active.businessAccount} onChange={event => patchActive({ businessAccount: event.target.value })}>{whatsappAccounts.map(account => <option value={account.id} key={account.id}>{account.name} · {account.phone}</option>)}</select><small>Quality rating: High · Demo data</small></label>
            <label>Subscription group<select aria-label="WhatsApp subscription group" value={String(draft.config?.subscriptionGroupId ?? "")} onChange={event => { const group = groups.find(item => item.id === event.target.value); const next = variants.map(variant => ({ ...variant, subscriptionGroup: group?.name ?? "" })); update({ body: renderWhatsAppVariant(next[0], customTemplates), config: { ...draft.config, subscriptionGroupId: group?.id, whatsappVariants: next } }); }}><option value="">Select a subscription group</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><small>Only subscribed or opted-in users are eligible.</small></label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><h3>Message type</h3><p>Template messages start conversations. Response messages require an open 24-hour window.</p></div></div>
          <div className={styles.modeCards}>
            <button type="button" aria-pressed={active.mode === "template"} className={active.mode === "template" ? styles.selectedMode : ""} onClick={() => patchActive({ mode: "template" })}><LockKeyhole size={18}/><span><b>Template message</b><small>Use approved content to start a conversation</small></span>{active.mode === "template" && <Check size={16}/>}</button>
            <button type="button" aria-pressed={active.mode === "response"} className={active.mode === "response" ? styles.selectedMode : ""} onClick={() => patchActive({ mode: "response" })}><MessageCircle size={18}/><span><b>Response message</b><small>Reply to an inbound message within 24 hours</small></span>{active.mode === "response" && <Check size={16}/>}</button>
          </div>
        </section>

        {active.mode === "template" ? <TemplateComposer variant={active} patch={patchActive} chooseTemplate={chooseTemplate} customTemplates={customTemplates} draft={draft} update={update} onTemplateCreated={template => { const templates = upsertCustomWhatsAppTemplate(draft, template); const next = variants.map((variant, index) => index === selected ? { ...variant, templateId: template.id, language: template.language, headerType: template.headerType, variables: template.variables.map(variable => ({ ...variable, value: variable.example })), buttonUrl: template.button.url ?? "" } : variant); saveVariants(next, selected, templates); }}/> : <ResponseComposer variant={active} patch={patchActive}/>}
      </div>

      <WhatsAppPreview variant={active} templates={customTemplates} groupSelected={Boolean(draft.config?.subscriptionGroupId)}/>
    </div>}
  </div>;
}

function TemplateComposer({ variant, patch, chooseTemplate, customTemplates, draft, update, onTemplateCreated }: { onTemplateCreated: (template: WhatsAppTemplate) => void; variant: WhatsAppVariant; patch: (patch: Partial<WhatsAppVariant>) => void; chooseTemplate: (templateId: string) => void; customTemplates: WhatsAppTemplate[]; draft: WhatsAppCampaignLike; update: (patch: { body?: string; config?: Record<string, unknown> }) => void }) {
  const template = getWhatsAppTemplate(variant.templateId, customTemplates);
  const [listOpen, setListOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const allTemplates = [...customTemplates, ...whatsappTemplates];
  const [form, setForm] = useState({ name: "", category: "Marketing", language: "English (US)", headerType: "none" as WhatsAppTemplate["headerType"], body: "Hi {{1}}, here is your offer: {{2}}", footer: "", headerText: "" });
  const [formError, setFormError] = useState("");
  const submitTemplate = () => {
    if (!form.name.trim() || !form.body.trim()) return;
    const id = `custom_${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20)}_${Date.now().toString(36).slice(-4)}`;
    const variableKeys = whatsAppTemplateVariables(form.body);
    const next: WhatsAppTemplate = { id, name: form.name.trim(), language: form.language, category: form.category as WhatsAppTemplate["category"], status: "Pending", headerType: form.headerType, headerText: form.headerText, body: form.body, footer: form.footer, variables: variableKeys.map(key => ({ key, label: `Variable ${key}`, example: "example", fallback: "" })), button: { type: "quick_reply", label: "OK" } };
    const issues = validateWhatsAppTemplate(next);
    if (issues.length) { setFormError(issues.join(" ")); return; }
    setFormError("");
    onTemplateCreated(next);
    setSubmitOpen(false);
  };
  return <>
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><h3>Approved template</h3><p>Each language is a separate approved template.</p></div><button type="button" className={styles.textButton} aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>Manage templates</button></div>
      {listOpen && <div className={styles.templateMeta} style={{ display: "block", marginBottom: 10 }}>
        {allTemplates.map(item => <button type="button" key={item.id} className={styles.textButton} style={{ display: "flex", width: "100%", justifyContent: "space-between", padding: "8px 4px" }} onClick={() => { chooseTemplate(item.id); setListOpen(false); }}>
          <span><b>{item.name}</b> · {item.language}</span>
          <span>{item.category}{variant.templateId === item.id ? " · ✓ in use" : ""}</span>
        </button>)}
      </div>}
      <label>Template<select value={variant.templateId} onChange={event => chooseTemplate(event.target.value)}>{allTemplates.map(item => <option value={item.id} key={item.id}>{displayTemplate(item.id, customTemplates)} · {item.category} · {item.status}</option>)}</select></label>
      <button type="button" className={styles.textButton} style={{ fontWeight: 750, padding: "8px 4px" }} onClick={() => setSubmitOpen(!submitOpen)}>{submitOpen ? "Cancel submission" : "+ Submit template"}</button>
      {customTemplates.length > 0 && <div style={{ display: "grid", gap: 6, margin: "10px 0" }}>{customTemplates.filter(item => item.status === "Pending").map(item => <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #e3dfe6", borderRadius: 6, fontSize: 11 }}>
        <span style={{ flex: 1 }}><b>{item.name}</b> · {item.category} · <span style={{ color: "#a2701d" }}>Pending Meta review</span></span>
        <button type="button" className="secondary small" onClick={() => update({ config: { ...draft.config, whatsappCustomTemplates: upsertCustomWhatsAppTemplate(draft, { ...item, status: "Approved" }) } })}>Simulate approval</button>
        <button type="button" className="secondary small" style={{ color: "#a4474f" }} onClick={() => update({ config: { ...draft.config, whatsappCustomTemplates: upsertCustomWhatsAppTemplate(draft, { ...item, status: "Rejected" }) } })}>Reject</button>
      </div>)}</div>}
      <div className={styles.templateMeta}><span className={template.status === "Approved" ? styles.approved : styles.notReady}><Info size={14}/> {template.status}</span><span>{template.category}</span><span>{template.language}</span><span>Last synced just now</span></div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><h3>Template content</h3><p>Approved copy is locked. Map each variable to demo profile data or a fallback.</p></div><LockKeyhole size={16}/></div>
      {template.headerType === "text" && <div className={styles.lockedCopy}>{template.headerText}</div>}
      {template.headerType === "image" && <div className={styles.contentGroup}><div className={styles.contentLabel}><span><ImageIcon size={16}/> Header image</span><small>PNG or JPG · under 5 MB in production</small></div><label>Image URL<input value={variant.headerUrl} onChange={event => patch({ headerUrl: event.target.value })} placeholder="https://..."/></label></div>}
      <div className={styles.contentGroup}><div className={styles.contentLabel}><span><MessageSquareText size={16}/> Body</span><small>Approved template copy</small></div><div className={styles.lockedCopy}>{template.body}</div></div>
      <div className={styles.variableList}>{variant.variables.map((variable, index) => <div className={styles.variableRow} key={variable.key}><span className={styles.variableToken}>{`{{${variable.key}}}`}</span><div><b>{variable.label}</b><small>Example: {template.variables[index]?.example}</small></div><label>Value<input value={variable.value} onChange={event => patch({ variables: variant.variables.map(item => item.key === variable.key ? { ...item, value: event.target.value } : item) })}/></label><label>Fallback<input value={variable.fallback} onChange={event => patch({ variables: variant.variables.map(item => item.key === variable.key ? { ...item, fallback: event.target.value } : item) })}/></label></div>)}</div>
      {template.footer && <div className={styles.contentGroup}><div className={styles.contentLabel}><span><FileText size={16}/> Footer</span></div><div className={styles.lockedCopy}>{template.footer}</div></div>}
      <div className={styles.contentGroup}><div className={styles.contentLabel}><span><MousePointerClick size={16}/> Button</span><small>{template.button.type.replaceAll("_", " ")}</small></div><div className={styles.buttonConfig}><span>{template.button.label}</span>{template.button.type === "website" && <label>Destination URL<input value={variant.buttonUrl} onChange={event => patch({ buttonUrl: event.target.value })} placeholder="https://example.com/path/{{1}}"/></label>}</div></div>
      {template.status === "Pending" && <p style={{ color: "#a2701d", fontSize: 11, fontWeight: 750 }}>This template is pending Meta review — simulate approval from the banner above before sending.</p>}
      {submitOpen && <section className={styles.liquidSection} style={{ marginTop: 14 }}>
        <h3>Submit template for approval</h3>
        <label>Template name<input aria-label="Template name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. shipping_update"/></label>
        <label>Category<select aria-label="Template category" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option>Marketing</option><option>Utility</option><option>Authentication</option></select></label>
        <label>Language<select aria-label="Template language" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}><option>English (US)</option><option>Chinese (Simplified)</option><option>Japanese</option><option>Korean</option></select></label>
        <label>Header<select aria-label="Header type" value={form.headerType} onChange={event => setForm({ ...form, headerType: event.target.value as WhatsAppTemplate["headerType"] })}><option value="none">None</option><option value="text">Text</option><option value="image">Image</option></select></label>
        {form.headerType === "text" && <label>Header text<input aria-label="Template header text" maxLength={60} value={form.headerText} onChange={event => setForm({ ...form, headerText: event.target.value })}/></label>}<label>Body <small>(use {'{{1}}'}, {'{{2}}'}… for variables)</small><textarea aria-label="Template body" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })}/></label>
        <label>Footer <small>(Optional)</small><input aria-label="Template footer" value={form.footer} onChange={event => setForm({ ...form, footer: event.target.value })}/></label>
        {formError && <p role="alert">{formError}</p>}<div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="primary small" disabled={!form.name.trim() || !form.body.trim()} onClick={submitTemplate}>Submit for approval</button>
          <button type="button" className="secondary small" onClick={() => setSubmitOpen(false)}>Cancel</button>
        </div>
      </section>}
    </section>
  </>;
}

function ResponseComposer({ variant, patch }: { variant: WhatsAppVariant; patch: (patch: Partial<WhatsAppVariant>) => void }) {
  return <section className={styles.section}>
    <div className={styles.sessionNotice}><div><MessageCircle size={18}/><span><b>24-hour conversation window</b><small>Response messages are only eligible after an inbound WhatsApp message.</small></span></div><label className={styles.windowToggle}><input type="checkbox" checked={variant.conversationWindowOpen} onChange={event => patch({ conversationWindowOpen: event.target.checked })}/><span/>Simulate open window</label></div>
    <div className={styles.sectionHeading}><div><h3>Response layout</h3><p>Choose the interaction that best fits the inbound conversation.</p></div></div>
    <div className={styles.layoutGrid}>{responseLayouts.map(item => { const Icon = item.icon; return <button type="button" aria-pressed={variant.responseLayout === item.value} className={variant.responseLayout === item.value ? styles.selectedLayout : ""} onClick={() => patch({ responseLayout: item.value })} key={item.value}><Icon size={18}/><span><b>{item.label}</b><small>{item.help}</small></span></button>; })}</div>
    <label>Message<textarea rows={4} value={variant.responseBody} onChange={event => patch({ responseBody: event.target.value })} placeholder="Write a response message"/><small>{variant.responseBody.length} characters</small></label>
    {variant.responseLayout === "media" && <div className={styles.twoColumns}><label>Media type<select value={variant.responseMediaType} onChange={event => patch({ responseMediaType: event.target.value as WhatsAppVariant["responseMediaType"] })}><option value="image">Image</option><option value="video">Video</option><option value="document">Document</option></select></label><label>Media URL<input value={variant.responseMediaUrl} onChange={event => patch({ responseMediaUrl: event.target.value })} placeholder="https://..."/></label></div>}
    {variant.responseLayout === "cta" && <div className={styles.twoColumns}><label>Button text<input value={variant.responseButtonText} onChange={event => patch({ responseButtonText: event.target.value })}/></label><label>Destination URL<input value={variant.responseButtonUrl} onChange={event => patch({ responseButtonUrl: event.target.value })}/></label></div>}
    {variant.responseLayout === "quick_reply" && <EditableOptions title="Quick replies" help="Up to 3 options" values={variant.quickReplies} limit={3} onChange={quickReplies => patch({ quickReplies })}/>} 
    {variant.responseLayout === "list" && <EditableOptions title="List options" help="Up to 10 options" values={variant.listOptions} limit={10} onChange={listOptions => patch({ listOptions })}/>} 
  </section>;
}

function EditableOptions({ title, help, values, limit, onChange }: { title: string; help: string; values: string[]; limit: number; onChange: (values: string[]) => void }) {
  return <div className={styles.optionsEditor}><div className={styles.contentLabel}><span><List size={16}/> {title}</span><small>{help}</small></div>{values.map((value, index) => <div key={index}><span>{index + 1}</span><input aria-label={`${title} option ${index + 1}`} maxLength={title === "Quick replies" ? 20 : 24} value={value} onChange={event => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><button type="button" aria-label={`Remove ${title} option ${index + 1}`} disabled={values.length === 1} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14}/></button></div>)}<button type="button" className={styles.textButton} disabled={values.length >= limit} onClick={() => onChange([...values, `Option ${values.length + 1}`])}><Plus size={14}/> Add option</button></div>;
}

function WhatsAppPreview({ variant, templates = [], groupSelected = false }: { variant: WhatsAppVariant; templates?: WhatsAppTemplate[]; groupSelected?: boolean }) {
  const template = getWhatsAppTemplate(variant.templateId, templates);
  const [device, setDevice] = useState("WhatsApp · iPhone");
  const message = useMemo(() => { try { return prepareWhatsAppMessage(variant, templates, { first_name: "Carla", last_name: "Rodriguez", language: "en" }).message; } catch { return renderWhatsAppVariant(variant, templates); } }, [variant, templates]);
  const account = whatsappAccounts.find(item => item.id === variant.businessAccount) ?? whatsappAccounts[0];
  const buttons = variant.mode === "template" ? [template.button.label] : variant.responseLayout === "quick_reply" ? variant.quickReplies : variant.responseLayout === "list" ? ["View options"] : variant.responseLayout === "cta" ? [variant.responseButtonText] : [];
  return <aside className={styles.previewColumn}>
    <div className={styles.previewHeader}><div><h3>Preview</h3><p>Personalized for <b>Carla Rodriguez</b></p></div><select aria-label="Preview device" value={device} onChange={event => setDevice(event.target.value)}><option>WhatsApp · iPhone</option><option>WhatsApp · Android</option></select></div>
    <div className={styles.phone} style={device.includes("Android") ? { maxWidth: 340, borderRadius: 4 } : undefined}>
      <div className={styles.phoneStatus}><span>9:41</span><span>● ●●</span></div>
      <div className={styles.whatsAppBar}><span className={styles.back}>‹</span><span className={styles.avatar}>{account.name.slice(0, 1)}</span><div><b>{account.name}</b><small>business account</small></div><Video size={17}/><Phone size={16}/></div>
      <div className={styles.chat}>
        <div className={styles.encryption}>Messages are end-to-end encrypted. This is a local preview.</div>
        <div className={styles.day}>Today</div>
        <article className={styles.bubble}>
          {variant.mode === "template" && template.headerType === "image" && <div className={styles.mediaPreview}>{variant.headerUrl ? <><ImageIcon size={30}/><span>Header image</span><small>{variant.headerUrl.replace(/^https?:\/\//, "").slice(0, 32)}</small></> : <><ImageIcon size={30}/><span>Add a header image</span></>}</div>}
          {variant.mode === "response" && variant.responseLayout === "media" && <div className={styles.mediaPreview}>{variant.responseMediaType === "video" ? <Video size={30}/> : variant.responseMediaType === "document" ? <FileText size={30}/> : <ImageIcon size={30}/>}<span>{variant.responseMediaType} attachment</span></div>}
          {variant.mode === "template" && template.headerType === "text" && <b>{template.headerText}</b>}<p>{message}</p>
          {variant.mode === "template" && template.footer && <small className={styles.footerText}>{template.footer}</small>}
          <time>9:41 AM ✓✓</time>
          {buttons.filter(Boolean).map(button => <button type="button" key={button}>{variant.responseLayout === "list" ? <List size={14}/> : <Link2 size={14}/>} {button}</button>)}
          {variant.mode === "response" && variant.responseLayout === "list" && <div className={styles.listPreview}>{variant.listOptions.slice(0, 3).map(item => <span key={item}>{item}</span>)}</div>}
        </article>
      </div>
      <div className={styles.phoneInput}><Plus size={16}/><span>Message</span><MessageCircle size={16}/></div>
    </div>
    <div className={styles.previewChecklist}><h4>Message readiness</h4><p className={variant.mode === "template" && template.status !== "Approved" ? styles.missing : ""}><Info size={15}/> {variant.mode === "template" ? `${template.status} template selected` : "Response layout configured"}</p><p className={!groupSelected ? styles.missing : ""}>{groupSelected ? <CheckCircle2 size={15}/> : <Info size={15}/>} Subscription group selected</p><p className={variant.mode === "response" && !variant.conversationWindowOpen ? styles.missing : ""}>{variant.mode === "template" || variant.conversationWindowOpen ? <CheckCircle2 size={15}/> : <Info size={15}/>} {variant.mode === "template" ? "Conversation can be initiated" : variant.conversationWindowOpen ? "Simulated window is open" : "Open a simulated conversation window"}</p></div>
  </aside>;
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
