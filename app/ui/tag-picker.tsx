"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Tag, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { engagementTagLimit, resolveTagAliases, type WorkspaceTag } from "@/lib/tag-model";
import styles from "./tags.module.css";

export default function TagPicker({ value, onChange, locale = "en", disabled = false, limit = engagementTagLimit }: { value: string[]; onChange: (value: string[]) => void; locale?: Locale; disabled?: boolean; limit?: number }) {
  const zh = locale === "zh-CN";
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<WorkspaceTag[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    try { const response = await fetch("/api/tags", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setTags(result.data); setLoaded(true); setError(""); const resolved = resolveTagAliases(value, result.aliases ?? {}); if (JSON.stringify(resolved) !== JSON.stringify(value)) onChange(resolved); }
    catch (cause) { setError(cause instanceof Error ? cause.message : zh ? "标签加载失败，请重试。" : "Could not load tags. Please retry."); }
  };
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const select = (name: string) => { if (value.includes(name)) onChange(value.filter(tag => tag !== name)); else if (value.length < limit) onChange([...value, name]); };
  const create = async () => {
    if (!query.trim() || busy || !loaded || value.length >= limit) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: query.trim() }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setTags(current => [...current, result]); onChange([...value, result.name]); setQuery("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create tag."); }
    finally { setBusy(false); }
  };
  return <div className={styles.picker} ref={root} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className="secondary" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => { setOpen(current => !current); if (!open) void load(); }}><Tag size={14}/>{zh ? "标签" : "Tags"}<ChevronDown size={14}/></button>
    <div className={styles.chips}>{value.map(name => <span className={styles.chip} key={name}>{name}<button type="button" disabled={disabled || busy} aria-label={`${zh ? "移除标签" : "Remove tag"} ${name}`} onClick={() => onChange(value.filter(tag => tag !== name))}><X size={12}/></button></span>)}</div>
    {open && <div className={styles.menu} id={id}>
      <input autoFocus aria-label={zh ? "搜索或创建标签" : "Search or create a tag"} placeholder={zh ? "搜索或创建标签" : "Search or create a tag"} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); const existing = tags.find(tag => tag.name === query.trim()); if (existing) select(existing.name); else void create(); } }}/>
      <small>{value.length} / {limit}</small>
      <div className={styles.options}>{tags.filter(tag => tag.path.toLowerCase().includes(query.toLowerCase())).map(tag => <button key={tag.id} type="button" role="checkbox" aria-checked={value.includes(tag.name)} disabled={busy || (!value.includes(tag.name) && value.length >= limit)} onClick={() => select(tag.name)}><span>{value.includes(tag.name) ? "✓" : "□"}</span>{tag.path}</button>)}</div>
      {loaded && query.trim() && !tags.some(tag => tag.name === query.trim()) && <button type="button" disabled={busy || value.length >= limit} onClick={() => void create()}>+ {zh ? "创建" : "Create"} “{query.trim()}”</button>}
      {!loaded && !error && <small>{zh ? "加载中…" : "Loading…"}</small>}
      {value.length >= limit && <small>{zh ? "已达到标签数量上限。" : "Tag limit reached."}</small>}
      {error && <div role="alert" className={styles.error}>{error}<button type="button" onClick={() => void load()}>{zh ? "重试" : "Retry"}</button></div>}
    </div>}
  </div>;
}
