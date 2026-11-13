"use client";
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {History,X} from 'lucide-react';
import {canvasViewSnapshotKey,createCanvasViewSnapshot,readCanvasViewSnapshot,writeCanvasViewSnapshot,canvasChangesSinceViewed,type CanvasChangeDocument,type CanvasViewedSnapshot,type CanvasViewChange,type CanvasViewScope,type CanvasViewStorage} from '@/lib/canvas-change-summary-model';
import styles from './canvas-change-summary.module.css';

function browserStorage():CanvasViewStorage|null{try{return window.localStorage;}catch{return null;}}
function display(value:unknown){if(value===undefined)return'Not set';if(typeof value==='string')return value||'(empty)';return JSON.stringify(value,null,2);}
function fieldName(path:string){return path.replace(/^wizard\./,'').replace(/^config\./,'').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('.',' / ');}
function ChangeValues({before,after,kind}:{before?:unknown;after?:unknown;kind:CanvasViewChange['kind']}){return <div className={styles.values}>{kind!=='added'&&<div><strong>Previous view</strong><pre>{display(before)}</pre></div>}{kind!=='removed'&&<div><strong>Current view</strong><pre>{display(after)}</pre></div>}</div>;}
function ChangesDialog({changes,viewedAt,close}:{changes:CanvasViewChange[];viewedAt?:string;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),title=useId();
 useEffect(()=>{const element=ref.current;if(element&&!element.open)element.showModal();return()=>{if(element?.open)element.close();};},[]);
 return <dialog ref={ref} aria-labelledby={title} className={styles.dialog} onCancel={event=>{event.preventDefault();close();}}><header><h2 id={title}>Changes Since Last Viewed</h2><button type="button" aria-label="Close Changes Since Last Viewed" className={styles.close} onClick={close}><X size={20}/></button></header><div className={styles.body}><p className={styles.note}>{viewedAt?`Compared with your view in this browser on ${new Date(viewedAt).toLocaleString()}.`:'No previous view snapshot is available in this browser.'}</p>{changes.length?<><p className={styles.count}>{changes.length} {changes.length===1?'change':'changes'}</p><ol className={styles.list}>{changes.map(change=><li key={change.id}><details><summary><span className={styles.badge} data-kind={change.kind}>{change.kind==='modified'?'Updated':change.kind==='added'?'Added':'Removed'}</span><span>{change.label}</span></summary>{change.fields?.length?change.fields.map(field=><section className={styles.field} key={field.path}><h3>{fieldName(field.path)}</h3><ChangeValues before={field.before} after={field.after} kind="modified"/></section>):<ChangeValues before={change.before} after={change.after} kind={change.kind}/>}</details></li>)}</ol></>:<p className={styles.empty}>No changes since your last recorded view.</p>}</div><footer><button type="button" onClick={close}>Close</button></footer></dialog>;
}
/** Browser view preference only; never updates a Canvas, graph, wizard, or version record. */
export default function CanvasChangeSummary({workspaceId,canvasId,current}:{workspaceId:string;canvasId:string;current:CanvasChangeDocument}){
 const scope=useMemo<CanvasViewScope>(()=>({workspaceId,canvasId}),[workspaceId,canvasId]),key=canvasViewSnapshotKey(scope),[history,setHistory]=useState<{key:string;snapshot:CanvasViewedSnapshot|null}>({key:'',snapshot:null}),[open,setOpen]=useState(false),documents=useRef(new Map<string,CanvasChangeDocument>()),generation=useRef(0),activeKey=useRef(key);
 documents.current.set(key,current);
 const snapshot=history.key===key?history.snapshot:null,changes=useMemo(()=>canvasChangesSinceViewed(scope,snapshot,current),[scope,snapshot,current]);
 useEffect(()=>{
  const thisGeneration=++generation.current;activeKey.current=key;setOpen(false);setHistory({key,snapshot:readCanvasViewSnapshot(browserStorage(),scope)});
  const save=()=>writeCanvasViewSnapshot(browserStorage(),createCanvasViewSnapshot(scope,documents.current.get(key)??current));
  window.addEventListener('pagehide',save);
  return()=>{
   window.removeEventListener('pagehide',save);const viewed=createCanvasViewSnapshot(scope,documents.current.get(key)??current);
   // React development remounts effects. A same-scope remount cancels this write.
   queueMicrotask(()=>{if(generation.current===thisGeneration||activeKey.current!==key){writeCanvasViewSnapshot(browserStorage(),viewed);documents.current.delete(key);}});
  };
 },[key,scope]);
 const close=()=>{const viewed=createCanvasViewSnapshot(scope,documents.current.get(key)??current);writeCanvasViewSnapshot(browserStorage(),viewed);setHistory({key,snapshot:viewed});setOpen(false);};
 return <><button type="button" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><History size={14} aria-hidden="true"/><span>{changes.length} Changes Since Last Viewed</span></button>{open&&<ChangesDialog changes={changes} viewedAt={snapshot?.viewedAt} close={close}/>}</>;
}
