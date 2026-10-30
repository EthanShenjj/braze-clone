"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Info, Plus, Send, Sparkles, UserRound, X } from "lucide-react";
import { ChannelCopywriter } from "./channel-copywriter";
import styles from "./sms-editor.module.css";
import { smsMetrics } from "@/lib/sms-model";
import { smsLanguages } from "@/lib/sms-model";
import { compileSms, contactVcard, type SmsValues } from "@/lib/channel-message-model";
import { AssetField, MessageField, NativeMessagePreview, type TestRequest } from "./message-controls";

type SmsCampaign = {
  id: string;
  name: string;
  body?: string;
  config?: Record<string, unknown>;
};

type SmsVariant = { id: string; name: string; body: string; values?: SmsValues };
type SubscriptionGroup = { id: string; name: string; channel: string; capabilities?:{sms?:boolean;mms?:boolean;rcs?:boolean} };
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
  openTest: (request?: TestRequest) => void;
}) {
  const baseValues = channelValues(draft);
  const [variants, setVariants] = useState<SmsVariant[]>(() => defaultVariants(draft));
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"compose" | "contact" | "test">("compose");
  const [groups, setGroups] = useState<SubscriptionGroup[]>([]);
  const [liquidOpen, setLiquidOpen] = useState(false),[copywriterOpen,setCopywriterOpen]=useState(false);
  const [linkHelpOpen, setLinkHelpOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [assetError, setAssetError] = useState("");
  const current = variants[selected] ?? variants[0];
  const values = { ...baseValues, ...current?.values } as SmsValues;
  const message = current?.body ?? "";
  const linkShortening = values.linkShortening !== false;
  const appendStop = values.appendStop !== false;
  let renderedMessage = message;
  try { renderedMessage = compileSms({ ...draft, channel:"sms",body:message,config:{...draft.config,channelValues:values} },{first_name:"Sofia",language:String(values.previewLanguage??"en")}).message; } catch { /* validation is shown by the message preview */ }
  const segments = smsMetrics(renderedMessage).segments;
  const selectedGroup=groups.find(group=>group.id===draft.config?.subscriptionGroupId),supportsMms=selectedGroup?.capabilities?.mms===true,supportsRcs=selectedGroup?.capabilities?.rcs===true;
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
    const next=variants.map((v,i)=>i===selected?{...v,values:{...values,...patch}}:v);
    setVariants(next);
    update({ config: { ...draft.config, smsVariants:next, channelValues: { ...baseValues,...next[0].values } } });
  };

  const persistVariants = (next: SmsVariant[], activeIndex = selected) => {
    const active = next[activeIndex] ?? next[0];
    setVariants(next);
    update({ body: next[0].body, config: { ...draft.config, smsVariants: next, channelValues:{...baseValues,...next[0].values} } });
  };

  const selectVariant = (index: number) => {
    setSelected(index);
  };

  const changeMessage = (body: string) => {
    const next = variants.map((variant, index) => index === selected ? { ...variant, body } : variant);
    persistVariants(next);
  };

  const addVariant = () => {
    const index = variants.length;
    if(index>=8)return;
    const next = [...variants, { id: `sms_variant_${Date.now()}`, name: `Variant ${index + 1}`, body: "",values:structuredClone(values) }];
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
          <button className={styles.addVariant} aria-label="Add variant" disabled={variants.length>=8} onClick={addVariant}><Plus size={17}/></button>
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
          <div className={styles.messageBubble}>{shortenedPreview(renderedMessage||"Your message preview will appear here.",linkShortening)}</div>
          <p>Actual rendering may not be identical to this preview depending on the user&apos;s environment.</p>
        </aside>

        <div className={styles.composeColumn}>
          <nav className={styles.tabs} aria-label="SMS composer sections">
            <button className={tab === "compose" ? styles.activeTab : ""} onClick={() => setTab("compose")}>Compose</button>
            <button className={tab === "contact" ? styles.activeTab : ""} onClick={() => setTab("contact")}>Contact Card Generator</button>
            <button className={tab === "test" ? styles.activeTab : ""} onClick={() => setTab("test")}>Test</button>
          </nav>

          {tab === "compose" && <>
            <MessageField label="Variant name"><input value={current.name} onChange={e=>persistVariants(variants.map((v,i)=>i===selected?{...v,name:e.target.value}:v))}/></MessageField>
            <div style={{display:"flex",gap:8}}><button onClick={()=>{if(variants.length<8)persistVariants([...variants,{...structuredClone(current),id:crypto.randomUUID(),name:`${current.name} copy`}],variants.length);}} disabled={variants.length>=8}>Copy variant</button><button disabled={variants.length===1} onClick={()=>{const next=variants.filter((_,i)=>i!==selected);setSelected(Math.max(0,selected-1));persistVariants(next,Math.max(0,selected-1));}}>Delete variant</button></div>
            <MessageField label="Message type"><select value={String(values.messageType??"SMS")} onChange={e=>persistValues({messageType:e.target.value})}><option>SMS</option><option disabled={!supportsMms}>MMS</option><option disabled={!supportsRcs}>RCS</option></select></MessageField>
            <details><summary>Sending configuration</summary><MessageField label="Sending number or messaging service"><input value={String(values.sendingNumber??"")} onChange={e=>persistValues({sendingNumber:e.target.value})}/></MessageField></details>
            {values.messageType!=="SMS"&&values.messageType&&<AssetField label="Message media" value={String(values.mediaUrl??"")} accept="image/*,video/mp4,text/vcard" onChange={mediaUrl=>persistValues({mediaUrl})}/>}
            {values.messageType==="RCS"&&<><MessageField label="Card title"><input value={String(values.rcsTitle??"")} maxLength={200} onChange={e=>persistValues({rcsTitle:e.target.value})}/></MessageField><MessageField label="Card description"><textarea value={String(values.rcsDescription??"")} onChange={e=>persistValues({rcsDescription:e.target.value})}/></MessageField>{(values.rcsButtons??[]).map((b,i)=><div key={i}><MessageField label={`Button ${i+1} label`}><input value={b.label} onChange={e=>persistValues({rcsButtons:values.rcsButtons?.map((v,j)=>j===i?{...v,label:e.target.value}:v)})}/></MessageField><MessageField label={`Button ${i+1} URL`}><input value={b.url} onChange={e=>persistValues({rcsButtons:values.rcsButtons?.map((v,j)=>j===i?{...v,url:e.target.value}:v)})}/></MessageField><button onClick={()=>persistValues({rcsButtons:values.rcsButtons?.filter((_,j)=>j!==i)})}>Remove button</button></div>)}<button disabled={(values.rcsButtons??[]).length>=4} onClick={()=>persistValues({rcsButtons:[...(values.rcsButtons??[]),{label:"Open",url:"https://"}]})}>+ Add action</button><h3>Carousel</h3>{(values.rcsCards??[]).map((card,i)=><fieldset key={i}><legend>Card {i+1}</legend>{(["title","description","mediaUrl","url"] as const).map(key=><MessageField key={key} label={key}><input value={card[key]} onChange={e=>persistValues({rcsCards:values.rcsCards?.map((c,j)=>i===j?{...c,[key]:e.target.value}:c)})}/></MessageField>)}<button onClick={()=>persistValues({rcsCards:values.rcsCards?.filter((_,j)=>j!==i)})}>Remove card</button></fieldset>)}<button disabled={(values.rcsCards??[]).length>=10} onClick={()=>persistValues({rcsCards:[...(values.rcsCards??[]),{title:"",description:"",mediaUrl:"",url:"https://"}]})}>+ Add carousel card</button></>}
            <div className={styles.languageRow}>
              <h3>Language</h3>
              <button onClick={() => setLanguageOpen(open => !open)}><Plus size={17}/> Add languages</button>
            </div>
            {languageOpen && <div className={styles.languagePanel}>{smsLanguages.map(([code,label])=><label key={code}><input type="checkbox" checked={Object.hasOwn(values.translations??{},code)} onChange={e=>{const translations={...values.translations};if(e.target.checked)translations[code]="";else delete translations[code];persistValues({translations});}}/>{label}</label>)}</div>}
            {Object.entries(values.translations??{}).map(([code,body])=><MessageField key={code} label={`${smsLanguages.find(l=>l[0]===code)?.[1]??code} message`}><textarea value={body} onChange={e=>persistValues({translations:{...values.translations,[code]:e.target.value}})}/></MessageField>)}
            <MessageField label="Preview language"><select value={String(values.previewLanguage??"en")} onChange={e=>persistValues({previewLanguage:e.target.value})}>{smsLanguages.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></MessageField>

            <div className={styles.contentSection}>
              <h3>Content</h3><button type="button" onClick={()=>setCopywriterOpen(!copywriterOpen)}><Sparkles size={15}/> Copywriter</button>{copywriterOpen&&<ChannelCopywriter channel="sms" current={message} apply={text=>{changeMessage(text);setCopywriterOpen(false);}}/>}
              <div className={styles.messageTitle}>
                <b>Message</b>
                <span className={renderedMessage.length > 1600 ? styles.warning : ""}>{renderedMessage.length} | {segments} Billable Segment{segments === 1 ? "" : "s"} <Info size={13}/></span>
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
              <label><input type="checkbox" checked={appendStop} onChange={e=>persistValues({appendStop:e.target.checked})}/> Append opt-out message</label>
              {appendStop&&<MessageField label="Opt-out message"><input value={String(values.stopText??"Reply STOP to opt-out.")} onChange={e=>persistValues({stopText:e.target.value})}/></MessageField>}
              <label><input type="checkbox" checked={linkShortening} onChange={event => persistValues({ linkShortening: event.target.checked })}/><span>Link shortening</span></label>
              <p><button onClick={() => setLinkHelpOpen(open => !open)}>Shorten the URL <ExternalLink size={12}/></button> contained in your message and better understand message engagement.</p>
              {linkHelpOpen && <div className={styles.helpPopover}><button aria-label="Close" onClick={() => setLinkHelpOpen(false)}><X size={15}/></button><b>Create a custom shortened link domain</b><p>You can replace “brz.ai” with a customized link shortening domain to increase credibility and brand recognition.</p></div>}
            </div>


          </>}

          {tab === "contact" && <div className={styles.secondaryPanel}>
            <div className={styles.panelHeading}><span><UserRound size={18}/></span><div><h3>Contact Card Generator</h3><p>Attach a vCard so recipients can save your business as a contact.</p></div></div>
            {!supportsMms?<div role="status"><h3>MMS capability required</h3><p>Contact cards are sent as MMS attachments. Select a subscription group with MMS enabled to generate and attach a contact card.</p></div>:<><div className={styles.contactGrid}>
              <label>First name<input value={contact.firstName ?? ""} onChange={event => patchContact({ firstName: event.target.value })}/></label>
              <label>Last name<input value={contact.lastName ?? ""} onChange={event => patchContact({ lastName: event.target.value })}/></label>
              <label>Organization<input value={contact.organization ?? ""} onChange={event => patchContact({ organization: event.target.value })}/></label>
              <label>Phone<input value={contact.phone ?? ""} onChange={event => patchContact({ phone: event.target.value })}/></label>
              <label>Email<input type="email" value={contact.email ?? ""} onChange={event => patchContact({ email: event.target.value })}/></label>
            </div>
            <button onClick={async()=>{const file=new File([contactVcard({firstName:contact.firstName??"",lastName:contact.lastName??"",organization:contact.organization??"",phone:contact.phone??"",email:contact.email??""})],"contact.vcf",{type:"text/vcard"});const form=new FormData();form.set("file",file);const r=await fetch("/api/message-assets",{method:"POST",body:form});const result=await r.json();if(r.ok)persistValues({messageType:"MMS",mediaUrl:result.url,mediaType:"vcard"});else setAssetError(result.error??"Could not attach contact card.");}}>Generate and attach contact card</button>
            {assetError&&<p role="alert">{assetError}</p>}</>}
          </div>}

          {tab === "test" && <div className={styles.secondaryPanel}>
            <div className={styles.panelHeading}><span><Send size={18}/></span><div><h3>Test message</h3><p>Preview the current variant with a test recipient before moving on.</p></div></div>
            <label className={styles.testField}>Phone number<input value={testNumber} onChange={event => setTestNumber(event.target.value)} placeholder="+1 555 000 0000"/></label>
            <button className={styles.testButton} disabled={!testNumber.trim() || !message.trim()&&!values.mediaUrl} onClick={()=>openTest({recipient:testNumber,variantId:current.id})}>Send test</button>
          </div>}
        </div>
      </div>
    </section>
  );
}
