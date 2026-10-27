"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { tagParentIsValid, type WorkspaceTag } from "@/lib/tag-model";
import type { Locale } from "@/lib/i18n";
import styles from "./tags.module.css";

function TagDialog({ children, titleId, alert = false, busy, dismiss }: { children: ReactNode; titleId: string; alert?: boolean; busy: boolean; dismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} role={alert ? "alertdialog" : "dialog"} aria-labelledby={titleId} className={styles.dialog} onCancel={event => { event.preventDefault(); if (!busy) dismiss(); }}>{children}</dialog>;
}

export default function TagManagement({ locale, notify }: { locale: Locale; notify: (message: string) => void }) {
  const zh = locale === "zh-CN";
  const [tags, setTags] = useState<WorkspaceTag[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<WorkspaceTag | "new" | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceTag | null>(null);
  const request = async (url: string, method = "GET", body?: unknown) => {
    const response = await fetch(url, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  };
  const load = useCallback(async () => { try { setTags((await request("/api/tags")).data); setError(""); } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const open = (tag: WorkspaceTag | "new") => { setEditing(tag); setName(tag === "new" ? "" : tag.name); setParentId(tag === "new" ? "" : tag.parentId ?? ""); setError(""); };
  const save = async () => {
    if (!editing || busy) return; setBusy(true); setError("");
    try {
      await request(editing === "new" ? "/api/tags" : `/api/tags/${editing.id}`, editing === "new" ? "POST" : "PATCH", { name, parentId: parentId || null, ...(editing === "new" ? {} : { expectedUpdatedAt: editing.updatedAt }) });
      setEditing(null); await load(); notify(zh ? "标签已保存。" : "Tag saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save tag."); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || busy) return; setBusy(true); setError("");
    try { await request(`/api/tags/${deleting.id}?expectedUpdatedAt=${encodeURIComponent(deleting.updatedAt)}`, "DELETE"); setDeleting(null); await load(); notify(zh ? "标签已删除。" : "Tag deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete tag."); } finally { setBusy(false); }
  };
  const filtered = tags.filter(tag => tag.path.toLowerCase().includes(query.toLowerCase()));
  return <section className={`page-content ${styles.page}`}>
    <div className={styles.heading}><div><h1>{zh ? "标签管理" : "Tag Management"}</h1><p>{zh ? "创建和管理工作区标签，用于组织 Campaign、Canvas 和受众细分。" : "Create and manage workspace tags to organize Campaigns, Canvases, and Segments."}</p></div><button className="primary" onClick={() => open("new")}><Plus size={16}/>{zh ? "创建标签" : "Create Tag"}</button></div>
    {error && !editing && !deleting && <div role="alert" className={styles.error}>{error}<button className="text-button" onClick={() => void load()}>{zh ? "重新加载" : "Reload"}</button></div>}
    <div className={styles.toolbar}><input className={styles.search} aria-label={zh ? "搜索标签" : "Search tags"} placeholder={zh ? "搜索标签" : "Search tags"} value={query} onChange={event => setQuery(event.target.value)}/><span>{filtered.length} {zh ? "个标签" : "Tags"}</span></div>
    <div className={styles.scroll}><table className={styles.table}><thead><tr><th>{zh ? "标签名称" : "Tag Name"}</th><th>{zh ? "嵌套于" : "Nested Under"}</th><th>{zh ? "使用情况" : "Usage"}</th><th>{zh ? "操作" : "Actions"}</th></tr></thead><tbody>{filtered.map(tag => { const children = tags.filter(child => child.parentId === tag.id); const used = Boolean(tag.usages.length || children.length); return <tr key={tag.id}><td><strong>{tag.name}</strong>{tag.parentId && <div className={styles.path}>{tag.path}</div>}</td><td>{tags.find(parent => parent.id === tag.parentId)?.name ?? "—"}</td><td><button className={styles.count} aria-expanded={expanded === tag.id} onClick={() => setExpanded(expanded === tag.id ? null : tag.id)}>{tag.usages.length} {zh ? "个资源" : "resources"}</button>{expanded === tag.id && <div className={styles.usage}>{tag.usages.map(usage => <div key={`${usage.type}:${usage.id}`}>{usage.name}<br/><small>{usage.type} · {usage.status}</small></div>)}{!tag.usages.length && <small>{zh ? "尚未使用" : "No resource references"}</small>}</div>}</td><td><div className={styles.rowActions}><button onClick={() => open(tag)}>{zh ? "重命名 / 嵌套" : "Rename / Nest"}</button><button disabled={used} title={used ? zh ? "请先移除资源引用，并移走子标签。" : "Remove resource references and move child tags first." : undefined} onClick={() => { setDeleting(tag); setError(""); }}>{zh ? "删除" : "Delete"}</button></div></td></tr>; })}</tbody></table></div>
    {!filtered.length && <div className={styles.empty}>{loading ? zh ? "加载中…" : "Loading…" : zh ? "没有匹配的标签。" : "No matching tags."}</div>}
    {editing && <TagDialog titleId="tag-dialog-title" busy={busy} dismiss={() => setEditing(null)}><h2 id="tag-dialog-title">{editing === "new" ? zh ? "创建标签" : "Create Tag" : zh ? "编辑标签" : "Edit Tag"}</h2><form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}><label>{zh ? "标签名称" : "Tag Name"}<input autoFocus required value={name} onChange={event => setName(event.target.value)}/></label><label>{zh ? "嵌套于" : "Nest Tag Under"}<select aria-label={zh ? "嵌套于" : "Nest Tag Under"} value={parentId} onChange={event => setParentId(event.target.value)}><option value="">{zh ? "无（顶层标签）" : "None (top-level tag)"}</option>{tags.filter(tag => editing === "new" || tagParentIsValid(editing.id, tag.id, tags)).map(tag => <option key={tag.id} value={tag.id}>{tag.path}</option>)}</select></label>{editing !== "new" && editing.usages.length > 0 && <p className={styles.note}>{zh ? "重命名会同步更新资源标签和全局对照组排除设置。" : "Renaming updates resource tags and Global Control Group exclusion settings."}</p>}{error && <div role="alert" className={styles.error}>{error}</div>}<div className={styles.actions}><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>{zh ? "取消" : "Cancel"}</button><button className="primary" disabled={busy || !name.trim()}>{busy ? zh ? "保存中…" : "Saving…" : zh ? "保存" : "Save"}</button></div></form></TagDialog>}
    {deleting && <TagDialog titleId="delete-tag-title" alert busy={busy} dismiss={() => setDeleting(null)}><h2 id="delete-tag-title">{zh ? "删除标签" : "Delete Tag"}</h2><p>{zh ? "确定永久删除此标签？" : "Permanently delete this tag?"} <strong>{deleting.name}</strong></p>{error && <div role="alert" className={styles.error}>{error}</div>}<div className={styles.actions}><button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>{zh ? "取消" : "Cancel"}</button><button className="primary" disabled={busy} onClick={() => void remove()}>{zh ? "删除" : "Delete"}</button></div></TagDialog>}
  </section>;
}
