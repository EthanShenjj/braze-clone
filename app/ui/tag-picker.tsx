"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Tag, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { engagementTagLimit, type WorkspaceTag } from "@/lib/tag-model";
import { currentTagWorkspace, loadWorkspaceTags, publishTagChanges, subscribeTagChanges } from "@/lib/tag-client";
import styles from "./tags.module.css";

export type TagPickerProps = {
  value:string[];onChange:(value:string[])=>void;locale?:Locale;disabled?:boolean;limit?:number;
  context?:string;resourceType?:string;workspaceId?:string;triggerLabel?:string;label?:string;
  placeholder?:string;showSelected?:boolean;allowCreate?:boolean;candidateNames?:string[];
};
export default function TagPicker({value,onChange,locale="en",disabled=false,limit=engagementTagLimit,context="assignment",resourceType,workspaceId:providedWorkspace,triggerLabel,label,placeholder,showSelected=true,allowCreate:providedCreate,candidateNames}:TagPickerProps){
  const workspaceId=providedWorkspace??currentTagWorkspace(),zh=locale==="zh-CN",filter=context==="filter"||context==="list-filter",inline=filter||context==="bulk"||context==="parent";
  const allowCreate=providedCreate??(!filter&&context!=="parent"),id=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),revision=useRef(0);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[tags,setTags]=useState<WorkspaceTag[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[active,setActive]=useState(0),[above,setAbove]=useState(false),[height,setHeight]=useState(300);
  const current=useRef({value,onChange});current.current={value,onChange};
  const load=useCallback(async()=>{
    const request=++revision.current;
    try{const result=await loadWorkspaceTags(workspaceId,context);if(request!==revision.current)return;setTags(result.data);setLoaded(true);const missing=current.current.value.filter(name=>Object.hasOwn(result.aliases??{},name)&&result.aliases[name]===null);setError(missing.length?(zh?"此标签已删除，请移除：":"This tag was deleted. Remove it: ")+missing.join(", "):"");const resolved=[...new Set(current.current.value.map(name=>result.aliases?.[name]??name))];if(JSON.stringify(resolved)!==JSON.stringify(current.current.value))current.current.onChange(resolved);}
    catch(cause){if(request===revision.current)setError(cause instanceof Error?cause.message:"Could not load tags. Please retry.");}
  },[workspaceId,context,zh]);
  useEffect(()=>{setLoaded(false);setTags([]);setOpen(false);setQuery("");void load();return()=>{revision.current++;};},[load]);
  useEffect(()=>subscribeTagChanges(detail=>{if(detail.workspaceId===workspaceId)void load();}),[workspaceId,load]);
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery("");}};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[open]);
  const show=()=>{if(disabled)return;const rect=root.current?.getBoundingClientRect();const below=window.innerHeight-(rect?.bottom??0)-14;setAbove(below<240&&(rect?.top??0)>below);setHeight(Math.max(100,Math.min(300,(below<240&&(rect?.top??0)>below?(rect?.top??0)-90:below)-8)));setOpen(true);setActive(0);if(!loaded)void load();if(!inline)setTimeout(()=>input.current?.focus(),0);};
  const visible=tags.filter(tag=>(!candidateNames||candidateNames.includes(tag.name))&&tag.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const canCreate=allowCreate&&loaded&&query.trim()&&!tags.some(tag=>tag.name===query.trim()),options=visible.length+(canCreate?1:0),atLimit=value.length>=limit;
  const select=(name:string)=>{if(busy||disabled)return;if(value.includes(name))onChange(value.filter(tag=>tag!==name));else if(!atLimit)onChange([...value,name]);input.current?.focus();};
  const create=async()=>{if(!canCreate||busy||atLimit)return;setBusy(true);setError("");try{const response=await fetch("/api/tags?workspaceId="+encodeURIComponent(workspaceId),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:query.trim(),workspaceId})});const tag=await response.json();if(!response.ok)throw new Error(tag.error??"Could not create tag.");setTags(previous=>[...previous.filter(item=>item.id!==tag.id),tag]);current.current.onChange([...new Set([...current.current.value,tag.name])]);setQuery("");publishTagChanges({workspaceId});input.current?.focus();}catch(cause){setError(cause instanceof Error?cause.message:"Could not create tag.");}finally{setBusy(false);}};
  const keydown=(event:React.KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==="Escape"){event.preventDefault();if(open)event.stopPropagation();setOpen(false);setQuery("");}
    else if(event.key==="Tab")setOpen(false);
    else if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!open)show();else setActive(index=>options?(index+(event.key==="ArrowDown"?1:-1)+options)%options:0);}
    else if(event.key==="Home"&&open){event.preventDefault();setActive(0);}
    else if(event.key==="End"&&open){event.preventDefault();setActive(Math.max(0,options-1));}
    else if(event.key==="Enter"){event.preventDefault();if(!open)show();else if(visible[active])select(visible[active].name);else if(canCreate)void create();}
  };
  useEffect(()=>{if(open)root.current?.querySelector<HTMLElement>('[data-tag-active="true"]')?.scrollIntoView({block:"nearest"});},[active,open]);
  const chips=<div className={styles.chips}>{value.map(name=><span className={styles.chip} key={name}>{tags.find(tag=>tag.name===name)?.path??name}<button type="button" disabled={disabled||busy} aria-label={(zh?"移除标签 ":"Remove tag ")+name} onClick={()=>onChange(value.filter(tag=>tag!==name))}><X size={12}/></button></span>)}</div>;
  const inputLabel=label??(filter?(triggerLabel??"Tags"):(inline?triggerLabel??"Add tags":"Add tags"));
  const selector=<div className={styles.tagInput}>{inline&&showSelected&&!filter&&value.length>0&&chips}<input ref={input} role="combobox" aria-label={inputLabel} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open&&options?id+"-"+active:undefined} disabled={disabled||busy} placeholder={placeholder??(filter?(value.length?value.length+" tags selected":"All Tags"):(zh?"添加标签":"Add tags"))} value={query} onFocus={show} onClick={()=>{if(!open)show();}} onChange={event=>{setQuery(event.target.value);setActive(0);if(!open)show();}} onKeyDown={keydown}/><button type="button" aria-label={"Toggle "+inputLabel} disabled={disabled||busy} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(open)setOpen(false);else show();}}><ChevronDown size={16}/></button></div>;
  return <div ref={root} data-tag-context={context} data-resource-type={resourceType} className={styles.picker+" "+(inline?styles.inlinePicker:"")}>
    {!inline&&<><button type="button" className={styles.trigger} disabled={disabled} aria-expanded={open} aria-controls={id} onClick={()=>open?setOpen(false):show()}><Tag size={15}/>{triggerLabel??(zh?"标签":"Tags")}<ChevronDown size={14}/></button>{showSelected&&chips}</>}
    {inline?selector:open&&<div className={styles.pickerInputPopover+" "+(above?styles.assignmentInputAbove:"")}>{selector}</div>}
    {open&&<div id={id} role="listbox" aria-label={inputLabel+" options"} aria-multiselectable="true" className={styles.optionsPopover+" "+(!inline?styles.assignmentOptions:"")+" "+(above?(inline?styles.optionsAbove:styles.assignmentAbove):"")} style={{maxHeight:height}}>
      {!loaded&&!error&&<p role="status">{zh?"加载中…":"Loading…"}</p>}
      {visible.map((tag,index)=><button type="button" role="option" aria-selected={value.includes(tag.name)} data-tag-active={active===index} id={id+"-"+index} key={tag.id} disabled={busy||(!value.includes(tag.name)&&atLimit)} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>setActive(index)} onClick={()=>select(tag.name)}><span>{tag.path}</span><input type="checkbox" readOnly checked={value.includes(tag.name)} tabIndex={-1} aria-hidden="true"/></button>)}
      {canCreate&&<button type="button" role="option" aria-selected={false} data-tag-active={active===visible.length} id={id+"-"+visible.length} disabled={busy||atLimit} onMouseDown={event=>event.preventDefault()} onClick={()=>void create()}>{zh?"创建 ":"Create "}"{query.trim()}"</button>}
      {loaded&&!visible.length&&!canCreate&&<p>{zh?"暂无匹配标签":"No tags found"}</p>}
      {atLimit&&<p>{zh?"已达到标签数量上限。":"Tag limit reached ("+limit+")."}</p>}
      {error&&<div role="alert" className={styles.error}>{error}<button type="button" onClick={()=>void load()}>{zh?"重试":"Retry"}</button></div>}
    </div>}
    {!open&&error&&<div role="alert" className={styles.error}>{error}</div>}
  </div>;
}
