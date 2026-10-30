"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ExternalLink, Globe2, Plus, WandSparkles, X } from "lucide-react";
import { translate, withLocale, type Locale } from "@/lib/i18n";
import { routeForPage } from "@/lib/navigation";
import styles from "./email-content-navigation.module.css";

export default function EmailContentNavigation({ locale, active, onNavigate, onClose, onInsert, disabled, linksPanel, languagesPanel }: {
  locale: Locale; active: "content" | "links" | "languages";
  onNavigate: (section: "content" | "links" | "personalization" | "languages") => void;
  onClose: () => void; onInsert: (text: string) => void; disabled?: boolean;
  linksPanel?: ReactNode; languagesPanel?: ReactNode;
}) {
  const [copyOpen,setCopyOpen]=useState(false),[prompt,setPrompt]=useState(""),[copy,setCopy]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const generate=async()=>{if(busy||!prompt.trim())return;setBusy(true);setError("");try{const response=await fetch("/api/messages/assist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:"banner",prompt:`Write copy for an email text block. ${prompt}`})});const result=await response.json();if(!response.ok)throw Error(result.error??"Copy could not be generated.");if(typeof result.text!=="string"||!result.text.trim())throw Error("The service returned no copy.");setCopy(result.text);}catch(error){setError(error instanceof Error?error.message:"Copy could not be generated.");}finally{setBusy(false);}};
  return <>
    <nav className={styles.navigation} aria-label="Content navigation">
      <div className={styles.title}>{translate(locale,"CONTENT")}<button aria-label={translate(locale,"Back to campaign")} onClick={onClose}><ChevronLeft size={15}/></button></div>
      <button className={active==="content"?styles.active:undefined} aria-current={active==="content"?"page":undefined} onClick={()=>onNavigate("content")}>{translate(locale,"Design and Build")}</button>
      <button className={active==="links"?styles.active:undefined} aria-current={active==="links"?"page":undefined} onClick={()=>onNavigate("links")}>{translate(locale,"Link Management")}</button>
      {active==="links"&&linksPanel}
      <hr/>
      <button className={styles.utility} onClick={()=>onNavigate("personalization")}><span className={styles.plus}><Plus size={12}/></span>{translate(locale,"Personalization")}</button>
      <button className={`${styles.utility} ${active==="languages"?styles.active:""}`} aria-current={active==="languages"?"page":undefined} onClick={()=>onNavigate("languages")}><Globe2 size={17}/>{translate(locale,"Languages")}</button>
      {active==="languages"&&languagesPanel}
      <hr/>
      <small>{translate(locale,"Create with Operator")}</small>
      <button className={styles.utility} aria-label="Open Operator for copywriting help" disabled={disabled} onClick={()=>setCopyOpen(true)}><WandSparkles size={17}/>{translate(locale,"Copy")}</button>
      <a className={styles.styleLink} href={withLocale(routeForPage("email-preferences").replace("sending_configuration","drag_and_drop_email"),locale)} target="_blank" rel="noopener noreferrer">{translate(locale,"Style Settings")}<ExternalLink size={14}/></a>
    </nav>
    {copyOpen&&<div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="email-copy-title"><header><h2 id="email-copy-title">Copy</h2><button aria-label="Close copywriting help" onClick={()=>setCopyOpen(false)}><X size={19}/></button></header><p>Describe the copy to generate for your selected email text block.</p><label>Instructions<textarea value={prompt} maxLength={9000} onChange={event=>setPrompt(event.target.value)}/></label><button disabled={busy||!prompt.trim()} onClick={()=>void generate()}>{busy?"Generating…":"Generate copy"}</button>{error&&<p role="alert">{error}</p>}{copy&&<><label>Generated copy<textarea value={copy} onChange={event=>setCopy(event.target.value)}/></label><button disabled={disabled||!copy.trim()} onClick={()=>{onInsert(copy);setCopyOpen(false);}}>Insert copy</button></>}</section></div>}
  </>;
}
