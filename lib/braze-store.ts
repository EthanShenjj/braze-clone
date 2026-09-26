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
import { deliverWebhook, webhookDeliveryCapability, type WebhookDeliveryResult } from "./webhook-delivery";
import { normalizeWebhookVariants, redactHeaders, renderWebhookText, webhookPreviewUser, type WebhookVariant } from "./webhook-model";
import { normalizePreferenceCenterConfig, preferenceCenterDefaultConfig, type PreferenceCenterConfig } from "./preference-center-model";

export type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
export type CampaignStatus = "Draft" | "Active" | "Stopped" | "Archived";
export type CampaignRecord = {
  id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number;
  edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config: Record<string, unknown>;
};
export type ResourceRecord = { id: string; type: string; name: string; status: string; description: string; updatedAt: string; data: Record<string, unknown> };
export type UserRecord = { id: string; email: string; firstName: string; country: string; lifecycle: string; subscribed: boolean; reachable: boolean; attributes: Record<string, unknown> };
export type CatalogSelectionRecord = {
  catalogId: string; name: string; description: string; filters: Array<{ field: string; operator: "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "exists" | "not_exists"; value: string }>;
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
  id: string; name: string; description: string; groupIds: string[]; status: "Active" | "Draft" | "Archived"; updatedAt: string;
  config: PreferenceCenterConfig; version: number;
};
export type PreferenceCenterEvent = { id: string; centerId: string; userId: string; eventType: "viewed" | "submitted" | "submission_failed"; createdAt: string; details: Record<string, unknown> };
export type PreferenceCenterVersion = { version: number; createdAt: string; name: string; status: PreferenceCenterRecord["status"] };

const databasePath = process.env.BRAZE_DATABASE_PATH ?? (process.env.VERCEL ? join(tmpdir(), "braze-local-demo", "braze-local.sqlite") : join(process.cwd(), ".data", "braze-local.sqlite"));
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
      status TEXT NOT NULL, updated_at TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS preference_center_versions (
      center_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
      config_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (center_id, version)
    );
    CREATE TABLE IF NOT EXISTS preference_center_events (
      id TEXT PRIMARY KEY, center_id TEXT NOT NULL, user_id TEXT NOT NULL, event_type TEXT NOT NULL,
      created_at TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS message_events (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, user_id TEXT NOT NULL,
      event_type TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS execution_runs (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, state TEXT NOT NULL, eligible_count INTEGER NOT NULL,
      delivered_count INTEGER NOT NULL, failed_count INTEGER NOT NULL, created_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_attempts (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, user_id TEXT NOT NULL, is_test INTEGER NOT NULL,
      variant_id TEXT NOT NULL, attempt INTEGER NOT NULL, status_code INTEGER, outcome TEXT NOT NULL,
      method TEXT NOT NULL, url TEXT NOT NULL, response_body TEXT NOT NULL, error TEXT NOT NULL,
      duration_ms INTEGER NOT NULL, created_at TEXT NOT NULL
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
  const preferenceColumns = database.prepare("PRAGMA table_info(preference_centers)").all() as Array<{ name: string }>;
  if (!preferenceColumns.some(column => column.name === "config_json")) database.exec("ALTER TABLE preference_centers ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}'");
  if (!preferenceColumns.some(column => column.name === "version")) database.exec("ALTER TABLE preference_centers ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
  seed(database);
  database.prepare("UPDATE preference_centers SET config_json = ? WHERE config_json = '{}' OR config_json IS NULL").run(JSON.stringify(preferenceCenterDefaultConfig));
  database.exec("INSERT OR IGNORE INTO preference_center_versions (center_id, version, name, status, config_json, created_at) SELECT id, version, name, status, config_json, updated_at FROM preference_centers");
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
  conn.prepare("INSERT INTO preference_centers (id, name, description, group_ids_json, status, updated_at, config_json, version) VALUES (?, ?, ?, ?, 'Active', ?, ?, 1)").run(
    "pc_marketing_preferences", "Marketing preferences", "Let users choose the email updates they want to receive.",
    JSON.stringify(["sg_product_updates", "sg_promotions"]), timestamp, JSON.stringify(preferenceCenterDefaultConfig),
  );
  conn.prepare("INSERT OR IGNORE INTO preference_center_versions VALUES (?, 1, ?, 'Active', ?, ?)").run(
    "pc_marketing_preferences", "Marketing preferences", JSON.stringify(preferenceCenterDefaultConfig), timestamp,
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

export type AudienceFilter = { field: string; operator: string; value: string };

// Translates saved segment filters into SQL clauses shared by estimates and launches.
function audienceFilterClauses(filters: AudienceFilter[]) {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  for (const filter of filters) {
    if (!filter.value) continue;
    const operator = filter.operator;
    if (filter.field === "country") { clauses.push(operator === "not_equals" ? "u.country != ?" : "u.country = ?"); values.push(filter.value); }
    else if (filter.field === "lifecycle") { clauses.push(operator === "not_equals" ? "u.lifecycle != ?" : "u.lifecycle = ?"); values.push(filter.value); }
    else if (filter.field === "subscribed") { clauses.push("u.subscribed = ?"); values.push(String(filter.value) === "true" ? 1 : 0); }
    else if (filter.field === "email") { clauses.push("instr(lower(u.email), lower(?)) > 0"); values.push(filter.value); }
    else if (filter.field.startsWith("attr:")) { const key = filter.field.slice(5).replace(/'/g, ""); clauses.push(`json_extract(u.attributes_json, '$.${key}') = ?`); values.push(filter.value); }
  }
  return { clauses, values };
}

export function savedSegmentFilters(name?: string | null): AudienceFilter[] {
  if (!name) return [];
  const saved = listResources("segments").find(row => row.name.toLowerCase() === name.toLowerCase());
  const data = (saved?.data ?? {}) as Record<string, unknown>;
  return (Array.isArray(data.filters) ? data.filters : []) as AudienceFilter[];
}

export function estimateAudience(audience = "All Users", country?: string, excludeCountry?: string, eligibility = "subscribed", subscriptionGroupId?: string, filters: AudienceFilter[] = []) {
  const audienceRule = audienceCondition(audience);
  const clauses: string[] = audienceRule.sql === "1 = 1" ? [] : [audienceRule.sql];
  const values: (string | number)[] = [...audienceRule.values];
  const filterClauses = audienceFilterClauses(filters);
  clauses.push(...filterClauses.clauses);
  values.push(...filterClauses.values);
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
  return {
    id: String(row.id), name: String(row.name), description: String(row.description), groupIds: parseJson(String(row.group_ids_json), []),
    status: row.status as PreferenceCenterRecord["status"], updatedAt: String(row.updated_at),
    config: normalizePreferenceCenterConfig(parseJson(String(row.config_json ?? "{}"), {})), version: Number(row.version ?? 1),
  };
}

export function listPreferenceCenters() { return (db().prepare("SELECT * FROM preference_centers ORDER BY updated_at DESC").all() as Record<string, unknown>[]).map(mapPreferenceCenter); }
export function getPreferenceCenter(id: string) {
  const row = db().prepare("SELECT * FROM preference_centers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapPreferenceCenter(row) : null;
}
export function createPreferenceCenter(input: { name: string; description?: string; groupIds?: string[]; status?: PreferenceCenterRecord["status"]; config?: PreferenceCenterConfig }) {
  const name = input.name.trim(); if (!name) throw new Error("Preference center name is required.");
  const record: PreferenceCenterRecord = { id: uid("pc"), name, description: input.description?.trim() || "", groupIds: input.groupIds ?? [], status: input.status ?? "Draft", updatedAt: now(), config: normalizePreferenceCenterConfig(input.config), version: 1 };
  db().prepare("INSERT INTO preference_centers (id, name, description, group_ids_json, status, updated_at, config_json, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.description, JSON.stringify(record.groupIds), record.status, record.updatedAt, JSON.stringify(record.config), record.version);
  db().prepare("INSERT INTO preference_center_versions VALUES (?, ?, ?, ?, ?, ?)").run(record.id, record.version, record.name, record.status, JSON.stringify(record.config), record.updatedAt);
  audit("preference_center", record.id, "created", { groupCount: record.groupIds.length }); return record;
}

export function updatePreferenceCenter(id: string, patch: Partial<Pick<PreferenceCenterRecord, "name" | "description" | "groupIds" | "status" | "config">>) {
  const current = getPreferenceCenter(id); if (!current) return null;
  const name = patch.name?.trim() || current.name;
  const description = patch.description === undefined ? current.description : patch.description.trim();
  const groupIds = patch.groupIds ?? current.groupIds;
  const status = patch.status ?? current.status;
  const config = patch.config ? normalizePreferenceCenterConfig(patch.config) : current.config;
  const updatedAt = now();
  const version = current.version + 1;
  db().prepare("UPDATE preference_centers SET name = ?, description = ?, group_ids_json = ?, status = ?, updated_at = ?, config_json = ?, version = ? WHERE id = ?").run(name, description, JSON.stringify(groupIds), status, updatedAt, JSON.stringify(config), version, id);
  db().prepare("INSERT INTO preference_center_versions VALUES (?, ?, ?, ?, ?, ?)").run(id, version, name, status, JSON.stringify(config), updatedAt);
  audit("preference_center", id, "updated", { groupCount: groupIds.length, status, version });
  return { id, name, description, groupIds, status, updatedAt, config, version } satisfies PreferenceCenterRecord;
}

export function listPreferenceCenterVersions(id: string): PreferenceCenterVersion[] {
  return db().prepare("SELECT version, name, status, created_at FROM preference_center_versions WHERE center_id = ? ORDER BY version DESC LIMIT 20").all(id).map(row => {
    const value = row as Record<string, unknown>;
    return { version: Number(value.version), name: String(value.name), status: value.status as PreferenceCenterRecord["status"], createdAt: String(value.created_at) };
  });
}

function preferenceCenterToken(centerId: string, userId: string) { return createHash("sha256").update(`local-preference-center:${centerId}:${userId}`).digest("hex").slice(0, 28); }
export function createPreferenceCenterLink(centerId: string, userId: string) {
  if (!getPreferenceCenter(centerId) || !getUser(userId)) return null;
  return { centerId, userId, token: preferenceCenterToken(centerId, userId) };
}
export function getPublicPreferenceCenter(centerId: string, userId: string, token?: string | null) {
  const center = getPreferenceCenter(centerId); const user = getUser(userId);
  if (!center || !user || center.status !== "Active") return null;
  if (token && token !== preferenceCenterToken(centerId, userId)) return null;
  const groups = center.groupIds.map(id => getSubscriptionGroup(id)).filter((group): group is SubscriptionGroupRecord => group !== null).filter(group => group.channel === "Email" && group.status === "Active").map(group => {
    const membership = db().prepare("SELECT state FROM subscription_group_memberships WHERE group_id = ? AND user_id = ?").get(group.id, userId) as { state?: SubscriptionState } | undefined;
    return { ...group, state: membership?.state ?? "unsubscribed" };
  });
  const eventId = uid("pcevt");
  db().prepare("INSERT INTO preference_center_events VALUES (?, ?, ?, 'viewed', ?, ?)").run(eventId, centerId, userId, now(), JSON.stringify({ version: center.version }));
  return { center, user, groups };
}
export function submitPublicPreferenceCenter(centerId: string, userId: string, token: string | null | undefined, states: Record<string, boolean>) {
  const center = getPreferenceCenter(centerId); const user = getUser(userId);
  if (!center || !user || center.status !== "Active" || token !== preferenceCenterToken(centerId, userId)) return null;
  const groupIds = center.groupIds.filter(id => {
    const group = getSubscriptionGroup(id); return group?.channel === "Email" && group.status === "Active";
  });
  db().exec("BEGIN");
  try {
    for (const groupId of groupIds) setSubscriptionMember(groupId, userId, states[groupId] ? "subscribed" : "unsubscribed");
    const eventId = uid("pcevt"); const timestamp = now();
    db().prepare("INSERT INTO preference_center_events VALUES (?, ?, ?, 'submitted', ?, ?)").run(eventId, centerId, userId, timestamp, JSON.stringify({ version: center.version, states }));
    audit("preference_center", centerId, "submitted", { userId, subscribedGroups: groupIds.filter(id => states[id]).length });
    db().exec("COMMIT");
    return { updatedAt: timestamp, groupIds };
  } catch (error) { db().exec("ROLLBACK"); throw error; }
}
export function preferenceCenterAnalytics(centerId: string) {
  const rows = db().prepare("SELECT event_type, count(*) AS count FROM preference_center_events WHERE center_id = ? GROUP BY event_type").all(centerId) as Array<{ event_type: string; count: number }>;
  const counts = Object.fromEntries(rows.map(row => [row.event_type, row.count]));
  return { views: counts.viewed ?? 0, submissions: counts.submitted ?? 0, failures: counts.submission_failed ?? 0 };
}

function webhookContext(user: { id: string; email?: string; firstName?: string; country?: string; attributes?: Record<string, unknown> } | null, custom: Record<string, unknown> = {}): Record<string, unknown> {
  if (!user) return { ...webhookPreviewUser, ...custom };
  return {
    user_id: user.id,
    external_id: user.id,
    email: user.email ?? "",
    first_name: user.firstName ?? "",
    country: user.country ?? "",
    ...(user.attributes ?? {}),
    attributes: user.attributes ?? {},
    ...custom,
  };
}

function recordWebhookResult(campaignId: string, userId: string, variant: WebhookVariant, result: WebhookDeliveryResult, isTest: boolean) {
  const timestamp = now();
  const insert = db().prepare("INSERT INTO webhook_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const attempt of result.attempts) insert.run(uid("wha"), campaignId, userId, isTest ? 1 : 0, variant.id, attempt.attempt, attempt.statusCode, attempt.outcome, result.method, result.url, attempt.responseBody, attempt.error, attempt.durationMs, timestamp);
  return {
    url: result.url,
    method: result.method,
    requestHeaders: redactHeaders(result.requestHeaders),
    requestBody: result.requestBody,
    attempts: result.attempts,
    delivered: result.delivered,
  };
}

function recordBlockedWebhook(campaignId: string, userId: string, variant: WebhookVariant, error: string, isTest: boolean, suppliedContext?: Record<string, unknown>) {
  const timestamp = now();
  const context = suppliedContext ?? webhookContext(getUser(userId));
  const url = renderWebhookText(variant.url, context, String(context.language ?? "en"), variant.translations);
  db().prepare("INSERT INTO webhook_attempts VALUES (?, ?, ?, ?, ?, 1, NULL, 'blocked', ?, ?, '', ?, 0, ?)")
    .run(uid("wha"), campaignId, userId, isTest ? 1 : 0, variant.id, variant.method, url, error, timestamp);
  return { url, method: variant.method, requestHeaders: redactHeaders(variant.headers), requestBody: variant.body, attempts: [{ attempt: 1, statusCode: null, outcome: "blocked" as const, responseBody: "", error, durationMs: 0 }], delivered: false };
}

export async function launchCampaign(id: string) {
  const conn = db(); const campaign = getCampaign(id);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "Active") {
    const latest = conn.prepare("SELECT id, eligible_count, delivered_count, failed_count FROM execution_runs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as { id: string; eligible_count: number; delivered_count: number; failed_count: number } | undefined;
    return { campaign, run: { id: latest?.id ?? "existing", eligible: latest?.eligible_count ?? 0, delivered: latest?.delivered_count ?? 0, failed: latest?.failed_count ?? 0, alreadyLaunched: true } };
  }
  const issues = campaignValidationIssues(campaign);
  if (issues.length) throw new Error(issues.join(" "));
  const audience = audienceCondition(campaign.audience ?? "All Users");
  const segmentFilters = savedSegmentFilters(campaign.audience);
  const filterClauses = audienceFilterClauses(segmentFilters);
  const country = typeof campaign.config.audienceCountry === "string" && ["US", "GB", "CN", "SG", "DE"].includes(campaign.config.audienceCountry) ? campaign.config.audienceCountry : null;
  const excludedCountry = typeof campaign.config.audienceExcludeCountry === "string" && ["US", "GB", "CN", "SG", "DE"].includes(campaign.config.audienceExcludeCountry) ? campaign.config.audienceExcludeCountry : null;
  const subscriptionGroupId = typeof campaign.config.subscriptionGroupId === "string" ? campaign.config.subscriptionGroupId : null;
  const allClauses = [audience.sql, ...filterClauses.clauses];
  if (country) allClauses.push("u.country = ?");
  if (excludedCountry) allClauses.push("u.country != ?");
  const allValues = [...audience.values, ...filterClauses.values, ...(country ? [country] : []), ...(excludedCountry ? [excludedCountry] : [])];
  const users = conn.prepare(`SELECT u.id, u.reachable, u.subscribed, u.email${subscriptionGroupId ? ", m.state AS subscription_state" : ""} FROM users u ${subscriptionGroupId ? "LEFT JOIN subscription_group_memberships m ON m.user_id = u.id AND m.group_id = ?" : ""} WHERE ${allClauses.join(" AND ")} ORDER BY u.id`).all(...(subscriptionGroupId ? [subscriptionGroupId] : []), ...allValues) as { id: string; reachable: number; subscribed: number; email: string; subscription_state?: SubscriptionState }[];
  // Suppression list entries exclude matching emails and whole domains from sends.
  const suppressionEntries = listResources("suppression-lists").map(row => row.name.toLowerCase().replace(/^@/, ""));
  const isSuppressed = (email: string) => suppressionEntries.some(entry => email.toLowerCase() === entry || email.toLowerCase().endsWith(`@${entry}`));
  // Frequency capping rules limit delivered messages per user inside each window.
  const freqRecord = listResources("frequency-capping-rules")[0];
  const freqData = (freqRecord?.data ?? {}) as { enabled?: boolean; rules?: Array<{ kind: string; limit: number; window: string }> };
  const freqRules = freqData.enabled === true ? (freqData.rules ?? []).filter(rule => rule.limit > 0) : [];
  const freqCappedUsers = new Set<string>();
  for (const rule of freqRules) {
    const windowMs = rule.window === "per week" ? 7 * 86400000 : rule.window === "per month" ? 30 * 86400000 : 86400000;
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const channelClause = rule.kind === "All channels" ? "" : " AND channel = ?";
    const rows = conn.prepare(`SELECT user_id, count(*) AS sent FROM message_events WHERE event_type = 'delivered' AND created_at >= ?${channelClause} GROUP BY user_id`).all(cutoff, ...(rule.kind === "All channels" ? [] : [rule.kind])) as Array<{ user_id: string; sent: number }>;
    for (const row of rows) if (row.sent >= rule.limit) freqCappedUsers.add(row.user_id);
  }
  const requireSubscription = campaign.config.subscribeEligibility !== "all";
  const controlGroup = Math.min(100, Math.max(0, Number(campaign.config.controlGroup ?? 20)));
  const configuredMaxUsers = campaign.config.limitVolume ? Math.max(1, Number(campaign.config.maxUsers ?? 100)) : Infinity;
  const maxUsers = campaign.channel === "webhook" ? Math.min(configuredMaxUsers, Math.max(1, Number(process.env.WEBHOOK_MAX_DELIVERIES_PER_RUN ?? 100))) : configuredMaxUsers;
  const subscribed = (user: { subscribed: number; subscription_state?: SubscriptionState }) => subscriptionGroupId ? user.subscription_state === "subscribed" : Boolean(user.subscribed);
  const eligible = users.filter(user => user.reachable && (!requireSubscription || subscribed(user)));
  // Quiet hours defer deliveries whose designated send time falls inside the window.
  const delivery = (campaign.config.delivery ?? {}) as Record<string, unknown>;
  const quietActive = delivery.quietHours === true && typeof delivery.quietStart === "string" && typeof delivery.quietEnd === "string";
  let quietDeferred = false;
  if (quietActive) {
    const sendTime = String(delivery.sendTime ?? "10:00");
    const start = String(delivery.quietStart); const end = String(delivery.quietEnd);
    quietDeferred = start <= end ? sendTime >= start && sendTime < end : sendTime >= start || sendTime < end;
  }
  const runId = uid("run"); const timestamp = now();
  const insertEvent = conn.prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)");
  let delivered = 0; let failed = 0; let webhookProcessed = 0; let deferredCount = 0; let frequencyCapped = 0; let suppressedCount = 0;
  const webhookVariants = campaign.channel === "webhook" ? normalizeWebhookVariants(campaign) : [];
  for (const user of users) {
    const deliverable = user.reachable && (!requireSubscription || subscribed(user));
    const inControl = deliverable && createHash("sha256").update(`${id}:${user.id}`).digest()[0] / 256 * 100 < controlGroup;
    let eventType = !deliverable ? subscribed(user) ? "unreachable" : "suppressed"
      : isSuppressed(user.email) ? "suppressed"
      : freqCappedUsers.has(user.id) ? "frequency_capped"
      : inControl ? "control"
      : (campaign.channel === "webhook" ? webhookProcessed : delivered) >= maxUsers ? "held_back"
      : quietDeferred ? "deferred"
      : "delivered";
    if (eventType === "suppressed" && deliverable) suppressedCount += 1;
    if (eventType === "frequency_capped") frequencyCapped += 1;
    if (eventType === "deferred") deferredCount += 1;
    let eventData: Record<string, unknown> = { runId };
    if (eventType === "delivered" && campaign.channel === "webhook") {
      webhookProcessed += 1;
      const hash = createHash("sha256").update(`${id}:${user.id}:variant`).digest()[0];
      const variant = webhookVariants[hash % webhookVariants.length];
      const profile = getUser(user.id);
      const context = webhookContext(profile);
      try {
        const result = await deliverWebhook(variant, context, String(context.language ?? "en"));
        eventData = { ...eventData, webhook: recordWebhookResult(id, user.id, variant, result, false) };
        if (!result.delivered) eventType = "failed";
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : "Webhook delivery failed.";
        eventData = { ...eventData, webhook: recordBlockedWebhook(id, user.id, variant, error, false, context) };
        eventType = "failed";
      }
    }
    insertEvent.run(uid("evt"), id, campaign.channel, user.id, eventType, timestamp, JSON.stringify(eventData));
    if (eventType === "delivered") {
      delivered += 1;
      if (campaign.channel !== "webhook") {
        if (delivered % 4 === 0) insertEvent.run(uid("evt"), id, campaign.channel, user.id, "opened", timestamp, JSON.stringify({ runId }));
        if (delivered % 9 === 0) insertEvent.run(uid("evt"), id, campaign.channel, user.id, "clicked", timestamp, JSON.stringify({ runId }));
      }
    } else if (eventType === "unreachable" || eventType === "suppressed" || eventType === "failed") { failed += 1; }
  }
  conn.prepare("INSERT INTO execution_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(runId, id, "completed", eligible.length, delivered, failed, timestamp, JSON.stringify({ campaign, quietHoursDeferred: quietDeferred, deferredCount, frequencyCapped, suppressionListHits: suppressedCount }));
  conn.prepare("UPDATE campaigns SET status = 'Active', sent = sent + ?, edited_at = ? WHERE id = ?").run(delivered, timestamp, id);
  audit("campaign", id, "launched", { runId, eligible: eligible.length, delivered, failed, deferred: deferredCount, frequencyCapped, suppressionListHits: suppressedCount });
  return { campaign: getCampaign(id), run: { id: runId, eligible: eligible.length, delivered, failed, deferred: deferredCount, frequencyCapped, suppressionListHits: suppressedCount, quietHoursDeferred: quietDeferred } };
}

export async function sendTestCampaign(id: string, input: { recipient?: string; mode?: "random" | "existing" | "custom"; customUser?: Record<string, unknown>; variantId?: string; locale?: string } | string = {}) {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error("Campaign not found");
  const options = typeof input === "string" ? { recipient: input } : input;
  const recipient = options.recipient || "user_1";
  const timestamp = now();
  if (campaign.channel === "webhook") {
    const issues = campaignValidationIssues(campaign);
    if (issues.length) throw new Error(issues.join(" "));
    const row = options.mode === "random"
      ? db().prepare("SELECT * FROM users WHERE reachable = 1 ORDER BY id LIMIT 1").get() as Record<string, unknown> | undefined
      : db().prepare("SELECT * FROM users WHERE id = ? OR lower(email) = lower(?) LIMIT 1").get(recipient, recipient) as Record<string, unknown> | undefined;
    const user = row ? mapUser(row) : null;
    const userId = user?.id ?? "custom_test_user";
    const context = webhookContext(user, options.mode === "custom" ? options.customUser : {});
    const variants = normalizeWebhookVariants(campaign);
    const variant = variants.find(item => item.id === options.variantId) ?? variants[0];
    let result: WebhookDeliveryResult;
    try { result = await deliverWebhook(variant, context, options.locale || String(context.language ?? "en"), 1); }
    catch (cause) { result = recordBlockedWebhook(id, userId, variant, cause instanceof Error ? cause.message : "Webhook delivery failed.", true, context); }
    const safeResult = result.attempts[0]?.outcome === "blocked" ? result : recordWebhookResult(id, userId, variant, result, true);
    db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), id, campaign.channel, userId, result.delivered ? "delivered" : "failed", timestamp, JSON.stringify({ test: true, recipient, webhook: safeResult }));
    audit("campaign", id, "webhook_test_sent", { recipient, delivered: result.delivered, statusCode: result.attempts.at(-1)?.statusCode ?? null });
    return { recipient, campaign: campaign.name, channel: campaign.channel, createdAt: timestamp, webhook: safeResult, capability: webhookDeliveryCapability() };
  }
  db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), id, campaign.channel, "test_user", "delivered", timestamp, JSON.stringify({ test: true, recipient }));
  audit("campaign", id, "test_sent", { recipient });
  return { recipient, campaign: campaign.name, channel: campaign.channel, createdAt: timestamp };
}

// API campaigns receive externally-sent message events for attribution.
export function recordExternalEvent(campaignId: string, input: { userId?: string; event?: string; attributes?: Record<string, unknown> }) {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const allowed = ["sent", "delivered", "opened", "clicked", "conversion", "failed"];
  const event = allowed.includes(String(input.event)) ? String(input.event) : null;
  if (!event) throw new Error(`event must be one of: ${allowed.join(", ")}`);
  const userId = String(input.userId ?? "").trim() || "external_user";
  const timestamp = now();
  db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), campaignId, campaign.channel, userId, event, timestamp, JSON.stringify({ external: true, attributes: input.attributes ?? {} }));
  audit("campaign", campaignId, "external_event", { userId, event });
  return { recorded: true, campaign: campaign.name, event, userId, createdAt: timestamp };
}

export function listWebhookAttempts(campaignId?: string, limit = 100) {
  const rows = campaignId
    ? db().prepare("SELECT * FROM webhook_attempts WHERE campaign_id = ? ORDER BY created_at DESC, attempt DESC LIMIT ?").all(campaignId, Math.min(500, Math.max(1, limit)))
    : db().prepare("SELECT * FROM webhook_attempts ORDER BY created_at DESC, attempt DESC LIMIT ?").all(Math.min(500, Math.max(1, limit)));
  return rows as Record<string, unknown>[];
}

export { webhookDeliveryCapability };

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

export function updateResource(id: string, input: { name?: string; status?: string; description?: string; data?: Record<string, unknown> }, expectedUpdatedAt?: string) {
  const existing = getResource(id);
  if (!existing) throw new Error("Resource not found");
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== existing.updatedAt) throw new Error("Resource changed in another tab. Reload before saving.");
  const updatedAt = now();
  db().prepare("UPDATE resources SET name = ?, status = ?, description = ?, updated_at = ?, data_json = ? WHERE id = ?")
    .run(input.name ?? existing.name, input.status ?? existing.status, input.description ?? existing.description, updatedAt, JSON.stringify(input.data ?? existing.data), id);
  audit("resource", id, "updated", { type: existing.type });
  return getResource(id)!;
}

export function deleteResource(id: string) {
  const existing = getResource(id);
  if (!existing) throw new Error("Resource not found");
  db().prepare("DELETE FROM resources WHERE id = ?").run(id);
  audit("resource", id, "archived", { type: existing.type });
  return existing;
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
export function createCatalog(input: string | { id?: string; name: string; description?: string; data?: Record<string, unknown> }) {
  const value = typeof input === "string" ? { name: input } : input;
  if (value.id) {
    const timestamp = now();
    const record: ResourceRecord = { id: value.id, type: "catalogs", name: value.name, status: "Draft", description: value.description ?? "", updatedAt: timestamp, data: value.data ?? { fields: [], fieldTypes: {}, source: "Braze", size: "1KB" } };
    db().prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at, data_json=excluded.data_json").run(record.id, record.type, record.name, record.status, record.description, record.updatedAt, JSON.stringify(record.data));
    audit("catalog", record.id, "created", {});
    return record;
  }
  return createResource({
    type: "catalogs",
    name: value.name,
    description: value.description ?? "",
    data: value.data ?? { fields: [], fieldTypes: {}, source: "Braze", size: "1KB" },
  });
}
export function updateCatalog(id: string, patch: Partial<Pick<ResourceRecord, "name" | "description" | "data" | "status">>) {
  const current = getResource(id); if (!current || current.type !== "catalogs") return null;
  const next = { ...current, ...patch, data: patch.data ?? current.data, updatedAt: now() };
  db().prepare("UPDATE resources SET name = ?, status = ?, description = ?, updated_at = ?, data_json = ? WHERE id = ?").run(next.name, next.status, next.description, next.updatedAt, JSON.stringify(next.data), id);
  audit("catalog", id, "updated", { fields: (next.data as { fields?: unknown }).fields }); return next;
}
export function removeCatalog(id: string) {
  const conn = db();
  conn.exec("BEGIN");
  try {
    conn.prepare("DELETE FROM catalog_subscriptions WHERE catalog_id = ?").run(id);
    conn.prepare("DELETE FROM catalog_selections WHERE catalog_id = ?").run(id);
    conn.prepare("DELETE FROM catalog_items WHERE catalog_id = ?").run(id);
    conn.prepare("DELETE FROM resources WHERE id = ? AND type = 'catalogs'").run(id);
    audit("catalog", id, "deleted", {});
    conn.exec("COMMIT");
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
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

export function upsertCatalogSelection(catalogId: string, input: Omit<CatalogSelectionRecord, "catalogId" | "updatedAt">, originalName?: string) {
  if (!getResource(catalogId)) throw new Error("Catalog not found");
  const timestamp = now();
  if (originalName && originalName !== input.name) db().prepare("DELETE FROM catalog_selections WHERE catalog_id = ? AND name = ?").run(catalogId, originalName);
  db().prepare(`INSERT INTO catalog_selections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(catalog_id,name) DO UPDATE SET description=excluded.description, filters_json=excluded.filters_json,
    random_sort=excluded.random_sort, sort_field=excluded.sort_field, sort_direction=excluded.sort_direction,
    result_limit=excluded.result_limit, updated_at=excluded.updated_at`).run(
      catalogId, input.name, input.description, JSON.stringify(input.filters), input.randomSort ? 1 : 0,
      input.sortField, input.sortDirection, Math.max(1, Math.min(50, input.resultLimit)), timestamp,
    );
  audit("catalog_selection", `${catalogId}:${input.name}`, originalName ? "updated" : "created", {});
  return getCatalogSelection(catalogId, input.name)!;
}

export function removeCatalogSelection(catalogId: string, name: string) {
  db().prepare("DELETE FROM catalog_selections WHERE catalog_id = ? AND name = ?").run(catalogId, name);
  audit("catalog_selection", `${catalogId}:${name}`, "deleted", {});
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
    items = items.filter(item => {
      const raw = filter.field === "id" ? item.id : item.fields[filter.field];
      const left = String(raw ?? "").toLowerCase(); const right = filter.value.toLowerCase();
      if (filter.operator === "not_equals") return left !== right;
      if (filter.operator === "contains") return left.includes(right);
      if (filter.operator === "not_contains") return !left.includes(right);
      if (filter.operator === "greater_than") return Number(raw) > Number(filter.value);
      if (filter.operator === "less_than") return Number(raw) < Number(filter.value);
      if (filter.operator === "exists") return raw != null && raw !== "";
      if (filter.operator === "not_exists") return raw == null || raw === "";
      return left === right;
    });
  }
  if (selection.randomSort) {
    items.sort((left, right) => createHash("sha256").update(`${catalogId}:${name}:${user.id}:${left.id}`).digest("hex").localeCompare(createHash("sha256").update(`${catalogId}:${name}:${user.id}:${right.id}`).digest("hex")));
  } else if (selection.sortField) {
    const direction = selection.sortDirection === "descending" ? -1 : 1;
    items.sort((left, right) => String(left.fields[selection.sortField] ?? "").localeCompare(String(right.fields[selection.sortField] ?? "")) * direction);
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

export function updateRecommendation(id: string, patch: Partial<Pick<RecommendationRecord, "name" | "description" | "data">>, persisted?: RecommendationRecord | null) {
  const current = getRecommendation(id) ?? persisted ?? {
    id,
    type: "recommendations",
    name: patch.name?.trim() || "New Recommendation",
    status: "Draft",
    description: patch.description ?? "",
    updatedAt: now(),
    data: patch.data ?? { trackingType: "purchase_object", propertyName: "product_id" },
  };
  const next: RecommendationRecord = { ...current, ...patch, data: { ...current.data, ...patch.data }, updatedAt: now() };
  db().prepare(`INSERT INTO resources (id, type, name, status, description, updated_at, data_json)
    VALUES (?, 'recommendations', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status,
      description = excluded.description, updated_at = excluded.updated_at, data_json = excluded.data_json`)
    .run(id, next.name, next.status || "Draft", next.description, next.updatedAt, JSON.stringify(next.data));
  audit("recommendation", id, "updated", { configured: Boolean(next.data.catalogId && next.data.recommendationType) });
  return next;
}

export function reportOverview(range = "30") {
  const since = new Date(Date.now() - Number(range) * 86_400_000).toISOString();
  const rows = db().prepare("SELECT event_type, count(*) AS count FROM message_events WHERE created_at >= ? GROUP BY event_type").all(since) as { event_type: string; count: number }[];
  const counts = Object.fromEntries(rows.map(row => [row.event_type, row.count]));
  // Per-channel breakdown so the channel performance reports show distinct data.
  const channelRows = db().prepare("SELECT channel, event_type, count(*) AS count FROM message_events WHERE created_at >= ? GROUP BY channel, event_type").all(since) as { channel: string; event_type: string; count: number }[];
  const channels: Record<string, Record<string, number>> = {};
  for (const row of channelRows) {
    channels[row.channel] = channels[row.channel] ?? {};
    channels[row.channel][row.event_type] = row.count;
  }
  // Per-campaign breakdown for dimension tables.
  const campaignRows = db().prepare(`SELECT e.campaign_id, COALESCE(c.name, r.name) AS name, e.channel, sum(CASE WHEN e.event_type = 'delivered' THEN 1 ELSE 0 END) AS delivered, sum(CASE WHEN e.event_type = 'opened' THEN 1 ELSE 0 END) AS opened, sum(CASE WHEN e.event_type = 'clicked' THEN 1 ELSE 0 END) AS clicked, sum(CASE WHEN e.event_type = 'failed' THEN 1 ELSE 0 END) AS failed FROM message_events e LEFT JOIN campaigns c ON c.id = e.campaign_id LEFT JOIN resources r ON r.id = e.campaign_id WHERE e.created_at >= ? GROUP BY e.campaign_id ORDER BY delivered DESC LIMIT 12`).all(since) as Array<{ campaign_id: string; name: string; channel: string; delivered: number; opened: number; clicked: number; failed: number }>;
  const runs = db().prepare("SELECT created_at, delivered_count FROM execution_runs WHERE created_at >= ? UNION ALL SELECT created_at, message_count AS delivered_count FROM canvas_runs WHERE created_at >= ? ORDER BY created_at DESC LIMIT 12").all(since, since) as { created_at: string; delivered_count: number }[];
  return { delivered: counts.delivered ?? 0, opened: counts.opened ?? 0, clicked: counts.clicked ?? 0, suppressed: counts.suppressed ?? 0, unreachable: counts.unreachable ?? 0, deferred: counts.deferred ?? 0, frequency_capped: counts.frequency_capped ?? 0, channels, campaigns: campaignRows, series: runs.reverse().map(run => ({ date: run.created_at, delivered: run.delivered_count })) };
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
  if (action === "reset") { conn.exec("DELETE FROM webhook_attempts; DELETE FROM message_events; DELETE FROM execution_runs; DELETE FROM canvas_runs; DELETE FROM demo_receipts; DELETE FROM demo_state; DELETE FROM audit_log; DELETE FROM campaigns; DELETE FROM users; DELETE FROM catalog_subscriptions; DELETE FROM catalog_selections; DELETE FROM catalog_items; DELETE FROM resources; DELETE FROM subscription_group_memberships; DELETE FROM subscription_groups; DELETE FROM preference_center_events; DELETE FROM preference_center_versions; DELETE FROM preference_centers;"); seed(conn); seedSampleCatalog(conn); return { message: "Sample data reset", state: getDemoState() }; }
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
