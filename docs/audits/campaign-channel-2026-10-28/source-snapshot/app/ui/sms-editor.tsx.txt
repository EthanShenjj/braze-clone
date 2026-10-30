"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Info, Plus, Send, Sparkles, UserRound, X } from "lucide-react";
import styles from "./sms-editor.module.css";
import { smsMetrics } from "@/lib/sms-model";

type SmsCampaign = {
  id: string;
  name: string;
  body?: string;
  config?: Record<string, unknown>;
};

type SmsVariant = { id: string; name: string; body: string };
type SubscriptionGroup = { id: string; name: string; channel: string };
type ContactCard = { firstName: string; lastName: string; organization: string; phone: string; email: string };

const liquidTokens = [
  "{{${first_name} | default: 'friend'}}",
  "{{${last_name}}}",
  "{{${email_address}}}",
  "{{${city}}}",
];

function channelValues(draft: SmsCampaign) {
  const stored = draft.config?.channelValues;
  return stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
}

function shortenedPreview(message: string, enabled: boolean) {
  if (!enabled) return message;
  return message.replace(/https?:\/\/\S+/g, "https://brz.ai/XXXXXXXX");
}

function defaultVariants(draft: SmsCampaign): SmsVariant[] {
  const stored = draft.config?.smsVariants;
  if (Array.isArray(stored) && stored.length) return stored as SmsVariant[];
  return [{ id: "sms_variant_1", name: draft.name || "Variant 1", body: draft.body ?? "" }];
}

export default function SmsCampaignComposer({
  draft,
  update,
  openTest,
}: {
  draft: SmsCampaign;
  update: (patch: Partial<SmsCampaign>) => void;
  openTest: () => void;
}) {
  const values = channelValues(draft);
  const [variants, setVariants] = useState<SmsVariant[]>(() => defaultVariants(draft));
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"compose" | "contact" | "test">("compose");
  const [groups, setGroups] = useState<SubscriptionGroup[]>([]);
  const [liquidOpen, setLiquidOpen] = useState(false);
  const [linkHelpOpen, setLinkHelpOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const current = variants[selected] ?? variants[0];
  const message = current?.body ?? "";
  const linkShortening = values.linkShortening !== false;
  const appendStop = values.appendStop !== false;
  const segments = smsMetrics(message).segments;
  const preview = useMemo(() => {
    const rendered = shortenedPreview(message || "Your message preview will appear here.", linkShortening);
    return appendStop && !/reply stop/i.test(rendered) ? `${rendered}\n\nReply STOP to opt-out.` : rendered;
  }, [appendStop, linkShortening, message]);

  useEffect(() => {
    void fetch("/api/subscription-groups?status=Active")
      .then(response => response.json())
      .then(data => setGroups(((data.data ?? []) as SubscriptionGroup[]).filter(group => group.channel === "SMS")))
      .catch(() => {});
  }, []);

  const persistValues = (patch: Record<string, unknown>) => {
    update({ config: { ...draft.config, channelValues: { ...values, ...patch } } });
  };

  const persistVariants = (next: SmsVariant[], activeIndex = selected) => {
    const active = next[activeIndex] ?? next[0];
    setVariants(next);
    update({ body: active.body, config: { ...draft.config, smsVariants: next } });
  };

  const selectVariant = (index: number) => {
    setSelected(index);
    update({ body: variants[index]?.body ?? "" });
  };

  const changeMessage = (body: string) => {
    const next = variants.map((variant, index) => index === selected ? { ...variant, body } : variant);
    persistVariants(next);
  };

  const addVariant = () => {
    const index = variants.length;
    const next = [...variants, { id: `sms_variant_${Date.now()}`, name: `Variant ${index + 1}`, body: "" }];
    setSelected(index);
    persistVariants(next, index);
  };

  const insertLiquid = (token: string) => {
    changeMessage(`${message}${message && !message.endsWith(" ") ? " " : ""}${token}`);
    setLiquidOpen(false);
  };

  const contact = (values.contactCard && typeof values.contactCard === "object" ? values.contactCard : {}) as Partial<ContactCard>;
  const patchContact = (patch: Partial<ContactCard>) => persistValues({ contactCard: { ...contact, ...patch } });

  return (
    <section className={styles.card} aria-label="SMS/MMS/RCS Composer">
      <h2>SMS/MMS/RCS Composer</h2>

      <div className={styles.variantSection}>
        <h3>Variants</h3>
        <div className={styles.variantTabs} role="tablist" aria-label="SMS variants">
          {variants.map((variant, index) => (
            <button key={variant.id} role="tab" aria-selected={selected === index} className={selected === index ? styles.selectedVariant : ""} onClick={() => selectVariant(index)}>
              {variant.name}
            </button>
          ))}
          <button className={styles.addVariant} aria-label="Add variant" onClick={addVariant}><Plus size={17}/></button>
        </div>
      </div>

      <label className={styles.groupField}>
        <span>Subscription Group <Info size={13}/></span>
        <select value={String(draft.config?.subscriptionGroupId ?? "")} onChange={event => {
          const id = event.target.value;
          const group = groups.find(item => item.id === id);
          update({ config: { ...draft.config, subscriptionGroupId: id || undefined, channelValues: { ...values, subscriptionGroup: group?.name ?? "" } } });
        }}>
          <option value="">Workspace subscription status</option>
          {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>

      <div className={styles.workspace}>
        <aside className={styles.previewColumn}>
          <h3>Preview</h3>
          <div className={styles.phonePreview}>
            <div className={styles.messageCanvas}>
              <div className={styles.bubble}>{preview}</div>
            </div>
          </div>
          <p>Actual rendering may not be identical to this preview depending on the user&apos;s environment.</p>
        </aside>

        <div className={styles.composeColumn}>
          <nav className={styles.tabs} aria-label="SMS composer sections">
            <button className={tab === "compose" ? styles.activeTab : ""} onClick={() => setTab("compose")}>Compose</button>
            <button className={tab === "contact" ? styles.activeTab : ""} onClick={() => setTab("contact")}>Contact Card Generator</button>
            <button className={tab === "test" ? styles.activeTab : ""} onClick={() => setTab("test")}>Test</button>
          </nav>

          {tab === "compose" && <>
            <div className={styles.languageRow}>
              <h3>Language</h3>
              <button onClick={() => setLanguageOpen(open => !open)}><Plus size={17}/> Add languages</button>
            </div>
            {languageOpen && <div className={styles.languagePanel}>
              <div><b>English</b><span>Default</span></div>
              <div><b>Spanish</b><button onClick={() => setLanguageOpen(false)}><X size={14}/></button></div>
            </div>}

            <div className={styles.contentSection}>
              <h3>Content</h3>
              <div className={styles.messageTitle}>
                <b>Message</b>
                <span className={message.length > 160 ? styles.warning : ""}>{message.length} | {segments} Billable Segment{segments === 1 ? "" : "s"} <Info size={13}/></span>
                <button aria-label="Open BrazeAI Operator"><Sparkles size={18}/></button>
              </div>
              <div className={styles.editorWrap}>
                <textarea value={message} onChange={event => changeMessage(event.target.value)} placeholder="Write your message" aria-label="Message"/>
                <button className={styles.addLiquid} aria-label="Add Liquid" title="Add Liquid" onClick={() => setLiquidOpen(open => !open)}><Plus size={15}/></button>
                {liquidOpen && <div className={styles.liquidMenu}>
                  <b>Personalize message</b>
                  {liquidTokens.map(token => <button key={token} onClick={() => insertLiquid(token)}>{token}</button>)}
                </div>}
              </div>
            </div>

            <div className={styles.linkSetting}>
              <label><input type="checkbox" checked={linkShortening} onChange={event => persistValues({ linkShortening: event.target.checked })}/><span>Link shortening</span></label>
              <p><button onClick={() => setLinkHelpOpen(open => !open)}>Shorten the URL <ExternalLink size={12}/></button> contained in your message and better understand message engagement.</p>
              {linkHelpOpen && <div className={styles.helpPopover}><button aria-label="Close" onClick={() => setLinkHelpOpen(false)}><X size={15}/></button><b>Create a custom shortened link domain</b><p>You can replace “brz.ai” with a customized link shortening domain to increase credibility and brand recognition.</p></div>}
            </div>

          </>}

          {tab === "contact" && <div className={styles.secondaryPanel}>
            <div className={styles.panelHeading}><span><UserRound size={18}/></span><div><h3>Contact Card Generator</h3><p>Attach a vCard so recipients can save your business as a contact.</p></div></div>
            <div className={styles.contactGrid}>
              <label>First name<input value={contact.firstName ?? ""} onChange={event => patchContact({ firstName: event.target.value })}/></label>
              <label>Last name<input value={contact.lastName ?? ""} onChange={event => patchContact({ lastName: event.target.value })}/></label>
              <label>Organization<input value={contact.organization ?? ""} onChange={event => patchContact({ organization: event.target.value })}/></label>
              <label>Phone<input value={contact.phone ?? ""} onChange={event => patchContact({ phone: event.target.value })}/></label>
              <label>Email<input type="email" value={contact.email ?? ""} onChange={event => patchContact({ email: event.target.value })}/></label>
            </div>
          </div>}

          {tab === "test" && <div className={styles.secondaryPanel}>
            <div className={styles.panelHeading}><span><Send size={18}/></span><div><h3>Test message</h3><p>Preview the current variant with a test recipient before moving on.</p></div></div>
            <label className={styles.testField}>Phone number<input value={testNumber} onChange={event => setTestNumber(event.target.value)} placeholder="+1 555 000 0000"/></label>
            <button className={styles.testButton} disabled={!testNumber.trim() || !message.trim()} onClick={openTest}>Send test</button>
          </div>}
        </div>
      </div>
    </section>
  );
}
