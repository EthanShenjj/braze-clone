"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { sampleCatalogId, sampleWorkspaceId } from "@/lib/sample-catalog";
import "./catalog-workspace.css";

type Catalog = { id: string; name: string; description: string; status: string; updatedAt: string; itemCount: number; data: { fields?: string[]; source?: string; size?: string; sample?: boolean } };
type Item = { id: string; name: string; fields: Record<string, unknown>; updatedAt: string };
type Section = "Preview" | "Selections" | "Settings";
type Filter = { field: string; operator: "equals" | "contains" | "not equals"; value: string };

const listUrl = `/dashboard/catalogs/${sampleWorkspaceId}?locale=en`;
const fieldLabel = (field: string) => field === "id" ? "id" : field;
const display = (value: unknown) => value == null || value === "" ? "—" : String(value);

export default function CatalogWorkspace({ notify }: { notify: (message: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const localMode = pathname.startsWith("/content/catalogs");
  const pathMatch = pathname.match(/^\/dashboard\/catalogs\/([^/]+)\/([^/]+)$/);
  const selectedId = pathMatch?.[1] ?? pathname.match(/^\/content\/catalogs\/([^/]+)$/)?.[1] ?? null;
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [section, setSection] = useState<Section>(searchParams.get("tab") === "selections" ? "Selections" : searchParams.get("tab") === "settings" ? "Settings" : "Preview");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<Filter>({ field: "", operator: "equals", value: "" });
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(12);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const selected = catalogs.find(catalog => catalog.id === selectedId);
  const sample = selected?.id === sampleCatalogId;
  const visibleCatalogs = localMode ? catalogs : catalogs.filter(catalog => catalog.id !== "catalog_featured");

  async function loadCatalogs() {
    try {
      const response = await fetch("/api/catalogs");
      if (response.ok) setCatalogs((await response.json()).data);
      else notify("Could not load catalogs.");
    } catch { notify("Could not load catalogs."); }
    finally { setCatalogsLoading(false); }
  }

  async function loadItems(id: string) {
    const response = await fetch(`/api/catalogs/${encodeURIComponent(id)}/items`);
    if (response.ok) setItems((await response.json()).data);
  }

  useEffect(() => { void loadCatalogs(); }, []);
  useEffect(() => {
    if (selectedId) void loadItems(selectedId);
    else setItems([]);
    setSection(searchParams.get("tab") === "selections" ? "Selections" : searchParams.get("tab") === "settings" ? "Settings" : "Preview"); setSearchInput(""); setSearchValue(""); setFilter(null); setPage(0); setSelectedItem(null); setSelectionOpen(false);
  }, [selectedId]);
  useEffect(() => { setSection(searchParams.get("tab") === "selections" ? "Selections" : searchParams.get("tab") === "settings" ? "Settings" : "Preview"); }, [searchParams]);

  const fields = selected ? ["id", ...(selected.data.fields ?? ["name", "price", "image"])] : [];
  const filteredItems = useMemo(() => items.filter(item => {
    if (searchValue && !item.id.toLowerCase().includes(searchValue.toLowerCase())) return false;
    if (!filter?.field || !filter.value) return true;
    const value = String(filter.field === "id" ? item.id : item.fields[filter.field] ?? "").toLowerCase();
    const wanted = filter.value.toLowerCase();
    return filter.operator === "contains" ? value.includes(wanted) : filter.operator === "not equals" ? value !== wanted : value === wanted;
  }), [items, searchValue, filter]);
  const pages = Math.max(1, Math.ceil(filteredItems.length / limit));
  const start = Math.min(page, pages - 1) * limit;
  const shown = filteredItems.slice(start, start + limit);
  const matchingCatalogs = visibleCatalogs.filter(catalog => catalog.name.toLowerCase().includes(catalogQuery.toLowerCase()));
  const catalogPages = Math.max(1, Math.ceil(matchingCatalogs.length / limit));
  const catalogStart = Math.min(page, catalogPages - 1) * limit;
  const matchingSelections = sample && "Gaming".toLowerCase().includes(catalogQuery.toLowerCase());

  function openCatalog(catalog: Catalog) {
    router.push(`/dashboard/catalogs/${encodeURIComponent(catalog.id)}/${sampleWorkspaceId}?name=${encodeURIComponent(catalog.name)}&locale=en`);
  }

  async function createCatalog() {
    if (!newName.trim()) return;
    const response = await fetch("/api/catalogs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
    if (!response.ok) { notify("Could not create catalog."); return; }
    const created = await response.json() as Catalog;
    setNewName(""); await loadCatalogs(); openCatalog(created);
  }

  async function saveItem(item: Item) {
    if (!selected) return;
    const exists = items.some(row => row.id === item.id);
    const response = await fetch(`/api/catalogs/${selected.id}/items${exists ? `/${item.id}` : ""}`, { method: exists ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
    if (!response.ok) { notify("Could not save catalog item."); return; }
    setEditingItem(null); await loadItems(selected.id); await loadCatalogs(); notify("Catalog item saved.");
  }

  return <div className="braze-catalog">
    <nav className="catalog-workspace-tabs" aria-label="Catalog pages">
      <button className={!selectedId ? "selected" : ""} onClick={() => router.push(listUrl)}>Catalogs</button>
      {selected && <button className="selected" onClick={() => openCatalog(selected)}>{selected.name}<X size={14} onClick={event => { event.stopPropagation(); router.push(listUrl); }}/></button>}
    </nav>
    {selected && <nav className="catalog-section-tabs" aria-label="Catalog detail tabs">{(["Preview", "Selections", "Settings"] as const).map(tab => <button key={tab} className={section === tab ? "selected" : ""} onClick={() => { setSection(tab); setSelectedItem(null); router.push(`${pathname}?tab=${tab.toLowerCase()}&locale=en`); }}>{tab}</button>)}</nav>}
    {!selectedId ? <div className="catalog-main catalog-index">
      <header className="catalog-heading"><div><h1>Catalogs <span className="catalog-view-pill"><Eye size={13}/> View only</span></h1></div><button className="secondary" onClick={() => notify("Feedback is unavailable in this local demo.")}>Send feedback</button></header>
      {localMode && <div className="catalog-local-create"><input placeholder="New local catalog name" value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void createCatalog(); }}/><button className="secondary" onClick={() => void createCatalog()}><Plus size={15}/> Create local catalog</button></div>}
      <div className="catalog-list-toolbar"><strong>{matchingCatalogs.length} {matchingCatalogs.length === 1 ? "Result" : "Results"}</strong><label><input placeholder="Search for catalogs" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)}/><Search size={17}/></label></div>
      <div className="catalog-scroll"><table className="catalog-grid"><thead><tr>{["Name", "Description", "Source", "Items", "Total size", "Last updated"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{matchingCatalogs.slice(catalogStart, catalogStart + limit).map(catalog => <tr key={catalog.id}><td><button className="catalog-link" onClick={() => openCatalog(catalog)}>{catalog.name}</button></td><td>{catalog.description}</td><td>{catalog.data.source ?? "Braze"}</td><td>{catalog.itemCount}</td><td>{catalog.data.size ?? "—"}</td><td>{catalog.id === sampleCatalogId ? "Sep 13, 2026, 10:38 PM" : new Date(catalog.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div>
      <CatalogPagination start={matchingCatalogs.length ? catalogStart + 1 : 0} end={Math.min(catalogStart + limit, matchingCatalogs.length)} total={matchingCatalogs.length} limit={limit} page={page} pages={catalogPages} setPage={setPage} setLimit={value => { setLimit(value); setPage(0); }}/>
      <CatalogUsage />
    </div> : selected ? <div className="catalog-main">
      {section === "Preview" && <>
        <header className="catalog-heading catalog-detail-heading"><div><h1>{selected.name} <span className="catalog-view-pill"><Eye size={13}/> View only</span></h1><p>{selected.description}</p></div><button className="catalog-outline" onClick={() => notify("Recommendations are not available in this local demo.")}>Create recommendation</button></header>
        <div className="catalog-preview-tools"><div className="catalog-filter-wrap"><button className="catalog-outline" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={16}/> Filters{filter && <span>1</span>}</button>{filterOpen && <div className="catalog-filter-popover"><label>Filter field<select value={filterDraft.field} onChange={event => setFilterDraft({ ...filterDraft, field: event.target.value })}><option value="">Select a field</option>{fields.map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}</select></label><label>Operator<select value={filterDraft.operator} onChange={event => setFilterDraft({ ...filterDraft, operator: event.target.value as Filter["operator"] })}><option value="equals">equals</option><option value="not equals">not equals</option><option value="contains">contains</option></select></label><label>Value<input value={filterDraft.value} onChange={event => setFilterDraft({ ...filterDraft, value: event.target.value })}/></label><div><button className="primary" onClick={() => { setFilter(filterDraft.field && filterDraft.value ? filterDraft : null); setPage(0); setFilterOpen(false); }}>Apply</button>{filter && <button className="text-button" onClick={() => { setFilter(null); setFilterDraft({ field: "", operator: "equals", value: "" }); setPage(0); setFilterOpen(false); }}>Clear</button>}</div></div>}</div><label className="catalog-item-search"><input placeholder="Search for an item by ID" value={searchInput} onChange={event => setSearchInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { setSearchValue(searchInput.trim()); setPage(0); } }}/><button aria-label="Search" onClick={() => { setSearchValue(searchInput.trim()); setPage(0); }}><Search size={17}/></button></label></div>
        <div className="catalog-results"><strong>{filteredItems.length} Results</strong>{!sample && <button className="secondary small" onClick={() => setEditingItem({ id: "", name: "", fields: {}, updatedAt: "" })}><Plus size={14}/> Add item</button>}</div>
        <div className="catalog-scroll"><table className="catalog-grid catalog-items"><thead><tr><th aria-label="View item"/>{fields.map(field => <th key={field}>{fieldLabel(field)}</th>)}</tr></thead><tbody>{shown.map(item => <tr key={item.id}><td><button className="catalog-eye" aria-label={`View catalog item ${item.id}`} onClick={() => setSelectedItem(item)}><Eye size={17}/></button></td>{fields.map(field => <td key={field}>{display(field === "id" ? item.id : item.fields[field] ?? (field === "name" ? item.name : undefined))}</td>)}</tr>)}{!shown.length && <tr><td colSpan={fields.length + 1} className="catalog-empty">No items match this search.</td></tr>}</tbody></table></div>
        <CatalogPagination start={filteredItems.length ? start + 1 : 0} end={Math.min(start + limit, filteredItems.length)} total={filteredItems.length} limit={limit} page={page} pages={pages} setPage={setPage} setLimit={value => { setLimit(value); setPage(0); }}/>
      </>}
      {section === "Selections" && <><header className="catalog-heading"><div><small>{selected.name}</small><h1>Selections <span className="catalog-view-pill"><Eye size={13}/> View only</span></h1></div><button className="secondary" onClick={() => notify("Feedback is unavailable in this local demo.")}>Send feedback</button></header><div className="catalog-list-toolbar"><strong>{matchingSelections ? "1 Result" : "0 Results"}</strong><label><input placeholder="Search by Selection Name" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)}/><Search size={17}/></label></div><div className="catalog-scroll"><table className="catalog-grid"><thead><tr><th>Name</th><th>Description</th><th>Last updated</th></tr></thead><tbody>{matchingSelections && <tr><td><button className="catalog-link" onClick={() => setSelectionOpen(true)}>Gaming</button></td><td>Selection for Gaming Catalog Items</td><td>—</td></tr>}</tbody></table></div><CatalogPagination start={matchingSelections ? 1 : 0} end={matchingSelections ? 1 : 0} total={matchingSelections ? 1 : 0} limit={12} page={0} pages={1} setPage={() => {}} setLimit={() => {}}/><CatalogUsage /></>}
      {section === "Settings" && <CatalogSettings />}
    </div> : <div className="catalog-main">{catalogsLoading ? <p>Loading catalog…</p> : <><h1>Catalog not found</h1><button className="catalog-link" onClick={() => router.push(listUrl)}>Back to Catalogs</button></>}</div>}
    {selectedItem && <aside className="catalog-item-drawer" role="dialog" aria-label={`View item ${selectedItem.id}`}><header><h2>View Item</h2><button aria-label="Close item details" onClick={() => setSelectedItem(null)}><X size={18}/></button></header><dl>{fields.map(field => <div key={field}><dt>{field}</dt><dd>{display(field === "id" ? selectedItem.id : selectedItem.fields[field] ?? (field === "name" ? selectedItem.name : undefined))}</dd></div>)}</dl>{!sample && <button className="secondary" onClick={() => { setEditingItem(selectedItem); setSelectedItem(null); }}>Edit item</button>}</aside>}
    {selectionOpen && <aside className="catalog-item-drawer" role="dialog" aria-label="Gaming selection"><header><h2>Gaming</h2><button aria-label="Close selection" onClick={() => setSelectionOpen(false)}><X size={18}/></button></header><p>Selection for Gaming Catalog Items</p><dl><div><dt>Filter</dt><dd>Product_type is Gaming</dd></div><div><dt>Catalog</dt><dd>{selected?.name}</dd></div></dl><h3>Matching items</h3>{items.filter(item => item.fields.Product_type === "Gaming").map(item => <p key={item.id}>{item.id} · {item.name}</p>)}<p>You need additional permissions to edit and delete selections.</p></aside>}
    {editingItem && !sample && <CatalogEditor key={editingItem.id || "new"} item={editingItem} fields={fields} close={() => setEditingItem(null)} save={saveItem}/>}
  </div>;
}

function CatalogPagination({ start, end, total, limit, page, pages, setPage, setLimit }: { start: number; end: number; total: number; limit: number; page: number; pages: number; setPage: (page: number) => void; setLimit: (limit: number) => void }) {
  return <footer className="catalog-pagination"><span>Showing rows {start} - {end} of {total}</span><label>Rows per page: <select value={limit} onChange={event => setLimit(Number(event.target.value))}><option value={12}>12</option>{pages > 1 && <><option value={24}>24</option><option value={48}>48</option></>}</select></label><div><button disabled={page === 0} aria-label="Previous page" onClick={() => setPage(page - 1)}><ChevronLeft size={17}/></button>{Array.from({ length: pages }, (_, index) => <button key={index} className={page === index ? "selected" : ""} aria-label={`Page ${index + 1}`} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={page >= pages - 1} aria-label="Next page" onClick={() => setPage(page + 1)}><ChevronRight size={17}/></button></div></footer>;
}

function CatalogUsage() {
  return <section className="catalog-usage"><div><small>Package</small><strong>Free</strong><div className="catalog-usage-track"><span/></div><p><b>4KB</b> of 500MB space used</p></div><table><tbody><tr><td>Catalogs</td><td>4KB</td></tr></tbody></table></section>;
}

function CatalogSettings() {
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  return <section className="catalog-settings"><h1>Settings <span className="catalog-view-pill"><Eye size={13}/> View only</span></h1><p>Configure the settings for Canvases and campaigns connected to this catalog. Read more in documentation.</p><div className="catalog-setting-card"><h2>Back in stock</h2><label><input type="checkbox" disabled/> Back in stock</label></div><div className="catalog-setting-card"><h2>Price drop</h2><label><input type="checkbox" disabled/> Price drop</label></div><div className="catalog-setting-card"><h2>Notification rules</h2><p>Notification rules do not replace campaign or Canvas notification settings (e.g. quiet hours)</p><label><input type="radio" defaultChecked disabled name="catalog-notify"/> Notify all subscribed users</label><label><input type="radio" disabled name="catalog-notify"/> Notify a certain number of users per 10 minutes</label></div><div className="catalog-setting-card"><h2>Subscriptions</h2><p>Users who subscribed to catalog notifications. Subscriptions expire when messages are sent, after 90 days, or when users perform the custom event for unsubscribing.</p><p>Active subscriptions: <b>0 / 100,000,000</b></p><button className="secondary" onClick={() => setShowSubscriptions(!showSubscriptions)}>{showSubscriptions ? "Hide subscriptions" : "Show last 10 subscriptions"}</button>{showSubscriptions && <p>No active subscriptions.</p>}</div></section>;
}

function CatalogEditor({ item, fields, close, save }: { item: Item; fields: string[]; close: () => void; save: (item: Item) => Promise<void> }) {
  const [draft, setDraft] = useState(item);
  const [json, setJson] = useState(JSON.stringify(item.fields, null, 2));
  const [error, setError] = useState("");
  const submit = () => { try { const data = JSON.parse(json) as Record<string, unknown>; if (!draft.id || !draft.name) { setError("Item ID and Name are required."); return; } void save({ ...draft, fields: data }); } catch { setError("Fields must be valid JSON."); } };
  return <div className="modal-backdrop"><section className="test-modal catalog-item-modal"><button className="modal-close" aria-label="Close" onClick={close}><X size={18}/></button><h2>{item.id ? "Edit catalog item" : "Add catalog item"}</h2><label>Item ID<input value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })}/></label><label>Name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>Fields ({fields.filter(field => field !== "id").join(", ")})<textarea value={json} onChange={event => setJson(event.target.value)}/></label>{error && <p className="form-error">{error}</p>}<button className="primary" onClick={submit}>Save item</button></section></div>;
}
