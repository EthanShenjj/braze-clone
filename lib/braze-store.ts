import "server-only";

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { campaignValidationIssues } from "./campaign-validation";
import { type CanvasGraph, type CanvasRun, type CanvasTrace, validateCanvasGraph } from "./canvas-model";
import { sampleCatalogId, sampleCatalogRows, sampleRecommendationId } from "./sample-catalog";
import { sampleSegmentByName, sampleSegments } from "./sample-segments";

export type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
export type CampaignStatus = "Draft" | "Active" | "Stopped" | "Archived";
export type CampaignRecord = {
  id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number;
  edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config: Record<string, unknown>;
};
export type ResourceRecord = { id: string; type: string; name: string; status: string; description: string; updatedAt: string; data: Record<string, unknown> };
export type UserRecord = { id: string; email: string; firstName: string; country: string; lifecycle: string; subscribed: boolean; reachable: boolean; attributes: Record<string, unknown> };
export type CatalogSelectionRecord = {
  catalogId: string; name: string; description: string; filters: Array<{ field: string; operator: "equals"; value: string }>;
  randomSort: boolean; sortField: string; sortDirection: string; resultLimit: number; updatedAt: string;
};
export type RecommendationRecord = ResourceRecord & {
  data: { catalogId?: string; selectionName?: string; recommendationType?: string; trackingType?: string; propertyName?: string };
};
export type SubscriptionChannel = "Email" | "SMS" | "WhatsApp";
export type SubscriptionState = "subscribed" | "unsubscribed";
export type SubscriptionGroupRecord = {
  id: string; name: string; description: string; channel: SubscriptionChannel; status: "Active" | "Archived";
  createdAt: string; updatedAt: string; subscriberCount: number;
};
export type SubscriptionMemberRecord = UserRecord & { state: SubscriptionState; updatedAt: string };
export type PreferenceCenterRecord = {
  id: string; name: string; description: string; groupIds: string[]; status: "Active" | "Draft"; updatedAt: string;
};

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
    CREATE TABLE IF NOT EXISTS catalog_selections (
      catalog_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, filters_json TEXT NOT NULL,
      random_sort INTEGER NOT NULL DEFAULT 0, sort_field TEXT NOT NULL DEFAULT '', sort_direction TEXT NOT NULL DEFAULT '',
      result_limit INTEGER NOT NULL DEFAULT 3, updated_at TEXT NOT NULL, PRIMARY KEY (catalog_id, name)
    );
    CREATE TABLE IF NOT EXISTS catalog_subscriptions (
      catalog_id TEXT NOT NULL, user_id TEXT NOT NULL, item_id TEXT NOT NULL, subscription_type TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY (catalog_id, user_id, item_id, subscription_type)
    );
    CREATE TABLE IF NOT EXISTS subscription_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscription_group_memberships (
      group_id TEXT NOT NULL, user_id TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS preference_centers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, group_ids_json TEXT NOT NULL,
      status TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_events (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, user_id TEXT NOT NULL,
      event_type TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS execution_runs (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, state TEXT NOT NULL, eligible_count INTEGER NOT NULL,
      delivered_count INTEGER NOT NULL, failed_count INTEGER NOT NULL, created_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS canvas_runs (
      id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL, created_at TEXT NOT NULL,
      entered_count INTEGER NOT NULL, completed_count INTEGER NOT NULL, message_count INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL, traces_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_receipts (delivery_id TEXT PRIMARY KEY, generated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
      created_at TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  seed(database);
  seedSampleCatalog(database);
  return database;
}

function seedSampleCatalog(conn: DatabaseSync) {
  const timestamp = "2026-09-13T22:38:00.000Z";
  conn.prepare("INSERT OR IGNORE INTO resources VALUES (?, 'catalogs', ?, 'View only', ?, ?, ?)").run(
    sampleCatalogId, "Sample_Catalog", "Sample catalog items for Decorumsoft", timestamp,
    JSON.stringify({ fields: ["Product_id", "Product_type", "Product_category", "item_name", "description", "price", "image"], source: "Braze", size: "4KB", sample: true }),
  );
  const insert = conn.prepare("INSERT OR IGNORE INTO catalog_items VALUES (?, ?, ?, ?, ?)");
  for (const row of sampleCatalogRows) insert.run(row.id, sampleCatalogId, row.name, JSON.stringify(row.fields), timestamp);
  conn.prepare("INSERT OR IGNORE INTO catalog_selections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    sampleCatalogId,
    "Gaming",
    "Selection for Gaming Catalog Items",
    JSON.stringify([{ field: "Product_type", operator: "equals", value: "Gaming" }]),
    1,
    "",
    "",
    3,
    timestamp,
  );
  conn.prepare("INSERT OR IGNORE INTO resources VALUES (?, 'recommendations', ?, 'Draft', ?, ?, ?)").run(
    sampleRecommendationId,
    "New Recommendation",
    "Recommend relevant Sample_Catalog items to each customer.",
    timestamp,
    JSON.stringify({ catalogId: "", selectionName: "", recommendationType: "", trackingType: "purchase_object", propertyName: "product_id" }),
  );
}

function seed(conn: DatabaseSync) {
  const existing = conn.prepare("SELECT count(*) AS count FROM campaigns").get() as { count: number };
  const created = now();
  const campaigns: CampaignRecord[] = [
    { id: "cmp_3d084f2b", name: "New Campaign - September 16, 2026", channel: "email", status: "Draft", schedule: "One time", sent: 0, edited: created, subject: "{% if ${language} == 'zh' %}九月专属优惠｜立减 20%{% else %}Your September Offer | 20% Off{% endif %}", body: "Thanks for being with us. Use code SEPTEMBER20 to get 20% off.", audience: "All Users", conversion: "Make Purchase", config: { variants: [{ id: "var_1", name: "Variant 1" }], delivery: { timezone: "UTC+08:00" } } },
    { id: "cmp_newsletter", name: "Newsletter Welcome", channel: "email", status: "Active", schedule: "Action-based", sent: 420, edited: created, subject: "Welcome to Braze", body: "Your latest offers are waiting.", audience: "New Users", conversion: "Start Session", config: {} },
    { id: "cmp_push_primer", name: "Push Primer", channel: "push", status: "Active", schedule: "Action-based", sent: 301, edited: created, subject: "New offers are ready", body: "Open the app to see your personalized offer.", audience: "All Users", conversion: "Make Purchase", config: { platform: "iOS" } },
    { id: "cmp_banner", name: "Referral Banner", channel: "banner", status: "Draft", schedule: "One time", sent: 0, edited: created, subject: "Invite a friend", body: "Give $10, get $10.", audience: "Recent Purchasers", conversion: "Make Purchase", config: { placement: "home_top" } },
    { id: "cmp_iam", name: "Welcome Offer IAM", channel: "iam", status: "Active", schedule: "One time", sent: 4784, edited: created, subject: "WELCOME", body: "Thanks for signing up! Use this offer code for 10% off your next order. WELCOME10", audience: "New Users", conversion: "Start Session", config: { channelValues: { sendTo: "Both Mobile Apps & Web Browsers", layout: "Modal" }, delivery: { timing: "designated", frequency: "One time", startDate: "2026-09-17", sendTime: "10:00" } } },
  ];
  const insertCampaign = conn.prepare("INSERT OR IGNORE INTO campaigns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
  for (const campaign of campaigns) insertCampaign.run(campaign.id, campaign.name, campaign.channel, campaign.status, campaign.schedule, campaign.sent, campaign.edited, campaign.subject ?? null, campaign.body ?? null, campaign.audience ?? null, campaign.conversion ?? null, JSON.stringify(campaign.config));
  if (existing.count) { seedSampleSegments(conn, created); seedCatalogItems(conn); seedSubscriptionGroups(conn); return; }
  const insertUser = conn.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const countries = ["US", "GB", "CN", "SG", "DE"];
  for (let index = 1; index <= 1000; index += 1) {
    const lifecycle = index % 5 === 0 ? "New Users" : index % 3 === 0 ? "Recent Purchasers" : "All Users";
    insertUser.run(`user_${index}`, `user${index}@example.test`, `Customer ${index}`, countries[index % countries.length], lifecycle, index % 11 ? 1 : 0, index % 13 ? 1 : 0, JSON.stringify({ language: index % 4 === 0 ? "zh" : "en", plan: index % 2 ? "pro" : "free" }));
  }
  const insertResource = conn.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)");
  const resources: Array<[string, string, string, string, string, Record<string, unknown>]> = [
    ["tmpl_september", "email-templates", "September offer", "Active", "Reusable email template with Liquid localization", { editor: "html" }],
    ["catalog_featured", "catalogs", "Featured collection", "Active", "20 products with price and image fields", { fields: ["sku", "name", "price", "image"] }],
    ["canvas_welcome", "canvas", "Welcome journey", "Draft", "Entry, delay, email and conversion journey", { nodes: [], edges: [] }],
  ];
  for (const [id, type, name, status, description, data] of resources) insertResource.run(id, type, name, status, description, created, JSON.stringify(data));
  seedSampleSegments(conn, created);
  seedCatalogItems(conn);
  seedSubscriptionGroups(conn);
}

function seedSampleSegments(conn: DatabaseSync, timestamp: string) {
  const insert = conn.prepare(`INSERT INTO resources VALUES (?, 'segments', ?, 'Active', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET type = excluded.type, name = excluded.name, status = excluded.status,
      description = excluded.description, updated_at = excluded.updated_at, data_json = excluded.data_json`);
  for (const segment of sampleSegments) insert.run(segment.id, segment.name, segment.description, timestamp, JSON.stringify({ filters: [segment.rule] }));
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

function seedSubscriptionGroups(conn: DatabaseSync) {
  const existing = conn.prepare("SELECT count(*) AS count FROM subscription_groups").get() as { count: number };
  if (existing.count) return;
  const timestamp = "2026-09-16T10:49:34.230Z";
  const groups: Array<[string, string, string, SubscriptionChannel]> = [
    ["sg_product_updates", "Product updates", "Feature launches, release notes, and product education.", "Email"],
    ["sg_promotions", "Promotions", "Offers, seasonal campaigns, and member-only savings.", "Email"],
    ["sg_sms_alerts", "SMS alerts", "Time-sensitive order and account notifications.", "SMS"],
    ["sg_whatsapp_updates", "WhatsApp updates", "Approved WhatsApp template updates.", "WhatsApp"],
  ];
  const insertGroup = conn.prepare("INSERT INTO subscription_groups VALUES (?, ?, ?, ?, 'Active', ?, ?)");
  const insertMembership = conn.prepare("INSERT INTO subscription_group_memberships VALUES (?, ?, ?, ?)");
  for (const [id, name, description, channel] of groups) insertGroup.run(id, name, description, channel, timestamp, timestamp);
  for (let index = 1; index <= 1000; index += 1) {
    const userId = `user_${index}`;
    if (index % 2 !== 0) insertMembership.run("sg_product_updates", userId, "subscribed", timestamp);
    if (index % 3 !== 0) insertMembership.run("sg_promotions", userId, "subscribed", timestamp);
    if (index % 4 !== 0) insertMembership.run("sg_sms_alerts", userId, index % 11 === 0 ? "unsubscribed" : "subscribed", timestamp);
    if (index % 5 !== 0) insertMembership.run("sg_whatsapp_updates", userId, "subscribed", timestamp);
  }
  conn.prepare("INSERT INTO preference_centers VALUES (?, ?, ?, ?, 'Active', ?)").run(
    "pc_marketing_preferences", "Marketing preferences", "Let users choose the email updates they want to receive.",
    JSON.stringify(["sg_product_updates", "sg_promotions"]), timestamp,
  );
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
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 1000);
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

function audienceCondition(audience: string) {
  const segment = sampleSegmentByName(audience);
  if (!segment) return { sql: "1 = 1", values: [] as (string | number)[] };
  const { rule } = segment;
  if (rule.field === "attribute") {
    if (!rule.attribute) return { sql: "1 = 1", values: [] as (string | number)[] };
    return { sql: `json_extract(u.attributes_json, '$.${rule.attribute}') = ?`, values: [rule.value] };
  }
  const columns = { lifecycle: "u.lifecycle", country: "u.country", subscribed: "u.subscribed", reachable: "u.reachable" } as const;
  return { sql: `${columns[rule.field]} = ?`, values: [rule.value] };
}

export function estimateAudience(audience = "All Users", country?: string, excludeCountry?: string, eligibility = "subscribed", subscriptionGroupId?: string) {
  const audienceRule = audienceCondition(audience);
  const clauses: string[] = audienceRule.sql === "1 = 1" ? [] : [audienceRule.sql];
  const values: (string | number)[] = [...audienceRule.values];
  if (country && ["US", "GB", "CN", "SG", "DE"].includes(country)) { clauses.push("u.country = ?"); values.push(country); }
  if (excludeCountry && ["US", "GB", "CN", "SG", "DE"].includes(excludeCountry)) { clauses.push("u.country != ?"); values.push(excludeCountry); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const eligible = eligibility === "all" ? "u.reachable = 1" : subscriptionGroupId ? "u.reachable = 1 AND m.state = 'subscribed'" : "u.subscribed = 1 AND u.reachable = 1";
  const membership = subscriptionGroupId ? "LEFT JOIN subscription_group_memberships m ON m.user_id = u.id AND m.group_id = ?" : "";
  const result = db().prepare(`SELECT count(*) AS matching, sum(CASE WHEN ${eligible} THEN 1 ELSE 0 END) AS reachable FROM users u ${membership} ${where}`).get(...(subscriptionGroupId ? [subscriptionGroupId] : []), ...values) as { matching: number; reachable: number | null };
  const workspace = db().prepare("SELECT count(*) AS total FROM users").get() as { total: number };
  return { matching: result.matching, reachable: result.reachable ?? 0, total: workspace.total };
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return { id: String(row.id), email: String(row.email), firstName: String(row.first_name), country: String(row.country), lifecycle: String(row.lifecycle), subscribed: Boolean(row.subscribed), reachable: Boolean(row.reachable), attributes: parseJson(String(row.attributes_json), {}) };
}

export function searchUsers(query = "", start = 0, limit = 20) {
  const offset = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
  const pageSize = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;
  const term = query.trim().toLowerCase();
  const condition = "instr(lower(id), ?) > 0 OR instr(lower(email), ?) > 0 OR instr(lower(first_name), ?) > 0";
  const total = (db().prepare(`SELECT count(*) AS count FROM users WHERE ${condition}`).get(term, term, term) as { count: number }).count;
  const rows = db().prepare(`SELECT * FROM users WHERE ${condition} ORDER BY CAST(SUBSTR(id, 6) AS INTEGER) LIMIT ? OFFSET ?`).all(term, term, term, pageSize, offset) as Record<string, unknown>[];
  return { data: rows.map(mapUser), total, start: offset, limit: pageSize };
}

export function setUserSubscription(id: string, subscribed: boolean) {
  const result = db().prepare("UPDATE users SET subscribed = ? WHERE id = ?").run(subscribed ? 1 : 0, id);
  if (!result.changes) return null;
  audit("user", id, "subscription_changed", { subscribed });
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown>;
  return mapUser(row);
}

function mapSubscriptionGroup(row: Record<string, unknown>): SubscriptionGroupRecord {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description), channel: row.channel as SubscriptionChannel,
    status: row.status as "Active" | "Archived", createdAt: String(row.created_at), updatedAt: String(row.updated_at), subscriberCount: Number(row.subscriber_count ?? 0),
  };
}

export function listSubscriptionGroups(input: { q?: string; channel?: string; status?: string } = {}) {
  const clauses: string[] = ["1 = 1"]; const values: string[] = [];
  if (input.q?.trim()) { clauses.push("(lower(g.name) LIKE lower(?) OR lower(g.description) LIKE lower(?))"); values.push(`%${input.q.trim()}%`, `%${input.q.trim()}%`); }
  if (input.channel && input.channel !== "All channels") { clauses.push("g.channel = ?"); values.push(input.channel); }
  if (input.status && input.status !== "All statuses") { clauses.push("g.status = ?"); values.push(input.status); }
  const rows = db().prepare(`SELECT g.*, sum(CASE WHEN m.state = 'subscribed' THEN 1 ELSE 0 END) AS subscriber_count
    FROM subscription_groups g LEFT JOIN subscription_group_memberships m ON m.group_id = g.id
    WHERE ${clauses.join(" AND ")} GROUP BY g.id ORDER BY g.updated_at DESC, g.name COLLATE NOCASE ASC`).all(...values) as Record<string, unknown>[];
  return rows.map(mapSubscriptionGroup);
}

export function getSubscriptionGroup(id: string) {
  const row = db().prepare(`SELECT g.*, sum(CASE WHEN m.state = 'subscribed' THEN 1 ELSE 0 END) AS subscriber_count
    FROM subscription_groups g LEFT JOIN subscription_group_memberships m ON m.group_id = g.id WHERE g.id = ? GROUP BY g.id`).get(id) as Record<string, unknown> | undefined;
  return row ? mapSubscriptionGroup(row) : null;
}

export function createSubscriptionGroup(input: { name: string; description?: string; channel: SubscriptionChannel }) {
  const name = input.name.trim();
  if (!name) throw new Error("Subscription group name is required.");
  const record: SubscriptionGroupRecord = { id: uid("sg"), name, description: input.description?.trim() || "", channel: input.channel, status: "Active", createdAt: now(), updatedAt: now(), subscriberCount: 0 };
  db().prepare("INSERT INTO subscription_groups VALUES (?, ?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.description, record.channel, record.status, record.createdAt, record.updatedAt);
  audit("subscription_group", record.id, "created", { channel: record.channel }); return record;
}

export function updateSubscriptionGroup(id: string, patch: Partial<Pick<SubscriptionGroupRecord, "name" | "description" | "channel" | "status">>) {
  const current = getSubscriptionGroup(id); if (!current) return null;
  const next = { ...current, ...patch, name: patch.name?.trim() || current.name, updatedAt: now() };
  db().prepare("UPDATE subscription_groups SET name = ?, description = ?, channel = ?, status = ?, updated_at = ? WHERE id = ?").run(next.name, next.description, next.channel, next.status, next.updatedAt, id);
  audit("subscription_group", id, next.status === "Archived" ? "archived" : "updated", { channel: next.channel });
  return getSubscriptionGroup(id);
}

export function listSubscriptionMembers(groupId: string, input: { q?: string; state?: string; start?: number; limit?: number } = {}) {
  if (!getSubscriptionGroup(groupId)) return null;
  const clauses = ["m.group_id = ?"]; const values: (string | number)[] = [groupId];
  if (input.q?.trim()) { clauses.push("(lower(u.id) LIKE lower(?) OR lower(u.email) LIKE lower(?) OR lower(u.first_name) LIKE lower(?))"); values.push(`%${input.q.trim()}%`, `%${input.q.trim()}%`, `%${input.q.trim()}%`); }
  if (input.state && input.state !== "All statuses") { clauses.push("m.state = ?"); values.push(input.state); }
  const where = clauses.join(" AND ");
  const total = (db().prepare(`SELECT count(*) AS count FROM subscription_group_memberships m JOIN users u ON u.id = m.user_id WHERE ${where}`).get(...values) as { count: number }).count;
  const start = Math.max(0, Math.floor(input.start ?? 0)); const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 20)));
  const rows = db().prepare(`SELECT u.*, m.state, m.updated_at AS membership_updated_at FROM subscription_group_memberships m JOIN users u ON u.id = m.user_id WHERE ${where} ORDER BY m.updated_at DESC, u.id LIMIT ? OFFSET ?`).all(...values, limit, start) as Record<string, unknown>[];
  return { data: rows.map(row => ({ ...mapUser(row), state: row.state as SubscriptionState, updatedAt: String(row.membership_updated_at) })), total, start, limit };
}

export function setSubscriptionMember(groupId: string, userId: string, state: SubscriptionState) {
  if (!getSubscriptionGroup(groupId) || !getUser(userId)) return null;
  const timestamp = now();
  db().prepare("INSERT INTO subscription_group_memberships VALUES (?, ?, ?, ?) ON CONFLICT(group_id,user_id) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at").run(groupId, userId, state, timestamp);
  audit("subscription_group", groupId, "member_subscription_changed", { userId, state });
  return { groupId, userId, state, updatedAt: timestamp };
}

function mapPreferenceCenter(row: Record<string, unknown>): PreferenceCenterRecord {
  return { id: String(row.id), name: String(row.name), description: String(row.description), groupIds: parseJson(String(row.group_ids_json), []), status: row.status as "Active" | "Draft", updatedAt: String(row.updated_at) };
}

export function listPreferenceCenters() { return (db().prepare("SELECT * FROM preference_centers ORDER BY updated_at DESC").all() as Record<string, unknown>[]).map(mapPreferenceCenter); }
export function createPreferenceCenter(input: { name: string; description?: string; groupIds?: string[]; status?: "Active" | "Draft" }) {
  const name = input.name.trim(); if (!name) throw new Error("Preference center name is required.");
  const record: PreferenceCenterRecord = { id: uid("pc"), name, description: input.description?.trim() || "", groupIds: input.groupIds ?? [], status: input.status ?? "Draft", updatedAt: now() };
  db().prepare("INSERT INTO preference_centers VALUES (?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.description, JSON.stringify(record.groupIds), record.status, record.updatedAt);
  audit("preference_center", record.id, "created", { groupCount: record.groupIds.length }); return record;
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
  const audience = audienceCondition(campaign.audience ?? "All Users");
  const country = typeof campaign.config.audienceCountry === "string" && ["US", "GB", "CN", "SG", "DE"].includes(campaign.config.audienceCountry) ? campaign.config.audienceCountry : null;
  const excludedCountry = typeof campaign.config.audienceExcludeCountry === "string" && ["US", "GB", "CN", "SG", "DE"].includes(campaign.config.audienceExcludeCountry) ? campaign.config.audienceExcludeCountry : null;
  const subscriptionGroupId = typeof campaign.config.subscriptionGroupId === "string" ? campaign.config.subscriptionGroupId : null;
  const users = conn.prepare(`SELECT u.id, u.reachable, u.subscribed${subscriptionGroupId ? ", m.state AS subscription_state" : ""} FROM users u ${subscriptionGroupId ? "LEFT JOIN subscription_group_memberships m ON m.user_id = u.id AND m.group_id = ?" : ""} WHERE ${audience.sql}${country ? " AND u.country = ?" : ""}${excludedCountry ? " AND u.country != ?" : ""} ORDER BY u.id`).all(...(subscriptionGroupId ? [subscriptionGroupId] : []), ...audience.values, ...(country ? [country] : []), ...(excludedCountry ? [excludedCountry] : [])) as { id: string; reachable: number; subscribed: number; subscription_state?: SubscriptionState }[];
  const requireSubscription = campaign.config.subscribeEligibility !== "all";
  const controlGroup = Math.min(100, Math.max(0, Number(campaign.config.controlGroup ?? 20)));
  const maxUsers = campaign.config.limitVolume ? Math.max(1, Number(campaign.config.maxUsers ?? 100)) : Infinity;
  const subscribed = (user: { subscribed: number; subscription_state?: SubscriptionState }) => subscriptionGroupId ? user.subscription_state === "subscribed" : Boolean(user.subscribed);
  const eligible = users.filter(user => user.reachable && (!requireSubscription || subscribed(user)));
  const runId = uid("run"); const timestamp = now();
  const insertEvent = conn.prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)");
  let delivered = 0; let failed = 0;
  for (const user of users) {
    const deliverable = user.reachable && (!requireSubscription || subscribed(user));
    const inControl = deliverable && createHash("sha256").update(`${id}:${user.id}`).digest()[0] / 256 * 100 < controlGroup;
    const eventType = !deliverable ? subscribed(user) ? "unreachable" : "suppressed" : inControl ? "control" : delivered >= maxUsers ? "held_back" : "delivered";
    insertEvent.run(uid("evt"), id, campaign.channel, user.id, eventType, timestamp, JSON.stringify({ runId }));
    if (eventType === "delivered") { delivered += 1; if (delivered % 4 === 0) insertEvent.run(uid("evt"), id, campaign.channel, user.id, "opened", timestamp, JSON.stringify({ runId })); if (delivered % 9 === 0) insertEvent.run(uid("evt"), id, campaign.channel, user.id, "clicked", timestamp, JSON.stringify({ runId })); } else if (eventType === "unreachable" || eventType === "suppressed") { failed += 1; }
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

const localCanvasId = "canvas_local_main";
export function getCanvasWorkspace() {
  const resource = getResource(localCanvasId);
  const rows = db().prepare("SELECT * FROM canvas_runs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 8").all(localCanvasId) as Record<string, unknown>[];
  const runs: CanvasRun[] = rows.map(row => ({ id: String(row.id), createdAt: String(row.created_at), entered: Number(row.entered_count), completed: Number(row.completed_count), messages: Number(row.message_count), traces: parseJson(String(row.traces_json), [] as CanvasTrace[]) }));
  return { graph: resource?.data ?? null, updatedAt: resource?.updatedAt ?? null, runs };
}

export function saveCanvasGraph(graph: CanvasGraph, expectedUpdatedAt?: string | null) {
  const existing = getResource(localCanvasId);
  if (existing && expectedUpdatedAt !== undefined && expectedUpdatedAt !== existing.updatedAt) throw new Error("Canvas draft changed in another tab. Reload before saving.");
  const updatedAt = now();
  db().prepare("INSERT INTO resources VALUES (?, 'canvas', ?, 'Draft', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, data_json=excluded.data_json")
    .run(localCanvasId, "Local canvas draft", "Saved visual journey graph", updatedAt, JSON.stringify(graph));
  audit("canvas", localCanvasId, existing ? "updated" : "created", { nodeCount: graph.nodes.length, edgeCount: graph.edges.length });
  return { graph, updatedAt };
}

export function launchCanvasGraph(): CanvasRun {
  const saved = getResource(localCanvasId);
  if (!saved) throw new Error("Save the Canvas draft before launching.");
  const graph = saved.data as CanvasGraph;
  const issues = validateCanvasGraph(graph);
  if (issues.length) throw new Error(issues.join(" "));
  const users = db().prepare("SELECT id, country, lifecycle, subscribed FROM users WHERE reachable = 1 AND subscribed = 1 ORDER BY id LIMIT 10").all() as { id: string; country: string; lifecycle: string; subscribed: number }[];
  const runId = uid("canvasrun"); const timestamp = now();
  let messages = 0;
  const traces: CanvasTrace[] = [];
  const insertEvent = db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)");
  db().exec("BEGIN");
  try {
    for (const user of users) {
      const steps: CanvasTrace["steps"] = [];
      let current = graph.nodes.find(node => node.kind === "entry")!;
      while (current) {
        steps.push({ nodeId: current.id, label: current.label, kind: current.kind, at: timestamp });
        if (current.kind === "message") {
          insertEvent.run(uid("evt"), localCanvasId, current.config?.channel ?? "email", user.id, "delivered", timestamp, JSON.stringify({ canvasRunId: runId, nodeId: current.id, simulated: true }));
          messages += 1;
        }
        const routes = graph.edges.filter(([from]) => from === current.id);
        const condition = current.kind === "branch" && current.config?.attribute
          ? String(user[current.config.attribute as keyof typeof user]) === current.config.value : true;
        const nextId = routes[current.kind === "branch" && !condition ? 1 : 0]?.[1];
        const next = graph.nodes.find(node => node.id === nextId);
        if (!next) break;
        current = next;
      }
      traces.push({ userId: user.id, steps });
    }
    const run: CanvasRun = { id: runId, createdAt: timestamp, entered: users.length, completed: traces.length, messages, traces };
    db().prepare("INSERT INTO canvas_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(run.id, localCanvasId, timestamp, run.entered, run.completed, run.messages, JSON.stringify(graph), JSON.stringify(traces));
    audit("canvas", localCanvasId, "launched", { runId, entered: run.entered, messages });
    db().exec("COMMIT");
    return run;
  } catch (error) { db().exec("ROLLBACK"); throw error; }
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
export function listCatalogItems(catalogId: string, q = ""): Array<{ id: string; name: string; fields: Record<string, unknown>; updatedAt: string }> {
  const rows = db().prepare("SELECT * FROM catalog_items WHERE catalog_id = ? AND (lower(name) LIKE lower(?) OR lower(id) LIKE lower(?)) ORDER BY updated_at DESC").all(catalogId, `%${q}%`, `%${q}%`) as Record<string, unknown>[];
  return rows.map(row => ({ id: String(row.id), name: String(row.name), fields: parseJson<Record<string, unknown>>(String(row.fields_json), {}), updatedAt: String(row.updated_at) }));
}
export function upsertCatalogItem(catalogId: string, input: { id: string; name: string; fields?: Record<string, unknown> }) {
  if (!getResource(catalogId)) throw new Error("Catalog not found"); const updatedAt = now();
  db().prepare("INSERT INTO catalog_items VALUES (?, ?, ?, ?, ?) ON CONFLICT(catalog_id,id) DO UPDATE SET name=excluded.name, fields_json=excluded.fields_json, updated_at=excluded.updated_at").run(input.id, catalogId, input.name, JSON.stringify(input.fields ?? {}), updatedAt);
  audit("catalog_item", `${catalogId}:${input.id}`, "upserted", {}); return { ...input, fields: input.fields ?? {}, updatedAt };
}
export function removeCatalogItem(catalogId: string, id: string) { db().prepare("DELETE FROM catalog_items WHERE catalog_id = ? AND id = ?").run(catalogId, id); audit("catalog_item", `${catalogId}:${id}`, "deleted", {}); }

function mapCatalogSelection(row: Record<string, unknown>): CatalogSelectionRecord {
  return {
    catalogId: String(row.catalog_id),
    name: String(row.name),
    description: String(row.description),
    filters: parseJson(String(row.filters_json), []),
    randomSort: Boolean(row.random_sort),
    sortField: String(row.sort_field),
    sortDirection: String(row.sort_direction),
    resultLimit: Number(row.result_limit),
    updatedAt: String(row.updated_at),
  };
}

export function listCatalogSelections(catalogId: string, query = "") {
  const term = `%${query.trim()}%`;
  const rows = db().prepare("SELECT * FROM catalog_selections WHERE catalog_id = ? AND lower(name) LIKE lower(?) ORDER BY updated_at DESC, name COLLATE NOCASE ASC").all(catalogId, term) as Record<string, unknown>[];
  return rows.map(mapCatalogSelection);
}

export function getCatalogSelection(catalogId: string, name: string) {
  const row = db().prepare("SELECT * FROM catalog_selections WHERE catalog_id = ? AND name = ?").get(catalogId, name) as Record<string, unknown> | undefined;
  return row ? mapCatalogSelection(row) : null;
}

export function getUser(id: string) {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function randomCatalogPreviewUser() {
  const row = db().prepare("SELECT * FROM users WHERE reachable = 1 ORDER BY id LIMIT 1 OFFSET ?").get((new Date().getUTCMinutes() * 17 + new Date().getUTCSeconds()) % 900) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : getUser("user_1");
}

export function previewCatalogSelection(catalogId: string, name: string, userId?: string) {
  const selection = getCatalogSelection(catalogId, name);
  if (!selection) return null;
  const user = userId ? getUser(userId) : randomCatalogPreviewUser();
  if (!user) return null;
  let items = listCatalogItems(catalogId);
  for (const filter of selection.filters) {
    items = items.filter(item => String(filter.field === "id" ? item.id : item.fields[filter.field] ?? "") === filter.value);
  }
  if (selection.randomSort) {
    items.sort((left, right) => createHash("sha256").update(`${catalogId}:${name}:${user.id}:${left.id}`).digest("hex").localeCompare(createHash("sha256").update(`${catalogId}:${name}:${user.id}:${right.id}`).digest("hex")));
  }
  return { selection, user, items: items.slice(0, selection.resultLimit) };
}

export function listCatalogSubscriptions(catalogId: string, limit = 10) {
  return db().prepare("SELECT user_id AS userId, item_id AS itemId, subscription_type AS subscriptionType, created_at AS createdAt FROM catalog_subscriptions WHERE catalog_id = ? ORDER BY created_at DESC LIMIT ?").all(catalogId, Math.max(1, Math.min(limit, 100))) as Array<{ userId: string; itemId: string; subscriptionType: string; createdAt: string }>;
}

function mapRecommendation(resource: ResourceRecord): RecommendationRecord {
  return resource as RecommendationRecord;
}

export function createRecommendation() {
  const timestamp = new Date();
  const name = `New Recommendation - ${timestamp.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, ${timestamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const record = createResource({ type: "recommendations", name, description: "", data: { catalogId: "", selectionName: "", recommendationType: "", trackingType: "purchase_object", propertyName: "product_id" } });
  audit("recommendation", record.id, "created", {});
  return mapRecommendation(record);
}

export function getRecommendation(id: string) {
  const record = getResource(id);
  return record?.type === "recommendations" ? mapRecommendation(record) : null;
}

export function updateRecommendation(id: string, patch: Partial<Pick<RecommendationRecord, "name" | "description" | "data">>) {
  const current = getRecommendation(id);
  if (!current) return null;
  const next: RecommendationRecord = { ...current, ...patch, data: { ...current.data, ...patch.data }, updatedAt: now() };
  db().prepare("UPDATE resources SET name = ?, description = ?, updated_at = ?, data_json = ? WHERE id = ?").run(next.name, next.description, next.updatedAt, JSON.stringify(next.data), id);
  audit("recommendation", id, "updated", { configured: Boolean(next.data.catalogId && next.data.recommendationType) });
  return next;
}

export function reportOverview(range = "30") {
  const since = new Date(Date.now() - Number(range) * 86_400_000).toISOString();
  const rows = db().prepare("SELECT event_type, count(*) AS count FROM message_events WHERE created_at >= ? GROUP BY event_type").all(since) as { event_type: string; count: number }[];
  const counts = Object.fromEntries(rows.map(row => [row.event_type, row.count]));
  const runs = db().prepare("SELECT created_at, delivered_count FROM execution_runs WHERE created_at >= ? UNION ALL SELECT created_at, message_count AS delivered_count FROM canvas_runs WHERE created_at >= ? ORDER BY created_at DESC LIMIT 12").all(since, since) as { created_at: string; delivered_count: number }[];
  return { delivered: counts.delivered ?? 0, opened: counts.opened ?? 0, clicked: counts.clicked ?? 0, suppressed: counts.suppressed ?? 0, unreachable: counts.unreachable ?? 0, series: runs.reverse().map(run => ({ date: run.created_at, delivered: run.delivered_count })) };
}

export function activityLog(limit = 50) {
  return db().prepare(`SELECT e.*, COALESCE(c.name, r.name) AS campaign_name FROM message_events e LEFT JOIN campaigns c ON c.id = e.campaign_id LEFT JOIN resources r ON r.id = e.campaign_id ORDER BY e.created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
}

export function getDemoState() {
  const saved = db().prepare("SELECT value FROM demo_state WHERE key = 'simulated_time'").get() as { value: string } | undefined;
  const pending = db().prepare("SELECT count(*) AS count FROM message_events e LEFT JOIN demo_receipts d ON d.delivery_id = e.id WHERE e.event_type = 'delivered' AND d.delivery_id IS NULL").get() as { count: number };
  return { simulatedTime: saved?.value ?? now(), pendingReceipts: pending.count };
}

export function demoAction(action: string) {
  const conn = db();
  if (action === "reset") { conn.exec("DELETE FROM message_events; DELETE FROM execution_runs; DELETE FROM canvas_runs; DELETE FROM demo_receipts; DELETE FROM demo_state; DELETE FROM audit_log; DELETE FROM campaigns; DELETE FROM users; DELETE FROM catalog_subscriptions; DELETE FROM catalog_selections; DELETE FROM catalog_items; DELETE FROM resources; DELETE FROM subscription_group_memberships; DELETE FROM subscription_groups; DELETE FROM preference_centers;"); seed(conn); seedSampleCatalog(conn); return { message: "Sample data reset", state: getDemoState() }; }
  if (action === "advance") {
    const current = getDemoState().simulatedTime;
    const next = new Date(new Date(current).getTime() + 86_400_000).toISOString();
    conn.prepare("INSERT INTO demo_state VALUES ('simulated_time', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(next);
    audit("demo", "simulated_time", "advanced", { from: current, to: next });
    return { message: `Demo clock advanced to ${next}. Scheduled jobs are not implemented.`, state: getDemoState() };
  }
  if (action === "failure") { const active = conn.prepare("SELECT id, channel FROM campaigns WHERE status = 'Active' LIMIT 1").get() as { id: string; channel: string } | undefined; if (!active) return { message: "No active campaign is available for failure injection.", state: getDemoState() }; conn.prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), active.id, active.channel, "user_1", "failed", getDemoState().simulatedTime, JSON.stringify({ reason: "rate_limit", simulated: true })); return { message: "Rate-limit failure recorded in Message Activity Log.", state: getDemoState() }; }
  if (action === "receipts") {
    const rows = conn.prepare("SELECT e.id, e.campaign_id, e.channel, e.user_id FROM message_events e LEFT JOIN demo_receipts d ON d.delivery_id = e.id WHERE e.event_type = 'delivered' AND d.delivery_id IS NULL ORDER BY e.created_at, e.id LIMIT 100").all() as { id: string; campaign_id: string; channel: string; user_id: string }[];
    const timestamp = getDemoState().simulatedTime;
    const insertEvent = conn.prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)");
    const mark = conn.prepare("INSERT INTO demo_receipts VALUES (?, ?)");
    let generated = 0;
    conn.exec("BEGIN");
    try {
      for (const [index, row] of rows.entries()) {
        const supportsOpen = ["email", "push", "whatsapp", "line"].includes(row.channel);
        const supportsClick = ["email", "push", "sms", "whatsapp", "line", "iam", "content", "banner"].includes(row.channel);
        if (supportsOpen && index % 2 === 0) { insertEvent.run(uid("evt"), row.campaign_id, row.channel, row.user_id, "opened", timestamp, JSON.stringify({ deliveryId: row.id, simulated: true })); generated += 1; }
        if (supportsClick && index % 4 === 0) { insertEvent.run(uid("evt"), row.campaign_id, row.channel, row.user_id, "clicked", timestamp, JSON.stringify({ deliveryId: row.id, simulated: true })); generated += 1; }
        mark.run(row.id, timestamp);
      }
      audit("demo", "receipts", "generated", { processed: rows.length, events: generated });
      conn.exec("COMMIT");
    } catch (error) { conn.exec("ROLLBACK"); throw error; }
    return { message: `${generated} receipt events generated from ${rows.length} deliveries.`, state: getDemoState() };
  }
  throw new Error(`Unsupported demo action: ${action}`);
}

function audit(entityType: string, entityId: string, action: string, detail: Record<string, unknown>) { db().prepare("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?)").run(uid("audit"), entityType, entityId, action, now(), JSON.stringify(detail)); }
