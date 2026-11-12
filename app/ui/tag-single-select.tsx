"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./tags.module.css";

type Choice={id:string;label:string};
export default function TagSingleSelect({label,value,options,change,placeholder="Select...",searchable=false,invalid=false,disabled=false,blur}:{label:string;value:string;options:Choice[];change:(value:string)=>void;placeholder?:string;searchable?:boolean;invalid?:boolean;disabled?:boolean;blur?:()=>void}) {
  const id=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[active,setActive]=useState(0),[above,setAbove]=useState(false),[height,setHeight]=useState(300);
  const selected=options.find(option=>option.id===value),visible=searchable&&query?options.filter(option=>option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())):options;
  const close=()=>{setOpen(false);setQuery("");};
  const show=(last=false)=>{
    if(disabled)return;
    const rect=root.current?.getBoundingClientRect(),below=window.innerHeight-(rect?.bottom??0)-14,up=(rect?.top??0)-90,preferAbove=below<240&&up>below;
    setAbove(preferAbove);setHeight(Math.max(100,Math.min(300,(preferAbove?up:below)-8)));setQuery("");
    const index=options.findIndex(option=>option.id===value);setActive(index>=0?index:last?Math.max(0,options.length-1):0);setOpen(true);
  };
  const choose=(option:Choice)=>{change(option.id);close();input.current?.focus();};
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery("");blur?.();}};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[open,blur]);
  useEffect(()=>{if(open)root.current?.querySelector<HTMLElement>('[data-tag-active="true"]')?.scrollIntoView({block:"nearest"});},[open,active,query]);
  const activeIndex=Math.min(active,Math.max(0,visible.length-1));
  return <div ref={root} className={`${styles.picker} ${styles.inlinePicker}`} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)){close();blur?.();}}}>
    <div className={styles.tagInput} style={invalid?{borderColor:"#b3263a"}:undefined}>
      <input disabled={disabled} ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete={searchable?"list":"none"} aria-activedescendant={open&&visible.length?`${id}-${activeIndex}`:undefined} aria-invalid={invalid} readOnly={!searchable} value={open&&searchable?query:selected?.label??""} placeholder={open&&selected?selected.label:placeholder} onFocus={()=>show()} onClick={()=>{if(!open)show();}} onChange={event=>{if(!searchable)return;setQuery(event.target.value);setActive(0);if(!open)setOpen(true);}} onKeyDown={event=>{
        if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}
        else if(event.key==="Tab")close();
        else if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!open)show(event.key==="ArrowUp");else setActive(index=>visible.length?(index+(event.key==="ArrowDown"?1:-1)+visible.length)%visible.length:0);}
        else if(event.key==="Home"&&open){event.preventDefault();setActive(0);}
        else if(event.key==="End"&&open){event.preventDefault();setActive(Math.max(0,visible.length-1));}
        else if(event.key==="Enter"){event.preventDefault();if(!open)show();else if(visible[activeIndex])choose(visible[activeIndex]);}
      }}/>
      <button disabled={disabled} type="button" aria-label={`Toggle ${label}`} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(open)close();else{input.current?.focus();show();}}}><ChevronDown size={16}/></button>
    </div>
    {open&&<div id={id} role="listbox" aria-label={`${label} options`} className={`${styles.optionsPopover} ${above?styles.optionsAbove:""}`} style={{maxHeight:height}}>{visible.map((option,index)=><button key={option.id} id={`${id}-${index}`} type="button" role="option" aria-selected={value===option.id} data-tag-active={activeIndex===index} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>setActive(index)} onClick={()=>choose(option)}>{option.label}</button>)}{!visible.length&&<p>No options found</p>}</div>}
  </div>;
}
