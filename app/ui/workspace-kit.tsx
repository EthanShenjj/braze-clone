"use client";
import { cloneElement, isValidElement, useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search, X } from "lucide-react";
import { useUnsavedChanges } from "./workspace-unsaved";
import { requestAppNavigation } from "@/lib/unsaved-navigation";
import styles from "./workspace-pages.module.css";
export { styles };
export type WorkspaceRow = { id: string; type?: string; name: string; description: string; status: string; updatedAt: string; data: Record<string, unknown> };
export async function requestJson<T = Record<string, unknown>>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
  return result as T;
}
export function postAction<T = Record<string, unknown>>(module: string, payload: Record<string, unknown>) { return requestJson<T>(`/api/workspace/${module}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function useRows(type: string) {
  const [rows, setRows] = useState<WorkspaceRow[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const reload = useCallback(async () => { setLoading(true); setError(""); try { const result = await requestJson<{ data: WorkspaceRow[] }>(`/api/resources/${type}`); setRows(result.data); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load."); } finally { setLoading(false); } }, [type]);
  useEffect(() => { void reload(); }, [reload]);
  const save = async (payload: Partial<WorkspaceRow>, existing?: WorkspaceRow) => {
    const result = await requestJson<WorkspaceRow>(`/api/resources/${type}`, { method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, ...(existing ? { id: existing.id, expectedUpdatedAt: existing.updatedAt } : {}) }) });
    await reload(); return result;
  };
  return { rows, reload, save, loading, error };
}
export function downloadJson(name: string, value: unknown) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `${name.replace(/[^a-z0-9-_]/gi, "_")}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function downloadCsv(name: string, rows: Record<string, unknown>[]) { const keys = [...new Set(rows.flatMap(Object.keys))]; const cell = (v: unknown) => `"${String(typeof v === "object" ? JSON.stringify(v) : v ?? "").replaceAll('"', '""')}"`; const content = [keys.map(cell).join(","), ...rows.map(r => keys.map(k => cell(r[k])).join(","))].join("\r\n"); const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function WorkspacePage({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) { return <section className={`page-content ${styles.page}`}><header className={styles.heading}><div><h1>{title}</h1><p>{description}</p></div><div className={styles.actions}>{actions}</div></header>{children}</section>; }
export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) { return <section className={styles.card}>{(title || actions) && <header className={styles.cardHeading}><h2>{title}</h2>{actions}</header>}{children}</section>; }
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{children}</div>; }
export function Empty({ children }: { children: ReactNode }) { return <div className={styles.empty}>{children}</div>; }
export function FormField({ label, help, children }: { label: string; help?: string; children: ReactNode }) { const control = isValidElement<{ "aria-label"?: string }>(children) && ["input", "textarea", "select"].includes(String(children.type)) ? cloneElement(children, { "aria-label": children.props["aria-label"] ?? label }) : children; return <label className={styles.field}><span>{label}</span>{control}{help && <small>{help}</small>}</label>; }
export function Badge({ children }: { children: ReactNode }) { return <span className={styles.badge}>{children}</span>; }
export function Tabs({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) { return <nav className={styles.tabs} role="tablist">{values.map(tab => <button role="tab" aria-selected={value === tab} className={value === tab ? styles.activeTab : ""} key={tab} onClick={() => onChange(tab)}>{tab}</button>)}</nav>; }
export function Modal({ title, children, onClose, dirty = false }: { title: string; children: ReactNode; onClose: () => void; dirty?: boolean }) {
  useUnsavedChanges(dirty);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if (e.key === "Escape" && !dirty) requestAppNavigation(onClose); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [dirty, onClose]);
  const close = () => { if (dirty) { if (window.confirm("Discard your unsaved changes?")) onClose(); } else requestAppNavigation(onClose); };
  return <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={20}/></button></header>{children}</section></div>;
}
export function ResourceTable({ rows, columns, onOpen, actions, loading, error, onReload, name = "resources" }: { rows: WorkspaceRow[]; columns: Array<{ key: string; label: string; render?: (r: WorkspaceRow) => ReactNode }>; onOpen: (row: WorkspaceRow) => void; actions?: (row: WorkspaceRow) => ReactNode; loading?: boolean; error?: string; onReload?: () => void; name?: string }) {
  const [q, setQ] = useState(""); const [status, setStatus] = useState("All"); const [sort, setSort] = useState("updated"); const [start, setStart] = useState(0); const [limit, setLimit] = useState(12);
  const statuses = [...new Set(rows.map(r => r.status))];
  const filtered = rows.filter(r => (status === "All" || r.status === status) && `${r.name} ${r.description} ${JSON.stringify(r.data)}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt));
  const offset = Math.min(start, Math.max(0, Math.ceil(filtered.length / limit) - 1) * limit);
  useEffect(() => { setStart(0); }, [q, status, limit]);
  return <Card><div className={styles.toolbar}><div className={styles.search}><Search size={16}/><input aria-label={`Search ${name}`} placeholder={`Search ${name}`} value={q} onChange={e => setQ(e.target.value)}/></div><select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}><option>All</option>{statuses.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Sort results" value={sort} onChange={e => setSort(e.target.value)}><option value="updated">Last edited</option><option value="name">Name A–Z</option></select>{onReload && <button className="secondary" aria-label="Refresh list" onClick={onReload}><RefreshCw size={15}/></button>}<button className="secondary" onClick={() => downloadCsv(name, filtered.map(r => ({ name: r.name, status: r.status, ...r.data, updatedAt: r.updatedAt })))}><Download size={15}/> Export</button></div>
    {error ? <Notice error>{error}</Notice> : loading ? <Empty>Loading {name}…</Empty> : <><div className={styles.results}>{filtered.length} Results</div><div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Status</th>{columns.map(c => <th key={c.key}>{c.label}</th>)}<th>Last edited</th><th>Actions</th></tr></thead><tbody>{filtered.slice(offset, offset + limit).map(row => <tr key={row.id}><td><button className="link-button" onClick={() => onOpen(row)}>{row.name}</button>{row.description && <small className={styles.description}>{row.description}</small>}</td><td><Badge>{row.status}</Badge></td>{columns.map(c => <td key={c.key}>{c.render ? c.render(row) : renderValue(row.data[c.key])}</td>)}<td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</td><td><div className={styles.rowActions}>{actions?.(row)}</div></td></tr>)}</tbody></table>{!filtered.length && <Empty>{q || status !== "All" ? "No results match your filters." : `No ${name} yet.`}</Empty>}</div><footer className={styles.pagination}><span>{filtered.length ? offset + 1 : 0}–{Math.min(offset + limit, filtered.length)} of {filtered.length}</span><select aria-label="Rows per page" value={limit} onChange={e => setLimit(Number(e.target.value))}><option>12</option><option>24</option><option>48</option></select><button aria-label="Previous page" className="secondary" disabled={!offset} onClick={() => setStart(offset - limit)}><ChevronLeft size={16}/></button><button aria-label="Next page" className="secondary" disabled={offset + limit >= filtered.length} onClick={() => setStart(offset + limit)}><ChevronRight size={16}/></button></footer></>}
  </Card>;
}
export function renderValue(value: unknown): ReactNode { if (value == null || value === "") return "—"; if (typeof value === "boolean") return value ? "On" : "Off"; if (Array.isArray(value)) return value.length && typeof value[0] === "object" ? `${value.length} items` : value.join(", ") || "—"; if (typeof value === "object") return `${Object.keys(value).length} properties`; return String(value); }
