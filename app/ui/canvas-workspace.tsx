"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ChevronDown, ChevronLeft, ChevronRight, Copy, Filter, LayoutPanelLeft, MoreHorizontal, Plus, Search, Tag, X } from "lucide-react";
import type { CanvasRecord } from "@/lib/braze-store";
import { browserCanvasMode, createBrowserCanvas, duplicateBrowserCanvas, getBrowserCanvas, listBrowserCanvases, patchBrowserCanvas, reconcileBrowserCanvasTags, tagBrowserCanvases } from "@/lib/canvas-browser-store";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";
import { requestAppNavigation } from "@/lib/unsaved-navigation";
import CanvasWizard from "./canvas-wizard";
import CanvasListHelp from "./canvas-list-help";
import TagPicker from "./tag-picker";
import { resolveBrowserTags, subscribeTagChanges } from "@/lib/tag-client";
import styles from "./canvas-workspace.module.css";
import TagSingleSelect from "./tag-single-select";
import AudienceDatePicker from "./audience-date-picker";
import InAppPriorityManager from "./in-app-priority-manager";
import {canvasStatuses,canvasListMatches,canvasRelativeEdited,emptyCanvasListFilters,type CanvasListFilters} from "@/lib/canvas-list-model";

type Column = "description" | "lastEditedBy" | "lastEdited" | "teams";
const defaultFilters=emptyCanvasListFilters;
const columnLabels:Record<Column,string>={teams:"Teams",lastEditedBy:"Last edited by",lastEdited:"Last edited",description:"Description"};
function canvasSearchQuery(value:string|null){if(!value)return "";try{const parsed=JSON.parse(value);return typeof parsed==="string"?parsed:"";}catch{return value;}}
const templates = [
  { id: "welcome", name: "Welcome journey", description: "Welcome new customers with a timed, cross-channel journey." },
  { id: "abandoned", name: "Abandoned intent", description: "Re-engage customers after they leave before converting." },
  { id: "payment", name: "Payment reminder", description: "Remind customers before an upcoming payment." },
];

export default function CanvasWorkspace({ locale, notify }: { locale: Locale; notify: (message: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspace") || searchParams.get("workspaceId") || "local";
  const refreshRevision = useRef(0);
  const canvasId = pathname.match(/^\/engagement\/canvas\/([^/]+)$/)?.[1] ?? null;
  const [items, setItems] = useState<CanvasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Draft");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState(() => canvasSearchQuery(searchParams.get("name")));
  const queryFromUrl = canvasSearchQuery(searchParams.get("name"));
  useEffect(() => { setQuery(queryFromUrl); }, [queryFromUrl]);
  useEffect(() => {
    if (canvasId || query === queryFromUrl) return;
    const timer = setTimeout(() => { const params = new URLSearchParams(searchParams.toString()); if (query) params.set("name", JSON.stringify(query)); else params.delete("name"); router.replace(`${pathname}?${params.toString()}`, {scroll:false}); }, 300);
    return () => clearTimeout(timer);
  }, [canvasId, query, queryFromUrl, pathname, router, searchParams]);
  const [filters, setFilters] = useState<CanvasListFilters>(defaultFilters);
  const [columns, setColumns] = useState<Column[]>(["description", "lastEditedBy", "lastEdited"]);
  const [menu, setMenu] = useState<"create" | "filters" | "columns" | string | null>(null);
  const [modal, setModal] = useState<"create" | "templates" | "edit" | "tour" | "copy" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [detailTags, setDetailTags] = useState<string[]>([]);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<"name" | "updatedAt">("updatedAt");
  const [direction, setDirection] = useState<-1 | 1>(-1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busy, setBusy] = useState(false);
  const [priorityOpen,setPriorityOpen]=useState(false);
  const [copying,setCopying]=useState<CanvasRecord|null>(null),[targetWorkspace,setTargetWorkspace]=useState("");
  const [workspaces,setWorkspaces]=useState<Array<{id:string;name:string}>>([]),[segmentChoices,setSegmentChoices]=useState<Array<{id:string;name:string}>>([]);
  const listRoot=useRef<HTMLElement>(null);
  useEffect(()=>{const controller=new AbortController();void Promise.all([fetch('/api/campaign-workspaces',{signal:controller.signal}).then(r=>r.json()),fetch(`/api/campaigns/form-capabilities?workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal}).then(r=>r.json())]).then(([spaces,caps])=>{setWorkspaces(spaces.data??[]);setSegmentChoices(caps.segments??[]);}).catch(()=>{});return()=>controller.abort();},[workspaceId]);
  useEffect(()=>{if(!menu)return;const close=(event:PointerEvent)=>{if(!(event.target as Element).closest('[data-canvas-menu]'))setMenu(null);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[menu]);

  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    try {
      let browserItems = browserCanvasMode ? listBrowserCanvases(workspaceId) : [];
      const [canvasResult, tagResult] = await Promise.allSettled([
        fetch(`/api/canvases?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
        browserItems.length ? fetch(`/api/tags?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const tagResponse = tagResult.status === "fulfilled" ? tagResult.value : null;
      if (tagResponse?.ok) {
        const registry = await tagResponse.json();
        browserItems = reconcileBrowserCanvasTags(registry.aliases ?? {}, workspaceId);
      }
      if (canvasResult.status === "rejected") throw canvasResult.reason;
      const response = canvasResult.value;
      if (!response.ok) throw new Error("Could not load Canvases.");
      const result = await response.json();
      const serverItems: CanvasRecord[] = Array.isArray(result.data) ? result.data : [];
      if (revision !== refreshRevision.current) return;
      setItems([...browserItems, ...serverItems.filter(item => !browserItems.some(browserItem => browserItem.id === item.id))]);
      setError("");
    } catch (cause) { if (revision !== refreshRevision.current) return; if (browserCanvasMode) setItems(listBrowserCanvases(workspaceId)); setError(cause instanceof Error ? cause.message : "Could not load Canvases."); }
    finally { if (revision === refreshRevision.current) setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { setLoading(true); setItems([]); setSelectedTags([]); setSelected([]); setModal(null); void refresh(); }, [refresh]);
  useEffect(() => {
    return subscribeTagChanges(detail => {
      if (detail.workspaceId !== workspaceId) return;
      void refresh();
    });
  }, [refresh]);
  useEffect(() => {
    try { const saved = localStorage.getItem("canvas-list-columns"); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setColumns(parsed.filter((value): value is Column => value in columnLabels)); } } catch { return; }
  }, []);
  useEffect(() => { setPage(1); setSelected([]); }, [status, selectedTags, query, filters, pageSize]);
  useEffect(() => { setMenu(current => current === "bulkTags" ? null : current); }, [selected]);

  const workspaceItems = items.filter(item => (item.workspaceId ?? "local") === workspaceId);
  const visible = useMemo(() => items.filter(item => {
    if ((item.workspaceId ?? "local") !== workspaceId) return false;
    if (status !== "All" && item.status !== status) return false;
    if (selectedTags.length && !selectedTags.some(tag => item.tags.includes(tag))) return false;
    if (query && !`${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    return canvasListMatches(item,filters);
  }).sort((first, second) => direction * first[sort].localeCompare(second[sort])), [items, workspaceId, status, selectedTags, query, filters, sort, direction]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allSelected = rows.length > 0 && rows.every(item => selected.includes(item.id));
  const tagCandidates = [...new Set(workspaceItems.flatMap(item => item.tags))].sort();
  const unique = (key: keyof CanvasRecord) => [...new Set(workspaceItems.map(item => item[key]).filter((value): value is string => typeof value === "string" && Boolean(value)))].sort();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const changeFilters = (patch: Partial<CanvasListFilters>) => setFilters(previous => ({ ...previous, ...patch }));
  const toggleColumn = (column: Column) => {
    const next = columns.includes(column) ? columns.filter(item => item !== column) : [...columns, column];
    setColumns(next); localStorage.setItem("canvas-list-columns", JSON.stringify(next));
  };
  const changeSort = (column: "name" | "updatedAt") => { if (sort === column) setDirection(value => value === 1 ? -1 : 1); else { setSort(column); setDirection(column === "name" ? 1 : -1); } };
  const navigate = (id?: string) => requestAppNavigation(() => { setMenu(null); const params = new URLSearchParams(searchParams.toString()); if (id) params.set("step", "basics"); else params.delete("step"); params.set("workspaceId", workspaceId); router.push(withLocale(`${id ? `/engagement/canvas/${id}` : "/engagement/canvas"}?${params.toString()}`, locale)); });
  const request = async (url: string, method: string, body: Record<string, unknown>) => {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, workspaceId }) });
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
    while (workspaceItems.some(item => item.name.toLowerCase() === title.toLowerCase() && item.status !== "Archived")) title = `${baseTitle} ${suffix++}`;
    const result = browserCanvasMode ? createBrowserCanvas({ workspaceId, name: title, description: templateItem?.description ?? "", template: selectedTemplate }) : await request("/api/canvases", "POST", { name: title, description: templateItem?.description ?? "", template: selectedTemplate });
    setModal(null);
    notify("Canvas draft created.");
    navigate(result.id);
  });
  const openEdit = (item: CanvasRecord) => { setName(item.name); setDescription(item.description); setDetailTags(item.tags); setEditingId(item.id); setModal("edit"); setMenu(null); };
  const saveDetails = () => void runAction(async () => {
    const body = { name, description, tags: (editingId ? Boolean(getBrowserCanvas(editingId, workspaceId)) : browserCanvasMode) ? await resolveBrowserTags(detailTags, workspaceId) : detailTags };
    const result = editingId ? getBrowserCanvas(editingId, workspaceId) ? patchBrowserCanvas(editingId, body, workspaceId) : await request(`/api/canvases/${editingId}`, "PATCH", { ...body, updatedAt: items.find(item => item.id === editingId)?.updatedAt }) : browserCanvasMode ? createBrowserCanvas({ workspaceId, ...body, template: template ?? undefined }) : await request("/api/canvases", "POST", { ...body, template: template ?? undefined });
    setModal(null); notify(editingId ? "Canvas details saved." : "Canvas created.");
    if (!editingId) navigate(result.id);
  });
  const duplicate = (item: CanvasRecord) => void runAction(async () => { if (getBrowserCanvas(item.id, workspaceId)) duplicateBrowserCanvas(item.id, workspaceId); else await request(`/api/canvases/${item.id}`, "POST", { action: "duplicate" }); notify("Canvas duplicated as a draft."); });
  const archive = (ids: string[]) => {
    if (!window.confirm(`Archive ${ids.length} Canvas${ids.length === 1 ? "" : "es"}? They will be hidden from the Draft view.`)) return;
    void runAction(async () => { for (const id of ids) { if (getBrowserCanvas(id, workspaceId)) patchBrowserCanvas(id, { status: "Archived" }, workspaceId); else await request(`/api/canvases/${id}`, "PATCH", { status: "Archived" }); } setSelected([]); notify("Canvas archived."); });
  };
  const toggleAlerts = (item: CanvasRecord) => void runAction(async () => { if (getBrowserCanvas(item.id, workspaceId)) patchBrowserCanvas(item.id, { alertsConfigured: !item.alertsConfigured }, workspaceId); else await request(`/api/canvases/${item.id}`, "PATCH", { alertsConfigured: !item.alertsConfigured }); notify(item.alertsConfigured ? "Canvas alert flag removed." : "Canvas alert flag configured."); });
  const openBulkTags = () => {
    setBulkTags([...new Set(items.filter(item => selected.includes(item.id)).flatMap(item => item.tags))]);
    setMenu(menu === "bulkTags" ? null : "bulkTags");
  };
  const applyBulkTags = () => void runAction(async () => {
    const tags = await resolveBrowserTags(bulkTags, workspaceId);
    const browserIds = selected.filter(id => Boolean(getBrowserCanvas(id, workspaceId)));
    const serverIds = selected.filter(id => !browserIds.includes(id));
    if (serverIds.length) await request("/api/tags/resources", "POST", { resourceType: "canvas", ids: serverIds, tags, workspaceId });
    if (browserIds.length) tagBrowserCanvases(browserIds, tags, workspaceId);
    notify("Canvas tags updated.");
  });

  if (canvasId) {
    const current = workspaceItems.find(item => item.id === canvasId);
    if (loading) return <div className={styles.message}>Loading Canvas…</div>;
    if (!current) return <div className={styles.message} role="alert">Canvas not found. <button onClick={() => navigate()}>Back to all Canvases</button></div>;
    return <CanvasWizard key={`${workspaceId}:${canvasId}`} canvasId={canvasId} onBack={() => navigate()} onUpdated={() => void refresh()} locale={locale} notify={notify}/>;
  }

  return <section className={styles.page} ref={listRoot}>
    <div className={styles.heading}><div><h1>Canvas <span className={styles.access}>Limited access</span></h1><p>Design and launch customer journeys with Canvas. Drag, drop, and connect messaging across channels to create seamless, automated experiences.</p>{browserCanvasMode && <p className={styles.storageNotice}>Demo drafts are saved in this browser only; they are not shared across devices.</p>}</div><div className={styles.headingActions}><CanvasListHelp onTour={()=>setModal("tour")}/><div className={styles.anchor} data-canvas-menu><button className={styles.primary} onClick={() => setMenu(menu === "create" ? null : "create")}>Create Canvas <ChevronDown size={16}/></button>{menu === "create" && <div className={styles.popover}><button disabled={busy} onClick={() => createCanvas()}><Plus size={16}/> Start a New Canvas</button><button onClick={() => { setModal("templates"); setMenu(null); }}><LayoutPanelLeft size={16}/> Use a Canvas Template</button></div>}</div></div></div>
    <div className={styles.toolbar}>{selected.length > 0 ? <div className={styles.bulk}><button className={styles.selectedCount} onClick={() => { setSelected([]); setMenu(null); }}>{selected.length} Selected <X size={14}/></button><button className={styles.outline} onClick={() => archive(selected)} disabled={busy}><Archive size={16}/> Archive</button><div className={styles.anchor} data-canvas-menu><button className={styles.outline} onClick={openBulkTags} disabled={busy} aria-expanded={menu === "bulkTags"}><Tag size={16}/> Tag as <ChevronDown size={15}/></button>{menu === "bulkTags" && <div className={`${styles.popover} ${styles.bulkTagPopover}`}><TagPicker value={bulkTags} onChange={setBulkTags} locale={locale} context="bulk" resourceType="canvas" workspaceId={workspaceId} triggerLabel="Add Tag"/><div className={styles.bulkTagActions}><button className={styles.primary} disabled={busy} onClick={applyBulkTags}>{busy ? "Applying…" : "Apply tags"}</button></div></div>}</div></div> : <><div className={styles.statusFilter}><span>Status</span><TagSingleSelect label="Status" value={status} change={setStatus} options={canvasStatuses.map(value=>({id:value==='All Statuses'?'All':value,label:value}))}/></div><div className={styles.tagFilter}><span>Tags</span><TagPicker value={selectedTags} onChange={setSelectedTags} locale={locale} context="filter" resourceType="canvas" workspaceId={workspaceId} triggerLabel="Tags" placeholder="All Tags" showSelected={false} allowCreate={false} candidateNames={tagCandidates}/></div><div className={styles.anchor} data-canvas-menu><button className={styles.outline} aria-expanded={menu === "filters"} onClick={() => setMenu(menu === "filters" ? null : "filters")}><Filter size={17}/> Filters {activeFilterCount || ""}</button>{menu === "filters" && <div className={`${styles.popover} ${styles.filterPopover}`}>
<label>Canvas experience<TagSingleSelect label="Canvas experience" value={filters.experience} change={value=>changeFilters({experience:value})} options={unique('experience').map(value=>({id:value,label:value}))}/></label>
<label>Created by<TagSingleSelect label="Created by" searchable value={filters.createdBy} change={value=>changeFilters({createdBy:value})} options={unique('createdBy').map(value=>({id:value,label:value}))}/></label>
<label>Last edited by<TagSingleSelect label="Last edited by" searchable value={filters.lastEditedBy} change={value=>changeFilters({lastEditedBy:value})} options={unique('lastEditedBy').map(value=>({id:value,label:value}))}/></label>
<fieldset><legend>Search by</legend>{[['createdAt','Date created'],['updatedAt','Date last edited'],['','None']].map(([value,label])=><label className={styles.checkRow} key={label}><input type="radio" name="canvas-search-date" checked={filters.dateField===value} onChange={()=>changeFilters({dateField:value,from:'',to:''})}/>{label}</label>)}</fieldset>
{filters.dateField&&<div className={styles.dateRange}><label>From<AudienceDatePicker label="From" value={filters.from} change={from=>changeFilters({from})}/></label><label>To<AudienceDatePicker label="To" value={filters.to} change={to=>changeFilters({to})}/></label></div>}
<fieldset><legend>Show only</legend>{[['expiredInteractions','Canvases with expired interaction data'],['optimized','Optimized with BrazeAI Decisioning Studio™'],['complexTargeting','Canvases exceeding targeting complexity threshold']].map(([key,label])=><label className={styles.checkRow} key={key}><input type="checkbox" checked={Boolean(filters[key as keyof CanvasListFilters])} onChange={event=>changeFilters({[key]:event.target.checked})}/>{label}</label>)}</fieldset>
<label>Target segment<TagSingleSelect label="Target segment" searchable placeholder="All segments" value={filters.targetSegment} change={targetSegment=>changeFilters({targetSegment})} options={[{id:'',label:'All segments'},...segmentChoices.map(segment=>({id:segment.id,label:segment.name}))]}/></label>
</div>}</div><div className={styles.anchor} data-canvas-menu><button className={styles.outline} aria-expanded={menu === "columns"} onClick={() => setMenu(menu === "columns" ? null : "columns")}><LayoutPanelLeft size={17}/> Columns</button>{menu === "columns" && <div className={styles.popover}><label className={styles.checkRow}><input type="checkbox" aria-label="All Columns" checked={columns.length===Object.keys(columnLabels).length} onChange={event=>{const next=event.target.checked?Object.keys(columnLabels) as Column[]:[];setColumns(next);localStorage.setItem('canvas-list-columns',JSON.stringify(next));}}/>All Columns</label>{(Object.keys(columnLabels) as Column[]).map(column => <label className={styles.checkRow} key={column}><input type="checkbox" checked={columns.includes(column)} onChange={() => toggleColumn(column)}/>{columnLabels[column]}</label>)}</div>}</div><button className={styles.reset} onClick={() => { setStatus("All"); setSelectedTags([]); setQuery(""); setFilters(defaultFilters); }}>Reset filters</button></>}<label className={styles.search}><Search size={17}/><input aria-label="Search Canvases" placeholder="Search Canvases" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <div className={styles.chips}>{status !== "All" && <button onClick={() => setStatus("All")}>Status: {status} <X size={14}/></button>}{selectedTags.map(tag => <button key={tag} aria-label={`Remove tag filter ${tag}`} onClick={() => setSelectedTags(current => current.filter(name => name !== tag))}>Tag: {tag} <X size={14}/></button>)}{activeFilterCount > 0 && <button onClick={() => setFilters(defaultFilters)}>{activeFilterCount} more filter{activeFilterCount === 1 ? "" : "s"} <X size={14}/></button>}</div>
    <div className={styles.results}><strong>{visible.length} {visible.length === 1 ? "Result" : "Results"}</strong></div>
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    <div className={styles.tableWrap}><table><thead><tr><th><input type="checkbox" aria-label="Select all Canvas rows" checked={allSelected} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, ...rows.map(item => item.id)])] : previous.filter(id => !rows.some(item => item.id === id)))}/></th><th><button aria-label="Select to sort by Name in alphabetical order" onClick={() => changeSort("name")}>Name {sort === "name" ? direction === 1 ? "↑" : "↓" : "↕"}</button></th><th>Status</th>{columns.includes("description") && <th>Description</th>}{columns.includes("teams") && <th>Teams</th>}{columns.includes("lastEditedBy") && <th>Last edited by</th>}{columns.includes("lastEdited") && <th><button onClick={() => changeSort("updatedAt")}>Last edited {sort === "updatedAt" ? direction === 1 ? "↑" : "↓" : "↕"}</button></th>}{true && <th>Alerts Configured</th>}<th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><input type="checkbox" aria-label={`Select Canvas ${item.name}`} checked={selected.includes(item.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))}/></td><td><button className={styles.nameButton} onClick={() => navigate(item.id)}>{item.name}</button>{item.tags.length > 0 && <small className={styles.tags}>{item.tags.map(tag=><span key={tag}>{tag}</span>)}</small>}</td><td><span className={`${styles.badge} ${item.status === "Draft" ? styles.draft : item.status === "Active" ? styles.active : ""}`}>{item.status}</span></td>{columns.includes("description") && <td className={styles.description}>{item.description || "—"}</td>}{columns.includes("teams") && <td>{item.team || "—"}</td>}{columns.includes("lastEditedBy") && <td>{item.lastEditedBy||"N/A"}</td>}{columns.includes("lastEdited") && <td>{canvasRelativeEdited(item.updatedAt,new Date(),locale)}</td>}{true && <td>{item.alertsConfigured ? "Yes" : "—"}</td>}<td className={styles.actionCell} data-canvas-menu><button className={styles.iconButton} aria-label={`Actions for ${item.name}`} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={20}/></button>{menu === item.id && <div className={`${styles.popover} ${styles.rowPopover}`}><button onClick={() => navigate(item.id)}>Edit</button><button onClick={() => archive([item.id])} disabled={busy}>Archive</button><button onClick={() => duplicate(item)} disabled={busy}>Duplicate</button><button disabled title="Custom alerts are not enabled for this workspace.">Manage custom alerts</button><button disabled={Boolean(getBrowserCanvas(item.id,workspaceId))} title={getBrowserCanvas(item.id,workspaceId)?"Browser-only drafts must be saved to the server before copying across workspaces.":undefined} onClick={()=>{setCopying(item);setTargetWorkspace('');setModal('copy');setMenu(null);}}>Copy to workspace</button></div>}</td></tr>)}</tbody></table>{!loading && rows.length === 0 && <div className={styles.empty}>No Canvases match these filters. <button onClick={() => { setStatus("All"); setSelectedTags([]); setQuery(""); setFilters(defaultFilters); }}>Clear filters</button></div>}{loading && <div className={styles.empty}>Loading Canvases…</div>}</div>
    <div className={styles.pagination}><span>Showing rows {visible.length ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, visible.length)} of {visible.length}</span><label>Rows per page:<select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10, 20, 40, 60, 100].map(value => <option key={value}>{value}</option>)}</select></label><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17}/></button><button aria-label={`Current Page, Page ${currentPage}`} aria-current="page">{currentPage}</button><button aria-label="Next page" disabled={currentPage >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight size={17}/></button></div>
    <div className={styles.priorityLink}><button onClick={()=>setPriorityOpen(true)}>Priority Sorter</button></div>
    {priorityOpen&&<InAppPriorityManager priority="Medium" close={()=>setPriorityOpen(false)} saved={()=>void refresh()}/>}
    {modal && <div className={styles.overlay} onMouseDown={() => setModal(null)}><section className={styles.dialog} role="dialog" aria-modal="true" aria-label={modal === "copy" ? "Copy to workspace" : modal === "tour" ? "Canvas tour" : modal === "templates" ? "Canvas templates" : "Canvas details"} onMouseDown={event => event.stopPropagation()}><header><h2>{modal === "copy" ? "Copy to workspace" : modal === "tour" ? "Canvas management tour" : modal === "templates" ? "Choose a Canvas template" : modal === "edit" ? "Edit Canvas details" : "Create Canvas"}</h2><button aria-label="Close" onClick={() => setModal(null)}><X size={19}/></button></header>{modal === "copy" ? <><p>Copy {copying?.name} as a draft into another workspace.</p><label className={styles.copyWorkspace}>Destination workspace<TagSingleSelect label="Destination workspace" value={targetWorkspace} change={setTargetWorkspace} options={workspaces.filter(item=>item.id!==workspaceId).map(item=>({id:item.id,label:item.name}))}/></label>{workspaces.filter(item=>item.id!==workspaceId).length===0&&<p>No other workspaces are available.</p>}<p>Configure audience, tags and workspace-specific message selections in the destination workspace before launching.</p><div className={styles.dialogActions}><button className={styles.outline} onClick={()=>setModal(null)}>Cancel</button><button className={styles.primary} disabled={!targetWorkspace||busy} onClick={()=>void runAction(async()=>{if(!copying)return;await request(`/api/canvases/${copying.id}`,'POST',{action:'copy_to_workspace',targetWorkspaceId:targetWorkspace});setModal(null);notify('Canvas copied to workspace as a draft.');})}>{busy?'Copying…':'Copy Canvas'}</button></div></> : modal === "tour" ? <><p>Create journeys, find them with search and filters, then edit, duplicate or archive them from the list.</p><p>Open a Canvas to configure journey steps and simulate a local run. Use Copy to workspace to prepare a new draft in another workspace.</p><button className={styles.primary} onClick={() => setModal(null)}>Got it</button></> : modal === "templates" ? <div className={styles.templateList}>{templates.map(template => <button key={template.name} disabled={busy} onClick={() => createCanvas(template.id)}><strong>{template.name}</strong><span>{template.description}</span></button>)}</div> : <form onSubmit={event => { event.preventDefault(); saveDetails(); }}><label>Name<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)}/></label>{modal === "edit" && <TagPicker value={detailTags} onChange={setDetailTags} locale={locale} context="assignment" resourceType="canvas" workspaceId={workspaceId}/>}<div className={styles.dialogActions}><button type="button" className={styles.outline} onClick={() => setModal(null)}>Cancel</button><button className={styles.primary} disabled={busy || !name.trim()}>{busy ? "Saving…" : modal === "edit" ? "Save changes" : "Create Canvas"}</button></div></form>}</section></div>}
  </section>;
}
