"use client";
import {useState,useId,useRef,useEffect} from "react";
import {X,ChevronDown} from "lucide-react";
import styles from "./canvas-wizard.module.css";
type Segment={id:string;name:string};
export function CanvasSegmentPicker({ label, selected, segments, onChange, placeholder="Search Segments…", itemLabel="segment" }: { label: string; selected: string[]; segments: Segment[]; onChange: (next: string[]) => void; placeholder?:string;itemLabel?:string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const matches = segments.filter(segment => segment.name.toLowerCase().includes(query.trim().toLowerCase()));
  const missing = selected.filter(value => !segments.some(segment => segment.id === value));
  const toggle = (value: string) => { onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]); setQuery(""); setActiveIndex(0); };
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <div className={styles.segmentPicker} ref={root}><label htmlFor={id}>{label}</label><div className={styles.segmentSearch}>{selected.map(value => {
    const segment = segments.find(segment => segment.id === value);
    return <button className={styles.segmentChip} key={value} aria-label={`Remove ${itemLabel} ${segment?.name ?? value}`} onClick={() => onChange(selected.filter(item => item !== value))}>{segment?.name ?? `Unavailable ${itemLabel} (${value})`} <X size={13}/></button>;
  })}<input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-results`} aria-autocomplete="list" aria-activedescendant={open && matches[activeIndex] ? `${id}-option-${activeIndex}` : undefined} placeholder={placeholder} value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }} onKeyDown={event => {
    if (event.key === "Escape") { setOpen(false); event.stopPropagation(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
    if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); toggle(matches[activeIndex].id); }
  }}/><button className={styles.segmentToggle} aria-label={`Toggle ${label}`} aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown size={16}/></button></div>{open && <div className={styles.segmentResults} role="listbox" aria-label={`${label} options`} id={`${id}-results`} aria-multiselectable>{matches.map((segment, index) => <button id={`${id}-option-${index}`} role="option" aria-selected={selected.includes(segment.id)} key={segment.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => toggle(segment.id)}><span aria-hidden>{selected.includes(segment.id) ? "☑" : "☐"}</span>{segment.name}</button>)}{!matches.length && <p>No matching {itemLabel}s.</p>}</div>}{missing.length > 0 && <p className={styles.selectionError} role="alert">{missing.length} selected {itemLabel}(s) are no longer available in this workspace. Remove them or choose an available {itemLabel}.</p>}</div>;
}

