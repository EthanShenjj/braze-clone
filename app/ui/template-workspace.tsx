"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { loadUnlayerScript } from "@/lib/unlayer-client";
import type { Locale } from "@/lib/i18n";
import { initialCanvasGraph, isCanvasGraph, validateCanvasGraph, type CanvasGraph } from "@/lib/canvas-model";
import { variantsFor } from "@/lib/in-app-model";
import { normalizeWebhookVariants } from "@/lib/webhook-model";
import { EmailMessageEditor, type EmailCampaignLike, type SavePatch } from "./email-dnd-editor";
import InAppCampaignCompose from "./in-app-message";
import WebhookEditor from "./webhook-editor";
import { Card, Empty, FormField, Modal, Notice, ResourceTable, Tabs, WorkspacePage, downloadJson, requestJson, styles, useRows, type WorkspaceRow } from "./workspace-kit";
import { workspaceTitle } from "./workspace-pages";
import { useUnsavedChanges } from "./workspace-unsaved";
type EditorMode = "drag" | "html" | "plain";
const channelFor: Record<string, string> = { "email-templates": "email", "push-templates": "push", "in-app-message-templates": "iam", "webhook-templates": "webhook", "banner-templates": "banner" };
export default function TemplateWorkspace({ page, locale, notify }: { page: string; locale: Locale; notify: (s: string) => void }) {
  const store = useRows(page); const [editing, setEditing] = useState<WorkspaceRow | "new" | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const useTemplate = async (row: WorkspaceRow) => {
    setBusy(true); setError("");
    try {
      if (page === "canvas-templates") {
        const graph = row.data.graph;
        if (!isCanvasGraph(graph)) throw new Error("The template does not contain a valid Canvas graph.");
        const canvas = await requestJson<{ id: string; updatedAt: string }>("/api/canvases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${row.name} Canvas` }) });
        await requestJson(`/api/canvases/${canvas.id}/graph`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graph, updatedAt: canvas.updatedAt }) });
        window.location.assign(`/engagement/canvas/${canvas.id}`); return;
      }
      const channel = channelFor[page];
      if (!channel) { await navigator.clipboard.writeText(String(row.data.url ?? row.data.body ?? "")); notify("Link template copied."); return; }
      const config = row.data.config && typeof row.data.config === "object" ? row.data.config as Record<string, unknown> : { ...row.data };
      if (channel === "iam" && row.data.variant) config.iamVariants = [row.data.variant];
      if (channel === "webhook" && row.data.variant) config.webhookVariants = [row.data.variant];
      const campaign = await requestJson<{ id: string }>("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: `cmp_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, name: `${row.name} Campaign`, channel, status: "Draft", schedule: "One time", subject: row.data.subject, body: row.data.body, config }) });
      window.location.assign(`/engagement/campaigns/${campaign.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to apply template."); } finally { setBusy(false); }
  };
  if (editing) return <TemplateDetail key={editing === "new" ? "new" : editing.id} page={page} locale={locale} existing={editing === "new" ? undefined : editing} save={store.save} onClose={() => setEditing(null)} notify={notify}/>;
  return <WorkspacePage title={workspaceTitle(page)} description={page === "canvas-templates" ? "Save and reuse complete journey graphs." : page === "email-link-templates" ? "Manage reusable link destinations and tracking parameters." : `Create reusable ${channelFor[page] ?? "message"} designs and apply them to new campaign drafts.`} actions={<button className="primary" onClick={() => setEditing("new")}><Plus size={15}/> Create template</button>}>
    {error && <Notice error>{error}</Notice>}<ResourceTable name="templates" rows={store.rows} columns={[{ key: "category", label: "Category" }, { key: "editor", label: "Editor" }]} loading={store.loading} error={store.error} onReload={() => void store.reload()} onOpen={setEditing} actions={row => <><button className="secondary small" onClick={() => setEditing(row)}>Edit</button><button className="secondary small" disabled={busy || row.status === "Archived"} onClick={() => void useTemplate(row)}>{page === "email-link-templates" ? "Copy link" : "Use template"}</button><button className="secondary small" onClick={() => downloadJson(row.name, row.data)}>Export</button><button className="secondary small" disabled={row.status === "Archived"} onClick={() => { void store.save({ status: "Archived" }, row).then(() => notify("Template archived.")).catch(e => setError(e.message)); }}>Archive</button></>}/>
  </WorkspacePage>;
}
function TemplateDetail({ page, locale, existing, save, onClose, notify }: { page: string; locale: Locale; existing?: WorkspaceRow; save: (payload: Partial<WorkspaceRow>, existing?: WorkspaceRow) => Promise<WorkspaceRow>; onClose: () => void; notify: (s: string) => void }) {
  const [record, setRecord] = useState(existing); const [name, setName] = useState(existing?.name ?? ""); const [description, setDescription] = useState(existing?.description ?? ""); const [category, setCategory] = useState(String(existing?.data.category ?? "Custom")); const [mode, setMode] = useState<EditorMode>((existing?.data.emailEditorMode as EditorMode) ?? "html");
  const channel = channelFor[page];
  useEffect(() => { if (channel === "email") void loadUnlayerScript().catch(() => {}); }, [channel]);
  const source = existing?.data ?? {};
  const config: Record<string, unknown> = { ...source, ...(source.config as Record<string, unknown> ?? {}) };
  if (source.variant && channel === "iam") config.iamVariants = [source.variant];
  if (source.variant && channel === "webhook") config.webhookVariants = [source.variant];
  const [draft, setDraft] = useState<EmailCampaignLike>({ id: existing?.id ?? `template_${crypto.randomUUID()}`, name: existing?.name ?? "New template", channel, subject: String(source.subject ?? ""), body: String(source.body ?? ""), config });
  const [graphSource, setGraphSource] = useState(JSON.stringify(source.graph ?? initialCanvasGraph, null, 2)); const [url, setUrl] = useState(String(source.url ?? "")); const [linkText, setLinkText] = useState(String(source.linkText ?? "Learn more"));
  const [editorOpen, setEditorOpen] = useState(false); const [preview, setPreview] = useState(false); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(() => JSON.stringify({ name, description, category, draft, graphSource, url, linkText }));
  const serial = JSON.stringify({ name, description, category, draft, graphSource, url, linkText }); const dirty = serial !== saved; useUnsavedChanges(dirty);
  const update = (patch: Partial<EmailCampaignLike>) => setDraft(current => ({ ...current, ...patch, config: patch.config ? { ...current.config, ...patch.config } : current.config }));
  const persist = async (patch?: SavePatch) => {
    setSaving(true); setError("");
    try {
      if (!name.trim()) throw new Error("Enter a template name first.");
      const current = { ...draft, ...patch, config: { ...draft.config, ...patch?.config } };
      // Imported templates may contain a primary variant mirror from a Campaign.
      // Keep it in sync with the single email design exposed by this editor.
      if (channel === "email" && current.config.emailEditorEngine === "unlayer" && Array.isArray(current.config.variants)) current.config.variants = current.config.variants.map((variant, index) => index ? variant : { ...variant, subject: current.subject, body: current.body, editorMode: "drag", editorEngine: "unlayer", unlayerJson: current.config.emailUnlayerJson, unlayerVersion: current.config.emailUnlayerVersion, unlayerMigration: current.config.emailUnlayerMigration });
      let graph: CanvasGraph | undefined;
      if (page === "canvas-templates") { graph = JSON.parse(graphSource); if (!isCanvasGraph(graph)) throw new Error("Invalid Canvas graph."); const issues = validateCanvasGraph(graph); if (issues.length) throw new Error(issues.join(" ")); }
      if (page === "email-link-templates" && !/^https?:\/\//.test(url)) throw new Error("Enter an HTTP or HTTPS link.");
      const data = { ...current.config, subject: current.subject, body: current.body, config: current.config, category, editor: channel === "email" ? mode === "drag" ? "Drag-and-Drop Editor" : mode === "plain" ? "Plain-text Editor" : "HTML Editor" : page === "canvas-templates" ? "Canvas" : channel === "iam" ? "In-App Editor" : channel === "webhook" ? "Webhook Editor" : "Content Editor", emailEditorMode: mode, ...(channel === "iam" ? { variant: variantsFor(current)[0] } : {}), ...(channel === "webhook" ? { variant: normalizeWebhookVariants(current)[0] } : {}), ...(graph ? { graph } : {}), ...(page === "email-link-templates" ? { url, linkText } : {}) };
      const result = await save({ name, description, status: "Active", data }, record); setRecord(result); setDraft(current); setSaved(JSON.stringify({ name, description, category, draft: current, graphSource, url, linkText })); notify("Template saved."); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save template."); return false; } finally { setSaving(false); }
  };
  return <WorkspacePage title={record ? name : `Create ${workspaceTitle(page).replace(/s$/, "")}`} description="Configure and preview your reusable template." actions={<><button className="secondary" onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes?")) onClose(); }}><ArrowLeft size={15}/> Back to templates</button><button className="primary" disabled={saving} onClick={() => void persist()}><Save size={15}/> {saving ? "Saving…" : "Save template"}</button></>}>
    {error && <Notice error>{error}</Notice>}<Card title="Template details"><div className={styles.grid}><FormField label="Template name *"><input required value={name} onChange={e => { setName(e.target.value); update({ name: e.target.value }); }}/></FormField><FormField label="Category"><select value={category} onChange={e => setCategory(e.target.value)}>{["Custom", "Onboarding", "Promotional", "Transactional", "Newsletter"].map(c => <option key={c}>{c}</option>)}</select></FormField><FormField label="Description"><input value={description} onChange={e => setDescription(e.target.value)}/></FormField></div></Card>
    {channel === "email" ? <Card title="Email design"><div className={styles.form}><FormField label="Subject"><input value={draft.subject} onChange={e => update({ subject: e.target.value })}/></FormField><FormField label="Editor"><select value={mode} onChange={e => { setMode(e.target.value as EditorMode); update({ config: { emailEditorMode: e.target.value } }); }}><option value="html">HTML Code Editor</option><option value="plain">Plain-text Editor</option><option value="drag">Drag-and-Drop Editor (Unlayer)</option></select></FormField><div className={styles.buttonRow}><button className="primary" onClick={() => { if (!name.trim()) { setError("Enter a template name first."); return; } setEditorOpen(true); }}>Edit design</button><button className="secondary" onClick={() => setPreview(true)}>Preview</button></div>{draft.body && <iframe title="Email template preview" sandbox="" className={styles.preview} srcDoc={mode === "plain" ? `<pre>${draft.body.replaceAll("<", "&lt;")}</pre>` : draft.body}/>}</div></Card>
      : channel === "iam" ? <InAppCampaignCompose draft={draft} update={update} saveCampaign={persist} notify={notify}/>
      : channel === "webhook" ? <WebhookEditor draft={draft} update={update} openTest={() => setPreview(true)}/>
      : page === "canvas-templates" ? <Card title="Canvas journey graph"><FormField label="Journey graph JSON"><textarea rows={22} className={styles.code} value={graphSource} onChange={e => setGraphSource(e.target.value)}/></FormField><p className={styles.subtle}>Contains the saved nodes, edges and message configurations. Applying a template creates a new Canvas draft.</p></Card>
      : page === "email-link-templates" ? <Card title="Link configuration"><div className={styles.form}><FormField label="Link text"><input value={linkText} onChange={e => setLinkText(e.target.value)}/></FormField><FormField label="Destination URL"><input type="url" value={url} onChange={e => setUrl(e.target.value)}/></FormField><pre className={styles.code}>{`<a href="${url}">${linkText}</a>`}</pre></div></Card>
      : <Card title={channel === "banner" ? "Banner design" : "Push notification design"}><div className={styles.grid}><FormField label="Title"><input value={draft.subject} onChange={e => update({ subject: e.target.value })}/></FormField><FormField label={channel === "banner" ? "Placement ID" : "Deep link"}><input value={String(draft.config?.channelValues && (draft.config.channelValues as Record<string, unknown>)[channel === "banner" ? "placement" : "deepLink"] || "")} onChange={e => update({ config: { channelValues: { ...(draft.config?.channelValues as Record<string, unknown> ?? {}), [channel === "banner" ? "placement" : "deepLink"]: e.target.value } } })}/></FormField><FormField label="Message"><textarea value={draft.body} onChange={e => update({ body: e.target.value })}/></FormField></div><div className={styles.summary}><strong>{draft.subject || "Notification title"}</strong><p>{draft.body || "Your message will appear here."}</p></div></Card>}
    {editorOpen && <EmailMessageEditor locale={locale} mode={mode} variantName={name} draft={draft} save={persist} onClose={() => setEditorOpen(false)} onSendingSettings={() => { setEditorOpen(false); }} onModeChange={m => setMode(m === "drag" || m === "plain" ? m : "html")} onOpenTest={() => setPreview(true)}/>}
    {preview && <Modal title="Template preview" onClose={() => setPreview(false)}>{channel === "email" ? <iframe title="Rendered template" sandbox="" className={styles.preview} srcDoc={draft.body || "<p>No content yet.</p>"}/> : <pre className={styles.code}>{JSON.stringify(channel === "webhook" ? normalizeWebhookVariants(draft) : draft, null, 2)}</pre>}</Modal>}
  </WorkspacePage>;
}
