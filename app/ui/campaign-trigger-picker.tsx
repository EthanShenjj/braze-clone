'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {campaignTriggerCatalog} from '@/lib/campaign-form-model';
import styles from './campaign-forms.module.css';

export default function CampaignTriggerPicker({value,onChange,label='Select Trigger'}:{value:string;onChange:(value:string)=>void;label?:string}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0),[above,setAbove]=useState(false);
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),id=useId();
 const catalog:Array<{type:string;group:string}>=[...campaignTriggerCatalog,...(value&&!campaignTriggerCatalog.some(option=>option.type===value)?[{type:value,group:'SAVED LEGACY TRIGGER'}]:[])];
 const options=catalog.filter(option=>`${option.type} ${option.group}`.toLowerCase().includes(query.toLowerCase()));
 const show=()=>{setQuery('');setActive(Math.max(0,catalog.findIndex(option=>option.type===value)));setAbove((root.current?.getBoundingClientRect().bottom??0)+310>window.innerHeight);setOpen(true);};
 const choose=(selection:string)=>{onChange(selection);setOpen(false);setQuery('');input.current?.focus();};
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery('');}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 useEffect(()=>{if(open)root.current?.querySelector<HTMLElement>(`[id="${CSS.escape(`${id}-option-${active}`)}"]`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
 return <div ref={root} className={styles.triggerCombobox}>{label!=='Select Trigger'&&<label htmlFor={id}>{label}</label>}<div className={styles.triggerComboboxInput}>
 <input ref={input} id={id} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-listbox`} aria-autocomplete="list" aria-activedescendant={open&&options[active]?`${id}-option-${active}`:undefined} placeholder={value||'Select Trigger'} value={open?query:value} onClick={()=>{if(!open)show();}} onChange={event=>{if(!open)show();setQuery(event.target.value);setActive(0);}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);setQuery('');}
  else if(event.key==='Tab'){setOpen(false);setQuery('');}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open)show();else setActive(index=>options.length?(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length:0);}
  else if(open&&event.key==='Home'){event.preventDefault();setActive(0);}
  else if(open&&event.key==='End'){event.preventDefault();setActive(Math.max(0,options.length-1));}
  else if(event.key==='Enter'){event.preventDefault();if(open&&options[active])choose(options[active].type);else if(!open)show();}
 }}/><button type="button" tabIndex={-1} aria-label={`Toggle ${label}`} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(open)setOpen(false);else show();input.current?.focus();}}>⌄</button></div>
 {open&&<div id={`${id}-listbox`} role="listbox" aria-label={`${label} options`} className={`${styles.triggerOptions} ${above?styles.triggerOptionsAbove:''}`}>{[...new Set(options.map(option=>option.group))].map(group=><div role="group" aria-label={group} key={group}><div className={styles.triggerOptionGroup}>{group}</div>{options.filter(option=>option.group===group).map(option=>{const index=options.indexOf(option);return <button type="button" tabIndex={-1} role="option" aria-selected={value===option.type} data-active={active===index} id={`${id}-option-${index}`} key={option.type} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>setActive(index)} onClick={()=>choose(option.type)}>{option.type}</button>;})}</div>)}{!options.length&&<p>No matching triggers.</p>}</div>}
 </div>;
}
