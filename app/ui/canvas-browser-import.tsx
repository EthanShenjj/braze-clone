"use client";

import {useEffect,useState} from 'react';
import {getBrowserCanvas,listBrowserCanvases} from '@/lib/canvas-browser-store';
import styles from './canvas-browser-import.module.css';

export default function CanvasBrowserImport({workspaceId,onImported}:{workspaceId:string;onImported:()=>void}){
 const [ids,setIds]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=`canvas-imported-drafts:${workspaceId}`;
 useEffect(()=>{try{const value=JSON.parse(localStorage.getItem(key)??'[]'),imported=Array.isArray(value)?value:[];setIds(listBrowserCanvases(workspaceId).filter(canvas=>!imported.includes(canvas.id)).map(canvas=>canvas.id));}catch{setError('Browser drafts could not be read. The stored originals have been preserved.');}},[workspaceId,key]);
 async function importDrafts(){
  setBusy(true);setError('');const completed:string[]=[];
  try{for(const id of ids){const draft=getBrowserCanvas(id,workspaceId);if(!draft)continue;const response=await fetch('/api/canvases/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId,draft})}),result=await response.json();if(!response.ok)throw new Error(result.error??'Browser draft import failed.');completed.push(id);}
  }catch(cause){setError(cause instanceof Error?cause.message:'Browser draft import failed.');}
  finally{if(completed.length){setIds(current=>current.filter(id=>!completed.includes(id)));try{const value=JSON.parse(localStorage.getItem(key)??'[]');localStorage.setItem(key,JSON.stringify([...new Set([...(Array.isArray(value)?value:[]),...completed])]));}catch{}onImported();}setBusy(false);}
 }
 if(!ids.length&&!error)return null;
 return <aside className={styles.notice} aria-label="Browser draft recovery"><div>{ids.length>0&&<p>{ids.length} Canvas draft{ids.length===1?'':'s'} saved in this browser can be imported to the server. Local originals are preserved.</p>}{error&&<p role="alert">{error}</p>}</div>{ids.length>0&&<button disabled={busy} onClick={()=>void importDrafts()}>{busy?'Importing…':'Import browser drafts'}</button>}</aside>;
}
