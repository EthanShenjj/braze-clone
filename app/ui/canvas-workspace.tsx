"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Filter, LayoutPanelLeft, MoreHorizontal, Plus, Search, X } from "lucide-react";
import type { CanvasRecord } from "@/lib/braze-store";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";
import { requestAppNavigation } from "@/lib/unsaved-navigation";
import CanvasWizard from "./canvas-wizard";
import styles from "./canvas-workspace.module.css";

type Column = "description" | "lastEditedBy" | "lastEdited" | "alerts" | "teams";
type FilterState = { experience: string; createdBy: string; lastEditedBy: string; dateField: string; from: string; to: string; targetSegment: string; alertsOnly: boolean };
const defaultFilters: FilterState = { experience: "", createdBy: "", lastEditedBy: "", dateField: "", from: "", to: "", targetSegment: "", alertsOnly: false };
const columnLabels: Record<Column, string> = { description: "Description", lastEditedBy: "Last edited by", lastEdited: "Last edited", alerts: "Alerts Configured", teams: "Teams" };
const templates = [
  { id: "welcome", name: "Welcome journey", description: "Welcome new customers with a timed, cross-channel journey." },
  { id: "abandoned", name: "Abandoned intent", description: "Re-engage customers after they leave before converting." },
  { id: "payment", name: "Payment reminder", description: "Remind customers before an upcoming payment." },
];

export default function CanvasWorkspace({ locale, notify }: { locale: Locale; notify: (message: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const canvasId = pathname.match(/^\/engagement\/canvas\/([^/]+)$/)?.[1] ?? null;
  const [items, setItems] = useState<CanvasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Draft");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [columns, setColumns] = useState<Column[]>(["description", "lastEditedBy", "lastEdited", "alerts"]);
  const [menu, setMenu] = useState<"create" | "filters" | "columns" | string | null>(null);
  const [modal, setModal] = useState<"create" | "templates" | "edit" | "tour" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<"name" | "updatedAt">("updatedAt");
  const [direction, setDirection] = useState<-1 | 1>(-1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/canvases", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load Canvases.");
      const result = await response.json();
      setItems(Array.isArray(result.data) ? result.data : []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load Canvases."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    try { const saved = localStorage.getItem("canvas-list-columns"); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setColumns(parsed.filter((value): value is Column => value in columnLabels)); } } catch { return; }
  }, []);
  useEffect(() => { setPage(1); setSelected([]); }, [status, tag, query, filters, pageSize]);

  const visible = useMemo(() => items.filter(item => {
    if (status !== "All" && item.status !== status) return false;
    if (tag && !item.tags.includes(tag)) return false;
    if (query && !`${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filters.experience && item.experience !== filters.experience) return false;
    if (filters.createdBy && item.createdBy !== filters.createdBy) return false;
    if (filters.lastEditedBy && item.lastEditedBy !== filters.lastEditedBy) return false;
    if (filters.targetSegment && item.targetSegment !== filters.targetSegment) return false;
    if (filters.alertsOnly && !item.alertsConfigured) return false;
    const date = filters.dateField === "createdAt" ? item.createdAt : item.updatedAt;
    if (filters.dateField && filters.from && date.slice(0, 10) < filters.from) return false;
    if (filters.dateField && filters.to && date.slice(0, 10) > filters.to) return false;
    return true;
  }).sort((first, second) => direction * first[sort].localeCompare(second[sort])), [items, status, tag, query, filters, sort, direction]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allSelected = rows.length > 0 && rows.every(item => selected.includes(item.id));
  const tags = [...new Set(items.flatMap(item => item.tags))].sort();
  const unique = (key: keyof CanvasRecord) => [...new Set(items.map(item => item[key]).filter((value): value is string => typeof value === "string" && Boolean(value)))].sort();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const changeFilters = (patch: Partial<FilterState>) => setFilters(previous => ({ ...previous, ...patch }));
  const toggleColumn = (column: Column) => {
    const next = columns.includes(column) ? columns.filter(item => item !== column) : [...columns, column];
    setColumns(next); localStorage.setItem("canvas-list-columns", JSON.stringify(next));
  };
  const changeSort = (column: "name" | "updatedAt") => { if (sort === column) setDirection(value => value === 1 ? -1 : 1); else { setSort(column); setDirection(column === "name" ? 1 : -1); } };
  const navigate = (id?: string) => requestAppNavigation(() => { setMenu(null); router.push(withLocale(id ? `/engagement/canvas/${id}?step=basics` : "/engagement/canvas", locale)); });
  const request = async (url: string, method: string, body: Record<string, unknown>) => {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Canvas action failed.");
    return result as CanvasRecord;
  };
  const runAction = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); setMenu(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas action failed."); }
    finally { setBusy(false); }
  };
  const createCanvas = (selectedTemplate?: string) => void runAction(async () => {
    const templateItem = templates.find(item => item.id === selectedTemplate);
    const baseTitle = templateItem?.name ?? `New Canvas - ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
    let title = baseTitle;
    let suffix = 2;
    while (items.some(item => item.name.toLowerCase() === title.toLowerCase() && item.status !== "Archived")) title = `${baseTitle} ${suffix++}`;
    const result = await request("/api/canvases", "POST", { name: title, description: templateItem?.description ?? "", template: selectedTemplate });
    setModal(null);
    notify("Canvas draft created.");
    navigate(result.id);
  });
  const openEdit = (item: CanvasRecord) => { setName(item.name); setDescription(item.description); setTagsText(item.tags.join(", ")); setEditingId(item.id); setModal("edit"); setMenu(null); };
  const saveDetails = () => void runAction(async () => {
    const body = { name, description, tags: tagsText.split(",").map(value => value.trim()).filter(Boolean) };
    const result = editingId ? await request(`/api/canvases/${editingId}`, "PATCH", { ...body, updatedAt: items.find(item => item.id === editingId)?.updatedAt }) : await request("/api/canvases", "POST", { ...body, template: template ?? undefined });
    setModal(null); notify(editingId ? "Canvas details saved." : "Canvas created.");
    if (!editingId) navigate(result.id);
  });
  const duplicate = (item: CanvasRecord) => void runAction(async () => { await request(`/api/canvases/${item.id}`, "POST", { action: "duplicate" }); notify("Canvas duplicated as a draft."); });
  const archive = (ids: string[]) => {
    if (!window.confirm(`Archive ${ids.length} Canvas${ids.length === 1 ? "" : "es"}? They will be hidden from the Draft view.`)) return;
    void runAction(async () => { for (const id of ids) await request(`/api/canvases/${id}`, "PATCH", { status: "Archived" }); setSelected([]); notify("Canvas archived."); });
  };
  const toggleAlerts = (item: CanvasRecord) => void runAction(async () => { await request(`/api/canvases/${item.id}`, "PATCH", { alertsConfigured: !item.alertsConfigured }); notify(item.alertsConfigured ? "Canvas alert flag removed." : "Canvas alert flag configured."); });

  if (canvasId) {
    const current = items.find(item => item.id === canvasId);
    if (loading) return <div className={styles.message}>Loading Canvas…</div>;
    if (!current) return <div className={styles.message} role="alert">Canvas not found. <button onClick={() => navigate()}>Back to all Canvases</button></div>;
    return <CanvasWizard key={canvasId} canvasId={canvasId} onBack={() => navigate()} onUpdated={() => void refresh()} locale={locale} notify={notify}/>;
  }

  return <section className={styles.page}>
    <div className={styles.heading}><div><h1>Canvas <span className={styles.access}>♙ Limited access</span></h1><p>Design and launch customer journeys with Canvas. Drag, drop, and connect<br/> messaging across channels to create seamless, automated experiences.</p></div><div className={styles.headingActions}><button className={styles.outline} onClick={() => setModal("tour")}>Take a tour</button><div className={styles.anchor}><button className={styles.primary} onClick={() => setMenu(menu === "create" ? null : "create")}>Create Canvas <ChevronDown size={16}/></button>{menu === "create" && <div className={styles.popover}><button disabled={busy} onClick={() => createCanvas()}><Plus size={16}/> Start a New Canvas</button><button onClick={() => { setModal("templates"); setMenu(null); }}><LayoutPanelLeft size={16}/> Use a Canvas Template</button></div>}</div></div></div>
    <div className={styles.toolbar}><label>Status<select value={status} onChange={event => setStatus(event.target.value)}>{["Draft", "Active", "Stopped", "Archived", "All"].map(value => <option key={value}>{value}</option>)}</select></label><label>Tags<select value={tag} onChange={event => setTag(event.target.value)}><option value="">All Tags</option>{tags.map(value => <option key={value}>{value}</option>)}</select></label><div className={styles.anchor}><button className={styles.outline} aria-expanded={menu === "filters"} onClick={() => setMenu(menu === "filters" ? null : "filters")}><Filter size={17}/> Filters {activeFilterCount || ""}</button>{menu === "filters" && <div className={`${styles.popover} ${styles.filterPopover}`}><h3>More filters</h3><label>Canvas experience<select value={filters.experience} onChange={event => changeFilters({ experience: event.target.value })}><option value="">Any experience</option>{unique("experience").map(value => <option key={value}>{value}</option>)}</select></label><label>Created by<select value={filters.createdBy} onChange={event => changeFilters({ createdBy: event.target.value })}><option value="">Anyone</option>{unique("createdBy").map(value => <option key={value}>{value}</option>)}</select></label><label>Last edited by<select value={filters.lastEditedBy} onChange={event => changeFilters({ lastEditedBy: event.target.value })}><option value="">Anyone</option>{unique("lastEditedBy").map(value => <option key={value}>{value}</option>)}</select></label><label>Search by date<select value={filters.dateField} onChange={event => changeFilters({ dateField: event.target.value, from: "", to: "" })}><option value="">None</option><option value="createdAt">Date created</option><option value="updatedAt">Date last edited</option></select></label>{filters.dateField && <div className={styles.dateRange}><label>From<input type="date" value={filters.from} onChange={event => changeFilters({ from: event.target.value })}/></label><label>To<input type="date" value={filters.to} onChange={event => changeFilters({ to: event.target.value })}/></label></div>}<label>Target segment<select value={filters.targetSegment} onChange={event => changeFilters({ targetSegment: event.target.value })}><option value="">All segments</option>{unique("targetSegment").map(value => <option key={value}>{value}</option>)}</select></label><label className={styles.checkRow}><input type="checkbox" checked={filters.alertsOnly} onChange={event => changeFilters({ alertsOnly: event.target.checked })}/> Alerts configured</label><button className={styles.outline} onClick={() => setMenu(null)}>Apply filters</button></div>}</div><div className={styles.anchor}><button className={styles.outline} aria-expanded={menu === "columns"} onClick={() => setMenu(menu === "columns" ? null : "columns")}><LayoutPanelLeft size={17}/> Columns</button>{menu === "columns" && <div className={styles.popover}><h3>Visible columns</h3>{(Object.keys(columnLabels) as Column[]).map(column => <label className={styles.checkRow} key={column}><input type="checkbox" checked={columns.includes(column)} onChange={() => toggleColumn(column)}/>{columnLabels[column]}</label>)}</div>}</div><button className={styles.reset} onClick={() => { setStatus("All"); setTag(""); setQuery(""); setFilters(defaultFilters); }}>Reset filters</button><label className={styles.search}><Search size={17}/><input aria-label="Search Canvases" placeholder="Search Canvases" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <div className={styles.chips}>{status !== "All" && <button onClick={() => setStatus("All")}>Status: {status} <X size={14}/></button>}{tag && <button onClick={() => setTag("")}>Tag: {tag} <X size={14}/></button>}{activeFilterCount > 0 && <button onClick={() => setFilters(defaultFilters)}>{activeFilterCount} more filter{activeFilterCount === 1 ? "" : "s"} <X size={14}/></button>}</div>
    <div className={styles.results}><strong>{visible.length} Results</strong>{selected.length > 0 && <div className={styles.bulk}><span>{selected.length} selected</span><button onClick={() => archive(selected)} disabled={busy}>Archive selected</button><button onClick={() => setSelected([])}>Clear selection</button></div>}</div>
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    <div className={styles.tableWrap}><table><thead><tr><th><input type="checkbox" aria-label="Select all visible Canvases" checked={allSelected} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, ...rows.map(item => item.id)])] : previous.filter(id => !rows.some(item => item.id === id)))}/></th><th><button onClick={() => changeSort("name")}>Name {sort === "name" ? direction === 1 ? "↑" : "↓" : "↕"}</button></th><th>Status</th>{columns.includes("description") && <th>Description</th>}{columns.includes("teams") && <th>Teams</th>}{columns.includes("lastEditedBy") && <th>Last edited by</th>}{columns.includes("lastEdited") && <th><button onClick={() => changeSort("updatedAt")}>Last edited {sort === "updatedAt" ? direction === 1 ? "↑" : "↓" : "↕"}</button></th>}{columns.includes("alerts") && <th>Alerts<br/>Configured</th>}<th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.includes(item.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))}/></td><td><button className={styles.nameButton} onClick={() => navigate(item.id)}>{item.name}</button>{item.tags.length > 0 && <small className={styles.tags}>{item.tags.join(", ")}</small>}</td><td><span className={`${styles.badge} ${item.status === "Draft" ? styles.draft : item.status === "Active" ? styles.active : ""}`}>{item.status}</span></td>{columns.includes("description") && <td className={styles.description}>{item.description || "—"}</td>}{columns.includes("teams") && <td>{item.team || "—"}</td>}{columns.includes("lastEditedBy") && <td>{item.lastEditedBy}</td>}{columns.includes("lastEdited") && <td>{new Date(item.updatedAt).toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", { dateStyle: "medium" })}</td>}{columns.includes("alerts") && <td>{item.alertsConfigured ? "Yes" : "—"}</td>}<td className={styles.actionCell}><button className={styles.iconButton} aria-label={`Actions for ${item.name}`} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={20}/></button>{menu === item.id && <div className={`${styles.popover} ${styles.rowPopover}`}><button onClick={() => navigate(item.id)}>Edit journey</button><button onClick={() => openEdit(item)}>Edit details</button><button onClick={() => duplicate(item)} disabled={busy}><Copy size={15}/> Duplicate</button><button onClick={() => toggleAlerts(item)} disabled={busy}>{item.alertsConfigured ? "Remove alert flag" : "Configure alert flag"}</button><button onClick={() => archive([item.id])} disabled={busy}>Archive</button><button disabled title="This local demo has one workspace; cross-workspace copy is unavailable.">Copy to workspace (unavailable)</button></div>}</td></tr>)}</tbody></table>{!loading && rows.length === 0 && <div className={styles.empty}>No Canvases match these filters. <button onClick={() => { setStatus("All"); setTag(""); setQuery(""); setFilters(defaultFilters); }}>Clear filters</button></div>}{loading && <div className={styles.empty}>Loading Canvases…</div>}</div>
    <div className={styles.pagination}><span>{visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length}</span><label>Rows per page<select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10, 20, 40, 60, 100].map(value => <option key={value}>{value}</option>)}</select></label><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17}/></button><span>{currentPage} / {pages}</span><button aria-label="Next page" disabled={currentPage >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight size={17}/></button></div>
    {modal && <div className={styles.overlay} onMouseDown={() => setModal(null)}><section className={styles.dialog} role="dialog" aria-modal="true" aria-label={modal === "tour" ? "Canvas tour" : modal === "templates" ? "Canvas templates" : "Canvas details"} onMouseDown={event => event.stopPropagation()}><header><h2>{modal === "tour" ? "Canvas management tour" : modal === "templates" ? "Choose a Canvas template" : modal === "edit" ? "Edit Canvas details" : "Create Canvas"}</h2><button aria-label="Close" onClick={() => setModal(null)}><X size={19}/></button></header>{modal === "tour" ? <><p>Create journeys, find them with search and filters, then edit, duplicate or archive them from the list.</p><p>Open a Canvas to configure journey steps and simulate a local run. Cross-workspace copying is unavailable in this single-workspace demo.</p><button className={styles.primary} onClick={() => setModal(null)}>Got it</button></> : modal === "templates" ? <div className={styles.templateList}>{templates.map(template => <button key={template.name} disabled={busy} onClick={() => createCanvas(template.id)}><strong>{template.name}</strong><span>{template.description}</span></button>)}</div> : <form onSubmit={event => { event.preventDefault(); saveDetails(); }}><label>Name<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)}/></label>{modal === "edit" && <label>Tags (comma-separated)<input value={tagsText} onChange={event => setTagsText(event.target.value)}/></label>}<div className={styles.dialogActions}><button type="button" className={styles.outline} onClick={() => setModal(null)}>Cancel</button><button className={styles.primary} disabled={busy || !name.trim()}>{busy ? "Saving…" : modal === "edit" ? "Save changes" : "Create Canvas"}</button></div></form>}</section></div>}
  </section>;
}
