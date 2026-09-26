"use client";

import { useMemo, useState } from "react";
import {
  Check, CheckCircle2, Copy, FileText, Image as ImageIcon, Info, Link2, List,
  LockKeyhole, MessageCircle, MessageSquareText, MousePointerClick, Phone, Plus, RefreshCw,
  Trash2, Video,
} from "lucide-react";
import {
  getWhatsAppTemplate, normalizeWhatsAppVariants,
  renderWhatsAppVariant, whatsappAccounts, whatsappTemplates,
  type WhatsAppResponseLayout, type WhatsAppVariant,
} from "@/lib/whatsapp-model";
import styles from "./whatsapp-editor.module.css";

type CampaignLike = { body?: string; config?: Record<string, unknown> };

const responseLayouts: Array<{ value: WhatsAppResponseLayout; label: string; help: string; icon: typeof MessageCircle }> = [
  { value: "text", label: "Text message", help: "A simple reply inside the conversation window", icon: MessageSquareText },
  { value: "quick_reply", label: "Quick reply", help: "Offer up to three tap-to-reply options", icon: MousePointerClick },
  { value: "media", label: "Media message", help: "Reply with an image, video, or document", icon: ImageIcon },
  { value: "cta", label: "Call-to-action", help: "Send one website action", icon: Link2 },
  { value: "list", label: "List message", help: "Present up to ten selectable options", icon: List },
];

function displayTemplate(templateId: string) {
  const template = getWhatsAppTemplate(templateId);
  return `${template.name} · ${template.language}`;
}

export default function WhatsAppEditor({ draft, update, notify = () => {} }: { draft: CampaignLike; update: (patch: { body?: string; config?: Record<string, unknown> }) => void; notify?: (m: string) => void }) {
  const channelValues = (draft.config?.channelValues ?? {}) as Record<string, unknown>;
  const variants = normalizeWhatsAppVariants(draft);
  const [selected, setSelected] = useState(0);
  const active = variants[selected] ?? variants[0];

  const saveVariants = (next: WhatsAppVariant[], nextSelected = selected) => {
    const first = next[0];
    const template = getWhatsAppTemplate(first.templateId);
    update({
      body: renderWhatsAppVariant(first),
      config: {
        ...draft.config,
        whatsappVariants: next,
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
    const template = getWhatsAppTemplate(templateId);
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
        <button type="button" className={styles.iconAction} title={`Sync ${whatsappTemplates.length} templates from the local registry`} aria-label="Sync templates" onClick={() => { const at = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); update({ config: { ...draft.config, channelValues: { ...channelValues, lastTemplateSync: new Date().toISOString() } } }); notify(`${whatsappTemplates.length} WhatsApp templates synced (${at}).`); }}><RefreshCw size={15}/></button>
        <button type="button" className={styles.iconAction} aria-label="Duplicate variant" onClick={duplicateVariant}><Copy size={15}/></button>
        <button type="button" className={styles.iconAction} aria-label="Delete variant" disabled={variants.length === 1} onClick={removeVariant}><Trash2 size={15}/></button>
      </div>
    </div>

    <div className={styles.composer}>
      <div className={styles.formColumn}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><h3>Sending configuration</h3><p>Choose the demo business identity and subscription group.</p></div><span className={styles.approved}><CheckCircle2 size={14}/> Ready</span></div>
          <div className={styles.twoColumns}>
            <label>WhatsApp Business Account<select value={active.businessAccount} onChange={event => patchActive({ businessAccount: event.target.value })}>{whatsappAccounts.map(account => <option value={account.id} key={account.id}>{account.name} · {account.phone}</option>)}</select><small>Quality rating: High · Demo data</small></label>
            <label>Subscription group<select value={active.subscriptionGroup} onChange={event => patchActive({ subscriptionGroup: event.target.value })}><option>WhatsApp updates</option><option>Order notifications</option><option>Account security</option></select><small>Only subscribed or opted-in users are eligible.</small></label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><h3>Message type</h3><p>Template messages start conversations. Response messages require an open 24-hour window.</p></div></div>
          <div className={styles.modeCards}>
            <button type="button" aria-pressed={active.mode === "template"} className={active.mode === "template" ? styles.selectedMode : ""} onClick={() => patchActive({ mode: "template" })}><LockKeyhole size={18}/><span><b>Template message</b><small>Use approved content to start a conversation</small></span>{active.mode === "template" && <Check size={16}/>}</button>
            <button type="button" aria-pressed={active.mode === "response"} className={active.mode === "response" ? styles.selectedMode : ""} onClick={() => patchActive({ mode: "response" })}><MessageCircle size={18}/><span><b>Response message</b><small>Reply to an inbound message within 24 hours</small></span>{active.mode === "response" && <Check size={16}/>}</button>
          </div>
        </section>

        {active.mode === "template" ? <TemplateComposer variant={active} patch={patchActive} chooseTemplate={chooseTemplate}/> : <ResponseComposer variant={active} patch={patchActive}/>} 
      </div>

      <WhatsAppPreview variant={active}/>
    </div>
  </div>;
}

function TemplateComposer({ variant, patch, chooseTemplate }: { variant: WhatsAppVariant; patch: (patch: Partial<WhatsAppVariant>) => void; chooseTemplate: (templateId: string) => void }) {
  const template = getWhatsAppTemplate(variant.templateId);
  return <>
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><h3>Approved template</h3><p>Each language is a separate approved template.</p></div><button type="button" className={styles.textButton}>Manage templates</button></div>
      <label>Template<select value={variant.templateId} onChange={event => chooseTemplate(event.target.value)}>{whatsappTemplates.map(item => <option value={item.id} key={item.id}>{displayTemplate(item.id)} · {item.category}</option>)}</select></label>
      <div className={styles.templateMeta}><span className={styles.approved}><CheckCircle2 size={14}/> {template.status}</span><span>{template.category}</span><span>{template.language}</span><span>Last synced just now</span></div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><h3>Template content</h3><p>Approved copy is locked. Map each variable to demo profile data or a fallback.</p></div><LockKeyhole size={16}/></div>
      {template.headerType === "image" && <div className={styles.contentGroup}><div className={styles.contentLabel}><span><ImageIcon size={16}/> Header image</span><small>PNG or JPG · under 5 MB in production</small></div><label>Image URL<input value={variant.headerUrl} onChange={event => patch({ headerUrl: event.target.value })} placeholder="https://..."/></label></div>}
      <div className={styles.contentGroup}><div className={styles.contentLabel}><span><MessageSquareText size={16}/> Body</span><small>Approved template copy</small></div><div className={styles.lockedCopy}>{template.body}</div></div>
      <div className={styles.variableList}>{variant.variables.map((variable, index) => <div className={styles.variableRow} key={variable.key}><span className={styles.variableToken}>{`{{${variable.key}}}`}</span><div><b>{variable.label}</b><small>Example: {template.variables[index]?.example}</small></div><label>Value<input value={variable.value} onChange={event => patch({ variables: variant.variables.map(item => item.key === variable.key ? { ...item, value: event.target.value } : item) })}/></label><label>Fallback<input value={variable.fallback} onChange={event => patch({ variables: variant.variables.map(item => item.key === variable.key ? { ...item, fallback: event.target.value } : item) })}/></label></div>)}</div>
      {template.footer && <div className={styles.contentGroup}><div className={styles.contentLabel}><span><FileText size={16}/> Footer</span></div><div className={styles.lockedCopy}>{template.footer}</div></div>}
      <div className={styles.contentGroup}><div className={styles.contentLabel}><span><MousePointerClick size={16}/> Button</span><small>{template.button.type.replaceAll("_", " ")}</small></div><div className={styles.buttonConfig}><span>{template.button.label}</span>{template.button.type === "website" && <label>Destination URL<input value={variant.buttonUrl} onChange={event => patch({ buttonUrl: event.target.value })} placeholder="https://example.com/path/{{1}}"/></label>}</div></div>
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
  return <div className={styles.optionsEditor}><div className={styles.contentLabel}><span><List size={16}/> {title}</span><small>{help}</small></div>{values.map((value, index) => <div key={index}><span>{index + 1}</span><input value={value} onChange={event => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><button type="button" aria-label={`Remove ${title} option ${index + 1}`} disabled={values.length === 1} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14}/></button></div>)}<button type="button" className={styles.textButton} disabled={values.length >= limit} onClick={() => onChange([...values, `Option ${values.length + 1}`])}><Plus size={14}/> Add option</button></div>;
}

function WhatsAppPreview({ variant }: { variant: WhatsAppVariant }) {
  const template = getWhatsAppTemplate(variant.templateId);
  const message = useMemo(() => renderWhatsAppVariant(variant), [variant]);
  const account = whatsappAccounts.find(item => item.id === variant.businessAccount) ?? whatsappAccounts[0];
  const buttons = variant.mode === "template" ? [template.button.label] : variant.responseLayout === "quick_reply" ? variant.quickReplies : variant.responseLayout === "list" ? ["View options"] : variant.responseLayout === "cta" ? [variant.responseButtonText] : [];
  return <aside className={styles.previewColumn}>
    <div className={styles.previewHeader}><div><h3>Preview</h3><p>Personalized for <b>Carla Rodriguez</b></p></div><select aria-label="Preview device"><option>WhatsApp · iPhone</option><option>WhatsApp · Android</option></select></div>
    <div className={styles.phone}>
      <div className={styles.phoneStatus}><span>9:41</span><span>● ●●</span></div>
      <div className={styles.whatsAppBar}><span className={styles.back}>‹</span><span className={styles.avatar}>{account.name.slice(0, 1)}</span><div><b>{account.name}</b><small>business account</small></div><Video size={17}/><Phone size={16}/></div>
      <div className={styles.chat}>
        <div className={styles.encryption}>Messages are end-to-end encrypted. This is a local preview.</div>
        <div className={styles.day}>Today</div>
        <article className={styles.bubble}>
          {variant.mode === "template" && template.headerType === "image" && <div className={styles.mediaPreview}>{variant.headerUrl ? <><ImageIcon size={30}/><span>Header image</span><small>{variant.headerUrl.replace(/^https?:\/\//, "").slice(0, 32)}</small></> : <><ImageIcon size={30}/><span>Add a header image</span></>}</div>}
          {variant.mode === "response" && variant.responseLayout === "media" && <div className={styles.mediaPreview}>{variant.responseMediaType === "video" ? <Video size={30}/> : variant.responseMediaType === "document" ? <FileText size={30}/> : <ImageIcon size={30}/>}<span>{variant.responseMediaType} attachment</span></div>}
          <p>{message}</p>
          {variant.mode === "template" && template.footer && <small className={styles.footerText}>{template.footer}</small>}
          <time>9:41 AM ✓✓</time>
          {buttons.filter(Boolean).map(button => <button type="button" key={button}>{variant.responseLayout === "list" ? <List size={14}/> : <Link2 size={14}/>} {button}</button>)}
          {variant.mode === "response" && variant.responseLayout === "list" && <div className={styles.listPreview}>{variant.listOptions.slice(0, 3).map(item => <span key={item}>{item}</span>)}</div>}
        </article>
      </div>
      <div className={styles.phoneInput}><Plus size={16}/><span>Message</span><MessageCircle size={16}/></div>
    </div>
    <div className={styles.previewChecklist}><h4>Message readiness</h4><p><CheckCircle2 size={15}/> {variant.mode === "template" ? "Approved template selected" : "Response layout configured"}</p><p className={!variant.subscriptionGroup ? styles.missing : ""}>{variant.subscriptionGroup ? <CheckCircle2 size={15}/> : <Info size={15}/>} Subscription group selected</p><p className={variant.mode === "response" && !variant.conversationWindowOpen ? styles.missing : ""}>{variant.mode === "template" || variant.conversationWindowOpen ? <CheckCircle2 size={15}/> : <Info size={15}/>} {variant.mode === "template" ? "Conversation can be initiated" : variant.conversationWindowOpen ? "Simulated window is open" : "Open a simulated conversation window"}</p></div>
  </aside>;
}
