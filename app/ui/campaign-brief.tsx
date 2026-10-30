"use client";
import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import type { MessageDraft } from '@/lib/campaign-shared';
import styles from './campaign-fidelity.module.css';

type Brief = { id:string; name:string; size:number; type:string; url:string };
export default function CampaignBrief({draft,update}:{draft:MessageDraft;update:(patch:Partial<MessageDraft>)=>void}) {
  const fileInput=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
  const brief=draft.config?.campaignBrief as Brief|undefined;
  async function upload(file?:File) {
    if(!file)return;
    if(file.size>15*1024*1024){setError('Choose a file up to 15MB.');return;}
    if(!/\.(pdf|txt|md|csv|docx)$/i.test(file.name)){setError('Choose a PDF, TXT, MD, CSV, or DOCX file.');return;}
    setError('');setBusy(true);
    try {const form=new FormData();form.set('file',file);const response=await fetch('/api/campaign-briefs',{method:'POST',body:form});const result=await response.json();if(!response.ok)throw new Error(result.error??'Upload failed.');update({config:{...draft.config,campaignBrief:result}});}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not upload the brief.');}
    finally {setBusy(false);if(fileInput.current)fileInput.current.value='';}
  }
  return <section className={styles.brief} aria-label="Campaign brief"><h3>Campaign brief</h3><p className={styles.muted}>Attach a brief so BrazeAI Operator can build your campaign and your Standards can review it against your goals</p>
    <div className={styles.upload} style={dragging?{borderColor:'#6325dc',background:'#f5efff'}:undefined} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!busy)void upload(event.dataTransfer.files[0]);}}>
      {brief?<><FileText size={27}/><div style={{flex:1}}><a className={styles.link} href={brief.url} download={brief.name}>{brief.name}</a><p>{(brief.size/1024).toFixed(1)} KB</p></div><button type="button" className={styles.icon} aria-label="Remove campaign brief" disabled={busy} onClick={()=>update({config:{...draft.config,campaignBrief:null}})}><X size={19}/></button></>:<div><strong>Attach a campaign brief (optional)</strong><p>PDF, TXT, MD, CSV, DOCX up to 15MB</p></div>}
      <button type="button" className={styles.button} disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={16}/>{busy?'Uploading…':brief?'Replace file':'Upload file'}</button>
      <input ref={fileInput} type="file" accept=".pdf,.txt,.md,.csv,.docx" aria-label="Upload campaign brief" style={{display:'none'}} disabled={busy} onChange={event=>void upload(event.target.files?.[0])}/>
    </div>{error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
