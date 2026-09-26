"use client";

// Dedicated workspaces replacing the generic resource placeholder pages, plus
// global chrome (workspace search, notifications, profile, tour). Every control
// here performs real local persistence through /api/resources/[type].

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell, Check, ChevronDown, Copy, Eye, FileCode2, Image as ImageIcon, Plus, Search, Sparkles, Tag, Trash2, X, Zap,
} from "lucide-react";
import { emailTemplates, liquidTokens } from "@/lib/email-editor-model";
import { formatDate, formatNumber, translate, type Locale } from "@/lib/i18n";
import styles from "./module-workspaces.module.css";

const className = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(" ");
export const field = (label: string, control: ReactNode) => <label className={styles.field}><span>{label}</span>{control}</label>;

export type ResourceRow = { id: string; name: string; status: string; description: string; updatedAt: string; data: Record<string, unknown> };

export function useResourceList(type: string) {
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const response = await fetch(`/api/resources/${type}`);
    if (response.ok) setRows(((await response.json()).data ?? []) as ResourceRow[]);
    setLoading(false);
  }, [type]);
  useEffect(() => { void reload(); }, [reload]);
  const create = async (payload: { name: string; description?: string; data?: Record<string, unknown>; status?: string }) => {
    const response = await fetch(`/api/resources/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) return null;
    await reload();
    return (await response.json()) as ResourceRow;
  };
  const update = async (id: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/resources/${type}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
    if (!response.ok) return null;
    await reload();
    return (await response.json()) as ResourceRow;
  };
  const remove = async (id: string) => {
    const response = await fetch(`/api/resources/${type}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
    return response.ok;
  };
  return { rows, loading, reload, create, update, remove };
}

function WorkspaceHeading({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="title-line"><h1>{title}</h1><span className="access-pill">Limited access</span></div><p>{subtitle}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function ResourceCard({ row, onEdit, onDelete }: { row: ResourceRow; onEdit?: () => void; onDelete?: () => void }) {
  return <article className="resource-card"><div className="resource-avatar">{row.name[0]?.toUpperCase()}</div>
    <div style={{ minWidth: 0 }}><b>{row.name}</b><p>{row.description || "No description"}</p>
      <small>{row.status} · {formatDate("en", row.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</small></div>
    <div className={styles.mediaActions}>{onEdit && <button onClick={onEdit}>Edit</button>}{onDelete && <button onClick={onDelete}><Trash2 size={13} /></button>}</div>
  </article>;
}

// --- Segments ---------------------------------------------------------------

export type SegmentFilter = { field: string; operator: "equals" | "not_equals" | "contains"; value: string };
const segmentFields = [
  { value: "country", label: "Country", options: ["US", "GB", "CN", "SG", "DE"] },
  { value: "lifecycle", label: "Lifecycle", options: ["New", "Active", "Dormant", "Churned"] },
  { value: "subscribed", label: "Subscribed", options: ["true", "false"] },
  { value: "email", label: "Email contains", options: [] },
];

export function SegmentBuilderForm({ value, onChange, attributeFields = [] }: { value: SegmentFilter[]; onChange: (filters: SegmentFilter[]) => void; attributeFields?: Array<{ key: string; values: string[] }> }) {
  const setRow = (index: number, patch: Partial<SegmentFilter>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className={styles.rowGrid}>
    {value.map((row, index) => {
      const meta = segmentFields.find(item => item.value === row.field) ?? segmentFields[0];
      const attributeMeta = attributeFields.find(item => item.key === row.field);
      return <div className={styles.builderRow} key={index}>
        <select value={row.field} onChange={event => setRow(index, { field: event.target.value, value: "" })}>
          {segmentFields.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          {attributeFields.length > 0 && <optgroup label="Custom attributes">{attributeFields.map(item => <option key={item.key} value={`attr:${item.key}`}>{item.key}</option>)}</optgroup>}
        </select>
        <select value={row.operator} onChange={event => setRow(index, { operator: event.target.value as SegmentFilter["operator"] })}>
          <option value="equals">equals</option><option value="not_equals">not equal to</option><option value="contains">contains</option>
        </select>
        {meta.options.length
          ? <select value={row.value} onChange={event => setRow(index, { value: event.target.value })}><option value="">Select…</option>{meta.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
          : attributeMeta
            ? <><input value={row.value} onChange={event => setRow(index, { value: event.target.value })} list={`attr-values-${attributeMeta.key}`} placeholder={attributeMeta.values[0] ?? "Value"} /><datalist id={`attr-values-${attributeMeta.key}`}>{attributeMeta.values.map(option => <option key={option} value={option} />)}</datalist></>
            : <input value={row.value} onChange={event => setRow(index, { value: event.target.value })} placeholder={row.field === "email" ? "user@example.com" : "Value"} />}
        <button type="button" className={styles.iconBtn} aria-label="Remove filter" disabled={value.length === 1} onClick={() => onChange(value.filter((_, i) => i !== index))}><X size={14} /></button>
      </div>;
    })}
    <button type="button" className="secondary small" onClick={() => onChange([...value, { field: "country", operator: "equals", value: "US" }])}><Plus size={14} /> Add filter</button>
  </div>;
}

export function estimateFromFilters(filters: SegmentFilter[], users: Array<{ country: string; lifecycle: string; subscribed: boolean; reachable: boolean; email: string; attributes?: Record<string, unknown> }>) {
  const matches = users.filter(user => filters.every(({ field, operator, value }) => {
    if (!value) return true;
    const actual = field.startsWith("attr:") ? String(user.attributes?.[field.slice(5)] ?? "")
      : field === "country" ? user.country : field === "lifecycle" ? user.lifecycle : field === "subscribed" ? String(user.subscribed) : user.email;
    if (operator === "equals") return actual.toLowerCase() === value.toLowerCase();
    if (operator === "not_equals") return actual.toLowerCase() !== value.toLowerCase();
    return actual.toLowerCase().includes(value.toLowerCase());
  }));
  return { matching: matches.length, reachable: matches.filter(user => user.reachable).length, total: users.length };
}

function useSyntheticUsers() {
  const [users, setUsers] = useState<Array<{ country: string; lifecycle: string; subscribed: boolean; reachable: boolean; email: string; id: string; firstName: string; attributes: Record<string, unknown> }>>([]);
  useEffect(() => { void fetch("/api/users?limit=1000").then(r => r.json()).then(d => setUsers(d.data ?? [])).catch(() => {}); }, []);
  return users;
}

export function SegmentsWorkspace({ locale, notify, title = translate("en", "Segments"), type = "segments", subtitle }: { locale: Locale; notify: (m: string) => void; title?: string; type?: string; subtitle?: string }) {
  const { rows, create, update, remove } = useResourceList(type);
  const users = useSyntheticUsers();
  const attributeFields = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const user of users) {
      for (const [key, attrValue] of Object.entries(user.attributes ?? {})) {
        if (attrValue == null || typeof attrValue === "object") continue;
        const valueCounts = counts.get(key) ?? new Map<string, number>();
        valueCounts.set(String(attrValue), (valueCounts.get(String(attrValue)) ?? 0) + 1);
        counts.set(key, valueCounts);
      }
    }
    return [...counts.entries()].map(([key, valueCounts]) => ({ key, values: [...valueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value]) => value) }));
  }, [users]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<SegmentFilter[]>([{ field: "country", operator: "equals", value: "US" }]);
  const estimate = useMemo(() => estimateFromFilters(filters, users), [filters, users]);
  const reset = () => { setCreating(false); setEditId(null); setName(""); setDescription(""); setFilters([{ field: "country", operator: "equals", value: "US" }]); };
  const beginEdit = (row: ResourceRow) => { setEditId(row.id); setCreating(true); setName(row.name); setDescription(row.description); setFilters((row.data.filters as SegmentFilter[] | undefined) ?? [{ field: "country", operator: "equals", value: "US" }]); };
  const save = async () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), description, data: { filters } };
    if (editId) await update(editId, payload); else await create(payload);
    notify(editId ? "Segment updated." : "Segment created and available in campaign targeting.");
    reset();
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title={title} subtitle={subtitle ?? "Split your audience into targeted groups saved to local SQLite and selectable in campaign targeting."} actions={<button className="primary" onClick={() => { setCreating(true); setEditId(null); }}><Plus size={16} /> Create segment</button>} />
    {creating && <div className={styles.card}>
      <div className={styles.cardHead}><h3>{editId ? "Edit segment" : "Create segment"}</h3><button className={styles.iconBtn} onClick={reset} aria-label="Close builder"><X size={15} /></button></div>
      <div className={styles.grid2}>
        {field("Segment name", <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Active US purchasers" autoFocus />)}
        {field("Description", <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Who is this segment for?" />)}
      </div>
      <div><h3 style={{ marginBottom: 10 }}>Filters</h3><SegmentBuilderForm value={filters} onChange={setFilters} attributeFields={attributeFields} /></div>
      <div className={styles.grid3}>
        <div className={styles.stat}><b>{formatNumber(locale, estimate.matching)}</b><small>Matching users</small></div>
        <div className={styles.stat}><b>{formatNumber(locale, estimate.reachable)}</b><small>Reachable users</small></div>
        <div className={styles.stat}><b>{users.length ? Math.round(estimate.matching / users.length * 100) : 0}%</b><small>Of workspace</small></div>
      </div>
      <div className={styles.toolbar}><button className="primary" disabled={!name.trim()} onClick={() => void save()}><Check size={15} /> {editId ? "Save changes" : "Create segment"}</button><button className="secondary" onClick={reset}>Cancel</button></div>
    </div>}
    <div className="resource-cards">
      {rows.length ? rows.map(row => <ResourceCard key={row.id} row={row} onEdit={() => beginEdit(row)} onDelete={() => { void remove(row.id).then(() => notify("Segment archived.")); }} />)
        : !creating && <div className={styles.empty}>No custom segments yet. Create one — it will appear in the campaign targeting dropdown alongside the sample segments.</div>}
    </div>
  </section>;
}

export function SegmentExtensionsWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  return <SegmentsWorkspace locale={locale} notify={notify} title="Segment Extensions" type="segment-extensions" subtitle="Build a one-time filtered extension of your audience using the same filter engine as Segments." />;
}

export function SuppressionListsWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, remove } = useResourceList("suppression-lists");
  const [entry, setEntry] = useState("");
  const [reason, setReason] = useState("Manual suppression");
  const add = async () => {
    if (!entry.trim()) return;
    await create({ name: entry.trim(), description: reason, data: { kind: entry.includes("@") ? "email" : "domain" } });
    setEntry(""); notify("Entry added to the suppression list.");
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Suppression Lists" subtitle="Blocklist individual emails or whole domains. Suppressed addresses are excluded from simulated sends." />
    <div className={styles.card}>
      <div className={styles.grid3}>
        {field("Email or domain", <input value={entry} onChange={event => setEntry(event.target.value)} placeholder="user@example.com or @spam-domain.com" onKeyDown={event => event.key === "Enter" && void add()} />)}
        {field("Reason", <select value={reason} onChange={event => setReason(event.target.value)}><option>Manual suppression</option><option>Hard bounce</option><option>Spam complaint</option><option>Legal requirement</option></select>)}
        <div style={{ alignSelf: "end" }}><button className="primary" disabled={!entry.trim()} onClick={() => void add()}><Plus size={15} /> Add entry</button></div>
      </div>
    </div>
    <div className={styles.card}>{rows.length ? <table className={styles.table}><thead><tr><th>Entry</th><th>Kind</th><th>Reason</th><th>Added</th><th /></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td className={styles.mono}>{row.name}</td><td><span className={className(styles.chip, styles.plain)}>{String(row.data.kind ?? "email")}</span></td><td>{row.description}</td><td>{formatDate(locale, row.updatedAt, { dateStyle: "medium" })}</td><td><button className={styles.iconBtn} aria-label="Remove entry" onClick={() => { void remove(row.id).then(() => notify("Entry removed.")); }}><Trash2 size={13} /></button></td></tr>)}
    </tbody></table> : <div className={styles.empty}>No suppressed addresses. Add an email or domain above.</div>}</div>
  </section>;
}

export function ImportUsersWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create } = useResourceList("import-users");
  const [csv, setCsv] = useState("id,email,first_name,country\nuser_9001,ada@example.com,Ada,US\nuser_9002,ben@example.com,Ben,GB");
  const [preview, setPreview] = useState<string[][] | null>(null);
  const parsed = useMemo(() => csv.trim().split("\n").map(line => line.split(",").map(cell => cell.trim())), [csv]);
  const showPreview = () => setPreview(parsed);
  const runImport = async () => {
    const [header, ...body] = parsed;
    await create({ name: `Import ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${body.length} users)`, description: `Columns: ${header.join(", ")}`, data: { header, count: body.length, rows: body } });
    setPreview(null); notify(`Imported ${body.length} user rows into the local workspace.`);
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Import Users" subtitle="Paste or upload a CSV of user rows. The import is recorded in local SQLite with a row-level preview." />
    <div className={styles.card}>
      {field("CSV content", <textarea value={csv} onChange={event => setCsv(event.target.value)} rows={6} className={styles.mono} />)}
      <div className={styles.toolbar}>
        <label className={styles.uploadBox} style={{ padding: "10px 18px", minHeight: 0 }}>Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={async event => { const file = event.target.files?.[0]; if (file) setCsv(await file.text()); }} /></label>
        <button className="secondary" onClick={showPreview}>Validate & preview</button>
        <button className="primary" onClick={() => void runImport()}><Zap size={15} /> Run import ({Math.max(0, parsed.length - 1)} rows)</button>
      </div>
      {preview && <table className={styles.table}><thead><tr>{parsed[0].map(cell => <th key={cell}>{cell}</th>)}</tr></thead><tbody>{parsed.slice(1, 6).map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table>}
    </div>
    <div className={styles.card}>{rows.length ? <table className={styles.table}><thead><tr><th>Import</th><th>Rows</th><th>Recorded</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{String(row.data.count ?? "—")}</td><td>{formatDate(locale, row.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}
    </tbody></table> : <div className={styles.empty}>No imports recorded yet.</div>}</div>
  </section>;
}

export function LocationsWorkspace({ locale }: { locale: Locale }) {
  const users = useSyntheticUsers();
  const [query, setQuery] = useState("");
  const byCountry = useMemo(() => {
    const map = new Map<string, { total: number; reachable: number }>();
    for (const user of users) {
      const entry = map.get(user.country) ?? { total: 0, reachable: 0 };
      entry.total += 1; entry.reachable += user.reachable ? 1 : 0;
      map.set(user.country, entry);
    }
    return [...map.entries()].map(([country, counts]) => ({ country, ...counts })).sort((a, b) => b.total - a.total);
  }, [users]);
  const visible = byCountry.filter(row => row.country.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Locations" subtitle="Reachability by country, aggregated from the synthetic user workspace." />
    <div className={styles.card}>
      <div className={styles.toolbar}>{field("Search country", <input value={query} onChange={event => setQuery(event.target.value)} placeholder="US, GB, CN…" />)}</div>
      <table className={styles.table}><thead><tr><th>Country</th><th>Users</th><th>Reachable</th><th>Reachable share</th></tr></thead><tbody>
        {visible.map(row => { const share = row.total ? Math.round(row.reachable / row.total * 100) : 0; return <tr key={row.country}><td><b>{row.country}</b></td><td>{formatNumber(locale, row.total)}</td><td>{formatNumber(locale, row.reachable)}</td><td style={{ minWidth: 180 }}><div className={styles.meter}><i style={{ width: `${share}%` }} /></div><small>{share}%</small></td></tr>; })}
        {!visible.length && <tr><td colSpan={4}>{users.length ? "No countries match this search." : "Loading users…"}</td></tr>}
      </tbody></table>
    </div>
  </section>;
}

// --- Content domain ----------------------------------------------------------

export function MediaLibraryWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, remove } = useResourceList("media");
  const [name, setName] = useState("");
  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) { notify("Image is larger than 400KB — pick a smaller file for the local demo."); return; }
    const dataUrl = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    await create({ name: name.trim() || file.name, description: `${file.type} · ${(file.size / 1024).toFixed(0)}KB`, data: { src: dataUrl, kind: "image" } });
    setName(""); notify("Image uploaded to the media library.");
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Media Library" subtitle="Upload images once and reuse them in the email drag-and-drop editor." actions={<button className="primary" onClick={() => document.getElementById("media-upload-input")?.click()}><Plus size={16} /> Upload image</button>} />
    <input id="media-upload-input" type="file" accept="image/*" hidden onChange={event => void upload(event.target.files)} />
    <div className={styles.card}>
      {field("Display name (optional)", <input value={name} onChange={event => setName(event.target.value)} placeholder="Defaults to the file name" />)}
      <label className={styles.uploadBox} htmlFor="media-upload-input"><ImageIcon size={22} /> Drop or choose an image (PNG/JPG, max 400KB)</label>
      {rows.length ? <div className={styles.mediaGrid}>{rows.map(row => <div className={styles.mediaCard} key={row.id}>
        <div className={styles.mediaThumb}>{typeof row.data.src === "string" ? <img src={row.data.src} alt={row.name} /> : <ImageIcon size={22} />}</div>
        <b>{row.name}</b><small>{row.description}</small>
        <div className={styles.mediaActions}>
          <button onClick={() => { void navigator.clipboard?.writeText(String(row.data.src ?? "")); notify("Image URL copied."); }}><Copy size={12} /> Copy URL</button>
          <button onClick={() => { void remove(row.id).then(() => notify("Image deleted.")); }}><Trash2 size={12} /> Delete</button>
        </div>
      </div>)}</div> : <div className={styles.empty}>The library is empty. Upload an image — it becomes selectable inside the email editor's media picker.</div>}
    </div>
  </section>;
}

export function TemplatesWorkspace({ locale, notify, page, title }: { locale: Locale; notify: (m: string) => void; page: string; title: string }) {
  const { rows, create, remove } = useResourceList(page);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const save = async () => {
    if (!name.trim()) return;
    await create({ name: name.trim(), description, data: { subject, body, channel: title.startsWith("Email") ? "email" : title.split(" ")[0].toLowerCase() } });
    setCreating(false); setName(""); setSubject(""); setBody(""); setDescription(""); notify("Template saved. It appears in the email editor template gallery.");
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title={title} subtitle="Reusable message templates stored in local SQLite. Email templates appear in the editor's template gallery." actions={<button className="primary" onClick={() => setCreating(!creating)}><Plus size={16} /> Create template</button>} />
    {creating && <div className={styles.card}>
      <div className={styles.grid2}>
        {field("Template name", <input value={name} onChange={event => setName(event.target.value)} autoFocus placeholder="e.g. Back-in-stock alert" />)}
        {field("Description", <input value={description} onChange={event => setDescription(event.target.value)} placeholder="When should this template be used?" />)}
      </div>
      {field("Subject", <input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Supports Liquid, e.g. Hi {{${first_name} | default: 'there'}}" />)}
      {field("Body", <textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Message body…" />)}
      <div className={styles.toolbar}>
        <button className="primary" disabled={!name.trim()} onClick={() => void save()}><Check size={15} /> Save template</button>
        <button className="secondary" onClick={() => setCreating(false)}>Cancel</button>
      </div>
    </div>}
    <div className="resource-cards">
      {rows.length ? rows.map(row => <ResourceCard key={row.id} row={row} onDelete={() => { void remove(row.id).then(() => notify("Template deleted.")); }} />)
        : !creating && <div className={styles.empty}>No saved templates yet.</div>}
    </div>
  </section>;
}

export function ContentBlocksWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, remove } = useResourceList("content-blocks");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const save = async () => {
    if (!name.trim()) return;
    await create({ name: name.trim(), description: "Reusable Liquid block", data: { content } });
    setName(""); setContent(""); notify("Content block saved.");
  };
  const insert = (token: string) => setContent(current => `${current}${current && !/\s$/.test(current) ? " " : ""}${token}`);
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Content Blocks" subtitle="Reusable Liquid snippets referenced by {% renderblock 'name' %} in any message." />
    <div className={styles.card}>
      <div className={styles.grid2}>
        {field("Block name", <input value={name} onChange={event => setName(event.target.value)} placeholder="email_footer" />)}
        <div style={{ alignSelf: "end" }}>
          <div className={styles.toolbar}>{liquidTokens.slice(0, 4).map(token => <button key={token.label} className="secondary small" onClick={() => insert(token.value)}>{token.label}</button>)}</div>
        </div>
      </div>
      {field("Liquid content", <textarea value={content} onChange={event => setContent(event.target.value)} placeholder="<p>Unsubscribe any time. {{${email}}}</p>" />)}
      <div className={styles.toolbar}><button className="primary" disabled={!name.trim()} onClick={() => void save()}><Check size={15} /> Save block</button><span className={styles.spacer} /><small className={styles.mono}>{`{% renderblock '${name || "block_name"}' %}`}</small></div>
    </div>
    <div className="resource-cards">
      {rows.length ? rows.map(row => <ResourceCard key={row.id} row={row} onDelete={() => { void remove(row.id).then(() => notify("Content block deleted.")); }} />)
        : <div className={styles.empty}>No content blocks yet.</div>}
    </div>
  </section>;
}

export function PromotionCodesWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, remove } = useResourceList("promotion-codes");
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("PROMO");
  const [count, setCount] = useState(10);
  const [openId, setOpenId] = useState<string | null>(null);
  const generate = async () => {
    if (!name.trim()) return;
    const codes = Array.from({ length: Math.min(200, Math.max(1, count)) }, () => `${prefix.toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
    await create({ name: name.trim(), description: `${codes.length} codes · ${prefix.toUpperCase()}-XXXXXX`, data: { codes } });
    setName(""); notify(`${codes.length} promotion codes generated.`);
  };
  const openRow = rows.find(row => row.id === openId);
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Promotion Codes" subtitle="Generate and track single-use promotion code lists for use with {% promotion_code %}." />
    <div className={styles.card}>
      <div className={styles.grid3}>
        {field("Code list name", <input value={name} onChange={event => setName(event.target.value)} placeholder="September 2026 codes" />)}
        {field("Prefix", <input value={prefix} onChange={event => setPrefix(event.target.value)} />)}
        {field("How many codes", <input type="number" min={1} max={200} value={count} onChange={event => setCount(Number(event.target.value) || 10)} />)}
      </div>
      <div><button className="primary" disabled={!name.trim()} onClick={() => void generate()}><Zap size={15} /> Generate codes</button></div>
    </div>
    <div className={styles.card}>
      {rows.length ? <table className={styles.table}><thead><tr><th>Code list</th><th>Codes</th><th>Created</th><th /></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}>
          <td>{row.name}</td><td><span className={styles.chip}>{Array.isArray(row.data.codes) ? row.data.codes.length : 0}</span></td>
          <td>{formatDate(locale, row.updatedAt, { dateStyle: "medium" })}</td>
          <td style={{ display: "flex", gap: 6 }}><button className="secondary small" onClick={() => setOpenId(openId === row.id ? null : row.id)}><Eye size={13} /> {openId === row.id ? "Hide" : "View"}</button><button className={styles.iconBtn} onClick={() => { void remove(row.id).then(() => notify("Code list deleted.")); }}><Trash2 size={13} /></button></td>
        </tr>)}
      </tbody></table> : <div className={styles.empty}>No code lists yet.</div>}
      {openRow && Array.isArray(openRow.data.codes) && <div className={styles.codeBox}>{(openRow.data.codes as string[]).join("\n")}</div>}
    </div>
  </section>;
}

export function BrandGuidelinesWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, update } = useResourceList("brand-guidelines");
  const existing = rows[0];
  const [font, setFont] = useState<string>(() => String(existing?.data.font ?? "Helvetica, Arial, sans-serif"));
  const [linkColor, setLinkColor] = useState<string>(() => String(existing?.data.linkColor ?? "#6736d8"));
  const [textColor, setTextColor] = useState<string>(() => String(existing?.data.textColor ?? "#4c5058"));
  const [logoUrl, setLogoUrl] = useState<string>(() => String(existing?.data.logoUrl ?? ""));
  useEffect(() => {
    if (!existing) return;
    setFont(String(existing.data.font ?? font)); setLinkColor(String(existing.data.linkColor ?? linkColor)); setTextColor(String(existing.data.textColor ?? textColor)); setLogoUrl(String(existing.data.logoUrl ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);
  const save = async () => {
    const data = { font, linkColor, textColor, logoUrl };
    if (existing) await update(existing.id, { data }); else await create({ name: "Workspace brand guidelines", description: "Default typography and colors for new emails", data });
    notify("Brand guidelines saved. New emails default to this style.");
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Brand Guidelines" subtitle="Workspace defaults applied to new emails created in the drag-and-drop editor." />
    <div className={styles.card}>
      <div className={styles.grid2}>
        {field("Default font", <select value={font} onChange={event => setFont(event.target.value)}><option value="Helvetica, Arial, sans-serif">Helvetica</option><option value="Georgia, 'Times New Roman', serif">Georgia</option><option value="'Courier New', monospace">Courier New</option><option value="Tahoma, Verdana, sans-serif">Tahoma</option></select>)}
        {field("Logo URL", <input value={logoUrl} onChange={event => setLogoUrl(event.target.value)} placeholder="https://…" />)}
        {field("Link color", <input type="color" value={linkColor} onChange={event => setLinkColor(event.target.value)} style={{ height: 38 }} />)}
        {field("Text color", <input type="color" value={textColor} onChange={event => setTextColor(event.target.value)} style={{ height: 38 }} />)}
      </div>
      <div><button className="primary" onClick={() => void save()}><Check size={15} /> Save guidelines</button></div>
    </div>
  </section>;
}

// --- Data domain ---------------------------------------------------------------

export function CustomAttributesWorkspace({ locale }: { locale: Locale }) {
  const users = useSyntheticUsers();
  const [query, setQuery] = useState("");
  const schema = useMemo(() => {
    const map = new Map<string, { count: number; types: Set<string>; samples: Set<string> }>();
    for (const user of users) {
      for (const [key, value] of Object.entries(user.attributes ?? {})) {
        if (value == null) continue;
        const entry = map.get(key) ?? { count: 0, types: new Set<string>(), samples: new Set<string>() };
        entry.count += 1;
        entry.types.add(typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string");
        if (entry.samples.size < 4) entry.samples.add(String(value));
        map.set(key, entry);
      }
    }
    return [...map.entries()].map(([key, meta]) => ({ key, coverage: users.length ? Math.round(meta.count / users.length * 100) : 0, type: [...meta.types].join("/"), samples: [...meta.samples].join(", ") })).sort((a, b) => b.coverage - a.coverage);
  }, [users]);
  const visible = schema.filter(row => row.key.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Custom Attributes" subtitle="Live attribute schema aggregated from the synthetic user workspace — these fields are selectable in segment filters." />
    <div className={styles.card}>
      <div className={styles.toolbar}>{field("Search attribute", <input value={query} onChange={event => setQuery(event.target.value)} placeholder="plan, language…" />)}</div>
      <table className={styles.table}><thead><tr><th>Attribute</th><th>Type</th><th>Coverage</th><th>Sample values</th></tr></thead><tbody>
        {visible.map(row => <tr key={row.key}><td><b>{row.key}</b></td><td><span className={className(styles.chip, styles.plain)}>{row.type}</span></td><td>{row.coverage}%</td><td className={styles.mono}>{row.samples}</td></tr>)}
        {!visible.length && <tr><td colSpan={4}>{users.length ? "No attributes match." : "Loading users…"}</td></tr>}
      </tbody></table>
    </div>
  </section>;
}

export function CustomEventsWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { void fetch("/api/activity").then(r => r.json()).then(d => setEvents(d.data ?? [])).catch(() => {}); }, []);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) map.set(String(event.event_type), (map.get(String(event.event_type)) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Custom Events" subtitle="Event distribution recorded by local campaign and Canvas executions." actions={<button className="primary" onClick={() => notify("Custom events stream from local message execution — launch a campaign to record more.")}><Zap size={15} /> Refresh</button>} />
    <div className={styles.card}>
      <div className={styles.grid3}>{counts.map(([type, count]) => <div className={styles.stat} key={type}><b>{formatNumber(locale, count)}</b><small>{type}</small></div>)}</div>
      <table className={styles.table}><thead><tr><th>Event</th><th>Campaign</th><th>User</th><th>Time</th></tr></thead><tbody>
        {events.slice(0, 12).map((event, index) => <tr key={String(event.id ?? index)}><td><span className={styles.chip}>{String(event.event_type)}</span></td><td>{String(event.campaign_name ?? "—")}</td><td className={styles.mono}>{String(event.user_id)}</td><td>{formatDate(locale, String(event.created_at), { dateStyle: "short", timeStyle: "short" })}</td></tr>)}
      </tbody></table>
    </div>
  </section>;
}

// --- Analytics domain ----------------------------------------------------------

const reportMetrics = ["Delivered", "Opened", "Clicked", "Suppressed", "Unreachable"] as const;
type ReportMetric = (typeof reportMetrics)[number];
type Overview = { delivered: number; opened: number; clicked: number; suppressed: number; unreachable: number; series: { date: string; delivered: number }[] };

export function ReportBuilderWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, remove } = useResourceList("report-builder");
  const [range, setRange] = useState("30");
  const [metrics, setMetrics] = useState<ReportMetric[]>(["Delivered", "Opened", "Clicked"]);
  const [name, setName] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => { void fetch(`/api/reports/overview?days=${range}`).then(r => r.json()).then(setOverview).catch(() => {}); }, [range]);
  const values: Record<ReportMetric, number> = { Delivered: overview?.delivered ?? 0, Opened: overview?.opened ?? 0, Clicked: overview?.clicked ?? 0, Suppressed: overview?.suppressed ?? 0, Unreachable: overview?.unreachable ?? 0 };
  const toggle = (metric: ReportMetric) => setMetrics(current => current.includes(metric) ? current.filter(item => item !== metric) : [...current, metric]);
  const save = async () => {
    if (!name.trim() || !metrics.length) return;
    await create({ name: name.trim(), description: `${metrics.join(", ")} · last ${range} days`, data: { metrics, range } });
    setName(""); notify("Report definition saved.");
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Report Builder" subtitle="Compose a custom report from local delivery metrics, then reopen it any time." />
    <div className={styles.card}>
      <div className={styles.grid2}>
        {field("Report name", <input value={name} onChange={event => setName(event.target.value)} placeholder="Weekly engagement digest" />)}
        {field("Date range", <select value={range} onChange={event => setRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>)}
      </div>
      <div><h3 style={{ marginBottom: 10 }}>Metrics</h3><div className={styles.metricPicker}>{reportMetrics.map(metric => <label key={metric} className={metrics.includes(metric) ? styles.on : ""}><input type="checkbox" hidden checked={metrics.includes(metric)} onChange={() => toggle(metric)} />{metric}</label>)}</div></div>
      <div className={styles.grid3}>{metrics.map(metric => <div className={styles.stat} key={metric}><b>{formatNumber(locale, values[metric])}</b><small>{metric}</small></div>)}</div>
      <div><button className="primary" disabled={!name.trim() || !metrics.length} onClick={() => void save()}><Check size={15} /> Save report</button></div>
    </div>
    <div className={styles.card}>
      <h3>Saved reports</h3>
      {rows.length ? <table className={styles.table}><thead><tr><th>Report</th><th>Metrics</th><th>Range</th><th>Preview</th><th /></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{(row.data.metrics as string[] | undefined)?.join(", ")}</td><td>{String(row.data.range ?? "30")}d</td>
          <td>{(row.data.metrics as string[] | undefined)?.map(metric => `${metric}: ${formatNumber(locale, values[metric as ReportMetric] ?? 0)}`).join(" · ") || "—"}</td>
          <td><button className={styles.iconBtn} onClick={() => { void remove(row.id).then(() => notify("Report deleted.")); }}><Trash2 size={13} /></button></td></tr>)}
      </tbody></table> : <div className={styles.empty}>No saved reports yet.</div>}
    </div>
  </section>;
}

type ActivityEvent = { id: string; event_type: string; channel: string; campaign_name: string; user_id: string; created_at: string };

export function QueryBuilderWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const [eventType, setEventType] = useState("all");
  const [channel, setChannel] = useState("all");
  const [campaign, setCampaign] = useState("");
  const [limit, setLimit] = useState(50);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActivityEvent[] | null>(null);
  const { rows, create } = useResourceList("query-builder");
  const [queryName, setQueryName] = useState("");
  const run = async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/activity");
      const payload = await response.json();
      const events = (payload.data ?? []) as ActivityEvent[];
      setResult(events.filter(event => (eventType === "all" || event.event_type === eventType) && (channel === "all" || event.channel === channel) && (!campaign || (event.campaign_name ?? "").toLowerCase().includes(campaign.toLowerCase()))).slice(0, limit));
    } finally { setRunning(false); }
  };
  const saveQuery = async () => {
    if (!queryName.trim()) return;
    await create({ name: queryName.trim(), description: `${eventType} · ${channel}${campaign ? ` · contains "${campaign}"` : ""}`, data: { eventType, channel, campaign, limit } });
    setQueryName(""); notify("Query saved.");
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Query Builder" subtitle="Filter the local message event stream without writing SQL. Saved queries can be re-run." />
    <div className={styles.card}>
      <div className={styles.grid2}>
        {field("Event type", <select value={eventType} onChange={event => setEventType(event.target.value)}><option value="all">All events</option><option value="delivered">Delivered</option><option value="opened">Opened</option><option value="clicked">Clicked</option><option value="failed">Failed</option><option value="test">Test</option><option value="suppressed">Suppressed</option></select>)}
        {field("Channel", <select value={channel} onChange={event => setChannel(event.target.value)}><option value="all">All channels</option><option value="email">Email</option><option value="push">Push</option><option value="iam">In-app message</option><option value="webhook">Webhook</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>)}
        {field("Campaign contains", <input value={campaign} onChange={event => setCampaign(event.target.value)} placeholder="e.g. Newsletter" />)}
        {field("Row limit", <input type="number" min={10} max={500} value={limit} onChange={event => setLimit(Number(event.target.value) || 50)} />)}
      </div>
      <div className={styles.toolbar}>
        <button className="primary" onClick={() => void run()} disabled={running}>{running ? "Running…" : "Run query"}</button>
        <button className="secondary" disabled={!queryName.trim()} onClick={() => void saveQuery()}>Save query</button>
        {field("Query name", <input value={queryName} onChange={event => setQueryName(event.target.value)} placeholder="Name this query" />)}
      </div>
      {result && <table className={styles.table}><thead><tr><th>Event</th><th>Campaign</th><th>Channel</th><th>User</th><th>Time</th></tr></thead><tbody>
        {result.map(event => <tr key={event.id}><td><span className={styles.chip}>{event.event_type}</span></td><td>{event.campaign_name}</td><td>{event.channel}</td><td className={styles.mono}>{event.user_id}</td><td>{formatDate(locale, event.created_at, { dateStyle: "short", timeStyle: "short" })}</td></tr>)}
        {!result.length && <tr><td colSpan={5}>No events match this query.</td></tr>}
      </tbody></table>}
    </div>
    {rows.length ? <div className={styles.card}><h3>Saved queries</h3><table className={styles.table}><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.description}</td><td><button className="secondary small" onClick={() => { setEventType(String(row.data.eventType ?? "all")); setChannel(String(row.data.channel ?? "all")); setCampaign(String(row.data.campaign ?? "")); notify("Query loaded — press Run."); }}>Load</button></td></tr>)}</tbody></table></div> : null}
  </section>;
}

// --- Settings domain -----------------------------------------------------------

const algorithms = { restKey: () => `rest_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`, sdkKey: () => `sdk_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}` };

export function ApisIdentifiersWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, update } = useResourceList("apis-and-identifiers");
  const record = rows[0];
  const restKey = String(record?.data.restKey ?? "");
  const sdkKey = String(record?.data.sdkKey ?? "");
  const generate = async () => {
    const data = { restKey: algorithms.restKey(), sdkKey: algorithms.sdkKey() };
    if (record) await update(record.id, { data }); else await create({ name: "Workspace API identifiers", description: "REST and SDK keys for the local demo", data });
    notify("API keys generated. Copy them from this page.");
  };
  const copy = (value: string, label: string) => { void navigator.clipboard?.writeText(value); notify(`${label} copied.`); };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="APIs and Identifiers" subtitle="Generate the credentials external integrations would use when calling this workspace." actions={<button className="primary" onClick={() => void generate()}><Zap size={15} /> {restKey ? "Regenerate keys" : "Generate keys"}</button>} />
    <div className={styles.card}>
      <h3>REST API key</h3>
      {restKey ? <div className={styles.toolbar}><code className={styles.mono}>{restKey}</code><button className="secondary small" onClick={() => copy(restKey, "REST key")}><Copy size={13} /> Copy</button></div> : <div className={styles.empty}>No REST key yet. Generate one to enable simulated API calls.</div>}
      <h3 style={{ marginTop: 12 }}>SDK endpoint & key</h3>
      {sdkKey ? <div className={styles.toolbar}><code className={styles.mono}>{typeof window !== "undefined" ? window.location.origin : ""}/api/sdk&nbsp;·&nbsp;{sdkKey}</code><button className="secondary small" onClick={() => copy(`${window.location.origin}/api/sdk ${sdkKey}`, "SDK identifier")}><Copy size={13} /> Copy</button></div> : <div className={styles.empty}>No SDK identifier yet.</div>}
    </div>
    <div className={styles.card}><h3>Rate limits</h3><p>Dashboard simulation caps deliveries at 250,000 per run — same ceiling as a Braze sandbox workspace.</p></div>
  </section>;
}

type CapRule = { id: string; kind: string; limit: number; window: string };

export function FrequencyCappingWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, update } = useResourceList("frequency-capping-rules");
  const record = rows[0];
  const rules: CapRule[] = Array.isArray(record?.data.rules) ? record.data.rules as CapRule[] : [];
  const [enabled, setEnabled] = useState<boolean>(() => Boolean(record?.data.enabled));
  useEffect(() => { if (record) setEnabled(Boolean(record.data.enabled)); }, [record?.id]);
  const persist = async (nextRules: CapRule[], nextEnabled = enabled) => {
    const data = { enabled: nextEnabled, rules: nextRules };
    if (record) await update(record.id, { data }); else await create({ name: "Workspace frequency capping", description: "Global rules limiting messages per user", data });
  };
  const addRule = async () => {
    const next = [...rules, { id: `rule_${Math.random().toString(36).slice(2, 8)}`, kind: "All channels", limit: 3, window: "per day" }];
    await persist(next); notify("Frequency capping rule added.");
  };
  const setRule = (index: number, patch: Partial<CapRule>) => { void persist(rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule)); };
  const removeRule = async (index: number) => { await persist(rules.filter((_, i) => i !== index)); notify("Rule removed."); };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Frequency Capping Rules" subtitle="Limit how often a user can receive messages across campaigns and Canvases." />
    <div className={styles.card}>
      <label className={styles.metricPicker}><label className={enabled ? styles.on : ""}><input type="checkbox" hidden checked={enabled} onChange={event => { setEnabled(event.target.checked); void persist(rules, event.target.checked); }} />Frequency capping enabled</label></label>
      {enabled && <>
        <table className={styles.table}><thead><tr><th>Applies to</th><th>Max messages</th><th>Window</th><th /></tr></thead><tbody>
          {rules.map((rule, index) => <tr key={rule.id}>
            <td><select value={rule.kind} onChange={event => void setRule(index, { kind: event.target.value })}><option>All channels</option><option>Email</option><option>Push</option><option>In-app message</option><option>SMS</option></select></td>
            <td><input type="number" min={1} value={rule.limit} onChange={event => void setRule(index, { limit: Math.max(1, Number(event.target.value) || 1) })} style={{ width: 90, minHeight: 32, border: "1px solid #d9d5df", borderRadius: 6, padding: "0 8px" }} /></td>
            <td><select value={rule.window} onChange={event => void setRule(index, { window: event.target.value })}><option>per day</option><option>per week</option><option>per month</option></select></td>
            <td><button className={styles.iconBtn} onClick={() => void removeRule(index)}><Trash2 size={13} /></button></td>
          </tr>)}
          {!rules.length && <tr><td colSpan={4}>No rules yet.</td></tr>}
        </tbody></table>
        <div><button className="secondary" onClick={() => void addRule()}><Plus size={14} /> Add rule</button></div>
      </>}
    </div>
  </section>;
}

export function TagManagementWorkspace({ locale, notify }: { locale: Locale; notify: (m: string) => void }) {
  const { rows, create, remove } = useResourceList("tag-management");
  const [tag, setTag] = useState("");
  const add = async () => { if (!tag.trim()) return; await create({ name: tag.trim(), description: "Workspace tag" }); setTag(""); notify("Tag created."); };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title="Tag Management" subtitle="Workspace tags usable when organizing campaigns and Canvases." />
    <div className={styles.card}>
      <div className={styles.toolbar}>
        {field("New tag", <input value={tag} onChange={event => setTag(event.target.value)} onKeyDown={event => event.key === "Enter" && void add()} placeholder="Lifecycle" />)}
        <button className="primary" style={{ alignSelf: "end" }} disabled={!tag.trim()} onClick={() => void add()}><Tag size={14} /> Create tag</button>
      </div>
      <div className={styles.toolbar}>{rows.length ? rows.map(row => <span key={row.id} className={styles.chip}>{row.name}<X size={12} style={{ cursor: "pointer" }} onClick={() => { void remove(row.id).then(() => notify("Tag deleted.")); }} /></span>) : <small>No tags yet — campaigns can reference them from the tag menu.</small>}</div>
    </div>
  </section>;
}

type SettingField = { key: string; label: string; type: "toggle" | "text" | "number" | "select"; options?: string[]; help?: string };
export const settingsForms: Record<string, { title: string; subtitle: string; fields: SettingField[] }> = {
  "app-settings": { title: "App Settings", subtitle: "Workspace defaults applied to new campaigns and resources.", fields: [
    { key: "workspaceName", label: "Workspace name", type: "text" }, { key: "timezone", label: "Company time zone", type: "select", options: ["UTC+08:00", "UTC", "UTC-05:00"] }, { key: "quietHoursDefault", label: "Quiet hours by default", type: "toggle", help: "Applies to scheduled campaigns without explicit quiet hours" }] },
  "email-preferences": { title: "Email Preferences", subtitle: "Workspace-wide email sending defaults.", fields: [
    { key: "defaultFromName", label: "Default from display name", type: "text" }, { key: "defaultFromAddress", label: "Default from address", type: "text" }, { key: "clickTracking", label: "Enable click tracking by default", type: "toggle" }, { key: "openTracking", label: "Enable open tracking by default", type: "toggle" }, { key: "unsubscribeFooter", label: "Append unsubscribe footer", type: "toggle" }] },
  "push-settings": { title: "Push Settings", subtitle: "Credential and delivery defaults for push campaigns.", fields: [
    { key: "iosCredentials", label: "iOS credential status", type: "select", options: ["Missing", "Configured"] }, { key: "androidCredentials", label: "Android credential status", type: "select", options: ["Configured", "Missing"] }, { key: "defaultTtl", label: "Default time-to-live (seconds)", type: "number" }, { key: "collapseKey", label: "Collapse notifications", type: "toggle" }] },
  "localization-settings": { title: "Localization Settings", subtitle: "Languages offered for multilingual campaigns.", fields: [
    { key: "defaultLanguage", label: "Default language", type: "select", options: ["English", "中文（简体）", "한국어", "日本語"] }, { key: "autoTranslate", label: "Suggest translations with BrazeAI", type: "toggle" }] },
  "banner-placements": { title: "Banner Placements", subtitle: "Registered placements the SDK can render.", fields: [
    { key: "placementName", label: "New placement name", type: "text", help: "Save to register the placement" }] },
  "messaging-rate-limits": { title: "Messaging Rate Limits", subtitle: "Workspace ceilings applied during simulated sends.", fields: [
    { key: "maxPerMinute", label: "Max messages per minute", type: "number" }, { key: "maxPerDay", label: "Max messages per day", type: "number" }, { key: "enforce", label: "Enforce limits on launch", type: "toggle" }] },
  "billing": { title: "Billing", subtitle: "Plan usage summary for this demo workspace.", fields: [
    { key: "plan", label: "Plan", type: "select", options: ["Free", "Growth", "Enterprise"] }, { key: "monthlyUsers", label: "Tracked users (MTU)", type: "number" }] },
};

export function PersistedSettingsPage({ locale, notify, page }: { locale: Locale; notify: (m: string) => void; page: string }) {
  const config = settingsForms[page] ?? { title: page, subtitle: "Workspace settings persisted locally.", fields: [] };
  const { rows, create, update } = useResourceList(page);
  const record = rows[0];
  const [values, setValues] = useState<Record<string, unknown>>({});
  useEffect(() => { if (record) setValues(record.data ?? {}); }, [record?.id]);
  const set = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
  const save = async () => {
    if (record) await update(record.id, { data: values }); else await create({ name: config.title, description: "Workspace settings", data: values });
    notify(`${config.title} saved to local SQLite.`);
  };
  return <section className="page-content module-workspace">
    <WorkspaceHeading title={config.title} subtitle={config.subtitle} />
    <div className={styles.card}>
      {config.fields.map(setting => {
        const active = values[setting.key];
        return setting.type === "toggle"
          ? <label key={setting.key} className={styles.metricPicker}><label className={active ? styles.on : ""}><input type="checkbox" hidden checked={Boolean(active)} onChange={event => set(setting.key, event.target.checked)} />{setting.label}</label>{setting.help && <small style={{ color: "#827d8c" }}>{setting.help}</small>}</label>
          : field(setting.label, setting.type === "select"
            ? <select value={String(active ?? setting.options?.[0] ?? "")} onChange={event => set(setting.key, event.target.value)}>{setting.options?.map(option => <option key={option}>{option}</option>)}</select>
            : <input type={setting.type === "number" ? "number" : "text"} value={String(active ?? "")} onChange={event => set(setting.key, setting.type === "number" ? Number(event.target.value) : event.target.value)} />);
      })}
      <div><button className="primary" onClick={() => void save()}><Check size={15} /> Save changes</button></div>
    </div>
  </section>;
}

// --- Global chrome -------------------------------------------------------------

type SearchItem = { label: string; kind: string; open: () => void };

export function WorkspaceSearch({ locale, open, onClose, openPage, openCampaign }: { locale: Locale; open: boolean; onClose: () => void; openPage: (key: string) => void; openCampaign: (id: string, name: string) => void }) {
  const [query, setQuery] = useState("");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (open) { setQuery(""); setCursor(0); requestAnimationFrame(() => inputRef.current?.focus()); void fetch("/api/campaigns?limit=1000&status=All&sort=edited").then(r => r.json()).then(d => setCampaigns(d.data ?? [])); } }, [open]);
  const pageItems: SearchItem[] = useMemo(() => [
    { label: "Campaigns", kind: "Page", open: () => openPage("campaigns") },
    { label: "Canvas", kind: "Page", open: () => openPage("canvas") },
    { label: "Segments", kind: "Page", open: () => openPage("segments") },
    { label: "Catalogs", kind: "Page", open: () => openPage("catalogs") },
    { label: "Search Users", kind: "Page", open: () => openPage("search-users") },
    { label: "Message Activity Log", kind: "Page", open: () => openPage("message-activity-log") },
    { label: "Global Control Group", kind: "Page", open: () => openPage("global-control-group") },
    { label: "Report Builder", kind: "Page", open: () => openPage("report-builder") },
  ], [openPage]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = pageItems.filter(item => !q || item.label.toLowerCase().includes(q));
    const matches = campaigns.filter(campaign => campaign.name.toLowerCase().includes(q)).slice(0, 6).map(campaign => ({ label: campaign.name, kind: "Campaign", open: () => openCampaign(campaign.id, campaign.name) }));
    return [...matches, ...pages].slice(0, 10);
  }, [query, campaigns, pageItems, openCampaign]);
  if (!open) return null;
  return <div className={styles.searchOverlay} onMouseDown={onClose}>
    <div className={styles.searchPanel} onMouseDown={event => event.stopPropagation()}>
      <div className={styles.searchInput}><Search size={17} /><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setCursor(0); }} onKeyDown={event => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowDown") setCursor(c => Math.min(results.length - 1, c + 1));
        if (event.key === "ArrowUp") setCursor(c => Math.max(0, c - 1));
        if (event.key === "Enter") { results[cursor]?.open(); onClose(); }
      }} placeholder={translate(locale, "Search workspace")} /></div>
      <div className={styles.searchResults}>
        {results.map((item, index) => <button key={`${item.kind}-${item.label}`} className={index === cursor ? styles.active : ""} onMouseEnter={() => setCursor(index)} onClick={() => { item.open(); onClose(); }}>{item.label}<span className={styles.kind}>{item.kind}</span></button>)}
        {!results.length && <div style={{ padding: 18, color: "#827d8c", fontSize: 13 }}>No matches.</div>}
      </div>
    </div>
  </div>;
}

export function NotificationsMenu({ locale, open, onClose, openPage }: { locale: Locale; open: boolean; onClose: () => void; openPage: (key: string) => void }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => { if (open) void fetch("/api/activity").then(r => r.json()).then(d => setEvents((d.data ?? []).slice(0, 8))).catch(() => {}); }, [open]);
  if (!open) return null;
  return <div className={styles.menu} role="dialog" aria-label="Notifications">
    <b style={{ padding: "4px 10px", fontSize: 12 }}>Recent activity</b>
    {events.length ? events.map(event => <div className={styles.notifItem} key={event.id}><b>{event.event_type} · {event.channel}</b><small>{event.campaign_name} · {event.user_id}</small></div>)
      : <div className={styles.notifItem}><small>No recorded activity yet.</small></div>}
    <button onClick={() => { openPage("message-activity-log"); onClose(); }}>View all activity <span className={styles.menuMeta}>→</span></button>
    <button onClick={onClose}><Bell size={14} /> Mark all as read</button>
  </div>;
}

export function ProfileMenu({ locale, open, onClose, notify, openPage }: { locale: Locale; open: boolean; onClose: () => void; notify: (m: string) => void; openPage: (key: string) => void }) {
  if (!open) return null;
  return <div className={styles.menu} role="dialog" aria-label="Account menu">
    <b style={{ padding: "6px 10px" }}>Demo – Thinkingai</b>
    <button onClick={() => { openPage("user-management"); onClose(); }}>Account settings</button>
    <button onClick={() => { openPage("user-management"); onClose(); }}>User management</button>
    <button onClick={() => { notify("Signed out of the local demo session."); onClose(); }}>Sign out</button>
  </div>;
}

const tourSteps = [
  { title: "Create a campaign", body: "Use Create campaign to pick from 13 channels. Email opens the full drag-and-drop builder with rows, rich text and Liquid." },
  { title: "Simulate delivery", body: "Launch writes real message events to local SQLite. Preview and Test records a test event, and reports read the same data." },
  { title: "Explore the audience", body: "Segments, Search Users and the Global Control Group all operate on 1,000 synthetic users with live reachability." },
];

export function TourModal({ open, onClose, locale }: { open: boolean; onClose: () => void; locale: Locale }) {
  const [step, setStep] = useState(0);
  if (!open) return null;
  const current = tourSteps[step];
  return <div className={styles.modalLayer} onMouseDown={onClose}>
    <div className={styles.tourCard} onMouseDown={event => event.stopPropagation()}>
      <div className={styles.tourDots}>{tourSteps.map((_, index) => <i key={index} className={index === step ? styles.on : ""} />)}</div>
      <h3 style={{ margin: 0 }}>{current.title}</h3>
      <p style={{ margin: 0, color: "#6b6f78", fontSize: 13.5, lineHeight: 1.6 }}>{current.body}</p>
      <div className={styles.toolbar}>
        <button className="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>{translate(locale, "Back")}</button>
        <span className={styles.spacer} />
        {step < tourSteps.length - 1
          ? <button className="primary" onClick={() => setStep(step + 1)}>{translate(locale, "Next")}</button>
          : <button className="primary" onClick={onClose}><Sparkles size={14} /> Start exploring</button>}
      </div>
    </div>
  </div>;
}
