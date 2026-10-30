"use client";
import {useState} from "react";
import styles from "./campaign-editors.module.css";
export function ChannelCopywriter({channel,current,apply}:{channel:string;current:string;apply:(text:string)=>void}){
 const[prompt,setPrompt]=useState(current),[text,setText]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 return <section className={styles.card}><h3>Copywriter</h3><label className={styles.field}>What would you like to write?<textarea value={prompt} onChange={e=>setPrompt(e.target.value)}/></label><button className={styles.button} disabled={busy||!prompt.trim()} onClick={async()=>{setBusy(true);setError("");try{const r=await fetch("/api/messages/assist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,prompt})}),p=await r.json();if(!r.ok)throw new Error(p.error);setText(p.text);}catch(e){setError(e instanceof Error?e.message:"Generation failed.");}finally{setBusy(false);}}}>{busy?"Generating…":"Generate copy"}</button>{error&&<p role="alert" className={styles.error}>{error}</p>}{text&&<><label className={styles.field}>Generated copy<textarea value={text} onChange={e=>setText(e.target.value)}/></label><button className={`${styles.button} ${styles.primary}`} onClick={()=>apply(text)}>Apply copy</button></>}</section>;
}
