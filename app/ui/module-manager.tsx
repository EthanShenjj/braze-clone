"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Send, X } from "lucide-react";
import { moduleDefaults, objectValue, validateModule, workspaceModules, type ModuleField } from "@/lib/workspace-modules";
import { Badge, Card, Empty, FormField, Modal, Notice, ResourceTable, Tabs, WorkspacePage, downloadJson, postAction, requestJson, styles, useRows, type WorkspaceRow } from "./workspace-kit";
import { useUnsavedChanges } from "./workspace-unsaved";
import { UserEventRecorder } from "./data-workspaces";

type ModuleProps = { page: string; notify: (message: string) => void };
export default function ModuleManager({ page, notify }: ModuleProps) {
  const config = workspaceModules[page]; const store = useRows(page);
  const [editing, setEditing] = useState<WorkspaceRow | "new" | null>(null); const [duplicate, setDuplicate] = useState<WorkspaceRow | null>(null);
  const [actionResult, setActionResult] = useState<unknown>(); const [actionTitle, setActionTitle] = useState(""); const [actionError, setActionError] = useState(""); const [busy, setBusy] = useState("");
  const [history, setHistory] = useState(false); const [tab, setTab] = useState(page === "technology-partners" ? "Partner Directory" : "Manage");
  const [provider, setProvider] = useState("");
  if (!config) return <Notice error>This workspace is not configured.</Notice>;
  const action = async (row: WorkspaceRow, operation: string) => {
    setBusy(row.id); setActionError("");
    try {
      if (operation === "archive") { await store.save({ status: config.statuses?.includes("Archived") ? "Archived" : config.statuses?.includes("Paused") ? "Paused" : config.statuses?.[0], data: { ...row.data, ...(page === "feature-flags" ? { enabled: false } : {}) } }, row); notify(`${config.singular} updated.`); }
      else {
        const module = ["canvas-step-agents", "data-agents", "catalog-agents", "ai-decisioning"].includes(page) ? "agents" : page;
        const result = await postAction(module, { action: operation, id: row.id, expectedUpdatedAt: row.updatedAt, ...(module === "agents" ? { prompt: String(row.data.objective) } : {}) });
        await store.reload();
        if (operation === "publish") notify("Landing page published.");
        else if (operation === "export") { downloadJson(row.name, result); notify("Export downloaded and recorded in Exports Log."); }
        else { setActionTitle(`${row.name} · ${operation}`); setActionResult(result); }
      }
    } catch (e) { setActionError(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(""); }
  };
  const rowActions = (row: WorkspaceRow) => <>
    <button className="secondary small" disabled={Boolean(busy)} onClick={() => setEditing(row)}>Edit</button>
    {page === "landing-pages" && <><button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "publish")}>Publish</button>{row.status === "Published" && <a href={`/pages/${row.data.slug}`} target="_blank" rel="noreferrer">View page</a>}</>}
    {page === "cloud-data-ingestion" && <><button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "validate")}>Validate</button><button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "sync")}>Sync now</button></>}
    {page === "data-transformation" && <><button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "preview")}>Test</button><button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "apply")}>Apply payload</button></>}
    {page === "technology-partners" && <button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "check")}>Check configuration</button>}
    {["currents", "data-sharing"].includes(page) && <button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "export")}>Export events</button>}
    {["canvas-step-agents", "data-agents", "catalog-agents", "ai-decisioning"].includes(page) && <button className="secondary small" disabled={Boolean(busy)} onClick={() => void action(row, "run")}>Run agent</button>}
    <button className="secondary small" aria-label={`Duplicate ${row.name}`} onClick={() => { setDuplicate(row); setEditing("new"); }}><Copy size={13}/></button>
    {config.statuses && <button className="secondary small" disabled={Boolean(busy) || ["Archived", "Paused"].includes(row.status)} onClick={() => void action(row, "archive")}>{config.statuses.includes("Archived") ? "Archive" : "Pause"}</button>}
  </>;
  return <WorkspacePage title={config.title} description={config.description} actions={<>{["cloud-data-ingestion", "data-transformation", "surveys"].includes(page) && <button className="secondary" onClick={() => setHistory(!history)}>{history ? "Back to list" : page === "surveys" ? "Responses" : "Sync history"}</button>}{!config.singleton && <button className="primary" onClick={() => { setDuplicate(null); setEditing("new"); }}><Plus size={15}/> {page === "user-management" ? "Add new user" : `Create ${config.singular}`}</button>}</>}>
    {actionError && <Notice error>{actionError}</Notice>}
    {page === "technology-partners" && <Tabs values={["Partner Directory", "Integrations"]} value={tab} onChange={setTab}/>}
    {page === "technology-partners" && tab === "Partner Directory" ? <PartnerDirectory onConfigure={name => { setProvider(name); setEditing("new"); }}/>
      : history ? <ModuleRunHistory page={page}/>
      : config.singleton ? store.loading ? <Empty>Loading settings…</Empty> : store.error ? <Notice error>{store.error}</Notice> : <Card><ModuleEditor key={store.rows[0]?.updatedAt ?? "initial"} page={page} existing={store.rows[0]} save={store.save} onClose={() => {}} onSaved={() => notify(`${config.title} saved.`)} embedded/></Card>
      : <ResourceTable name={config.title.toLowerCase()} rows={store.rows} columns={config.columns.map(key => ({ key, label: config.fields.find(f => f.key === key)?.label ?? ({ lastSync: "Last sync", publishedAt: "Published at", responses: "Responses", lastRun: "Last run", apiIdentifier: "API identifier", lastExport: "Last export" } as Record<string, string>)[key] ?? key }))} loading={store.loading} error={store.error} onReload={() => void store.reload()} onOpen={setEditing} actions={rowActions}/>}
    {page === "feature-flags" && <FlagEligibility/>}
    {page === "products" && <UserEventRecorder product/>}
    {page === "push-settings" && <CredentialStatus/>}
    {page === "technology-partners" && <Notice>Credentials are read from the configured server environment. Configuration checks report credential availability; delivery must be verified with the selected provider.</Notice>}
    {page === "cloud-data-ingestion" && <Notice>“Sync now” processes the source rows supplied with the integration. Scheduled warehouse connectors require a configured external worker; this workspace records manual sync history.</Notice>}
    {page === "user-management" && <Notice>These dashboard user and permission records are stored in this workspace. Sign-in and invitations require an identity provider; saving a user does not send an invitation email.</Notice>}
    {editing && <Modal title={`${editing === "new" ? "Create" : "Edit"} ${config.singular}`} onClose={() => { setEditing(null); setProvider(""); }}><ModuleEditor page={page} existing={editing === "new" ? undefined : editing} duplicate={duplicate ?? undefined} initialProvider={provider} save={store.save} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setProvider(""); notify(`${config.singular} saved.`); }}/></Modal>}
    {actionResult !== undefined && <Modal title={actionTitle} onClose={() => setActionResult(undefined)}><pre className={styles.code}>{JSON.stringify(actionResult, null, 2)}</pre><button className="secondary" onClick={() => downloadJson(actionTitle, actionResult)}>Download result</button></Modal>}
  </WorkspacePage>;
}

function ModuleEditor({ page, existing, duplicate, initialProvider, save, onSaved, onClose, embedded = false }: { page: string; existing?: WorkspaceRow; duplicate?: WorkspaceRow; initialProvider?: string; save: (payload: Partial<WorkspaceRow>, existing?: WorkspaceRow) => Promise<WorkspaceRow>; onSaved: () => void; onClose: () => void; embedded?: boolean }) {
  const config = workspaceModules[page]; const source = existing ?? duplicate;
  const [name, setName] = useState(existing?.name ?? (duplicate ? `${duplicate.name} copy` : config.singleton ? config.title : ""));
  const [description, setDescription] = useState(source?.description ?? ""); const [status, setStatus] = useState(source?.status ?? config.statuses?.[0] ?? "Active");
  const initial = { ...moduleDefaults(page), ...source?.data, ...(initialProvider ? { provider: initialProvider } : {}) };
  const [data, setData] = useState<Record<string, unknown>>(() => Object.fromEntries(Object.entries(initial).map(([key, v]) => [key, config.fields.find(f => f.key === key)?.kind === "json" ? JSON.stringify(v, null, 2) : v])));
  const baseline = JSON.stringify({ name, description, status, data });
  const [savedBaseline] = useState(baseline); const dirty = JSON.stringify({ name, description, status, data }) !== savedBaseline;
  useUnsavedChanges(dirty);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const [tab, setTab] = useState("Configure");
  const patch = (key: string, value: unknown) => setData(current => ({ ...current, [key]: value }));
  const submit = async () => {
    setError(""); setSaving(true);
    try {
      const parsed: Record<string, unknown> = { ...source?.data, ...data };
      for (const f of config.fields) if (f.kind === "json") { try { parsed[f.key] = JSON.parse(String(data[f.key] || "null")); } catch { throw new Error(`${f.label} must be valid JSON.`); } }
      if (page === "feature-flags") setStatus(parsed.enabled ? "Active" : "Inactive");
      if (page === "banner-placements") parsed.placementName = parsed.placementId;
      if (page === "app-settings" && !parsed.apiIdentifier) parsed.apiIdentifier = crypto.randomUUID();
      if (page === "landing-pages" && existing?.status === "Published") { /* Keep published snapshot until Publish is explicitly selected. */ }
      const payload = { name: name.trim(), description, status: page === "feature-flags" ? parsed.enabled ? "Active" : status === "Archived" ? "Archived" : "Inactive" : status, data: parsed };
      validateModule(page, payload, existing);
      await save(payload, existing); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); } finally { setSaving(false); }
  };
  const custom = new Set(page === "feature-flags" ? ["rules", "properties"] : page === "surveys" ? ["questions"] : []);
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); void submit(); }}>
    {page === "landing-pages" && <Tabs values={["Configure", "Preview"]} value={tab} onChange={setTab}/>}
    {error && <Notice error>{error}</Notice>}
    {tab === "Preview" ? <iframe title="Landing page preview" className={styles.preview} sandbox="" srcDoc={String(data.html ?? "")}/> : <>
      {!config.singleton && <div className={styles.grid}><FormField label="Name *"><input autoFocus required maxLength={200} value={name} onChange={e => setName(e.target.value)}/></FormField>{config.statuses && <FormField label="Status"><select value={status} onChange={e => setStatus(e.target.value)}>{config.statuses.map(s => <option key={s}>{s}</option>)}</select></FormField>}</div>}
      {!config.singleton && <FormField label="Description"><input value={description} onChange={e => setDescription(e.target.value)}/></FormField>}
      <div className={styles.grid}>{config.fields.filter(f => !custom.has(f.key)).map(f => <div key={f.key} className={["textarea", "json"].includes(f.kind ?? "") ? styles.full : ""}><ModuleInput field={f} value={data[f.key]} disabled={Boolean(existing && f.immutable)} onChange={v => patch(f.key, v)}/></div>)}</div>
      {page === "feature-flags" && <><FeatureRules value={String(data.rules ?? "[]")} onChange={v => patch("rules", v)}/><ModuleInput field={config.fields.find(f => f.key === "properties")!} value={data.properties} onChange={v => patch("properties", v)}/></>}
      {page === "surveys" && <QuestionBuilder value={String(data.questions ?? "[]")} onChange={v => patch("questions", v)}/>}
    </>}
    <footer className={styles.formFooter}>{!embedded && <button type="button" className="secondary" onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes?")) onClose(); }}>Cancel</button>}<button className="primary" disabled={saving}>{saving ? "Saving…" : embedded ? "Save changes" : existing ? "Save changes" : `Create ${config.singular}`}</button></footer>
  </form>;
}
function ModuleInput({ field, value, onChange, disabled }: { field: ModuleField; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const { label, key, kind, help, required, min, max } = field;
  if (kind === "boolean") return <div className={styles.field}><span>{label}</span><label className={styles.checkRow}><input aria-label={label} type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)}/>{value ? "Enabled" : "Disabled"}</label>{help && <small>{help}</small>}</div>;
  return <FormField label={`${label}${required ? " *" : ""}`} help={help}>{kind === "select" ? <select aria-label={label} value={String(value ?? "")} onChange={e => onChange(e.target.value)}>{field.options?.map(o => <option key={o}>{o}</option>)}</select> : kind === "json" || kind === "textarea" ? <textarea aria-label={label} className={kind === "json" ? styles.code : ""} rows={kind === "json" ? 6 : 5} value={String(value ?? "")} onChange={e => onChange(e.target.value)} required={required}/> : <input aria-label={label} disabled={disabled} required={required} min={min} max={max} type={kind === "number" ? "number" : kind === "email" ? "email" : kind === "url" ? "url" : "text"} value={String(value ?? "")} onChange={e => onChange(kind === "number" ? e.target.value === "" ? "" : Number(e.target.value) : e.target.value)}/>}</FormField>;
}
type FeatureRule = { id: string; rollout: number; filters: Array<{ field: string; operator: string; value: string }> };
function FeatureRules({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let rules: FeatureRule[] = []; try { rules = JSON.parse(value); } catch {}
  const set = (next: FeatureRule[]) => onChange(JSON.stringify(next));
  const patch = (index: number, patch: Partial<FeatureRule>) => set(rules.map((r, i) => i === index ? { ...r, ...patch } : r));
  const move = (i: number, delta: number) => { const next = [...rules]; [next[i], next[i + delta]] = [next[i + delta], next[i]]; set(next); };
  return <Card title="Rollout rules" actions={<button type="button" className="secondary" onClick={() => set([...rules, { id: `rule_${crypto.randomUUID().slice(0, 8)}`, rollout: 0, filters: [{ field: "country", operator: "equals", value: "US" }] }])}><Plus size={14}/> Add rule</button>}><div className={styles.form}>{rules.map((rule, i) => <div className={styles.rule} key={rule.id}><div className={styles.ruleHeader}><span>Rule {i + 1}</span><div className={styles.buttonRow}><button type="button" className="secondary small" aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13}/></button><button type="button" className="secondary small" aria-label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13}/></button><button type="button" className="secondary small" aria-label={`Remove rule ${i + 1}`} onClick={() => set(rules.filter((_, j) => i !== j))}><X size={14}/></button></div></div>{rule.filters.map((f, fi) => <div className={styles.grid3} key={fi}><FormField label="User field"><select value={f.field} onChange={e => patch(i, { filters: rule.filters.map((r, index) => fi === index ? { ...r, field: e.target.value } : r) })}><option value="country">Country</option><option value="lifecycle">Lifecycle</option><option value="language">Language</option></select></FormField><FormField label="Operator"><select value={f.operator} onChange={e => patch(i, { filters: rule.filters.map((r, index) => fi === index ? { ...r, operator: e.target.value } : r) })}><option value="equals">equals</option><option value="not_equals">does not equal</option><option value="contains">contains</option></select></FormField><FormField label="Value"><input value={f.value} onChange={e => patch(i, { filters: rule.filters.map((r, index) => fi === index ? { ...r, value: e.target.value } : r) })}/></FormField></div>)}<FormField label="Rollout traffic (%)"><input type="number" min={0} max={100} value={rule.rollout} onChange={e => patch(i, { rollout: Number(e.target.value) })}/></FormField><button type="button" className="secondary small" onClick={() => patch(i, { filters: [...rule.filters, { field: "country", operator: "equals", value: "" }] })}>Add filter</button></div>)}{!rules.length && <p className={styles.subtle}>No audience rules. The Everyone else rollout applies to all users.</p>}</div></Card>;
}
type Question = { id: string; label: string; type: string; required: boolean; options?: string[] };
function QuestionBuilder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let questions: Question[] = []; try { questions = JSON.parse(value); } catch {}
  const set = (next: Question[]) => onChange(JSON.stringify(next));
  const patch = (i: number, updates: Partial<Question>) => set(questions.map((q, index) => i === index ? { ...q, ...updates } : q));
  return <Card title="Survey questions" actions={<button type="button" className="secondary" onClick={() => set([...questions, { id: `question_${questions.length + 1}`, label: "", type: "text", required: true }])}><Plus size={14}/> Add question</button>}><div className={styles.form}>{questions.map((q, i) => <div className={styles.question} key={i}><div className={styles.statusLine}><b>Question {i + 1}</b><button type="button" className="icon-button" aria-label={`Remove question ${i + 1}`} onClick={() => set(questions.filter((_, index) => i !== index))}><X size={15}/></button></div><div className={styles.grid}><FormField label="Question"><input required value={q.label} onChange={e => patch(i, { label: e.target.value })}/></FormField><FormField label="Answer type"><select value={q.type} onChange={e => patch(i, { type: e.target.value, options: ["Option 1", "Option 2"] })}><option value="text">Short text</option><option value="rating">Rating (1–5)</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option></select></FormField></div><FormField label="Attribute ID"><input value={q.id} onChange={e => patch(i, { id: e.target.value })}/></FormField>{q.type.includes("choice") && <FormField label="Options (one per line)"><textarea value={(q.options ?? []).join("\n")} onChange={e => patch(i, { options: e.target.value.split("\n") })}/></FormField>}<label className={styles.checkRow}><input type="checkbox" checked={q.required} onChange={e => patch(i, { required: e.target.checked })}/>Required</label></div>)}</div></Card>;
}
function FlagEligibility() {
  const [users, setUsers] = useState<Array<{ id: string; email: string }>>([]); const [user, setUser] = useState(""); const [result, setResult] = useState<Array<{ id: string; name: string; enabled: boolean; matchedRule: string; rollout: number }>>([]); const [error, setError] = useState("");
  useEffect(() => { void requestJson<{ data: typeof users }>("/api/users?limit=1000").then(r => setUsers(r.data)).catch(e => setError(e.message)); }, []);
  return <Card title="Check user eligibility"><div className={styles.toolbar}><select aria-label="Preview user" value={user} onChange={e => setUser(e.target.value)}><option value="">Select a user</option>{users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.id})</option>)}</select><button className="secondary" disabled={!user} onClick={() => { setError(""); void requestJson<{ data: typeof result }>(`/api/workspace/flag-evaluation?userId=${encodeURIComponent(user)}`).then(r => setResult(r.data)).catch(e => setError(e.message)); }}><Eye size={15}/> Evaluate</button></div>{error && <Notice error>{error}</Notice>}{result.map(r => <div className={styles.checkRow} key={r.id}><strong>{r.name}</strong><Badge>{r.enabled ? "Enabled" : "Disabled"}</Badge><span>{r.matchedRule} · {r.rollout}% rollout</span></div>)}</Card>;
}
function CredentialStatus() {
  const [data, setData] = useState<Record<string, boolean>>({});
  useEffect(() => { void requestJson<{ credentials: typeof data }>("/api/workspace/diagnostics").then(r => setData(r.credentials)); }, []);
  return <Card title="Server credentials"><div className={styles.grid3}>{[["apns", "APNs"], ["fcm", "FCM"], ["webPush", "Web Push"]].map(([key, title]) => <div className={styles.metric} key={key}><span>{title}</span><Badge>{data[key] ? "Credential available" : "Credential missing"}</Badge></div>)}</div><p className={styles.subtle}>Set APNS_KEY, FCM_SERVICE_ACCOUNT or WEB_PUSH_PRIVATE_KEY on the server. Availability does not confirm delivery.</p></Card>;
}
function ModuleRunHistory({ page }: { page: string }) {
  const type = page === "surveys" ? "landing-page-submissions" : page === "data-transformation" ? "transformation-runs" : "ingestion-runs";
  const { rows, loading, error } = useRows(type); const [selected, setSelected] = useState<WorkspaceRow | null>(null);
  return <><ResourceTable rows={rows} columns={[{ key: "integrationId", label: page === "surveys" ? "Survey" : "Source", render: r => String(r.data.surveyId ?? r.data.integrationId ?? r.data.transformationId ?? "—") }]} name={page === "surveys" ? "responses" : "runs"} loading={loading} error={error} onOpen={setSelected}/>{selected && <Modal title={selected.name} onClose={() => setSelected(null)}><pre className={styles.code}>{JSON.stringify(selected.data, null, 2)}</pre></Modal>}</>;
}
function PartnerDirectory({ onConfigure }: { onConfigure: (name: string) => void }) {
  const [q, setQ] = useState(""); const [category, setCategory] = useState("All");
  const partners = [{ name: "AWS SES", category: "Email delivery", description: "Region-based email delivery with IAM credentials." }, { name: "SendGrid", category: "Email delivery", description: "Send email with a scoped API key and a verified sender." }, { name: "Infobip", category: "Email delivery", description: "Email API with an account-specific Base URL." }, { name: "Snowflake", category: "Data and analytics", description: "Warehouse ingestion and event data sharing." }, { name: "Segment", category: "Data and analytics", description: "Customer event ingestion and Currents exports." }, { name: "Amplitude", category: "Data and analytics", description: "Product analytics and event data exports." }, { name: "Mixpanel", category: "Data and analytics", description: "Product analytics and event data exports." }, { name: "Google Ads", category: "Audience sync", description: "Audience synchronization configuration." }];
  return <><div className={styles.toolbar}><input className={styles.input} style={{ maxWidth: 400 }} aria-label="Search partners" placeholder="Search partners" value={q} onChange={e => setQ(e.target.value)}/><select aria-label="Partner category" value={category} onChange={e => setCategory(e.target.value)}><option>All</option><option>Email delivery</option><option>Data and analytics</option><option>Audience sync</option></select></div><div className={styles.grid3}>{partners.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) && (category === "All" || p.category === category)).map(p => <article className={styles.linkCard} key={p.name}><Badge>{p.category}</Badge><div className={styles.provider}>{p.name}</div><p>{p.description}</p><button className="secondary" onClick={() => onConfigure(p.name)}>Configure</button></article>)}</div></>;
}
