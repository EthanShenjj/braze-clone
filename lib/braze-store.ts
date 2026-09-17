import "server-only";

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { campaignValidationIssues } from "./campaign-validation";

export type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
export type CampaignStatus = "Draft" | "Active" | "Stopped" | "Archived";
export type CampaignRecord = {
  id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number;
  edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config: Record<string, unknown>;
};
export type ResourceRecord = { id: string; type: string; name: string; status: string; description: string; updatedAt: string; data: Record<string, unknown> };

const databasePath = process.env.VERCEL ? join(tmpdir(), "braze-local-demo", "braze-local.sqlite") : join(process.cwd(), ".data", "braze-local.sqlite");
let database: DatabaseSync | undefined;

function now() { return new Date().toISOString(); }
function uid(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`; }
function parseJson<T>(value: string | null | undefined, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }

function db() {
  if (database) return database;
  mkdirSync(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
      schedule TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, edited_at TEXT NOT NULL,
      subject TEXT, body TEXT, audience TEXT, conversion_event TEXT, config_json TEXT NOT NULL DEFAULT '{}', archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, first_name TEXT NOT NULL, country TEXT NOT NULL,
      lifecycle TEXT NOT NULL, subscribed INTEGER NOT NULL, reachable INTEGER NOT NULL, attributes_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
      description TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT NOT NULL, catalog_id TEXT NOT NULL, name TEXT NOT NULL, fields_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL, PRIMARY KEY (catalog_id, id)
    );
    CREATE TABLE IF NOT EXISTS message_events (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, user_id TEXT NOT NULL,
      event_type TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS execution_runs (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, state TEXT NOT NULL, eligible_count INTEGER NOT NULL,
      delivered_count INTEGER NOT NULL, failed_count INTEGER NOT NULL, created_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
      created_at TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  seed(database);
  return database;
}

function seed(conn: DatabaseSync) {
  const existing = conn.prepare("SELECT count(*) AS count FROM campaigns").get() as { count: number };
  if (existing.count) { seedCatalogItems(conn); return; }
  const created = now();
  const campaigns: CampaignRecord[] = [
    { id: "cmp_3d084f2b", name: "New Campaign - September 16, 2026", channel: "email", status: "Draft", schedule: "One time", sent: 0, edited: created, subject: "{% if ${language} == 'zh' %}九月专属优惠｜立减 20%{% else %}Your September Offer | 20% Off{% endif %}", body: "Thanks for being with us. Use code SEPTEMBER20 to get 20% off.", audience: "All Users", conversion: "Make Purchase", config: { variants: [{ id: "var_1", name: "Variant 1" }], delivery: { timezone: "UTC+08:00" } } },
    { id: "cmp_newsletter", name: "Newsletter Welcome", channel: "email", status: "Active", schedule: "Action-based", sent: 420, edited: created, subject: "Welcome to Braze", body: "Your latest offers are waiting.", audience: "New Users", conversion: "Start Session", config: {} },
    { id: "cmp_push_primer", name: "Push Primer", channel: "push", status: "Active", schedule: "Action-based", sent: 301, edited: created, subject: "New offers are ready", body: "Open the app to see your personalized offer.", audience: "All Users", conversion: "Make Purchase", config: { platform: "iOS" } },
    { id: "cmp_banner", name: "Referral Banner", channel: "banner", status: "Draft", schedule: "One time", sent: 0, edited: created, subject: "Invite a friend", body: "Give $10, get $10.", audience: "Recent Purchasers", conversion: "Make Purchase", config: { placement: "home_top" } },
  ];
  const insertCampaign = conn.prepare("INSERT INTO campaigns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
  for (const campaign of campaigns) insertCampaign.run(campaign.id, campaign.name, campaign.channel, campaign.status, campaign.schedule, campaign.sent, campaign.edited, campaign.subject ?? null, campaign.body ?? null, campaign.audience ?? null, campaign.conversion ?? null, JSON.stringify(campaign.config));
  const insertUser = conn.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const countries = ["US", "GB", "CN", "SG", "DE"];
  for (let index = 1; index <= 1000; index += 1) {
    const lifecycle = index % 5 === 0 ? "New Users" : index % 3 === 0 ? "Recent Purchasers" : "All Users";
    insertUser.run(`user_${index}`, `user${index}@example.test`, `Customer ${index}`, countries[index % countries.length], lifecycle, index % 11 ? 1 : 0, index % 13 ? 1 : 0, JSON.stringify({ language: index % 4 === 0 ? "zh" : "en", plan: index % 2 ? "pro" : "free" }));
  }
  const insertResource = conn.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)");
  const resources: Array<[string, string, string, string, string, Record<string, unknown>]> = [
    ["seg_recent", "segments", "Recent Purchasers", "Active", "Customers who made a purchase in the past 30 days", { filters: [{ field: "last_purchase", operator: "within", value: "30 days" }] }],
    ["tmpl_september", "email-templates", "September offer", "Active", "Reusable email template with Liquid localization", { editor: "html" }],
    ["catalog_featured", "catalogs", "Featured collection", "Active", "20 products with price and image fields", { fields: ["sku", "name", "price", "image"] }],
    ["canvas_welcome", "canvas", "Welcome journey", "Draft", "Entry, delay, email and conversion journey", { nodes: [], edges: [] }],
  ];
  for (const [id, type, name, status, description, data] of resources) insertResource.run(id, type, name, status, description, created, JSON.stringify(data));
  seedCatalogItems(conn);
}

function seedCatalogItems(conn: DatabaseSync) {
  const existing = conn.prepare("SELECT count(*) AS count FROM catalog_items WHERE catalog_id = 'catalog_featured'").get() as { count: number };
  if (existing.count) return;
  const insert = conn.prepare("INSERT INTO catalog_items VALUES (?, ?, ?, ?, ?)"); const timestamp = now();
  const items: Array<[string, string, Record<string, unknown>]> = [
    ["SKU-0926-01", "September Knit", { price: 89, inventory: 42, category: "Apparel", image: "https://images.example.test/knit.jpg" }],
    ["SKU-0926-02", "Everyday Tote", { price: 64, inventory: 15, category: "Accessories", image: "https://images.example.test/tote.jpg" }],
    ["SKU-0926-03", "Travel Bottle", { price: 28, inventory: 88, category: "Home", image: "https://images.example.test/bottle.jpg" }],
  ];
  items.forEach(([id, name, fields]) => insert.run(id, "catalog_featured", name, JSON.stringify(fields), timestamp));
}

function mapCampaign(row: Record<string, unknown>): CampaignRecord {
  return { id: String(row.id), name: String(row.name), channel: row.channel as Channel, status: row.status as CampaignStatus, schedule: String(row.schedule), sent: Number(row.sent), edited: String(row.edited_at), subject: row.subject ? String(row.subject) : undefined, body: row.body ? String(row.body) : undefined, audience: row.audience ? String(row.audience) : undefined, conversion: row.conversion_event ? String(row.conversion_event) : undefined, config: parseJson(String(row.config_json ?? "{}"), {}) };
}

export function listCampaigns(input: { q?: string; status?: string; limit?: number; offset?: number; sort?: string } = {}) {
  const conn = db();
  const clauses = ["archived_at IS NULL"];
  const values: (string | number)[] = [];
  if (input.q) { clauses.push("lower(name) LIKE lower(?)"); values.push(`%${input.q}%`); }
  if (input.status && input.status !== "All") { clauses.push("status = ?"); values.push(input.status); }
  const order = input.sort === "name" ? "name COLLATE NOCASE ASC" : "edited_at DESC";
  const count = conn.prepare(`SELECT count(*) AS count FROM campaigns WHERE ${clauses.join(" AND ")}`).get(...values) as { count: number };
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = conn.prepare(`SELECT * FROM campaigns WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values, limit, offset) as Record<string, unknown>[];
  return { data: rows.map(mapCampaign), total: count.count, limit, offset };
}

export function getCampaign(id: string) {
  const row = db().prepare("SELECT * FROM campaigns WHERE id = ? AND archived_at IS NULL").get(id) as Record<string, unknown> | undefined;
  return row ? mapCampaign(row) : null;
}

export function upsertCampaign(input: Partial<CampaignRecord> & Pick<CampaignRecord, "id" | "name" | "channel">) {
  const conn = db();
  const current = getCampaign(input.id);
  const record: CampaignRecord = { id: input.id, name: input.name, channel: input.channel, status: input.status ?? current?.status ?? "Draft", schedule: input.schedule ?? current?.schedule ?? "One time", sent: input.sent ?? current?.sent ?? 0, edited: now(), subject: input.subject ?? current?.subject, body: input.body ?? current?.body, audience: input.audience ?? current?.audience ?? "All Users", conversion: input.conversion ?? current?.conversion ?? "Make Purchase", config: input.config ?? current?.config ?? {} };
  conn.prepare(`INSERT INTO campaigns (id,name,channel,status,schedule,sent,edited_at,subject,body,audience,conversion_event,config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, channel=excluded.channel, status=excluded.status, schedule=excluded.schedule, sent=excluded.sent, edited_at=excluded.edited_at, subject=excluded.subject, body=excluded.body, audience=excluded.audience, conversion_event=excluded.conversion_event, config_json=excluded.config_json`).run(record.id, record.name, record.channel, record.status, record.schedule, record.sent, record.edited, record.subject ?? null, record.body ?? null, record.audience ?? null, record.conversion ?? null, JSON.stringify(record.config));
  audit("campaign", record.id, current ? "updated" : "created", { channel: record.channel });
  return record;
}

export function archiveCampaign(id: string) { db().prepare("UPDATE campaigns SET archived_at = ?, status = 'Archived', edited_at = ? WHERE id = ?").run(now(), now(), id); audit("campaign", id, "archived", {}); }
export function stopCampaign(id: string) { db().prepare("UPDATE campaigns SET status = 'Stopped', edited_at = ? WHERE id = ?").run(now(), id); audit("campaign", id, "stopped", {}); return getCampaign(id); }

export function estimateAudience(audience = "All Users", country?: string) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (audience === "New Users" || audience === "Recent Purchasers") { clauses.push("lifecycle = ?"); values.push(audience); }
  if (country && ["US", "GB", "CN", "SG", "DE"].includes(country)) { clauses.push("country = ?"); values.push(country); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = db().prepare(`SELECT count(*) AS matching, sum(CASE WHEN subscribed = 1 AND reachable = 1 THEN 1 ELSE 0 END) AS reachable FROM users ${where}`).get(...values) as { matching: number; reachable: number | null };
  return { matching: result.matching, reachable: result.reachable ?? 0 };
}

export function launchCampaign(id: string) {
  const conn = db(); const campaign = getCampaign(id);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "Active") {
    const latest = conn.prepare("SELECT id, eligible_count, delivered_count, failed_count FROM execution_runs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as { id: string; eligible_count: number; delivered_count: number; failed_count: number } | undefined;
    return { campaign, run: { id: latest?.id ?? "existing", eligible: latest?.eligible_count ?? 0, delivered: latest?.delivered_count ?? 0, failed: latest?.failed_count ?? 0, alreadyLaunched: true } };
  }
  const issues = campaignValidationIssues(campaign);
  if (issues.length) throw new Error(issues.join(" "));
  const audience = campaign.audience === "New Users" ? "lifecycle = 'New Users'" : campaign.audience === "Recent Purchasers" ? "lifecycle = 'Recent Purchasers'" : "1 = 1";
  const country = typeof campaign.config.audienceCountry === "string" && ["US", "GB", "CN", "SG", "DE"].includes(campaign.config.audienceCountry) ? campaign.config.audienceCountry : null;
  const users = conn.prepare(`SELECT id, reachable, subscribed FROM users WHERE ${audience}${country ? " AND country = ?" : ""}`).all(...(country ? [country] : [])) as { id: string; reachable: number; subscribed: number }[];
  const eligible = users.filter(user => user.reachable && user.subscribed);
  const runId = uid("run"); const timestamp = now();
  const insertEvent = conn.prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)");
  let delivered = 0; let failed = 0;
  for (const user of users) {
    const deliverable = user.reachable && user.subscribed;
    const eventType = deliverable ? "delivered" : user.subscribed ? "unreachable" : "suppressed";
    insertEvent.run(uid("evt"), id, campaign.channel, user.id, eventType, timestamp, JSON.stringify({ runId }));
    if (deliverable) { delivered += 1; if (delivered % 4 === 0) insertEvent.run(uid("evt"), id, campaign.channel, user.id, "opened", timestamp, JSON.stringify({ runId })); if (delivered % 9 === 0) insertEvent.run(uid("evt"), id, campaign.channel, user.id, "clicked", timestamp, JSON.stringify({ runId })); } else { failed += 1; }
  }
  conn.prepare("INSERT INTO execution_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(runId, id, "completed", eligible.length, delivered, failed, timestamp, JSON.stringify(campaign));
  conn.prepare("UPDATE campaigns SET status = 'Active', sent = sent + ?, edited_at = ? WHERE id = ?").run(delivered, timestamp, id);
  audit("campaign", id, "launched", { runId, eligible: eligible.length, delivered, failed });
  return { campaign: getCampaign(id), run: { id: runId, eligible: eligible.length, delivered, failed } };
}

export function sendTestCampaign(id: string, recipient = "marketing.qa@example.com") {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error("Campaign not found");
  const timestamp = now();
  db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), id, campaign.channel, "test_user", "delivered", timestamp, JSON.stringify({ test: true, recipient }));
  audit("campaign", id, "test_sent", { recipient });
  return { recipient, campaign: campaign.name, channel: campaign.channel, createdAt: timestamp };
}

export function listResources(type: string, q = "") {
  const rows = db().prepare("SELECT * FROM resources WHERE type = ? AND lower(name) LIKE lower(?) ORDER BY updated_at DESC").all(type, `%${q}%`) as Record<string, unknown>[];
  return rows.map(row => ({ id: String(row.id), type: String(row.type), name: String(row.name), status: String(row.status), description: String(row.description), updatedAt: String(row.updated_at), data: parseJson(String(row.data_json), {}) }));
}
export function createResource(input: Pick<ResourceRecord, "type" | "name"> & Partial<ResourceRecord>) {
  const record: ResourceRecord = { id: uid("res"), type: input.type, name: input.name, status: input.status ?? "Draft", description: input.description ?? "New local resource", updatedAt: now(), data: input.data ?? {} };
  db().prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)").run(record.id, record.type, record.name, record.status, record.description, record.updatedAt, JSON.stringify(record.data));
  audit("resource", record.id, "created", { type: record.type }); return record;
}

export function getResource(id: string) {
  const row = db().prepare("SELECT * FROM resources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? { id: String(row.id), type: String(row.type), name: String(row.name), status: String(row.status), description: String(row.description), updatedAt: String(row.updated_at), data: parseJson(String(row.data_json), {}) } : null;
}

export function listCatalogs() {
  const catalogs = listResources("catalogs"); const conn = db();
  return catalogs.map(catalog => ({ ...catalog, itemCount: (conn.prepare("SELECT count(*) AS count FROM catalog_items WHERE catalog_id = ?").get(catalog.id) as { count: number }).count }));
}
export function createCatalog(name: string) { return createResource({ type: "catalogs", name, description: "Local product catalog", data: { fields: ["sku", "name", "price", "image"] } }); }
export function updateCatalog(id: string, patch: Partial<Pick<ResourceRecord, "name" | "description" | "data" | "status">>) {
  const current = getResource(id); if (!current || current.type !== "catalogs") return null;
  const next = { ...current, ...patch, data: patch.data ?? current.data, updatedAt: now() };
  db().prepare("UPDATE resources SET name = ?, status = ?, description = ?, updated_at = ?, data_json = ? WHERE id = ?").run(next.name, next.status, next.description, next.updatedAt, JSON.stringify(next.data), id);
  audit("catalog", id, "updated", { fields: (next.data as { fields?: unknown }).fields }); return next;
}
export function listCatalogItems(catalogId: string, q = "") {
  const rows = db().prepare("SELECT * FROM catalog_items WHERE catalog_id = ? AND lower(name) LIKE lower(?) ORDER BY updated_at DESC").all(catalogId, `%${q}%`) as Record<string, unknown>[];
  return rows.map(row => ({ id: String(row.id), name: String(row.name), fields: parseJson(String(row.fields_json), {}), updatedAt: String(row.updated_at) }));
}
export function upsertCatalogItem(catalogId: string, input: { id: string; name: string; fields?: Record<string, unknown> }) {
  if (!getResource(catalogId)) throw new Error("Catalog not found"); const updatedAt = now();
  db().prepare("INSERT INTO catalog_items VALUES (?, ?, ?, ?, ?) ON CONFLICT(catalog_id,id) DO UPDATE SET name=excluded.name, fields_json=excluded.fields_json, updated_at=excluded.updated_at").run(input.id, catalogId, input.name, JSON.stringify(input.fields ?? {}), updatedAt);
  audit("catalog_item", `${catalogId}:${input.id}`, "upserted", {}); return { ...input, fields: input.fields ?? {}, updatedAt };
}
export function removeCatalogItem(catalogId: string, id: string) { db().prepare("DELETE FROM catalog_items WHERE catalog_id = ? AND id = ?").run(catalogId, id); audit("catalog_item", `${catalogId}:${id}`, "deleted", {}); }

export function reportOverview(range = "30") {
  const since = new Date(Date.now() - Number(range) * 86_400_000).toISOString();
  const rows = db().prepare("SELECT event_type, count(*) AS count FROM message_events WHERE created_at >= ? GROUP BY event_type").all(since) as { event_type: string; count: number }[];
  const counts = Object.fromEntries(rows.map(row => [row.event_type, row.count]));
  const runs = db().prepare("SELECT * FROM execution_runs ORDER BY created_at DESC LIMIT 12").all() as { created_at: string; delivered_count: number }[];
  return { delivered: counts.delivered ?? 0, opened: counts.opened ?? 0, clicked: counts.clicked ?? 0, suppressed: counts.suppressed ?? 0, unreachable: counts.unreachable ?? 0, series: runs.reverse().map(run => ({ date: run.created_at, delivered: run.delivered_count })) };
}

export function activityLog(limit = 50) {
  return db().prepare(`SELECT e.*, c.name AS campaign_name FROM message_events e LEFT JOIN campaigns c ON c.id = e.campaign_id ORDER BY e.created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
}

export function demoAction(action: string) {
  if (action === "reset") { const conn = db(); conn.exec("DELETE FROM message_events; DELETE FROM execution_runs; DELETE FROM audit_log; DELETE FROM campaigns; DELETE FROM users; DELETE FROM resources;"); seed(conn); return { message: "Sample data reset" }; }
  if (action === "advance") { const draft = getCampaign("cmp_3d084f2b"); if (draft) upsertCampaign({ ...draft, schedule: "One time" }); return { message: "Simulated time advanced by one day" }; }
  if (action === "failure") { const active = db().prepare("SELECT id, channel FROM campaigns WHERE status = 'Active' LIMIT 1").get() as { id: string; channel: string } | undefined; if (active) db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), active.id, active.channel, "user_1", "failed", now(), JSON.stringify({ reason: "rate_limit" })); return { message: "Rate-limit failure injected" }; }
  return { message: "Delivery receipts generated from the current execution state" };
}

function audit(entityType: string, entityId: string, action: string, detail: Record<string, unknown>) { db().prepare("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?)").run(uid("audit"), entityType, entityId, action, now(), JSON.stringify(detail)); }
