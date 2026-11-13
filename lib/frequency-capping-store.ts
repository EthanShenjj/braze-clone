import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { listTags } from "./tag-store.ts";
import { frequencyChannel, frequencySettings, frequencyPolicy, frequencyWindowStart, validateFrequencySettings, type FrequencySnapshot, type FrequencySettings, type FrequencyRule } from "./frequency-capping-model.ts";
type Row = { id: string; type: string; data_json: string; updated_at: string };
const object = (text: string): Record<string, any> => { try { return JSON.parse(text); } catch { return {}; } };
const scope = (data: Record<string, any>) => String(data.workspaceId ?? "local");
let serial = 0;
function atomic<T>(db: DatabaseSync, action: () => T) { db.exec("CREATE TABLE IF NOT EXISTS frequency_write_lock (id INTEGER PRIMARY KEY, version INTEGER NOT NULL); INSERT OR IGNORE INTO frequency_write_lock VALUES (1,0)"); const name = `frequency_${++serial}`; db.exec(`SAVEPOINT ${name}`); try { db.exec("UPDATE frequency_write_lock SET version=version WHERE id=1"); const value = action(); db.exec(`RELEASE ${name}`); return value; } catch (error) { db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`); throw error; } }
function record(db: DatabaseSync, workspaceId: string) { return (db.prepare("SELECT id,type,data_json,updated_at FROM resources WHERE type='frequency-capping-rules' ORDER BY updated_at DESC").all() as Row[]).find(row => scope(object(row.data_json)) === workspaceId); }
export function frequencySnapshot(db: DatabaseSync, workspaceId = "local"): FrequencySnapshot {
  const row = record(db, workspaceId), data = row ? object(row.data_json) : {}, workspace = db.prepare("SELECT data_json FROM resources WHERE type='workspaces' AND id=?").get(workspaceId) as { data_json: string } | undefined, options = workspace ? object(workspace.data_json) : {};
  const requested = Number(options.frequencyCappingRuleLimit ?? 10), maxRules = Number.isInteger(requested) && requested >= 1 && requested <= 15 ? requested : 10;
  return { workspaceId, settings: frequencySettings(data), updatedAt: row?.updated_at ?? null, capabilities: { maxRules, canEdit: data.canEdit !== false && options.editFrequencyCaps !== false }, availableTags: listTags(db, workspaceId).map(({ id, name, parentId }) => ({ id, name, parentId })) };
}
export function validateFrequencyAssignment(db: DatabaseSync, workspaceId: string, policy: Record<string, unknown>) {
  const categoryId = policy.frequencyCategoryId;
  if (categoryId === undefined || categoryId === "") return;
  if (typeof categoryId !== "string" || !frequencySnapshot(db, workspaceId).settings.categories.some(category => category.id === categoryId)) throw new Error("Choose an available message category in this workspace.");
}
export function validateFrequencyResource(db: DatabaseSync, input: Record<string, any>, existing?: Row): Record<string, any> {
  const workspaceId = scope(input), snapshot = frequencySnapshot(db, workspaceId), found = record(db, workspaceId);
  if (!snapshot.capabilities.canEdit) throw Object.assign(new Error("Edit Frequency Capping Rules permission is required."), { status: 403 });
  if (existing && scope(object(existing.data_json)) !== workspaceId) throw new Error("Frequency settings cannot move to another workspace.");
  if (!existing && found) throw Object.assign(new Error("Frequency settings already exist for this workspace. Reload before saving."), { status: 409 });
  const settings = validateFrequencySettings(input, snapshot.capabilities.maxRules), tags = new Set(snapshot.availableTags.map(t => t.id));
  for (const rule of settings.rules) if (rule.tagId && !tags.has(rule.tagId)) throw new Error("Choose an available tag in this workspace.");
  const removed = new Set(snapshot.settings.categories.filter(c => !settings.categories.some(next => next.id === c.id)).map(c => c.id));
  if (removed.size) {
    const campaigns = db.prepare("SELECT config_json FROM campaigns").all() as { config_json: string }[];
    const canvases = db.prepare("SELECT data_json FROM resources WHERE type='canvas'").all() as { data_json: string }[];
    if (campaigns.some(r => { const data = object(r.config_json); return scope(data) === workspaceId && removed.has(String(data.delivery?.frequencyCategoryId ?? data.frequencyCategoryId)); }) || canvases.some(r => { const data = object(r.data_json); return scope(data) === workspaceId && removed.has(String(data.wizard?.send?.frequencyCategoryId)); })) throw new Error("A message category in use cannot be removed.");
  }
  return { ...settings, workspaceId, schemaVersion: 1, ...(existing && object(existing.data_json).canEdit === false ? { canEdit: false } : input.canEdit === false ? { canEdit: false } : {}) };
}
export function saveFrequencySettings(db: DatabaseSync, input: unknown, expectedUpdatedAt: unknown, workspaceId = "local") {
  return atomic(db, () => {
    const existing = record(db, workspaceId);
    if ((existing?.updated_at ?? null) !== expectedUpdatedAt) throw Object.assign(new Error("Frequency rules changed in another tab. Reload before saving."), { status: 409 });
    const data = validateFrequencyResource(db, { ...(input as object), workspaceId }, existing);
    const timestamp = new Date(Math.max(Date.now(), Date.parse(existing?.updated_at ?? "1970-01-01") + 1)).toISOString();
    db.prepare("INSERT INTO resources VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,data_json=excluded.data_json")
      .run(existing?.id ?? `frequency_${randomUUID()}`, "frequency-capping-rules", "Workspace frequency capping", "Active", "Shared per-user message limits", timestamp, JSON.stringify(data));
    return frequencySnapshot(db, workspaceId);
  });
}
export type FrequencyDispatch = { workspaceId: string; userId: string; entityType: "campaign" | "canvas"; entityId: string; channel: string; dispatchId: string; timestamp: string; obey: boolean; count: boolean };
type DispatchRow = { dispatch_id: string; entity_type: "campaign" | "canvas"; entity_id: string; created_at: string; channels_json: string; sent_json: string; expires_at: string };
// DDL can be rolled back by an enclosing Canvas transaction; connection identity cannot cache it.
function initialize(db: DatabaseSync) { db.exec("CREATE TABLE IF NOT EXISTS frequency_dispatches (workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,dispatch_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,created_at TEXT NOT NULL,channels_json TEXT NOT NULL,sent_json TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id,dispatch_id)); CREATE INDEX IF NOT EXISTS frequency_dispatch_history ON frequency_dispatches(workspace_id,user_id,created_at)"); }
function metadata(db: DatabaseSync, entityType: string, id: string) {
  const row = entityType === "canvas" ? db.prepare("SELECT data_json AS value FROM resources WHERE type='canvas' AND id=?").get(id) : db.prepare("SELECT config_json AS value FROM campaigns WHERE id=?").get(id);
  const data = row ? object(String(row.value)) : {};
  return { workspaceId: scope(data), tags: Array.isArray(data.tags) ? data.tags as string[] : [], categoryId: String(entityType === "canvas" ? data.wizard?.send?.frequencyCategoryId ?? "" : data.delivery?.frequencyCategoryId ?? data.frequencyCategoryId ?? ""), policy: frequencyPolicy({ ...data, ...data.delivery }) };
}
function hasTag(tags: string[], id: string, directory: FrequencySnapshot["availableTags"]) {
  return tags.some(value => { let tag = directory.find(t => t.id === value || t.name === value); const seen = new Set<string>(); while (tag && !seen.has(tag.id)) { if (tag.id === id) return true; seen.add(tag.id); tag = directory.find(t => t.id === tag!.parentId); } return false; });
}
function matches(db: DatabaseSync, rule: FrequencyRule, row: { entity_type: string; entity_id: string }, snapshot: FrequencySnapshot) { const data = metadata(db, row.entity_type, row.entity_id); return (!rule.tagId || data.workspaceId === snapshot.workspaceId && hasTag(data.tags, rule.tagId, snapshot.availableTags)) && (!rule.categoryId || data.workspaceId === snapshot.workspaceId && data.categoryId === rule.categoryId); }
function legacyHistory(db: DatabaseSync, ctx: FrequencyDispatch, rule: FrequencyRule, cutoff: string, snapshot: FrequencySnapshot) {
  const rows = db.prepare("SELECT campaign_id,channel,created_at,data_json FROM message_events WHERE user_id=? AND created_at>=? AND created_at<=? AND event_type IN ('delivered','accepted')").all(ctx.userId, cutoff, ctx.timestamp) as Array<{ campaign_id: string; channel: string; created_at: string; data_json: string }>;
  const ids = new Set<string>();
  for (const row of rows) {
    const data = object(row.data_json), channel = frequencyChannel(row.channel);
    if (!channel || data.test || data.seed || data.frequencyDispatchId || data.frequencyCounted === false || (rule.type !== "any" && channel !== rule.type) || (rule.seconds % 86400 !== 0 && row.created_at === cutoff)) continue;
    const entityType = data.canvasRunId ? "canvas" : "campaign", meta = metadata(db, entityType, row.campaign_id);
    if (String(data.workspaceId ?? meta.workspaceId) !== ctx.workspaceId || !matches(db, rule, { entity_type: entityType, entity_id: row.campaign_id }, snapshot)) continue;
    ids.add(`${row.campaign_id}:${data.runId ?? data.canvasRunId ?? row.created_at}:${data.nodeId ?? ""}`);
  }
  return ids.size;
}
export function reserveDispatch(db: DatabaseSync, ctx: FrequencyDispatch): { allowed: boolean; cappedRuleIds: string[] } {
  const channel = frequencyChannel(ctx.channel);
  if (!channel) return { allowed: true, cappedRuleIds: [] };
  initialize(db);
  return atomic(db, () => {
    const snapshot = frequencySnapshot(db, ctx.workspaceId), own = db.prepare("SELECT * FROM frequency_dispatches WHERE workspace_id=? AND user_id=? AND dispatch_id=?").get(ctx.workspaceId, ctx.userId, ctx.dispatchId) as DispatchRow | undefined;
    if (own && (own.entity_id !== ctx.entityId || own.entity_type !== ctx.entityType)) throw new Error("Dispatch identity belongs to another message.");
    const user = db.prepare("SELECT attributes_json FROM users WHERE id=?").get(ctx.userId) as { attributes_json: string } | undefined, attrs = user ? object(user.attributes_json) : {}, zone = String(attrs.timezone ?? attrs.time_zone ?? "UTC");
    const capped: string[] = [];
    if (ctx.obey && snapshot.settings.enabled) for (const rule of snapshot.settings.rules) {
      if (rule.type !== "any" && rule.type !== channel || !matches(db, rule, { entity_type: ctx.entityType, entity_id: ctx.entityId }, snapshot)) continue;
      const cutoff = frequencyWindowStart(ctx.timestamp, rule.seconds, zone), rows = db.prepare("SELECT * FROM frequency_dispatches WHERE workspace_id=? AND user_id=? AND dispatch_id<>? AND created_at>=? AND created_at<=?").all(ctx.workspaceId, ctx.userId, ctx.dispatchId, cutoff, ctx.timestamp) as DispatchRow[];
      let count = legacyHistory(db, ctx, rule, cutoff, snapshot);
      for (const row of rows) {
        if (rule.seconds % 86400 !== 0 && row.created_at === cutoff) continue;
        const channels: string[] = row.expires_at > ctx.timestamp ? JSON.parse(row.channels_json) : JSON.parse(row.sent_json);
        if (channels.length && (rule.type === "any" || channels.includes(rule.type)) && matches(db, rule, row, snapshot)) count++;
      }
      if (count >= rule.messages) capped.push(rule.id);
    }
    if (capped.length) return { allowed: false, cappedRuleIds: capped };
    if (ctx.count) {
      const sent: string[] = own ? JSON.parse(own.sent_json) : [], channels: string[] = own && own.expires_at > ctx.timestamp ? JSON.parse(own.channels_json) : sent;
      db.prepare("INSERT INTO frequency_dispatches VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id,dispatch_id) DO UPDATE SET channels_json=excluded.channels_json,expires_at=excluded.expires_at,created_at=excluded.created_at")
        .run(ctx.workspaceId, ctx.userId, ctx.dispatchId, ctx.entityType, ctx.entityId, own && (sent.length || own.expires_at > ctx.timestamp) ? own.created_at : ctx.timestamp, JSON.stringify([...new Set([...channels, channel])]), JSON.stringify(sent), new Date(Date.parse(ctx.timestamp) + 300000).toISOString());
    }
    return { allowed: true, cappedRuleIds: [] };
  });
}
export function finishDispatch(db: DatabaseSync, ctx: FrequencyDispatch, sent: boolean) {
  if (!ctx.count || !frequencyChannel(ctx.channel)) return;
  initialize(db);
  atomic(db, () => {
    const row = db.prepare("SELECT * FROM frequency_dispatches WHERE workspace_id=? AND user_id=? AND dispatch_id=?").get(ctx.workspaceId, ctx.userId, ctx.dispatchId) as DispatchRow | undefined;
    if (!row) return;
    const channel = frequencyChannel(ctx.channel)!, completed = new Set<string>(JSON.parse(row.sent_json));
    if (sent) completed.add(channel);
    const channels = new Set<string>(JSON.parse(row.channels_json));
    if (!sent && !completed.has(channel)) channels.delete(channel);
    if (!channels.size) db.prepare("DELETE FROM frequency_dispatches WHERE workspace_id=? AND user_id=? AND dispatch_id=?").run(ctx.workspaceId, ctx.userId, ctx.dispatchId);
    else db.prepare("UPDATE frequency_dispatches SET channels_json=?,sent_json=?,created_at=? WHERE workspace_id=? AND user_id=? AND dispatch_id=?").run(JSON.stringify([...channels]), JSON.stringify([...completed]), sent && JSON.parse(row.sent_json).length === 0 ? ctx.timestamp : row.created_at, ctx.workspaceId, ctx.userId, ctx.dispatchId);
  });
}
