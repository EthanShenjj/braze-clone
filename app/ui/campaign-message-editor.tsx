"use client";
import PushCampaignEditor from "./push-campaign-editor";
import ContentCardEditor from "./content-card-editor";
import BannerCampaignEditor from "./banner-campaign-editor";
import LineCampaignEditor from "./line-campaign-editor";
import { MessageVariants,NativeMessagePreview,type MessageEditorProps } from "./message-controls";
import { campaignVariants,variantDraft,multichannelChannels,type MessageDraft } from "@/lib/campaign-shared";
import { normalizeWebhookVariants,redactHeaders } from "@/lib/webhook-model";
import { normalizeWhatsAppVariants,customWhatsAppTemplates,renderWhatsAppVariant,prepareWhatsAppMessage } from "@/lib/whatsapp-model";
import { variantsFor } from "@/lib/in-app-model";
import styles from "./campaign-editors.module.css";
export function CampaignMessageEditor(props:MessageEditorProps){
 const Editor=props.draft.channel==="push"?PushCampaignEditor:props.draft.channel==="content"?ContentCardEditor:props.draft.channel==="banner"?BannerCampaignEditor:LineCampaignEditor;
 return <MessageVariants {...props}>{(draft,update)=><Editor draft={draft} update={update} openTest={props.openTest}/>}</MessageVariants>;
}
export function CampaignMessagesReview({draft}: {draft:MessageDraft}){
 if(draft.channel==="multichannel"||draft.channel==="operator"){
  const messages=(draft.config?.multichannelMessages??{}) as Record<string,MessageDraft>;
  const selected=(draft.config?.channelValues as {channels?:string[]}|undefined)?.channels??[];
  return <>{Object.entries(multichannelChannels).filter(([label,channel])=>selected.includes(label)&&messages[channel]).map(([label,channel])=><section key={channel}><h3>{label}</h3><CampaignMessagesReview draft={{...messages[channel],channel}}/></section>)}</>;
 }
 return <div className={styles.workspace}>{campaignVariants(draft).map((variant,index)=>{
  const current=variantDraft(draft,index);
  if(draft.channel==="webhook"){const webhook=normalizeWebhookVariants(current)[0];return <article key={variant.id} className={styles.card}><h3>{variant.name}</h3><p>{webhook.method} {webhook.url}</p><pre className={styles.code}>{JSON.stringify(redactHeaders(webhook.headers),null,2)}</pre><pre className={styles.code}>{webhook.body}</pre></article>;}
  if(draft.channel==="whatsapp"){const wa=normalizeWhatsAppVariants(current)[0];let payload:unknown;try{payload=prepareWhatsAppMessage(wa,customWhatsAppTemplates(draft),{first_name:"Sofia",user_id:"preview"});}catch(e){payload={error:e instanceof Error?e.message:"Complete this message"};}return <article key={variant.id} className={styles.card}><h3>{variant.name}</h3><p>{wa.mode} · {wa.mode==="response"?wa.responseLayout:wa.templateId}</p><div className={styles.bubble}>{renderWhatsAppVariant(wa,customWhatsAppTemplates(draft))}</div><details><summary>Message payload</summary><pre className={styles.code}>{JSON.stringify(payload,null,2)}</pre></details></article>;}
  if(draft.channel==="iam"){const iam=variantsFor(current)[0];return <article key={variant.id} className={styles.card}><h3>{variant.name}</h3><p>{iam.sendTo} · {iam.editorMode??"Drag-and-drop"}</p>{iam.pages.map((page,i)=><details key={page.id} open={i===0}><summary>Page {i+1}: {page.name}</summary><NativeMessagePreview draft={{...current,config:{...current.config,iamVariants:[{...iam,pages:[page]}]}}}/></details>)}</article>;}
  return <article key={variant.id} className={styles.card}><h3>{variant.name} Preview</h3>{draft.channel==="email"&&<><p><b>From:</b> {String((current.config?.emailSending as {fromAddress?:string})?.fromAddress??"")}</p><p><b>Subject:</b> {current.subject}</p></>}<NativeMessagePreview draft={current}/>{draft.channel!=="email"&&<details><summary>Message settings</summary><pre className={styles.code}>{JSON.stringify(current.config?.channelValues??{},null,2)}</pre></details>}</article>;
 })}</div>;
}
