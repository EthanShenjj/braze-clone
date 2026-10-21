"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Bell, Check, Copy, ExternalLink, Info, Link as LinkIcon, Mail, MessageCircle, Plus, Send, Smartphone, Sparkles, UserRound, Webhook, X } from "lucide-react";
import type { CanvasNode } from "@/lib/canvas-model";
import { smsIssues, smsLanguageSnippet, smsLanguages, smsMetrics, smsPreview } from "@/lib/sms-model";
import styles from "./canvas-sms-editor.module.css";

type Group = { id: string; name: string; channel: string };
type PreviewUser = { id: string; firstName: string; email: string; attributes: Record<string, unknown>; country: string };
type Config = NonNullable<CanvasNode["config"]>;
const attributes = ["first_name", "last_name", "email_address", "phone_number", "city", "country", "language", "user_id"];
const channelChoices = [
  ["banner", "Banner", Bell], ["content", "Content Cards", Mail], ["email", "Email", Mail],
  ["line", "LINE", MessageCircle], ["push", "Push notifications", Smartphone], ["sms", "SMS/MMS/RCS", MessageCircle],
  ["iam", "In-App Messages", Smartphone], ["webhook", "Webhook", Webhook], ["whatsapp", "WhatsApp", MessageCircle],
] as const;

export default function CanvasSmsEditor({ node, canvasId, groups, connected, testAvailable, onDone, onOtherChannel }: {
  node: CanvasNode; canvasId: string; groups: Group[]; connected: boolean; testAvailable: boolean;
  onDone: (config: Config) => void; onOtherChannel: (channel: string) => void;
}) {
  const [config, setConfig] = useState<Config>(() => ({ ...node.config }));
  const [channelPicker, setChannelPicker] = useState(!node.config?.channel);
  const [section, setSection] = useState("channels");
  const [tab, setTab] = useState("compose");
  const [overlay, setOverlay] = useState<"liquid" | "languages" | null>(null);
  const [personalizationType, setPersonalizationType] = useState("Default Attributes");
  const [attribute, setAttribute] = useState("");
  const [fallback, setFallback] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [languageMenu, setLanguageMenu] = useState(false);
  const [languageFields, setLanguageFields] = useState({ message: false, image: false });
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [override, setOverride] = useState(false);
  const [previewMode, setPreviewMode] = useState("random");
  const [users, setUsers] = useState<PreviewUser[]>([]);
  const [previewUser, setPreviewUser] = useState<PreviewUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [customJson, setCustomJson] = useState('{\n  "first_name": "Alex",\n  "language": "en"\n}');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);
  const [review, setReview] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const values = (config.channelValues ?? {}) as Record<string, unknown>;
  const message = config.message ?? "";
  const shorten = values.linkShortening !== false;
  const groupId = String(config.subscriptionGroupId ?? "");
  const patch = (value: Partial<Config>) => setConfig(current => ({ ...current, ...value }));
  const patchValues = (value: Record<string, unknown>) => patch({ channelValues: { ...values, ...value } });
  const profile = useMemo(() => {
    if (previewMode === "custom") { try { const value: unknown = JSON.parse(customJson); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } }
    return previewUser ? { ...previewUser.attributes, first_name: previewUser.firstName, email_address: previewUser.email, country: previewUser.country, user_id: previewUser.id } : {};
  }, [customJson, previewMode, previewUser]);
  const rendered = useMemo(() => {
    try { return { text: tab === "test" ? smsPreview(message, profile, shorten) : message, error: "" }; }
    catch (error) { return { text: "", error: error instanceof Error ? error.message : "Invalid Liquid." }; }
  }, [message, profile, shorten, tab]);
  const metrics = smsMetrics(tab === "test" ? rendered.text : message);
  const issues = smsIssues(message, groupId);
  const customProfileError = useMemo(() => {
    if (previewMode !== "custom") return "";
    try { const parsed: unknown = JSON.parse(customJson); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? "" : "Enter a JSON object."; }
    catch { return "Enter valid JSON."; }
  }, [customJson, previewMode]);
  const activeRecipients = [...new Set([...recipients, ...recipientInput.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean)])];
  const liquid = attribute ? `{{${personalizationType === "Custom Attributes" ? "custom_attribute." : ""}\${${attribute}}${fallback ? ` | default: '${fallback.replace(/'/g, "\\'")}'` : ""}}}` : "";
  const languageSnippet = languages.length ? smsLanguageSnippet(languages) : "";

  useEffect(() => {
    const previous = document.body.style.overflow;
    const focused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.body.style.overflow = previous; focused?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/users?q=${encodeURIComponent(userSearch)}&limit=20`, { signal: controller.signal }).then(response => response.json()).then(result => setUsers(result.data ?? [])).catch(() => {});
    return () => controller.abort();
  }, [userSearch]);
  useEffect(() => {
    if (JSON.stringify(config) === JSON.stringify(node.config ?? {})) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [config, node.config]);
  const insert = (text: string) => {
    const start = textarea.current?.selectionStart ?? message.length;
    const end = textarea.current?.selectionEnd ?? start;
    patch({ message: message.slice(0, start) + text + message.slice(end) });
    setOverlay(null);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + text.length, start + text.length); });
  };
  const copyPreview = async () => {
    setNotice("");
    try {
      const response = await fetch("/api/sms/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: rendered.text }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create preview.");
      await navigator.clipboard.writeText(`${window.location.origin}${result.url}`);
      setNotice("Preview link copied. This snapshot expires in 7 days.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not copy preview link."); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice("Copied to clipboard."); } catch { setNotice("Clipboard is unavailable. Select and copy the text directly."); }
  };
  const sendTest = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/sms-test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeId: node.id, message, subscriptionGroupId: groupId, linkShortening: shorten, recipients: activeRecipients, override, profile }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not prepare test.");
      setNotice(`${result.tests.length} test message${result.tests.length === 1 ? "" : "s"} prepared. Local simulation; no SMS was delivered.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not prepare test."); }
    finally { setBusy(false); }
  };
  const selectChannel = (channel: string) => {
    if (channel !== "sms") { onOtherChannel(channel); return; }
    patch({ channel: "sms", subscriptionGroupId: groupId || groups.find(group => group.channel === "SMS")?.id }); setChannelPicker(false);
  };
  const count = <span className={styles.count} title={`${metrics.encoding} · ${metrics.units} encoding units`}>{metrics.characters} | {metrics.segments} Billable Segment{metrics.segments === 1 ? "" : "s"} <Info size={13}/></span>;

  if (typeof document === "undefined") return null;
  return createPortal(<div className={styles.backdrop} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); if (overlay) setOverlay(null); else onDone(config); }
    if (event.key === "Tab" && !overlay && panel.current) {
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, a[href]')).filter(element => element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={`${node.label} step editor`} tabIndex={-1} ref={panel}>
      <aside className={styles.stepColumn}>
        <div className={styles.stepCard}><div className={styles.stepName}>{node.label}</div>{!connected && <div className={styles.disconnected}>DISCONNECTED</div>}
          <div className={`${styles.stepMessage} ${issues.length ? styles.incomplete : ""}`}>
            {issues.length > 0 && <div className={styles.incompleteTitle}><Info size={12}/> Incomplete Messages</div>}
            <button onClick={() => setSection("channels")}><Send size={16}/> Messages</button><div><MessageCircle size={17}/></div>
          </div><p><ArrowDown size={18}/> <span>All users who enter this step advance to the next step</span></p>
        </div><button className={styles.done} onClick={() => onDone(config)}>Done</button>
      </aside>
      <main className={styles.main}>
        <header className={styles.header}>Set up Messages<button aria-label="BrazeAI Operator" onClick={() => { setSection("channels"); setChannelPicker(false); setTab("test"); setReview(true); }}><Sparkles size={23}/></button></header>
        <div className={styles.body}>
          <nav className={styles.tabs} role="tablist" aria-label="Message step">
            <button role="tab" aria-selected={section === "channels"} onClick={() => setSection("channels")}>Messaging channels</button>
            <button role="tab" aria-selected={section === "delivery"} onClick={() => setSection("delivery")}>Delivery settings</button>
          </nav>
          {section === "delivery" ? <div className={styles.delivery}>
            <h3>Delivery Schedule</h3><p>Deliver this message <b>when users enter this step.</b></p>
            <label className={styles.check}><input type="checkbox" checked={Boolean(config.intelligentTiming)} onChange={event => patch({ intelligentTiming: event.target.checked })}/> Using Intelligent Timing <Info size={14}/></label>
            <div className={styles.indented}><b>Select a time to send messages when a user&apos;s profile does not have enough data to calculate an optimal time:</b>
              <label className={styles.check}><input type="radio" name="sms-fallback" disabled={!config.intelligentTiming} checked={config.timingFallback !== "custom"} onChange={() => patch({ timingFallback: "popular" })}/> the most popular time to use the app amongst all users</label>
              <label className={styles.check}><input type="radio" name="sms-fallback" disabled={!config.intelligentTiming} checked={config.timingFallback === "custom"} onChange={() => patch({ timingFallback: "custom" })}/> a specific custom fallback time (in the user&apos;s local time zone)</label>
              <input aria-label="Custom fallback time" type="time" disabled={!config.intelligentTiming || config.timingFallback !== "custom"} value={String(config.timingTime ?? "17:00")} onInput={event => patch({ timingTime: event.currentTarget.value })} onChange={event => patch({ timingTime: event.target.value })}/>
            </div>
            <hr/><h3>Delivery validations</h3><p>Double-check that your audience meets your delivery criteria at message send. For in-app messages, delivery validations are checked when the user enters the step, not when the message is displayed.</p>
            <label className={styles.check}><input className={styles.switch} type="checkbox" checked={Boolean(config.deliveryValidation)} onChange={event => patch({ deliveryValidation: event.target.checked })}/> <span>Validate audience at message send<small>Recommended if you&apos;re using quiet hours, Intelligent Timing, or rate limiting.</small></span></label>
          </div> : channelPicker ? <div className={styles.channelPicker}><h2>Select Message Channel</h2><p>Start by choosing your first message channel for this step.</p><div>{channelChoices.map(([key, label, Icon]) => <button key={key} onClick={() => selectChannel(key)}><Icon size={23}/>{label}</button>)}</div></div> : <>
            <div className={styles.channels}><h5>Channels</h5><div><button className={styles.selectedChannel}><MessageCircle size={18} fill="currentColor"/> SMS/MMS/RCS</button><button aria-label="Change message channel" onClick={() => setChannelPicker(true)}><Plus size={21}/></button></div></div>
            <div className={styles.subscription}><label htmlFor="canvas-sms-group">Subscription Group <button aria-label="Subscription group help" onClick={() => setHelp(!help)}><Info size={13} fill="currentColor" color="#55555b"/></button></label><select id="canvas-sms-group" value={groupId} onChange={event => patch({ subscriptionGroupId: event.target.value })}><option value="">Select subscription group</option>{groups.filter(group => group.channel === "SMS").map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{help && <p>Only users subscribed to the selected SMS subscription group can receive this message.</p>}</div>
            <div className={styles.workspace}>
              <aside className={styles.preview}><h5>Preview</h5><div className={styles.previewPane}><div className={styles.bubble}>{rendered.text || "Your message..."}</div></div>{tab === "test" && count}<p>Actual rendering may not be identical to this preview depending on the user&apos;s environment.</p>{rendered.error && <p role="alert" className={styles.error}>{rendered.error}</p>}</aside>
              <div className={styles.composer}><nav className={styles.tabs} role="tablist" aria-label="SMS composer sections">{[["compose", "Compose"], ["contact", "Contact Card Generator"], ["test", "Test"]].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setNotice(""); }}>{label}</button>)}</nav>
                {tab === "compose" && <>
                  <div className={styles.language}><h4>Language</h4><button onClick={() => { setOverlay("languages"); setLanguageMenu(false); }}><Plus size={19}/> Add languages</button></div>
                  <div className={styles.content}><h4>Content</h4><div className={styles.messageHeading}><label htmlFor="canvas-sms-message">Message</label>{count}<button aria-label="Review message with Operator" onClick={() => { setSection("channels"); setChannelPicker(false); setTab("test"); setReview(true); }}><Sparkles size={19}/></button></div>
                    <div className={styles.editor}><textarea ref={textarea} id="canvas-sms-message" value={message} onChange={event => patch({ message: event.target.value })} placeholder="Your message..." maxLength={20000}/><button className={styles.addLiquid} aria-label="Add Liquid" onClick={() => setOverlay("liquid")}><Plus size={10}/></button></div>
                  </div>
                  <div className={styles.shortening}><label className={styles.check}><input type="checkbox" checked={shorten} onChange={event => patchValues({ linkShortening: event.target.checked })}/> Link shortening</label><p><a href="https://www.braze.com/docs/en/user_guide/message_building_by_channel/sms/campaign/link_shortening" target="_blank" rel="noreferrer">Shorten the URL <ExternalLink size={12}/></a> contained in your message and better understand message engagement.</p></div>
                </>}
                {tab === "contact" && <div className={styles.contact}><h4>Contact Card Generator</h4><p>Contact Cards let subscribers save your number as a contact in their phones with an associated image and other information. Creating and sending a Contact Card requires MMS. Please reach out to your account manager to add MMS if you would like to send a contact card <a href="https://www.braze.com/docs/en/user_guide/message_building_by_channel/sms/mms/contact_card/" target="_blank" rel="noreferrer">Learn More <ExternalLink size={12}/></a></p></div>}
                {tab === "test" && <div className={styles.test}>
                  <h5>Content Review with Operator</h5><p>Use Operator to review your message&apos;s formatting, content, grammar, and style. <a href="https://www.braze.com/docs/en/user_guide/brazeai/operator/capabilities/#review-content-quality" target="_blank" rel="noreferrer">See our documentation for more information <ExternalLink size={12}/></a>.</p><button className={styles.reviewButton} onClick={() => setReview(!review)}><Sparkles size={15}/> Review with Operator</button>
                  {review && <div className={styles.feedback}><b>Content review</b><p>{issues.length ? issues.join(" ") : "Message content and subscription group are configured."} {metrics.segments > 1 && `This message uses ${metrics.segments} billable segments.`} {message && !/stop/i.test(message) && "Consider including opt-out instructions."}</p><small>Local checks</small></div>}
                  <h5>Test Recipients</h5><p>Select at least one Content Test Group or individual user to receive this test message. Messages will be customized with recipients&apos; attributes by default.</p>
                  <label className={styles.field}>Add content test group <select disabled value=""><option value="">No Content Test Groups</option></select></label>
                  <label className={styles.field}>Add individual users<div className={styles.recipientField}>{recipients.map(recipient => <span key={recipient}>{recipient}<button aria-label={`Remove ${recipient}`} onClick={() => setRecipients(recipients.filter(item => item !== recipient))}><X size={12}/></button></span>)}<input value={recipientInput} placeholder="External ids, emails, or phone numbers" onChange={event => setRecipientInput(event.target.value)} onKeyDown={event => { if (["Enter", ",", ";"].includes(event.key)) { event.preventDefault(); setRecipients(activeRecipients); setRecipientInput(""); } }}/></div></label>
                  <label className={styles.check}><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)}/> Override recipients&apos; attributes with current preview user&apos;s attributes <Info size={14}/></label>
                  <button className={styles.primary} disabled={!testAvailable || busy || !!issues.length || !activeRecipients.length || !!rendered.error || !!customProfileError} onClick={() => void sendTest()}>{busy ? "Preparing…" : "Send Test"}</button>{!testAvailable && <p className={styles.feedback}>Testing is unavailable for browser-only drafts.</p>}
                  <hr/><button className={styles.outline} disabled={!rendered.text || !!rendered.error} onClick={() => void copyPreview()}><LinkIcon size={17}/> Copy preview link</button>
                  <label className={styles.field}>Preview message as user<select value={previewMode} onChange={event => { setPreviewMode(event.target.value); setNotice(""); }}><option value="random">Random user</option><option value="existing">Select existing user</option><option value="custom">Custom user</option></select></label>
                  {previewMode === "random" && <button className={styles.textButton} disabled={!users.length} onClick={() => { const alternatives = users.filter(user => user.id !== previewUser?.id); setPreviewUser(alternatives[Math.floor(Math.random() * alternatives.length)] ?? users[0]); }}><UserRound size={17} fill="currentColor"/> Get random user</button>}
                  {previewMode === "existing" && <><label className={styles.field}>Search users<input value={userSearch} placeholder="External ID or email address" onChange={event => setUserSearch(event.target.value)}/></label><select aria-label="Select existing user" value={previewUser?.id ?? ""} onChange={event => setPreviewUser(users.find(user => user.id === event.target.value) ?? null)}><option value="">Select a user</option>{users.map(user => <option key={user.id} value={user.id}>{user.id} · {user.email}</option>)}</select></>}
                  {previewMode === "custom" && <label className={styles.field}>Custom user attributes<textarea value={customJson} onChange={event => setCustomJson(event.target.value)}/>{(() => { try { const parsed = JSON.parse(customJson); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return <small role="alert">Enter a JSON object.</small>; } catch { return <small role="alert">Enter valid JSON.</small>; } return null; })()}</label>}
                  {previewMode !== "custom" && previewUser && <div className={styles.userSummary}><Check size={14}/> {previewUser.firstName} · {previewUser.id}</div>}
                  {notice && <p className={styles.feedback} role="status">{notice}</p>}
                </div>}
              </div>
            </div>
          </>}
        </div>
      </main>
      {overlay === "liquid" && <div className={styles.liquidBackdrop} onClick={() => setOverlay(null)}><section className={styles.liquidPanel} role="dialog" aria-label="Add Personalization" onClick={event => event.stopPropagation()}><h4>Add Personalization</h4><label className={styles.field}>Personalization type<select value={personalizationType} onChange={event => { setPersonalizationType(event.target.value); setAttribute(""); }}><option>Default Attributes</option><option>Custom Attributes</option></select></label><label className={styles.field}>Attribute{personalizationType === "Custom Attributes" ? <input autoFocus placeholder="Attribute name" value={attribute} onChange={event => setAttribute(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}/> : <select autoFocus value={attribute} onChange={event => setAttribute(event.target.value)}><option value="">Search for an attribute</option>{attributes.map(name => <option key={name}>{name}</option>)}</select>}</label><label className={styles.field}>Default value <small>(Optional)</small><input value={fallback} onChange={event => setFallback(event.target.value)} placeholder="Enter default value"/></label><label className={styles.field}>Liquid Snippet<div className={styles.snippet}><input readOnly value={liquid}/><button aria-label="Copy Liquid snippet" onClick={() => void copy(liquid)}><Copy size={18}/></button></div></label><footer><button className={styles.outline} onClick={() => setOverlay(null)}>Cancel</button><button className={styles.primary} disabled={!liquid} onClick={() => insert(liquid)}>Insert</button></footer></section></div>}
      {overlay === "languages" && <div className={styles.languageBackdrop}><section className={styles.languageModal} role="dialog" aria-modal="true" aria-label="Internationalize your message"><button className={styles.close} aria-label="Close language dialog" onClick={() => setOverlay(null)}><X size={23}/></button><h2>Internationalize your message</h2><label className={styles.field}>Languages</label><button className={styles.languageSelect} onClick={() => setLanguageMenu(!languageMenu)}>{languages.length ? languages.map(code => smsLanguages.find(item => item[0] === code)?.[1]).join(", ") : "Select a language or languages"}</button>{languageMenu && <div className={styles.languageOptions}><label><span>Select all languages</span><input type="checkbox" checked={languages.length === smsLanguages.length} onChange={event => setLanguages(event.target.checked ? smsLanguages.map(item => item[0]) : [])}/></label>{smsLanguages.map(([code, name]) => <label key={code}><span>{name}</span><input type="checkbox" checked={languages.includes(code)} onChange={event => setLanguages(event.target.checked ? [...languages, code] : languages.filter(item => item !== code))}/></label>)}</div>}<h5>Fields to internationalize</h5><label className={styles.check}><input type="checkbox" checked={languageFields.message} onChange={event => setLanguageFields({ ...languageFields, message: event.target.checked })}/> Message</label><label className={styles.check}><input type="checkbox" checked={languageFields.image} onChange={event => setLanguageFields({ ...languageFields, image: event.target.checked })}/> Image</label>{languageSnippet && <><p>Select a method of insertion or paste the following snippet into the desired location. Learn more about <a href="https://www.braze.com/docs/en/user_guide/personalization_and_dynamic_content/liquid/conditional_logic/" target="_blank" rel="noreferrer">Liquid conditional logic</a>.</p><pre>{languageSnippet}</pre><button className={styles.outline} onClick={() => void copy(languageSnippet)}><Copy size={14}/> Copy</button></>}<footer><button className={styles.outline} onClick={() => setOverlay(null)}>Cancel</button><button className={styles.primary} disabled={!languages.length || !languageFields.message} onClick={() => { patch({ message: message + (message ? "\n" : "") + languageSnippet }); setOverlay(null); }}>Add text to fields</button></footer></section></div>}
    </div>
  </div>, document.body);
}
