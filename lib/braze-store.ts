import "server-only";
import { validateModule, workspaceModules, objectValue, evaluateFlag, stableBucket } from "./workspace-modules";
import { prepareInAppPreview, validateInAppSnapshot } from "./in-app-runtime";
import { variantsFor as inAppVariants } from "./in-app-model";
import { initializeTags, assignTags, listTags, listTagAliases, createTag, changeTag, tagCampaigns } from "./tag-store";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { globalControlCohort, hasGlobalControlExemption, normalizeGlobalControl, validateGlobalControlCommand, type GlobalControlSettings, type GlobalControlSnapshot } from "./global-control-model";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { emailPreferenceCampaignDefaults, normalizeEmailPreferences, validateEmailPreferences, type EmailPreferences } from "./email-preferences";
import { renderBrazeLiquid,workspaceContentBlockHtml } from "./email-liquid";
import { smsIssues, smsMetrics, smsPreview } from "./sms-model";
import { latestWhatsAppInbound, whatsAppResponseEligibility, normalizeWhatsAppVariants, customWhatsAppTemplates, prepareWhatsAppMessage, validateWhatsAppCampaign } from "./whatsapp-model";
import { compileWorkspaceEmail, emailSendingIssues, emailVariantSendingIssues, extractEmailLinks, isBotClick } from "./email-runtime";
import { resolveLiquidPreview, type WorkspaceLiquid } from "./email-editor-model";
import { analyticsDateRange, campaignMonitoringIssues, defaultCampaignMonitoring, realCampaignEvents, type CampaignMonitoring } from "./campaign-analytics-model";
import { campaignAudienceFieldKind,intelligentTimingRequirements,type DeliveryTimePreview } from "./campaign-audience-model";
import { conversionCatalog, resolveConversionEvents, conversionConfigurationIssues } from "./campaign-form-model";
import { campaignValidationIssues, campaignComposeIssues, campaignAudienceIssues, subscriptionCapabilityIssues } from "./campaign-validation";
import { compileLineMessages } from "./line-model";
import { allocation, campaignVariants, variantDraft, variantKey, pickVariant, multichannelChannels, audienceConfigurationIssues, type MessageDraft, type AudienceGroup } from "./campaign-shared";
import { dispatchPreparedMessage } from "./message-delivery";
import { creativeHtml,type CreativeRow } from "./creative-model";
import { compileSms,compilePush,compileContentCard } from "./channel-message-model";
import { campaignTriggeredBy,nextScheduledTime,nextAllowedDeliveryTime,inQuietHours,isWithinCampaignDuration } from "./campaign-scheduling";
import { initialCanvasGraph, isCanvasGraph, type CanvasGraph, type CanvasRun, type CanvasTrace, validateCanvasGraph } from "./canvas-model";
import { canvasWizardIssues, defaultCanvasWizard, normalizeCanvasWizard, type CanvasFilter, type CanvasWizardConfig } from "./canvas-wizard-model";
import { sampleCatalogId, sampleCatalogRows, sampleRecommendationId } from "./sample-catalog";
import { sampleSegmentByName, sampleSegments } from "./sample-segments";
import { deliverWebhook, webhookDeliveryCapability, type WebhookDeliveryResult } from "./webhook-delivery";
import { webhookRetryDelay } from "./webhook-retry";
import { normalizeWebhookVariants, redactHeaders, renderWebhookText, webhookPreviewUser, type WebhookVariant } from "./webhook-model";
import { normalizePreferenceCenterConfig, preferenceCenterDefaultConfig, type PreferenceCenterConfig } from "./preference-center-model";
import { CatalogValidationError, catalogFields, selectionMatches, selectCatalogRows, validateCatalogItem, validateCatalogName, validateFields, validateSelection, type CatalogField, type CatalogFilter, type CatalogSelectionInput } from "./catalog-model";

export type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
export type CampaignStatus = "Draft" | "Active" | "Stopped" | "Archived" | "Idle";
export type CampaignRecord = {
  id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number;
  edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config: Record<string, unknown>;
};
export type ResourceRecord = { id: string; type: string; name: string; status: string; description: string; updatedAt: string; data: Record<string, unknown> };
export type UserRecord = { id: string; email: string; firstName: string; country: string; lifecycle: string; subscribed: boolean; emailSubscriptionStatus: "opted_in" | "subscribed" | "unsubscribed"; reachable: boolean; attributes: Record<string, unknown>; globalControlGroup?: boolean };
export type CatalogSelectionRecord = {
  catalogId: string; name: string; description: string; filters: CatalogFilter[];
  randomSort: boolean; sortField: string; sortDirection: string; resultLimit: number; updatedAt: string;
};
export type RecommendationRecord = ResourceRecord & {
  data: { catalogId?: string; selectionName?: string; recommendationType?: string; trackingType?: string; propertyName?: string };
};
export type SubscriptionChannel = "Email" | "SMS" | "WhatsApp" | "LINE";
export type SubscriptionState = "subscribed" | "unsubscribed";
export type SubscriptionGroupRecord = {
  id: string; name: string; description: string; channel: SubscriptionChannel; status: "Active" | "Archived";
  createdAt: string; updatedAt: string; subscriberCount: number; capabilities?: {sms:boolean;mms:boolean;rcs:boolean};
};
export type SubscriptionMemberRecord = UserRecord & { state: SubscriptionState; updatedAt: string };
export type PreferenceCenterRecord = {
  id: string; name: string; description: string; groupIds: string[]; status: "Active" | "Draft" | "Archived"; updatedAt: string;
  config: PreferenceCenterConfig; version: number; publishedVersion: number | null;
};
export type PreferenceCenterEvent = { id: string; centerId: string; userId: string; eventType: "viewed" | "submitted" | "submission_failed"; createdAt: string; details: Record<string, unknown> };
export type PreferenceCenterVersion = { version: number; createdAt: string; name: string; status: PreferenceCenterRecord["status"] };

const databasePath = process.env.BRAZE_DATABASE_PATH ?? (process.env.VERCEL ? join(tmpdir(), "braze-local-demo", "braze-local.sqlite") : join(process.cwd(), ".data", "braze-local.sqlite"));
let database: DatabaseSync | undefined;

function now() { return new Date().toISOString(); }
export function messagePublicOrigin(){const host=process.env.VERCEL_PROJECT_PRODUCTION_URL??process.env.VERCEL_URL;return (process.env.BRAZE_PUBLIC_URL??(host?`https://${host}`:"http://localhost:3100")).replace(/\/$/,"");}
export function shortenMessageLink(url:string,campaignId:string,userId:string){
  if(!/^https?:\/\//i.test(url))throw new Error("Only HTTP and HTTPS links can be shortened.");
  const existing=listResources("message-links").find(r=>r.data.campaignId===campaignId&&r.data.userId===userId&&r.data.url===url);
  const record=existing??createResource({type:"message-links",name:"Message link",status:"Active",data:{campaignId,userId,url}});
  return `${messagePublicOrigin()}/api/message-links/${record.id}`;
}
export function followMessageLink(id:string){const resource=getResource(id);if(!resource||resource.type!=="message-links"||resource.status!=="Active")return null;const url=String(resource.data.url);if(!/^https?:\/\//i.test(url))return null;const campaign=getCampaign(String(resource.data.campaignId));if(campaign)db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"),campaign.id,campaign.channel,String(resource.data.userId),"clicked",now(),JSON.stringify({linkId:id,url}));return url;}
function uid(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`; }
function parseJson<T>(value: string | null | undefined, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }

function db() {
  if (database) return database;
  mkdirSync(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.function("campaign_random_bucket",{deterministic:true},value=>Math.floor(stableBucket(String(value))*100));
  database.function("campaign_flag_enabled",{deterministic:true},(flag,id,country,lifecycle,attributes)=>Number(evaluateFlag(parseJson(String(flag),{}),{id:String(id),country:String(country),lifecycle:String(lifecycle),attributes:parseJson(String(attributes),{})}).enabled));
  database.function("campaign_median",{deterministic:true},value=>{
    const numbers=parseJson<unknown[]>(String(value),[]).filter((item):item is number=>typeof item==="number"&&Number.isFinite(item)&&item>=0).sort((a,b)=>a-b);
    if(!numbers.length)return null;const middle=Math.floor(numbers.length/2);return numbers.length%2?numbers[middle]:(numbers[middle-1]+numbers[middle])/2;
  });
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
      status TEXT NOT NULL, updated_at TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
      published_version INTEGER
    );
    CREATE TABLE IF NOT EXISTS preference_center_versions (
      center_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
      config_json TEXT NOT NULL, created_at TEXT NOT NULL, group_ids_json TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '', PRIMARY KEY (center_id, version)
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
    CREATE TABLE IF NOT EXISTS canvas_pending_steps (
      run_id TEXT NOT NULL, user_id TEXT NOT NULL, next_node_id TEXT NOT NULL, due_at TEXT NOT NULL,
      PRIMARY KEY (run_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS canvas_entry_history (
      canvas_id TEXT NOT NULL, user_id TEXT NOT NULL, last_entered_at TEXT NOT NULL,
      PRIMARY KEY (canvas_id, user_id)
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
  if (!preferenceColumns.some(column => column.name === "published_version")) database.exec("ALTER TABLE preference_centers ADD COLUMN published_version INTEGER");
  const versionColumns = database.prepare("PRAGMA table_info(preference_center_versions)").all() as Array<{ name: string }>;
  if (!versionColumns.some(column => column.name === "group_ids_json")) {
    database.exec("ALTER TABLE preference_center_versions ADD COLUMN group_ids_json TEXT NOT NULL DEFAULT '[]'");
    database.exec("UPDATE preference_center_versions SET group_ids_json = (SELECT group_ids_json FROM preference_centers WHERE id = center_id) WHERE EXISTS (SELECT 1 FROM preference_centers WHERE id = center_id)");
  }
  if (!versionColumns.some(column => column.name === "description")) {
    database.exec("ALTER TABLE preference_center_versions ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    database.exec("UPDATE preference_center_versions SET description = (SELECT description FROM preference_centers WHERE id = center_id) WHERE EXISTS (SELECT 1 FROM preference_centers WHERE id = center_id)");
  }
  const userColumns = database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!userColumns.some(column => column.name === "email_subscription_status")) {
    database.exec("ALTER TABLE users ADD COLUMN email_subscription_status TEXT NOT NULL DEFAULT 'subscribed'");
    database.exec("UPDATE users SET email_subscription_status = CASE WHEN subscribed = 1 THEN 'subscribed' ELSE 'unsubscribed' END");
  }
  seed(database);
  database.prepare("UPDATE preference_centers SET config_json = ? WHERE config_json = '{}' OR config_json IS NULL").run(JSON.stringify(preferenceCenterDefaultConfig));
  database.exec("INSERT OR IGNORE INTO preference_center_versions (center_id, version, name, status, config_json, created_at, group_ids_json, description) SELECT id, version, name, status, config_json, updated_at, group_ids_json, description FROM preference_centers");
  database.exec("UPDATE preference_centers SET published_version = version WHERE status = 'Active' AND published_version IS NULL");
  seedSampleCatalog(database);
  initializeTags(database);
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
    { id: "cmp_sms_early_access", name: "Early Access", channel: "sms", status: "Draft", schedule: "One time", sent: 0, edited: created, body: "Thanks for being a loyal customer, {{${first_name} | default: 'aficionado'}}! Your reward for being so loyal? Early access to our limited edition sale: https://www.braze.com/", audience: "Loyal Customers", conversion: "Make Purchase", config: { subscriptionGroupId: "sg_sms_alerts", smsVariants: [{ id: "sms_variant_1", name: "Early Access", body: "Thanks for being a loyal customer, {{${first_name} | default: 'aficionado'}}! Your reward for being so loyal? Early access to our limited edition sale: https://www.braze.com/" }], channelValues: { messageType: "SMS", subscriptionGroup: "SMS alerts", linkShortening: true, appendStop: true } } },
  ];
  const insertCampaign = conn.prepare("INSERT OR IGNORE INTO campaigns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
  for (const campaign of campaigns) insertCampaign.run(campaign.id, campaign.name, campaign.channel, campaign.status, campaign.schedule, campaign.sent, campaign.edited, campaign.subject ?? null, campaign.body ?? null, campaign.audience ?? null, campaign.conversion ?? null, JSON.stringify(campaign.config));
  if (existing.count) { seedSampleSegments(conn, created); seedCatalogItems(conn); seedSubscriptionGroups(conn); return; }
  const insertUser = conn.prepare("INSERT INTO users (id, email, first_name, country, lifecycle, subscribed, reachable, attributes_json, email_subscription_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const countries = ["US", "GB", "CN", "SG", "DE"];
  for (let index = 1; index <= 1000; index += 1) {
    const lifecycle = index % 5 === 0 ? "New Users" : index % 3 === 0 ? "Recent Purchasers" : "All Users";
    insertUser.run(`user_${index}`, `user${index}@example.test`, `Customer ${index}`, countries[index % countries.length], lifecycle, index % 11 ? 1 : 0, index % 13 ? 1 : 0, JSON.stringify({ language: index % 4 === 0 ? "zh" : "en", plan: index % 2 ? "pro" : "free" }), index % 11 ? "subscribed" : "unsubscribed");
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
  conn.prepare("INSERT INTO preference_centers (id, name, description, group_ids_json, status, updated_at, config_json, version, published_version) VALUES (?, ?, ?, ?, 'Active', ?, ?, 1, 1)").run(
    "pc_marketing_preferences", "Marketing preferences", "Let users choose the email updates they want to receive.",
    JSON.stringify(["sg_product_updates", "sg_promotions"]), timestamp, JSON.stringify(preferenceCenterDefaultConfig),
  );
  conn.prepare("INSERT OR IGNORE INTO preference_center_versions (center_id, version, name, status, config_json, created_at, group_ids_json, description) VALUES (?, 1, ?, 'Active', ?, ?, ?, ?)").run(
    "pc_marketing_preferences", "Marketing preferences", JSON.stringify(preferenceCenterDefaultConfig), timestamp, JSON.stringify(["sg_product_updates", "sg_promotions"]), "Let users choose the email updates they want to receive.",
  );
}

function stableCampaignIdentifier(id:string){const hex=createHash("sha256").update(`braze-local-campaign:${id}`).digest("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-${((parseInt(hex[16],16)&3)|8).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`;}
function mapCampaign(row: Record<string, unknown>): CampaignRecord {
  const config=parseJson<Record<string,unknown>>(String(row.config_json??"{}"),{}),first=db().prepare("SELECT min(created_at) AS created FROM audit_log WHERE entity_type='campaign' AND entity_id=? AND action='created'").get(String(row.id)) as {created:string|null};
  return { id: String(row.id), name: String(row.name), channel: row.channel as Channel, status: row.status as CampaignStatus, schedule: String(row.schedule), sent: Number(row.sent), edited: String(row.edited_at), subject: row.subject ? String(row.subject) : undefined, body: row.body ? String(row.body) : undefined, audience: row.audience ? String(row.audience) : undefined, conversion: row.conversion_event ? String(row.conversion_event) : undefined, config:{...config,apiIdentifier:config.apiIdentifier??stableCampaignIdentifier(String(row.id)),createdAt:config.createdAt??first.created??String(row.edited_at),createdBy:config.createdBy??"Local user",lastEditedBy:config.lastEditedBy??"Local user",workspaceId:config.workspaceId??"local"} };
}

export function listCampaigns(input: { q?: string; status?: string; limit?: number; offset?: number; sort?: string; includeArchived?:boolean; workspaceId?:string } = {}) {
  const conn=db(),clauses:string[]=["COALESCE(json_extract(config_json,'$.workspaceId'),'local') = ?"],values:(string|number)[]=[input.workspaceId??"local"];
  if(input.status==="Archived")clauses.push("(archived_at IS NOT NULL OR status='Archived')");else if(!input.includeArchived)clauses.push("archived_at IS NULL AND status != 'Archived'");
  if(input.q){clauses.push("lower(name) LIKE lower(?)");values.push(`%${input.q}%`);}
  if(input.status&&!["All","Archived"].includes(input.status)){clauses.push("status = ?");values.push(input.status);}
  const order=input.sort==="name"?"name COLLATE NOCASE ASC":"edited_at DESC",where=clauses.join(" AND ");
  const count=conn.prepare(`SELECT count(*) AS count FROM campaigns WHERE ${where}`).get(...values) as {count:number};
  const limit=Math.min(Math.max(input.limit??12,1),1000),offset=Math.max(input.offset??0,0);
  const rows=conn.prepare(`SELECT * FROM campaigns WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values,limit,offset) as Record<string,unknown>[];
  return {data:rows.map(mapCampaign),total:count.count,limit,offset};
}
export function getCampaign(id:string){const row=db().prepare("SELECT * FROM campaigns WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?mapCampaign(row):null;}
function campaignAuditSnapshot(campaign:CampaignRecord|null){
 if(!campaign)return null;
 const redact=(value:unknown,key=""):unknown=>{if(/authorization|password|api.?key|secret|bearer|token|base64|content$/i.test(key))return "[redacted]";if(Array.isArray(value))return value.map(v=>redact(v));if(value&&typeof value==="object"&&"key" in value&&/authorization|password|api.?key|secret|bearer|token/i.test(String((value as Record<string,unknown>).key)))return{...(value as object),value:"[redacted]"};if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v,k)]));return typeof value==="string"&&value.length>2000?`${value.slice(0,2000)}…`:value;};
 return redact({name:campaign.name,channel:campaign.channel,status:campaign.status,schedule:campaign.schedule,audience:campaign.audience,subject:campaign.subject,body:campaign.body,conversion:campaign.conversion,config:campaign.config});
}
export function upsertCampaign(input:Partial<CampaignRecord>&Pick<CampaignRecord,"id"|"name"|"channel">){
 const conn=db(),current=getCampaign(input.id);
 if(current?.status==="Archived"&&input.status!==undefined&&input.status!=="Archived")throw new Error("Archived Campaigns cannot be restored by saving an editor snapshot. Copy to a new Draft instead.");
 if(input.status!==undefined&&!["Draft","Active","Stopped","Archived","Idle"].includes(input.status))throw new Error("Choose a valid Campaign status.");
 if(current&&(current.status==="Active"||Boolean(conn.prepare("SELECT id FROM execution_runs WHERE campaign_id=? LIMIT 1").get(current.id)))&&(input.conversion!==undefined&&input.conversion!==current.conversion||input.config!==undefined&&Object.hasOwn(input.config,"conversionEvents")&&JSON.stringify(input.config.conversionEvents??[])!==JSON.stringify(current.config.conversionEvents??[])))throw new Error("Conversion events cannot be changed after a Campaign has launched.");
 const timestamp=now(),record:CampaignRecord={id:input.id,name:input.name,channel:input.channel,status:input.status??current?.status??"Draft",schedule:input.schedule??current?.schedule??"One time",sent:input.sent??current?.sent??0,edited:timestamp,subject:input.subject??current?.subject,body:input.body??current?.body,audience:input.audience??current?.audience??"All Users",conversion:input.conversion??current?.conversion??"Start Session",config:{...current?.config,...input.config,apiIdentifier:current?.config.apiIdentifier??(typeof input.config?.apiIdentifier==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.config.apiIdentifier)?input.config.apiIdentifier:crypto.randomUUID()),createdAt:current?.config.createdAt??timestamp,createdBy:current?.config.createdBy??"Local user",lastEditedBy:"Local user",workspaceId:current?.config.workspaceId??input.config?.workspaceId??"local"}};
 if(record.channel==="email"){const preferences=getEmailPreferences().data;if(!current)record.config={...emailPreferenceCampaignDefaults(preferences),...record.config};const issues=emailVariantSendingIssues(record,preferences);if(issues.length)throw new Error(issues.join(" "));}
 record.config={...record.config,tags:assignTags(conn,record.config.tags,"campaign")};
 conn.prepare(`INSERT INTO campaigns (id,name,channel,status,schedule,sent,edited_at,subject,body,audience,conversion_event,config_json,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,channel=excluded.channel,status=excluded.status,schedule=excluded.schedule,sent=excluded.sent,edited_at=excluded.edited_at,subject=excluded.subject,body=excluded.body,audience=excluded.audience,conversion_event=excluded.conversion_event,config_json=excluded.config_json,archived_at=CASE WHEN excluded.status='Archived' THEN COALESCE(campaigns.archived_at,excluded.archived_at) ELSE campaigns.archived_at END`).run(record.id,record.name,record.channel,record.status,record.schedule,record.sent,record.edited,record.subject??null,record.body??null,record.audience??null,record.conversion??null,JSON.stringify(record.config),record.status==="Archived"?timestamp:null);
 if(record.channel==="email")syncEmailLinkAliases(record);
 audit("campaign",record.id,current?"updated":"created",{channel:record.channel,user:"Local user",category:"Campaign settings",before:campaignAuditSnapshot(current),after:campaignAuditSnapshot(record)});return record;
}
export function archiveCampaign(id:string){const current=getCampaign(id);if(!current)throw new Error("Campaign not found.");const timestamp=now();db().prepare("UPDATE campaigns SET archived_at=?,status='Archived',edited_at=? WHERE id=?").run(timestamp,timestamp,id);audit("campaign",id,"archived",{user:"Local user",category:"Status",before:{status:current.status},after:{status:"Archived"}});return getCampaign(id);}
export function stopCampaign(id:string){const current=getCampaign(id);if(!current)throw new Error("Campaign not found.");if(current.status==="Archived")throw new Error("Archived Campaigns cannot be stopped.");db().prepare("UPDATE campaigns SET status='Stopped',edited_at=? WHERE id=?").run(now(),id);audit("campaign",id,"stopped",{user:"Local user",category:"Status",before:{status:current.status},after:{status:"Stopped"}});return getCampaign(id);}

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
    const columns: Record<string, string> = { country: "u.country", lifecycle: "u.lifecycle", email: "u.email" };
    if (filter.field === "subscribed") { clauses.push(operator === "not_equals" ? "u.subscribed != ?" : "u.subscribed = ?"); values.push(String(filter.value) === "true" ? 1 : 0); }
    else if (columns[filter.field] || filter.field.startsWith("attr:")) {
      const expression = columns[filter.field] ?? "CAST(json_extract(u.attributes_json, ?) AS TEXT)";
      if (!columns[filter.field]) values.push(`$.${JSON.stringify(filter.field.slice(5))}`);
      clauses.push(operator === "contains" ? `instr(lower(COALESCE(${expression}, '')), lower(?)) > 0` : `lower(COALESCE(${expression}, '')) ${operator === "not_equals" ? "!=" : "="} lower(?)`);
      values.push(filter.value);
    }
  }
  return { clauses, values };
}

export function savedSegmentFilters(name?: string | null): AudienceFilter[] {
  if (!name) return [];
  const saved = listResources("segments").find(row => row.name.toLowerCase() === name.toLowerCase());
  const data = (saved?.data ?? {}) as Record<string, unknown>;
  return (Array.isArray(data.filters) ? data.filters : []) as AudienceFilter[];
}

function subscriptionGroupForChannel(groupId: string | undefined, channel: Channel) {
  if (!groupId) return null;
  const group = getSubscriptionGroup(groupId);
  const expected = channel === "email" ? "Email" : channel === "sms" ? "SMS" : channel === "whatsapp" ? "WhatsApp" : channel === "line" ? "LINE" : null;
  if (!group || group.status !== "Active" || group.channel !== expected) throw new Error("Select an active subscription group for this channel.");
  return group;
}

function subscriptionCondition(channel: Channel, eligibility: string, groupId?: string) {
  if (channel === "email") {
    const status = eligibility === "opted-in" ? "u.email_subscription_status = 'opted_in'" : "u.email_subscription_status != 'unsubscribed'";
    return `${status}${groupId ? " AND m.state = 'subscribed'" : ""}`;
  }
  if (channel === "sms" || channel === "whatsapp" || channel === "line") return groupId ? "m.state = 'subscribed'" : "0 = 1";
  return "1 = 1";
}

function globalControlRecord() {
  const records = listResources("global-control-group");
  return records.find(record => record.id === "workspace_global_control") ?? records[0];
}

function globalControlSettings() {
  const record = globalControlRecord();
  return normalizeGlobalControl(record?.data, record ? `legacy:${record.id}` : undefined);
}

function userGlobalCohort(userId: string, settings: GlobalControlSettings) {
  const bucket = createHash("sha256").update(`${settings.seed}:${userId}`).digest().readUInt32BE(0) / 0x100000000;
  return globalControlCohort(settings, bucket);
}

function heldByGlobalControl(userId: string, settings: GlobalControlSettings, tags: unknown, channel?: string) {
  return !hasGlobalControlExemption(settings, tags, channel) && userGlobalCohort(userId, settings) === "control";
}

function activeEngagementTags() {
  const campaigns = (db().prepare("SELECT * FROM campaigns WHERE status = 'Active' AND archived_at IS NULL").all() as Record<string, unknown>[]).map(mapCampaign);
  const tags = campaigns.flatMap(campaign => Array.isArray(campaign.config.tags) ? campaign.config.tags.filter((tag): tag is string => typeof tag === "string") : []);
  tags.push(...listResources("canvas").filter(canvas => canvas.status === "Active").flatMap(canvas => Array.isArray(canvas.data.tags) ? canvas.data.tags.filter((tag): tag is string => typeof tag === "string") : []));
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
}

export function getGlobalControlSnapshot(): GlobalControlSnapshot {
  const record = globalControlRecord();
  const settings = normalizeGlobalControl(record?.data, record ? `legacy:${record.id}` : undefined);
  const users = db().prepare("SELECT id FROM users").all() as { id: string }[];
  let control = 0; let sample = 0;
  for (const user of users) {
    const cohort = userGlobalCohort(user.id, settings);
    if (cohort === "control") control++;
    if (cohort === "sample") sample++;
  }
  const { seed: _seed, ...publicSettings } = settings;
  return { settings: publicSettings, counts: { total: users.length, control, treatment: users.length - control, sample }, availableTags: activeEngagementTags(), updatedAt: record?.updatedAt ?? null };
}

export function saveGlobalControl(command: unknown, expectedUpdatedAt: unknown) {
  validateGlobalControlCommand(command);
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const record = globalControlRecord();
    if ((record?.updatedAt ?? null) !== expectedUpdatedAt) throw new Error("Global Control Group changed in another tab. Reload before saving.");
    const current = normalizeGlobalControl(record?.data, record ? `legacy:${record.id}` : undefined);
    let settings = { ...current };
    if (command.action === "enable") {
      if (current.enabled) throw new Error("Disable the current Global Control Group before changing its percentage.");
      settings = { ...current, enabled: true, percentage: command.percentage, seed: randomBytes(24).toString("hex"), enabledAt: now() };
    } else if (command.action === "disable") {
      settings = { ...current, enabled: false, percentage: null, seed: null, enabledAt: null };
    } else {
      const available = new Set([...activeEngagementTags(), ...current.exclusionTags]);
      const tags = [...new Set(command.exclusionTags.map(tag => tag.trim()))];
      if (tags.some(tag => !available.has(tag))) throw new Error("Exclusion tags must be applied to an active campaign or Canvas first.");
      settings.exclusionTags = tags;
    }
    // A monotonic revision prevents two same-millisecond updates sharing a token.
    const updatedAt = new Date(Math.max(Date.now(), new Date(record?.updatedAt ?? 0).getTime() + 1)).toISOString();
    conn.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, data_json=excluded.data_json")
      .run("workspace_global_control", "global-control-group", "Global Control Group", settings.enabled ? "Active" : "Draft", "Workspace Global Control Group", updatedAt, JSON.stringify(settings));
    audit("global_control_group", "workspace_global_control", command.action, { percentage: settings.percentage, exclusionTags: settings.exclusionTags });
    conn.exec("COMMIT");
    return getGlobalControlSnapshot();
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}

export function exportGlobalControlMembers() {
  const settings = globalControlSettings();
  if (!settings.enabled) throw new Error("Enable a Global Control Group before exporting members.");
  return (db().prepare("SELECT id FROM users ORDER BY id").all() as { id: string }[]).filter(user => userGlobalCohort(user.id, settings) === "control").map(user => user.id);
}

export function globalControlReport(days = 30) {
  const snapshot = getGlobalControlSnapshot();
  const settings = globalControlSettings();
  const deliveries = { control: 0, treatment: 0, sample: 0 };
  if (settings.enabled) {
    const since = new Date(Date.now() - Math.max(1, Math.min(365, Number.isFinite(days) ? days : 30)) * 86400000).toISOString();
    const rows = db().prepare("SELECT json_extract(data_json, '$.globalControlCohort') AS cohort, count(*) AS count FROM message_events WHERE event_type = 'delivered' AND created_at >= ? AND json_extract(data_json, '$.globalControlGeneration') = ? GROUP BY cohort").all(since, settings.seed) as Array<{ cohort: string; count: number }>;
    for (const row of rows) {
      if (row.cohort === "control") deliveries.control = row.count;
      else { deliveries.treatment += row.count; if (row.cohort === "sample") deliveries.sample = row.count; }
    }
  }
  return { ...snapshot, deliveries };
}

export function estimateAudience(audience = "All Users", country?: string, excludeCountry?: string, eligibility = "subscribed", subscriptionGroupId?: string, filters: AudienceFilter[] = [], channel: Channel = "email", engagement?: { tags?: unknown }) {
  subscriptionGroupForChannel(subscriptionGroupId, channel);
  const audienceRule = audienceCondition(audience);
  const clauses: string[] = audienceRule.sql === "1 = 1" ? [] : [audienceRule.sql];
  const values: (string | number)[] = [...audienceRule.values];
  const filterClauses = audienceFilterClauses(filters);
  clauses.push(...filterClauses.clauses);
  values.push(...filterClauses.values);
  if (country && ["US", "GB", "CN", "SG", "DE"].includes(country)) { clauses.push("u.country = ?"); values.push(country); }
  if (excludeCountry && ["US", "GB", "CN", "SG", "DE"].includes(excludeCountry)) { clauses.push("u.country != ?"); values.push(excludeCountry); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const eligible = `u.reachable = 1 AND ${subscriptionCondition(channel, eligibility, subscriptionGroupId)}`;
  const membership = subscriptionGroupId ? "LEFT JOIN subscription_group_memberships m ON m.user_id = u.id AND m.group_id = ?" : "";
  const result = db().prepare(`SELECT count(*) AS matching, sum(CASE WHEN ${eligible} THEN 1 ELSE 0 END) AS reachable FROM users u ${membership} ${where}`).get(...(subscriptionGroupId ? [subscriptionGroupId] : []), ...values) as { matching: number; reachable: number | null };
  const workspace = db().prepare("SELECT count(*) AS total FROM users").get() as { total: number };
  const settings = globalControlSettings();
  const excluded = engagement && settings.enabled ? (db().prepare(`SELECT u.id FROM users u ${membership} ${where}${where ? " AND" : "WHERE"} ${eligible}`).all(...(subscriptionGroupId ? [subscriptionGroupId] : []), ...values) as { id: string }[]).filter(user => heldByGlobalControl(user.id, settings, engagement.tags, channel)).length : 0;
  return { matching: result.matching, reachable: (result.reachable ?? 0) - excluded, total: workspace.total, globalControlExcluded: excluded };
}

function configuredAudienceRuleSQL(rule:{field:string;operator:string;value:string},values:(string|number)[]){
 const columns:Record<string,string>={id:"u.id",country:"u.country",lifecycle:"u.lifecycle",email:"u.email",first_name:"u.first_name",subscribed:"u.subscribed",reachable:"u.reachable",emailSubscriptionStatus:"u.email_subscription_status",created_at:"COALESCE(json_extract(u.attributes_json,'$.created_at'),(SELECT min(a.created_at) FROM audit_log a WHERE a.entity_type='user' AND a.entity_id=u.id AND a.action IN ('created','imported')))"};
 let expression=columns[rule.field];
 if(rule.field==="random_bucket")expression="campaign_random_bucket(u.id)";
 if(rule.field==="created_from")expression="COALESCE(json_extract(u.attributes_json,'$.created_from'),CASE (SELECT action FROM audit_log a WHERE a.entity_type='user' AND a.entity_id=u.id AND a.action IN ('created','imported') ORDER BY a.created_at LIMIT 1) WHEN 'imported' THEN 'Import' WHEN 'created' THEN 'API' END)";
 if(rule.field==="pending_deletion")expression="COALESCE(json_extract(u.attributes_json,'$.pending_deletion'),0)";
 if(rule.field==="first_session_at"||rule.field==="last_session_at")expression=`(SELECT ${rule.field==="first_session_at"?"min":"max"}(COALESCE(json_extract(e.data_json,'$.createdAt'),e.updated_at)) FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name IN ('session_start','Start Session'))`;
 if(rule.field==="median_session_duration_seconds")expression="(SELECT campaign_median(json_group_array(COALESCE(json_extract(e.data_json,'$.properties.session_duration_seconds'),json_extract(e.data_json,'$.properties.duration_seconds'),json_extract(e.data_json,'$.properties.duration_ms')/1000.0))) FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name IN ('session_start','Start Session'))";

 if(rule.field==="age")expression="CAST(strftime('%Y','now')-strftime('%Y',json_extract(u.attributes_json,'$.dob'))-(strftime('%m-%d','now')<strftime('%m-%d',json_extract(u.attributes_json,'$.dob'))) AS INTEGER)";
 if(rule.field==="phone_unformatted")expression="replace(replace(replace(replace(replace(replace(COALESCE(json_extract(u.attributes_json,'$.phone'),json_extract(u.attributes_json,'$.phone_number')),'+',''),' ',''),'-',''),'(',''),')',''),'.','')";
 if(rule.field==="email_available")expression="CASE WHEN instr(u.email,'@')>1 AND instr(substr(u.email,instr(u.email,'@')+1),'.')>1 THEN 1 ELSE 0 END";
 if(rule.field==="location_available")expression="CASE WHEN json_type(u.attributes_json,'$.location')='object' OR (json_extract(u.attributes_json,'$.latitude') IS NOT NULL AND json_extract(u.attributes_json,'$.longitude') IS NOT NULL) THEN 1 ELSE 0 END";
 if(["ecommerce_order_count","ecommerce_revenue","ecommerce_refund_total"].includes(rule.field))expression=`(SELECT ${rule.field==="ecommerce_order_count"?"count(*)":"COALESCE(sum(COALESCE(json_extract(e.data_json,'$.properties.total_price'),json_extract(e.data_json,'$.properties.total'),json_extract(e.data_json,'$.properties.revenue'),json_extract(e.data_json,'$.price')*COALESCE(json_extract(e.data_json,'$.quantity'),1),0)),0)"} FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name='${rule.field==="ecommerce_refund_total"?"ecommerce.order_refunded":"ecommerce.order_placed"}')`;
 if(rule.field.startsWith("subscription_group:")){const id=rule.field.slice(19);if(!getSubscriptionGroup(id))throw new Error("Choose an available subscription group.");expression="(SELECT m.state FROM subscription_group_memberships m WHERE m.user_id=u.id AND m.group_id=?)";values.push(id);}
 if(["last_received_message_at","last_engaged_message_at","last_control_at"].includes(rule.field))expression=`(SELECT max(e.created_at) FROM message_events e WHERE e.user_id=u.id AND e.event_type IN (${rule.field==="last_received_message_at"?"'delivered'":rule.field==="last_control_at"?"'control','global_control'":"'clicked','opened'"}) AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1)`;
 if(rule.field.startsWith("receipt_channel_last:")){const channel=rule.field.slice(21);if(!["email","push","iam","sms","webhook","whatsapp"].includes(channel))throw new Error("Choose a supported receipt channel.");expression="(SELECT max(e.created_at) FROM message_events e WHERE e.user_id=u.id AND e.channel=? AND e.event_type='delivered' AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1)";values.push(channel);}
 if(["receipt_count:","receipt_last:"].some(prefix=>rule.field.startsWith(prefix))){const [kind,event,...idParts]=rule.field.split(":"),id=idParts.join(":");if(!["delivered","conversion","control","engaged"].includes(event)||!getCampaign(id))throw new Error("Choose an available Campaign and receipt.");expression=`(SELECT ${kind==="receipt_last"?"max(e.created_at)":"count(*)"} FROM message_events e WHERE e.user_id=u.id AND e.campaign_id=? AND ${event==="engaged"?"e.event_type IN ('opened','clicked')":"e.event_type=?"} AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1)`;values.push(id);if(event!=="engaged")values.push(event);}
 if(rule.field.startsWith("receipt_variant:")){const [,id,...variantParts]=rule.field.split(":"),variant=variantParts.join(":");if(!getCampaign(id)||!variant)throw new Error("Choose an available Campaign variant.");expression="(SELECT count(*) FROM message_events e WHERE e.user_id=u.id AND e.campaign_id=? AND e.event_type='delivered' AND COALESCE(json_extract(e.data_json,'$.variantId'),json_extract(e.data_json,'$.attributes.variantId'))=? AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1)";values.push(id,variant);}
 if(rule.field==="never_received_message")expression="CASE WHEN EXISTS (SELECT 1 FROM message_events e WHERE e.user_id=u.id AND e.event_type='delivered' AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1) THEN 0 ELSE 1 END";
 if(rule.field.startsWith("receipt_alias:")){expression="(SELECT count(*) FROM message_events e WHERE e.user_id=u.id AND e.event_type='clicked' AND COALESCE(json_extract(e.data_json,'$.alias'),json_extract(e.data_json,'$.attributes.alias'))=? AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1)";values.push(rule.field.slice(14));}
 if(rule.field.startsWith("feature_enabled:")){const flagId=rule.field.slice(16),flag=listResources("feature-flags").find(flag=>flag.data.flagId===flagId&&flag.status!=="Archived");if(!flag)throw new Error("Choose an available feature flag.");expression="COALESCE((SELECT json_extract(e.data_json,'$.enabled') FROM resources e JOIN campaigns c ON c.id=json_extract(e.data_json,'$.campaignId') WHERE e.type='feature-assignments' AND e.status='Active' AND c.status='Active' AND c.archived_at IS NULL AND json_extract(e.data_json,'$.userId')=u.id AND json_extract(e.data_json,'$.flagId')=? ORDER BY e.updated_at DESC LIMIT 1),campaign_flag_enabled(?,u.id,u.country,u.lifecycle,u.attributes_json))";values.push(flagId,JSON.stringify(flag.data));}
 if(rule.field.startsWith("session_app_count:")||rule.field.startsWith("session_app_first:")||rule.field.startsWith("session_app_last:")){const [kind,...parts]=rule.field.split(":"),id=parts.join(":");if(!getResource(id)||getResource(id)?.type!=="app-settings")throw new Error("Choose an available app.");expression=`(SELECT ${kind==="session_app_count"?"count(*)":kind==="session_app_first"?"min(COALESCE(json_extract(e.data_json,'$.createdAt'),e.updated_at))":"max(COALESCE(json_extract(e.data_json,'$.createdAt'),e.updated_at))"} FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name IN ('session_start','Start Session') AND COALESCE(json_extract(e.data_json,'$.properties.appId'),json_extract(e.data_json,'$.properties.app_id'))=?)`;values.push(id);}
 if(rule.field.startsWith("session_recent:")){const days=Number(rule.field.slice(15));if(!Number.isInteger(days)||days<1||days>30)throw new Error("Choose between 1 and 30 days for session history.");expression="(SELECT count(*) FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name IN ('session_start','Start Session') AND julianday(COALESCE(json_extract(e.data_json,'$.createdAt'),e.updated_at)) BETWEEN julianday('now',?) AND julianday('now'))";values.push(`-${days} days`);}

 if(rule.field==="session_count")expression="(SELECT count(*) FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name IN ('session_start','Start Session'))";
 else if(rule.field.startsWith("event_count:")&&rule.field.slice(12)){expression="(SELECT count(*) FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND e.name=?)";values.push(rule.field.slice(12));}
 else if(["purchase_count","purchase_total"].includes(rule.field))expression=`(SELECT ${rule.field==="purchase_count"?"count(*)":"COALESCE(sum(COALESCE(json_extract(e.data_json,'$.price'),0)*COALESCE(json_extract(e.data_json,'$.quantity'),1)),0)"} FROM resources e WHERE e.type='user-events' AND json_extract(e.data_json,'$.userId')=u.id AND (json_extract(e.data_json,'$.productId') IS NOT NULL OR e.name='purchase'))`;
 else if(rule.field.startsWith("campaign_interaction:")){const kind=rule.field.slice(21);if(!["opened","clicked","delivered","conversion","control"].includes(kind))throw new Error("Choose a supported Campaign interaction.");expression="(SELECT count(*) FROM message_events e WHERE e.user_id=u.id AND e.event_type=? AND COALESCE(json_extract(e.data_json,'$.test'),json_extract(e.data_json,'$.attributes.test'),0)!=1 AND COALESCE(json_extract(e.data_json,'$.simulated'),json_extract(e.data_json,'$.attributes.simulated'),0)!=1)";values.push(kind);}
 else if(rule.field.startsWith("segment:")){const name=rule.field.slice(8);if(!sampleSegmentByName(name)&&!listResources("segments").some(r=>r.name===name))throw new Error(`Unknown audience segment: ${name}.`);const base=audienceCondition(name),extra=audienceFilterClauses(savedSegmentFilters(name));expression=`CASE WHEN ${[base.sql,...extra.clauses].join(" AND ")} THEN 1 ELSE 0 END`;values.push(...base.values,...extra.values);}
 if(!expression){if(!rule.field.startsWith("attr:")||!rule.field.slice(5))throw new Error("Choose a supported audience filter field.");expression="json_extract(u.attributes_json, ?)";values.push(`$.${JSON.stringify(rule.field.slice(5))}`);}
 if(rule.operator==="exists"||rule.operator==="not_exists")return `${rule.operator==="not_exists"?"NOT ":""}(COALESCE(${expression},'')!='')`;
 if(rule.operator==="greater_than"||rule.operator==="less_than"){
  if(campaignAudienceFieldKind(rule.field)==="date"){if(!Number.isFinite(new Date(rule.value).getTime()))throw new Error("Enter a valid date for the created-at filter.");values.push(rule.value);return `julianday(${expression}) ${rule.operator==="greater_than"?">":"<"} julianday(?)`;}
  const n=Number(rule.value);if(!Number.isFinite(n))throw new Error("Enter a numeric audience filter value.");values.push(n);return `CAST(${expression} AS REAL) ${rule.operator==="greater_than"?">":"<"} ?`;
 }
 if(["equals","not_equals"].includes(rule.operator)&&campaignAudienceFieldKind(rule.field)==="date"){if(!Number.isFinite(Date.parse(rule.value)))throw new Error("Enter a valid date for the audience filter.");values.push(rule.value);return `date(${expression}) ${rule.operator==="not_equals"?"!=":"="} date(?)`;}
 if(["equals","not_equals"].includes(rule.operator)&&campaignAudienceFieldKind(rule.field)==="number"){const number=Number(rule.value);if(!rule.value.trim()||!Number.isFinite(number))throw new Error("Enter a numeric audience filter value.");values.push(number);return `${expression} ${rule.operator==="not_equals"?"!=":"="} ?`;}
 const boolean=campaignAudienceFieldKind(rule.field)==="boolean";if(boolean&&["equals","not_equals"].includes(rule.operator)){values.push(["true","1"].includes(rule.value.toLowerCase())?1:0);return `CASE lower(CAST(${expression} AS TEXT)) WHEN 'true' THEN 1 WHEN '1' THEN 1 WHEN '1.0' THEN 1 WHEN 'false' THEN 0 WHEN '0' THEN 0 WHEN '0.0' THEN 0 END ${rule.operator==="not_equals"?"!=":"="} ?`;}
 const value=rule.value;values.push(value);
 if(rule.operator==="contains"||rule.operator==="not_contains")return `instr(lower(COALESCE(${expression},'')),lower(?)) ${rule.operator==="contains"?">":"="} 0`;
 return `lower(CAST(COALESCE(${expression},'') AS TEXT)) ${rule.operator==="not_equals"?"!=":"="} lower(?)`;
}
function configuredAudienceSQL(campaign: MessageDraft) {
  const config=campaign.config??{},issues=campaignAudienceIssues(campaign);if(issues.length)throw new Error(issues.join(" "));
  const clauses:string[]=[],values:(string|number)[]=[];
  const names=Array.isArray(config.audienceSegments)?config.audienceSegments as string[]:[campaign.audience??"All Users"];
  const segments=names.filter(name=>name!=="All Users").map(name=>{
    if(!sampleSegmentByName(name)&&!listResources("segments").some(row=>row.name===name))throw new Error(`Unknown audience segment: ${name}.`);
    const base=audienceCondition(name),extra=audienceFilterClauses(savedSegmentFilters(name));values.push(...base.values,...extra.values);return `(${[base.sql,...extra.clauses].join(" AND ")})`;
  });
  if(segments.length)clauses.push(`(${segments.join(config.audienceSegmentOperator==="OR"?" OR ":" AND ")})`);
  for(const group of (config.audienceGroups??[]) as AudienceGroup[]){
    const rules=group.rules.map(rule=>configuredAudienceRuleSQL(rule,values));
    clauses.push(`${group.exclude?"NOT ":""}(${rules.join(group.operator==="OR"?" OR ":" AND ")})`);
  }
  if(!Array.isArray(config.audienceGroups)){if(config.audienceCountry){clauses.push("u.country = ?");values.push(String(config.audienceCountry));}if(config.audienceExcludeCountry){clauses.push("u.country != ?");values.push(String(config.audienceExcludeCountry));}}
  return {sql:clauses.length?clauses.join(" AND "):"1 = 1",values};
}
export function estimateConfiguredAudience(campaign: MessageDraft,lookup?:string){
  const query=configuredAudienceSQL(campaign),channel=campaign.channel as Channel,groupId=String(campaign.config?.subscriptionGroupId??"");subscriptionGroupForChannel(groupId,channel);
  const membership=groupId?"LEFT JOIN subscription_group_memberships m ON m.user_id=u.id AND m.group_id=?":"",parameters=groupId?[groupId,...query.values]:query.values;
  const rows=db().prepare(`SELECT u.*,${groupId?"m.state":"NULL"} AS subscription_state FROM users u ${membership} WHERE ${query.sql}`).all(...parameters) as Record<string,unknown>[];
  const settings=globalControlSettings(),suppressions=listResources("suppression-lists").map(r=>r.name.toLowerCase().replace(/^@/,""));
  const reasons=(row:Record<string,unknown>)=>{
    const result:string[]=[];if(!row.reachable)result.push("No reachable channel");
    if(channel==="email"&&(row.email_subscription_status==="unsubscribed"||campaign.config?.subscribeEligibility==="opted-in"&&row.email_subscription_status!=="opted_in"))result.push("Email subscription status");
    if(groupId&&row.subscription_state!=="subscribed"||["sms","whatsapp","line"].includes(channel)&&!groupId)result.push("Not subscribed to the selected subscription group");
    if(heldByGlobalControl(String(row.id),settings,campaign.config?.tags,channel))result.push("Global Control Group");
    const email=String(row.email).toLowerCase();if(suppressions.some(s=>email===s||email.endsWith(`@${s}`)))result.push("Suppression list");return result;
  };
  const lookupRow=lookup?db().prepare("SELECT * FROM users WHERE id=? OR lower(email)=lower(?) OR json_extract(attributes_json,'$.external_id')=? OR json_extract(attributes_json,'$.external_user_id')=? OR json_extract(attributes_json,'$.braze_id')=? LIMIT 1").get(lookup,lookup,lookup,lookup,lookup) as Record<string,unknown>|undefined:undefined;
  const user=lookupRow?mapUser(lookupRow):null,match=user?rows.find(r=>r.id===user.id):null;
  const lookupReasons=user?match?reasons(match):["Does not match the current segments and filters"]:["User not found"];
  const matchedIds=new Set(rows.map(row=>String(row.id))),purchases=listResources("user-events").filter(event=>matchedIds.has(String(event.data.userId))&&(Boolean(event.data.productId)||event.name==="purchase")),currencies=[...new Set(purchases.map(event=>String(event.data.currency??"USD")))];
  const ltv=purchases.length&&currencies.length===1?purchases.reduce((sum,event)=>sum+Number(event.data.price??0)*Number(event.data.quantity??1),0):null;
  return {ltv,ltvCurrency:currencies.length===1?currencies[0]:null,calculatedAt:now(),matching:rows.length,reachable:rows.filter(r=>!reasons(r).length).length,total:(db().prepare("SELECT count(*) AS n FROM users").get() as {n:number}).n,globalControlExcluded:rows.filter(r=>heldByGlobalControl(String(r.id),settings,campaign.config?.tags,channel)).length,...(lookup?{lookup:{exists:Boolean(user),matchesFilters:Boolean(match),eligible:Boolean(match&&!lookupReasons.length),reasons:lookupReasons}}:{})};
}
export function calculateCampaignAudienceStatistics(campaign:MessageDraft){
 const result=estimateConfiguredAudience(campaign),values=objectValue(campaign.config?.channelValues),children=objectValue(campaign.config?.multichannelMessages),channels:Record<string,string>={...multichannelChannels,SMS:"sms"};
 const targets=["multichannel","operator"].includes(campaign.channel)&&Array.isArray(values.channels)?values.channels.map(label=>channels[String(label)]).filter(Boolean):[campaign.channel];
 const channelBreakdown=[...new Set(targets)].map(channel=>{const child=objectValue(children[channel]),config=objectValue(child.config),stats=channel===campaign.channel?result:estimateConfiguredAudience({...campaign,channel,config:{...campaign.config,subscriptionGroupId:config.subscriptionGroupId}});return{channel,reachable:stats.reachable,ltv:stats.ltv};});
 return{...result,channelBreakdown};
}
export function campaignFormCapabilities(workspaceId="local"){return{brazeAI:{available:false,reason:"Optimize with BrazeAI™ is not available for this workspace."},attributes:listUserAttributeNames(),apps:listResources("app-settings").filter(app=>app.status!=="Archived").map(({id,name})=>({id,name})),subscriptionGroups:listSubscriptionGroups().filter(group=>group.status!=="Archived").map(({id,name})=>({id,name})),campaigns:listCampaigns({includeArchived:true,limit:1000,workspaceId}).data.map(campaign=>({id:campaign.id,name:campaign.name,channel:campaign.channel,variants:campaignVariants(campaign).map(({id,name})=>({id,name}))})),featureFlags:listResources("feature-flags").filter(flag=>flag.status!=="Archived").map(flag=>({id:String(flag.data.flagId),name:flag.name})),linkAliases:listResources("link-aliases").filter(alias=>alias.status==="Active").map(alias=>({name:alias.name})),filters:{randomBucket:true,createdFrom:true,pendingDeletion:true,sessionDates:true},intelligentTiming:{profileTimes:true,activityFallback:true,deliveryPreview:true}};}
export function intelligentTimingFallback(campaign:MessageDraft){
 const delivery=objectValue(campaign.config?.delivery);if(delivery.intelligentFallback==="custom")return{time:String(delivery.intelligentFallbackTime??"10:00"),source:"custom" as const};
 const hours=new Map<number,number>(),profiles=new Map((db().prepare("SELECT id,attributes_json FROM users").all() as Array<{id:string;attributes_json:string}>).map(row=>[row.id,parseJson<Record<string,unknown>>(row.attributes_json,{})]));
 for(const event of listResources("user-events").filter(row=>["session_start","Start Session"].includes(row.name))){const at=new Date(String(event.data.createdAt??event.updatedAt)),profile=profiles.get(String(event.data.userId))??{};if(!Number.isFinite(at.getTime()))continue;try{const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:String(profile.time_zone??profile.timezone??"UTC"),hour:"2-digit",hourCycle:"h23"}).format(at));hours.set(hour,(hours.get(hour)??0)+1);}catch{}}
 if(hours.size){const hour=[...hours.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];return{time:`${String(hour).padStart(2,"0")}:00`,source:"activity" as const};}
 for(const profile of profiles.values()){const hour=Number(profile.best_send_hour);if(profile.best_send_hour!==undefined&&Number.isFinite(hour)&&hour>=0&&hour<=23)hours.set(Math.floor(hour),(hours.get(Math.floor(hour))??0)+1);}
 if(hours.size){const hour=[...hours.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];return{time:`${String(hour).padStart(2,"0")}:00`,source:"profile" as const};}
 return{time:String(delivery.sendTime??"10:00"),source:"default" as const};
}
function withIntelligentTimingData<T extends MessageDraft>(campaign:T):T{const delivery=objectValue(campaign.config?.delivery);if(delivery.timing!=="intelligent"||delivery.intelligentFallback==="custom")return campaign;return{...campaign,config:{...campaign.config,delivery:{...delivery,intelligentPopularTime:intelligentTimingFallback(campaign).time}}};}
export function previewCampaignDeliveryTimes(campaign:MessageDraft,channel=campaign.channel,at=new Date()):DeliveryTimePreview{
 const actual={...campaign,channel},requirements=intelligentTimingRequirements(actual,at),fallback=intelligentTimingFallback(actual),result:DeliveryTimePreview={calculatedAt:now(),channel,timezone:"UTC",matching:0,reachable:0,withOptimalTime:0,usingFallback:0,fallbackTime:fallback.time,fallbackSource:fallback.source,bins:[],requirements};
 if(requirements.length)return result;
 const query=configuredAudienceSQL(actual),rows=db().prepare(`SELECT id,attributes_json FROM users u WHERE ${query.sql}`).all(...query.values) as Array<{id:string;attributes_json:string}>;result.matching=rows.length;
 const bins=new Map<string,number>(),effective=withIntelligentTimingData(actual);
 for(const row of rows){if(!isCampaignUserEligible(actual,row.id))continue;const profile=parseJson<Record<string,unknown>>(row.attributes_json,{}),hour=Number(profile.best_send_hour),hasOptimal=profile.best_send_hour!==undefined&&profile.best_send_hour!==null&&Number.isFinite(hour)&&hour>=0&&hour<=23;const zone=String(profile.time_zone??profile.timezone??objectValue(effective.config?.delivery).timezone??"UTC"),time=nextAllowedDeliveryTime(nextScheduledTime(effective,at,profile),objectValue(effective.config?.delivery),zone).toISOString().slice(0,13)+":00:00.000Z";bins.set(time,(bins.get(time)??0)+1);result.reachable++;hasOptimal?result.withOptimalTime++:result.usingFallback++;}
 result.bins=[...bins.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([at,users])=>({at,users}));return result;
}
function isCampaignUserEligible(campaign:MessageDraft,userId:string){const query=configuredAudienceSQL(campaign),group=String(campaign.config?.subscriptionGroupId??""),row=db().prepare(`SELECT u.* FROM users u ${group?"LEFT JOIN subscription_group_memberships m ON m.user_id=u.id AND m.group_id=?":""} WHERE (${query.sql}) AND u.id=? AND u.reachable=1 AND ${subscriptionCondition(campaign.channel as Channel,String(campaign.config?.subscribeEligibility??"subscribed"),group)}`).get(...(group?[group]:[]),...query.values,userId) as Record<string,unknown>|undefined;if(!row||heldByGlobalControl(userId,globalControlSettings(),campaign.config?.tags,campaign.channel as Channel))return false;const email=String(row.email).toLowerCase();return !listResources("suppression-lists").some(r=>email===r.name.toLowerCase()||email.endsWith(`@${r.name.toLowerCase().replace(/^@/,"")}`));}
function materializeSdkMessage(message:MessageDraft,userId:string,payload:unknown,campaignId:string,variantId:string,force=false){
  const values=objectValue(message.config?.channelValues);if(message.channel==="content"&&values.creationMode!=="launch"&&!force)return null;
  const id=`sdk_${createHash("sha256").update(`${campaignId}:${message.channel}:${userId}`).digest("hex").slice(0,24)}`,existing=getResource(id);if(existing)return existing;
  const run=db().prepare("SELECT created_at FROM execution_runs WHERE campaign_id=? ORDER BY created_at ASC LIMIT 1").get(campaignId) as {created_at:string}|undefined;
  const launchedAt=run?.created_at??now(),expiresAt=message.channel==="content"?new Date(new Date(launchedAt).getTime()+Math.min(30,Math.max(.01,Number(values.expirationDays??30)))*86400000).toISOString():undefined;
  return createResource({id,type:"sdk-messages",name:message.name??"Message",status:"Available",data:{campaignId,userId,channel:message.channel,payload,variantId,createdAt:now(),expiresAt,pinned:values.pinned===true,priority:values.priority??objectValue(message.config?.delivery).iamPriority??"Medium",order:Number(objectValue(message.config?.delivery).iamOrder??0),placement:values.placement,removalEvent:values.removalEvent,removalEventName:values.removalEventName,removalProperties:values.removalProperties??[]}});
}
function enqueueCampaignJob(campaign:CampaignRecord,userId:string,dueAt:string,triggerProperties:Record<string,unknown>={},key=dueAt){
 const id=`job_${createHash("sha256").update(`${campaign.id}:${userId}:${key}`).digest("hex").slice(0,28)}`;if(getResource(id))return null;
 return createResource({id,type:"campaign-jobs",name:campaign.name,status:"Pending",data:{campaignId:campaign.id,userId,dueAt,triggerProperties,createdAt:now(),attempts:0}});
}
function activateCampaignSchedule(campaign:CampaignRecord):CampaignLaunchResult{
 const effective=withIntelligentTimingData(campaign),query=configuredAudienceSQL(campaign),users=db().prepare(`SELECT u.id FROM users u WHERE ${query.sql}`).all(...query.values) as {id:string}[];let queued=0;
 if(campaign.schedule!=="Action-based"&&campaign.schedule!=="API-triggered")for(const {id} of users){if(!isCampaignUserEligible(campaign,id))continue;const user=getUser(id)!;if(enqueueCampaignJob(campaign,id,nextAllowedDeliveryTime(nextScheduledTime(effective,new Date(),user.attributes),objectValue(effective.config?.delivery),String(user.attributes.time_zone??user.attributes.timezone??objectValue(effective.config?.delivery).timezone??"UTC")).toISOString()))queued++;}
 const id=uid("run"),timestamp=now();db().prepare("INSERT INTO execution_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id,campaign.id,"scheduled",users.length,0,0,timestamp,JSON.stringify({queued,schedule:campaign.schedule}));db().prepare("UPDATE campaigns SET status='Active',edited_at=? WHERE id=?").run(timestamp,campaign.id);audit("campaign",campaign.id,"schedule_activated",{queued});return{campaign:getCampaign(campaign.id),run:{id,eligible:users.length,delivered:0,failed:0,queued}};
}
export function triggerCampaign(id:string,userIds:string[],properties:Record<string,unknown>={}){const campaign=getCampaign(id);if(!campaign||campaign.status!=="Active"||campaign.schedule!=="API-triggered")throw new Error("Choose an active API-triggered Campaign.");if(!userIds.length||userIds.length>1000)throw new Error("Provide 1–1,000 user IDs.");let queued=0;const requestId=uid("trigger");for(const userId of [...new Set(userIds)])if(getUser(userId)&&isCampaignUserEligible(campaign,userId)&&enqueueCampaignJob(campaign,userId,now(),properties,requestId))queued++;return{queued,requestId};}
export async function processCampaignJobs(limit=100){
 const due=listResources("campaign-jobs").filter(r=>r.status==="Pending"&&new Date(String(r.data.dueAt)).getTime()<=Date.now()).slice(0,Math.min(100,Math.max(1,limit))),results:Array<{id:string;status:string;error?:string}>=[];
 for(const job of due){
  const claimed=db().prepare("UPDATE resources SET status='Processing',updated_at=? WHERE id=? AND status='Pending'").run(now(),job.id);if(!claimed.changes)continue;
  try{const campaign=getCampaign(String(job.data.campaignId)),userId=String(job.data.userId),user=getUser(userId);if(!campaign||campaign.status!=="Active"||!user){updateResource(job.id,{status:"Cancelled"});continue;}const d=objectValue(campaign.config.delivery);if(campaign.schedule!=="API-triggered"&&d.endEnabled&&!isWithinCampaignDuration({channel:campaign.channel,config:{delivery:{endEnabled:true,endTime:d.endTime,timezone:d.timezone}}})){updateResource(job.id,{status:"Expired"});continue;}
   const zone=String(user.attributes.time_zone??user.attributes.timezone??d.timezone??"UTC");
   if(inQuietHours(new Date(),d,["Company time","User local time"].includes(zone)?"UTC":zone)||workspaceRateLimited(now())){updateResource(job.id,{status:"Pending",data:{...job.data,dueAt:new Date(Date.now()+15*60000).toISOString()}});results.push({id:job.id,status:"Deferred"});continue;}
   const result=await launchCampaign(campaign.id,campaign.id,{...campaign,status:"Draft",config:{...campaign.config,triggerProperties:job.data.triggerProperties,delivery:{...d,quietHours:false}}},userId);
   updateResource(job.id,{status:"Completed",data:{...job.data,completedAt:now(),run:result.run}});
   if(result.run.delivered)db().prepare("UPDATE campaigns SET sent=sent+? WHERE id=?").run(result.run.delivered,campaign.id);
   if(campaign.schedule==="One time"&&d.frequency&&d.frequency!=="One time")enqueueCampaignJob(campaign,userId,nextAllowedDeliveryTime(nextScheduledTime(withIntelligentTimingData(campaign),new Date(),user.attributes,true),d,zone).toISOString());results.push({id:job.id,status:"Completed"});
  }catch(e){updateResource(job.id,{status:"Failed",data:{...job.data,error:e instanceof Error?e.message:"Delivery failed.",completedAt:now()}});results.push({id:job.id,status:"Failed",error:e instanceof Error?e.message:"Delivery failed."});}
 }
 return{processed:results.length,results,webhookRetries:await processWebhookRetries(limit)};
}
export function sdkCampaignMessages(userId:string){
  const user=getUser(userId);if(!user)return{banners:[],content_cards:[],in_app_messages:[]};const profile={...user.attributes,first_name:user.firstName,email:user.email,user_id:user.id};
  for(const campaign of runtimeActiveCampaigns().filter(c=>["content","banner","iam"].includes(c.channel))){
    if(!isCampaignUserEligible(campaign,userId))continue;const control=Number(campaign.config.controlGroup??20),bucket=createHash("sha256").update(`${campaign.config.holdoutSeed??campaign.id}:${userId}`).digest()[0]/256*100;if(bucket<control)continue;
    const index=pickVariant(campaign,createHash("sha256").update(`${campaign.id}:${userId}:variant`).digest().readUInt32BE(0)/0x100000000),draft=variantDraft(campaign,index),values=objectValue(draft.config.channelValues);
    if(campaign.channel==="content"&&values.creationMode!=="launch")materializeSdkMessage(draft,userId,compileContentCard(draft,profile),campaign.id,campaignVariants(campaign)[index].id,true);
  }
  const priority:Record<string,number>={High:0,Medium:1,Normal:1,Low:2},rows=listResources("sdk-messages").filter(r=>r.data.userId===userId&&r.status==="Available"&&(!r.data.expiresAt||new Date(String(r.data.expiresAt)).getTime()>Date.now())&&getCampaign(String(r.data.campaignId))?.status==="Active").sort((a,b)=>(priority[String(a.data.priority)]??1)-(priority[String(b.data.priority)]??1)||Number(a.data.order)-Number(b.data.order));
  const eligible=rows.filter(r=>{const campaign=getCampaign(String(r.data.campaignId));return campaign&&isCampaignUserEligible(campaign,userId);});
  return{banners:eligible.filter(r=>r.data.channel==="banner"),content_cards:eligible.filter(r=>r.data.channel==="content").sort((a,b)=>Number(b.data.pinned)-Number(a.data.pinned)),in_app_messages:eligible.filter(r=>r.data.channel==="iam").slice(0,1)};
}
export function sdkMessageReceipt(userId:string,messageId:string,event:string){const message=getResource(messageId);if(!message||message.type!=="sdk-messages"||message.data.userId!==userId)throw new Error("Message not found for this user.");if(!["impression","read","clicked","dismissed"].includes(event))throw new Error("Unsupported message receipt.");if(event==="dismissed")updateResource(message.id,{status:"Dismissed"});const eventType=event==="impression"?"delivered":event==="read"?"opened":event;const duplicate=db().prepare("SELECT id FROM message_events WHERE campaign_id=? AND user_id=? AND event_type=? AND json_extract(data_json,'$.sdkMessageId')=?").get(String(message.data.campaignId),userId,eventType,message.id);if(!duplicate)db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"),String(message.data.campaignId),String(message.data.channel),userId,eventType,now(),JSON.stringify({sdkMessageId:message.id,variantId:message.data.variantId}));return{recorded:true,event:eventType};}

function mapUser(row: Record<string, unknown>): UserRecord {
  return { id: String(row.id), email: String(row.email), firstName: String(row.first_name), country: String(row.country), lifecycle: String(row.lifecycle), subscribed: Boolean(row.subscribed), emailSubscriptionStatus: String(row.email_subscription_status ?? (row.subscribed ? "subscribed" : "unsubscribed")) as UserRecord["emailSubscriptionStatus"], reachable: Boolean(row.reachable), attributes: parseJson(String(row.attributes_json), {}) };
}

export function searchUsers(query = "", start = 0, limit = 20) {
  const offset = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
  const pageSize = Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.floor(limit))) : 20;
  const term = query.trim().toLowerCase();
  const condition = "instr(lower(id), ?) > 0 OR instr(lower(email), ?) > 0 OR instr(lower(first_name), ?) > 0";
  const total = (db().prepare(`SELECT count(*) AS count FROM users WHERE ${condition}`).get(term, term, term) as { count: number }).count;
  const rows = db().prepare(`SELECT * FROM users WHERE ${condition} ORDER BY CAST(SUBSTR(id, 6) AS INTEGER) LIMIT ? OFFSET ?`).all(term, term, term, pageSize, offset) as Record<string, unknown>[];
  const settings = globalControlSettings();
  return { data: rows.map(row => ({ ...mapUser(row), globalControlGroup: userGlobalCohort(String(row.id), settings) === "control" })), total, start: offset, limit: pageSize };
}

export function listUserAttributeNames() {
  const rows = db().prepare("SELECT attributes_json FROM users").all() as Array<{ attributes_json: string }>;
  return [...new Set(rows.flatMap(row => Object.keys(parseJson<Record<string, unknown>>(row.attributes_json, {}))))].sort((left, right) => left.localeCompare(right));
}

export function setUserSubscription(id: string, subscribed: boolean) {
  return setUserEmailSubscriptionStatus(id, subscribed ? "subscribed" : "unsubscribed");
}

export function setUserEmailSubscriptionStatus(id: string, status: UserRecord["emailSubscriptionStatus"]) {
  const result = db().prepare("UPDATE users SET subscribed = ?, email_subscription_status = ? WHERE id = ?").run(status === "unsubscribed" ? 0 : 1, status, id);
  if (!result.changes) return null;
  audit("user", id, "subscription_changed", { status });
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown>;
  return mapUser(row);
}

const userField = (row: Record<string, string>, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key] ?? row[key.replace(/_/g, " ")] ?? row[key.replace(/_/g, "-")];
    if (value) return value.trim();
  }
  return "";
};

export function importUsers(rows: Array<Record<string, string>>) {
  const insert = db().prepare("INSERT OR IGNORE INTO users (id, email, first_name, country, lifecycle, subscribed, reachable, attributes_json, email_subscription_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const now = Date.now();
  let imported = 0;
  let skipped = 0;
  rows.forEach((row, index) => {
    const id = userField(row, "id", "user_id", "external_id") || `user_import_${now}_${index + 1}`;
    const email = userField(row, "email") || `${id}@example.test`;
    const firstName = userField(row, "first_name") || "Imported user";
    const country = userField(row, "country") || "US";
    const lifecycle = userField(row, "lifecycle", "segment") || "All Users";
    const subscribed = Number(!/^(false|0|no|unsubscribed)$/i.test(userField(row, "subscribed")));
    const importedStatus = userField(row, "email_subscription_status").replaceAll("-", "_");
    const emailStatus = ["opted_in", "subscribed", "unsubscribed"].includes(importedStatus) ? importedStatus : subscribed ? "subscribed" : "unsubscribed";
    const reachable = Number(!/^(false|0|no|unreachable)$/i.test(userField(row, "reachable")));
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) if (!["id", "user_id", "external_id", "email", "first_name", "country", "lifecycle", "segment", "subscribed", "reachable", "email_subscription_status"].includes(key) && value) attributes[key] = value.trim();
    const result = insert.run(id, email, firstName, country, lifecycle, emailStatus === "unsubscribed" ? 0 : 1, reachable, JSON.stringify(attributes), emailStatus);
    if (result.changes) { imported += 1; audit("user", id, "imported", { email }); } else skipped += 1;
  });
  return { imported, skipped };
}

export function validateSubscriptionCapabilities(value:unknown):{sms:boolean;mms:boolean;rcs:boolean}{
 if(value===undefined)return{sms:true,mms:false,rcs:false};
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(key=>!["sms","mms","rcs"].includes(key))||["sms","mms","rcs"].some(key=>typeof (value as Record<string,unknown>)[key]!=="boolean"))throw new Error("Capabilities must contain boolean sms, mms and rcs values.");
 return value as {sms:boolean;mms:boolean;rcs:boolean};
}
function subscriptionGroupCapabilities(id:string){const saved=getResource(`subscription-capabilities:${id}`);return saved?validateSubscriptionCapabilities(saved.data):{sms:true,mms:false,rcs:false};}
function saveSubscriptionCapabilities(id:string,value:{sms:boolean;mms:boolean;rcs:boolean}){db().prepare("INSERT INTO resources VALUES (?, 'subscription-group-capabilities', ?, 'Active', 'Subscription channel capabilities', ?, ?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at").run(`subscription-capabilities:${id}`,id,now(),JSON.stringify(value));}
function assertCampaignSubscriptionCapabilities(campaign:MessageDraft){if(campaign.channel!=="sms")return;const group=subscriptionGroupForChannel(String(campaign.config?.subscriptionGroupId??""),"sms");if(!group)throw new Error("Select an active subscription group for SMS.");const issues=subscriptionCapabilityIssues(campaign,group.capabilities);if(issues.length)throw new Error(issues.join(" "));}
function mapSubscriptionGroup(row: Record<string, unknown>): SubscriptionGroupRecord {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description), channel: row.channel as SubscriptionChannel,
    status: row.status as "Active" | "Archived", createdAt: String(row.created_at), updatedAt: String(row.updated_at), subscriberCount: Number(row.subscriber_count ?? 0),capabilities:subscriptionGroupCapabilities(String(row.id)),
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

export function createSubscriptionGroup(input: { name: string; description?: string; channel: SubscriptionChannel; capabilities?:unknown }) {
  const capabilities=validateSubscriptionCapabilities(input.capabilities),name = input.name.trim();
  if (!name) throw new Error("Subscription group name is required.");
  const record: SubscriptionGroupRecord = { id: uid("sg"), name, description: input.description?.trim() || "", channel: input.channel, status: "Active", createdAt: now(), updatedAt: now(), subscriberCount: 0 };
  db().prepare("INSERT INTO subscription_groups VALUES (?, ?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.description, record.channel, record.status, record.createdAt, record.updatedAt);
  saveSubscriptionCapabilities(record.id,capabilities);record.capabilities=capabilities;
  audit("subscription_group", record.id, "created", { channel: record.channel }); return record;
}

export function updateSubscriptionGroup(id: string, patch: Partial<Pick<SubscriptionGroupRecord, "name" | "description" | "channel" | "status" | "capabilities">>) {
  const current = getSubscriptionGroup(id); if (!current) return null;
  const capabilities=patch.capabilities===undefined?current.capabilities:validateSubscriptionCapabilities(patch.capabilities);
  const next = { ...current, name: patch.name?.trim() || current.name, description: patch.description ?? current.description, channel: patch.channel ?? current.channel, status: patch.status ?? current.status, updatedAt: now() };
  db().prepare("UPDATE subscription_groups SET name = ?, description = ?, channel = ?, status = ?, updated_at = ? WHERE id = ?").run(next.name, next.description, next.channel, next.status, next.updatedAt, id);
  if(capabilities)saveSubscriptionCapabilities(id,capabilities);
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
    publishedVersion: row.published_version == null ? null : Number(row.published_version),
  };
}

export function listPreferenceCenters() { return (db().prepare("SELECT * FROM preference_centers ORDER BY updated_at DESC").all() as Record<string, unknown>[]).map(mapPreferenceCenter); }
export function getPreferenceCenter(id: string) {
  const row = db().prepare("SELECT * FROM preference_centers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapPreferenceCenter(row) : null;
}
export function createPreferenceCenter(input: { name: string; description?: string; groupIds?: string[]; status?: PreferenceCenterRecord["status"]; config?: PreferenceCenterConfig }) {
  const name = input.name.trim(); if (!name) throw new Error("Preference center name is required.");
  const status = input.status === "Active" ? "Active" : "Draft";
  const record: PreferenceCenterRecord = { id: uid("pc"), name, description: input.description?.trim() || "", groupIds: input.groupIds ?? [], status, updatedAt: now(), config: normalizePreferenceCenterConfig(input.config), version: 1, publishedVersion: status === "Active" ? 1 : null };
  db().prepare("INSERT INTO preference_centers (id, name, description, group_ids_json, status, updated_at, config_json, version, published_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.description, JSON.stringify(record.groupIds), record.status, record.updatedAt, JSON.stringify(record.config), record.version, record.publishedVersion);
  db().prepare("INSERT INTO preference_center_versions (center_id, version, name, status, config_json, created_at, group_ids_json, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.version, record.name, record.status, JSON.stringify(record.config), record.updatedAt, JSON.stringify(record.groupIds), record.description);
  audit("preference_center", record.id, "created", { groupCount: record.groupIds.length }); return record;
}

export function updatePreferenceCenter(id: string, patch: Partial<Pick<PreferenceCenterRecord, "name" | "description" | "groupIds" | "status" | "config">>) {
  const current = getPreferenceCenter(id); if (!current) return null;
  const name = patch.name?.trim() || current.name;
  const description = patch.description === undefined ? current.description : patch.description.trim();
  const groupIds = patch.groupIds ?? current.groupIds;
  const publishNow = patch.status === "Active";
  const status = patch.status === "Archived" ? "Archived" : publishNow ? "Active" : current.publishedVersion && current.status === "Active" ? "Active" : "Draft";
  const config = patch.config ? normalizePreferenceCenterConfig(patch.config) : current.config;
  const updatedAt = now();
  const version = current.version + 1;
  const publishedVersion = publishNow ? version : current.publishedVersion;
  db().prepare("UPDATE preference_centers SET name = ?, description = ?, group_ids_json = ?, status = ?, updated_at = ?, config_json = ?, version = ?, published_version = ? WHERE id = ?").run(name, description, JSON.stringify(groupIds), status, updatedAt, JSON.stringify(config), version, publishedVersion, id);
  db().prepare("INSERT INTO preference_center_versions (center_id, version, name, status, config_json, created_at, group_ids_json, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, version, name, publishNow ? "Active" : "Draft", JSON.stringify(config), updatedAt, JSON.stringify(groupIds), description);
  audit("preference_center", id, "updated", { groupCount: groupIds.length, status, version });
  return { id, name, description, groupIds, status, updatedAt, config, version, publishedVersion } satisfies PreferenceCenterRecord;
}

export function publishPreferenceCenter(id: string) {
  const current = getPreferenceCenter(id); if (!current) return null;
  const updatedAt = now();
  db().prepare("UPDATE preference_centers SET status = 'Active', published_version = ?, updated_at = ? WHERE id = ?").run(current.version, updatedAt, id);
  db().prepare("UPDATE preference_center_versions SET status = 'Active' WHERE center_id = ? AND version = ?").run(id, current.version);
  audit("preference_center", id, "published", { version: current.version });
  return getPreferenceCenter(id);
}

export function archivePreferenceCenter(id: string) {
  const current = getPreferenceCenter(id); if (!current) return null;
  db().prepare("UPDATE preference_centers SET status = 'Archived', updated_at = ? WHERE id = ?").run(now(), id);
  audit("preference_center", id, "archived", { publishedVersion: current.publishedVersion });
  return getPreferenceCenter(id);
}

function getPublishedPreferenceCenter(id: string) {
  const center = getPreferenceCenter(id);
  if (!center || center.status !== "Active" || center.publishedVersion === null) return null;
  const version = db().prepare("SELECT * FROM preference_center_versions WHERE center_id = ? AND version = ?").get(id, center.publishedVersion) as Record<string, unknown> | undefined;
  if (!version) return null;
  return { ...center, name: String(version.name), description: String(version.description), groupIds: parseJson(String(version.group_ids_json), [] as string[]), config: normalizePreferenceCenterConfig(parseJson(String(version.config_json), {})), version: center.publishedVersion };
}

export function listPreferenceCenterVersions(id: string): PreferenceCenterVersion[] {
  return db().prepare("SELECT version, name, status, created_at FROM preference_center_versions WHERE center_id = ? ORDER BY version DESC LIMIT 20").all(id).map(row => {
    const value = row as Record<string, unknown>;
    return { version: Number(value.version), name: String(value.name), status: value.status as PreferenceCenterRecord["status"], createdAt: String(value.created_at) };
  });
}

function preferenceCenterSecret() {
  const conn = db();
  const existing = conn.prepare("SELECT value FROM demo_state WHERE key = 'preference_center_secret'").get() as { value: string } | undefined;
  if (existing) return existing.value;
  const secret = randomBytes(32).toString("hex");
  conn.prepare("INSERT OR IGNORE INTO demo_state VALUES ('preference_center_secret', ?)").run(secret);
  return (conn.prepare("SELECT value FROM demo_state WHERE key = 'preference_center_secret'").get() as { value: string }).value;
}
function preferenceCenterToken(centerId: string, userId: string) {
  const expires = Math.floor(Date.now() / 1000) + 30 * 86400;
  const signature = createHmac("sha256", preferenceCenterSecret()).update(`${centerId}:${userId}:${expires}`).digest("hex");
  return `${expires}.${signature}`;
}
function validPreferenceCenterToken(centerId: string, userId: string, token: string | null | undefined) {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", preferenceCenterSecret()).update(`${centerId}:${userId}:${expires}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function createPreferenceCenterLink(centerId: string, userId: string) {
  if (!getPublishedPreferenceCenter(centerId) || !getUser(userId)) return null;
  return { centerId, userId, token: preferenceCenterToken(centerId, userId) };
}
export function getPublicPreferenceCenter(centerId: string, userId: string, token?: string | null) {
  const center = getPublishedPreferenceCenter(centerId); const user = getUser(userId);
  if (!center || !user) return null;
  if (!validPreferenceCenterToken(centerId, userId, token)) return null;
  const groups = center.groupIds.map(id => getSubscriptionGroup(id)).filter((group): group is SubscriptionGroupRecord => group !== null).filter(group => group.channel === "Email" && group.status === "Active").map(group => {
    const membership = db().prepare("SELECT state FROM subscription_group_memberships WHERE group_id = ? AND user_id = ?").get(group.id, userId) as { state?: SubscriptionState } | undefined;
    return { ...group, state: membership?.state ?? "unsubscribed" };
  });
  const eventId = uid("pcevt");
  db().prepare("INSERT INTO preference_center_events VALUES (?, ?, ?, 'viewed', ?, ?)").run(eventId, centerId, userId, now(), JSON.stringify({ version: center.version }));
  return { center, user: { id: user.id, email: user.email, firstName: user.firstName, emailSubscriptionStatus: user.emailSubscriptionStatus }, groups };
}
export function submitPublicPreferenceCenter(centerId: string, userId: string, token: string | null | undefined, states: Record<string, boolean>, action: "groups" | "global_unsubscribe" = "groups") {
  const center = getPublishedPreferenceCenter(centerId); const user = getUser(userId);
  if (!center || !user || !validPreferenceCenterToken(centerId, userId, token)) return null;
  const groupIds = center.groupIds.filter(id => {
    const group = getSubscriptionGroup(id); return group?.channel === "Email" && group.status === "Active";
  });
  if (action === "groups" && groupIds.some(id => typeof states[id] !== "boolean")) throw new Error("Provide a choice for every listed subscription group.");
  db().exec("BEGIN");
  try {
    if (action === "global_unsubscribe") setUserSubscription(userId, false);
    for (const groupId of groupIds) setSubscriptionMember(groupId, userId, action === "global_unsubscribe" || !states[groupId] ? "unsubscribed" : "subscribed");
    const eventId = uid("pcevt"); const timestamp = now();
    db().prepare("INSERT INTO preference_center_events VALUES (?, ?, ?, 'submitted', ?, ?)").run(eventId, centerId, userId, timestamp, JSON.stringify({ version: center.version, states, action }));
    audit("preference_center", centerId, "submitted", { userId, action, subscribedGroups: action === "groups" ? groupIds.filter(id => states[id]).length : 0 });
    db().exec("COMMIT");
    return { updatedAt: timestamp, groupIds };
  } catch (error) { db().exec("ROLLBACK"); throw error; }
}
export function preferenceCenterAnalytics(centerId: string) {
  const rows = db().prepare("SELECT event_type, count(*) AS count FROM preference_center_events WHERE center_id = ? GROUP BY event_type").all(centerId) as Array<{ event_type: string; count: number }>;
  const counts = Object.fromEntries(rows.map(row => [row.event_type, row.count]));
  return { views: counts.viewed ?? 0, submissions: counts.submitted ?? 0, failures: counts.submission_failed ?? 0 };
}

function normalizeWebhookCredential(data:Record<string,unknown>){
 const keys=Object.keys(data);if(keys.some(key=>!["credentialEnv","scheme","headerName"].includes(key)))throw new Error("Managed credentials store a server credential reference, scheme and header name only.");
 if(typeof data.credentialEnv!=="string"||!/^[_A-Z][_A-Z0-9]{0,127}$/.test(data.credentialEnv)||!["Bearer","Basic","Header"].includes(String(data.scheme)))throw new Error("Choose a valid managed credential reference and scheme.");
 if(data.scheme==="Header"&&(typeof data.headerName!=="string"||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]+$/.test(data.headerName)||/^(host|content-length|connection|transfer-encoding)$/i.test(data.headerName)))throw new Error("Choose a valid credential header name.");
 return {credentialEnv:data.credentialEnv,scheme:String(data.scheme),...(data.scheme==="Header"?{headerName:String(data.headerName)}:{})};
}
export function managedWebhookCredentialMetadata(record:ResourceRecord){return{id:record.id,type:record.type,name:record.name,status:record.status,description:record.description,updatedAt:record.updatedAt,data:{credentialEnv:typeof record.data.credentialEnv==="string"?record.data.credentialEnv:"",scheme:["Bearer","Basic","Header"].includes(String(record.data.scheme))?record.data.scheme:"Bearer",...(typeof record.data.headerName==="string"?{headerName:record.data.headerName}:{})}};}
async function deliverManagedWebhook(variant:WebhookVariant,context:Record<string,unknown>,locale="en",attempts?:number){
 if(!variant.credentialId){const result=await deliverWebhook(variant,context,locale,attempts),sensitive=result.requestHeaders.filter(header=>/authorization|token|secret|api[-_]?key/i.test(header.key)).map(header=>header.value).filter(Boolean);const scrub=(value:unknown):unknown=>typeof value==="string"?sensitive.reduce((text,secret)=>text.split(secret).join("[redacted]"),value):Array.isArray(value)?value.map(scrub):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,scrub(item)])):value;return scrub(result) as WebhookDeliveryResult;}
 const credential=getResource(variant.credentialId);if(!credential||credential.type!=="webhook-credentials"||credential.status!=="Active")throw new Error("The selected managed credential is unavailable.");
 let settings:ReturnType<typeof normalizeWebhookCredential>;try{settings=normalizeWebhookCredential(credential.data);}catch{throw new Error("The selected managed credential is unavailable.");}
 const secret=process.env[settings.credentialEnv];if(!secret||/[\r\n]/.test(secret))throw new Error("The selected managed credential is unavailable.");
 const headerName=settings.scheme==="Header"?settings.headerName!:"Authorization",encoded=settings.scheme==="Basic"?Buffer.from(secret).toString("base64"):secret,headerValue=settings.scheme==="Basic"?`Basic ${encoded}`:settings.scheme==="Bearer"?`Bearer ${secret}`:secret;
 const resolved={...variant,headers:[...variant.headers.filter(header=>header.key.toLowerCase()!==headerName.toLowerCase()),{id:"managed-credential",key:headerName,value:headerValue}]};
 const redact=(value:unknown):unknown=>typeof value==="string"?[headerValue,secret,encoded].filter(Boolean).sort((a,b)=>b.length-a.length).reduce((text,sensitive)=>text.split(sensitive).join("[redacted]"),value):Array.isArray(value)?value.map(redact):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redact(item)])):value;
 try{const result=await deliverWebhook(resolved,context,locale,attempts),safe=redact(result) as WebhookDeliveryResult;safe.requestHeaders=safe.requestHeaders.map(header=>header.key.toLowerCase()===headerName.toLowerCase()?{...header,value:"[redacted]"}:header);return safe;}catch{throw new Error("Managed Webhook delivery failed. Check the credential availability and request configuration.");}
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
  if(!isTest&&result.retryAt&&!result.delivered&&result.attempts.length<5)createResource({type:"webhook-retries",name:"Deferred Webhook",status:"Pending",data:{campaignId,userId,variant,attempts:result.attempts.length,dueAt:result.retryAt,expiresAt:new Date(Date.now()+86400000).toISOString()}});
  return {
    url: result.url,
    method: result.method,
    requestHeaders: redactHeaders(result.requestHeaders),
    requestBody: result.requestBody,
    attempts: result.attempts,
    delivered: result.delivered,
    retryAt:result.retryAt,
  };
}
async function processWebhookRetries(limit:number){
 const rows=listResources("webhook-retries").filter(r=>r.status==="Pending"&&new Date(String(r.data.dueAt)).getTime()<=Date.now()).slice(0,limit);let processed=0;
 for(const row of rows){const campaign=getCampaign(String(row.data.campaignId));if(!campaign||campaign.status!=="Active"||Date.now()>=new Date(String(row.data.expiresAt)).getTime()){updateResource(row.id,{status:"Expired"});continue;}if(!db().prepare("UPDATE resources SET status='Processing' WHERE id=? AND status='Pending'").run(row.id).changes)continue;
  try{const user=getUser(String(row.data.userId)),variant=row.data.variant as WebhookVariant,result=await deliverManagedWebhook(variant,webhookContext(user),String(user?.attributes.language??"en"),1),attempts=Number(row.data.attempts??0)+1,last=result.attempts.at(-1);for(const attempt of result.attempts)db().prepare("INSERT INTO webhook_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(uid("wha"),campaign.id,String(row.data.userId),0,variant.id,attempts,attempt.statusCode,attempt.outcome,result.method,result.url,attempt.responseBody,attempt.error,attempt.durationMs,now());const retryable=last?.statusCode==null||last.statusCode===408||last.statusCode===429||last.statusCode>=500;
   updateResource(row.id,{status:result.delivered?"Completed":attempts<5&&retryable?"Pending":"Failed",data:{...row.data,attempts,dueAt:result.retryAt??new Date(Date.now()+webhookRetryDelay(null,attempts)).toISOString(),lastStatus:last?.statusCode}});
   if(result.delivered)db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"),campaign.id,"webhook",String(row.data.userId),"delivered",now(),JSON.stringify({variantId:variant.id,retryId:row.id}));processed++;
  }catch(error){updateResource(row.id,{status:"Failed",data:{...row.data,error:error instanceof Error?error.message:"Webhook retry failed."}});}
 }
 return processed;
}

function recordBlockedWebhook(campaignId: string, userId: string, variant: WebhookVariant, error: string, isTest: boolean, suppliedContext?: Record<string, unknown>) {
  const timestamp = now();
  const context = suppliedContext ?? webhookContext(getUser(userId));
  const url = renderWebhookText(variant.url, context, String(context.language ?? "en"), variant.translations);
  db().prepare("INSERT INTO webhook_attempts VALUES (?, ?, ?, ?, ?, 1, NULL, 'blocked', ?, ?, '', ?, 0, ?)")
    .run(uid("wha"), campaignId, userId, isTest ? 1 : 0, variant.id, variant.method, url, error, timestamp);
  return { url, method: variant.method, requestHeaders: redactHeaders(variant.headers), requestBody: variant.body, attempts: [{ attempt: 1, statusCode: null, outcome: "blocked" as const, responseBody: "", error, durationMs: 0 }], delivered: false };
}

type LaunchRun = { prepared?:number;accepted?:number;available?:number;queued?:number; id: string; eligible: number; delivered: number; failed: number; deferred?: number; frequencyCapped?: number; suppressionListHits?: number; quietHoursDeferred?: boolean; alreadyLaunched?: boolean; children?: Array<{ campaignId: string; channel: string; run: LaunchRun }> };
type CampaignLaunchResult = { campaign: CampaignRecord | null; run: LaunchRun };
export async function launchCampaign(id: string, approvedParentId?: string, messageOverride?: CampaignRecord, runtimeUserId?:string): Promise<CampaignLaunchResult> {
  const conn = db(); const campaign = messageOverride ?? getCampaign(id);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "Active") {
    const latest = conn.prepare("SELECT id, eligible_count, delivered_count, failed_count FROM execution_runs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as { id: string; eligible_count: number; delivered_count: number; failed_count: number } | undefined;
    return { campaign, run: { id: latest?.id ?? "existing", eligible: latest?.eligible_count ?? 0, delivered: latest?.delivered_count ?? 0, failed: latest?.failed_count ?? 0, alreadyLaunched: true } };
  }
  const issues = [...campaignValidationIssues(campaign), ...(campaign.channel === "email" ? emailVariantSendingIssues(campaign, getEmailPreferences().data) : [])];
  if(!runtimeUserId)assertWorkspaceApproval("campaign", approvedParentId ?? id);
  if (issues.length) throw new Error(issues.join(" "));
  if(campaign.status==="Archived")throw new Error("Archived Campaigns cannot be launched.");
  assertCampaignSubscriptionCapabilities(campaign);
  const schedule=objectValue(campaign.config.delivery);
  if(!messageOverride&&campaign.channel!=="feature"&&campaign.channel!=="api"&&(campaign.schedule==="Action-based"||campaign.schedule==="API-triggered"||schedule.localTime===true||schedule.frequency&&schedule.frequency!=="One time"||schedule.timing&&schedule.timing!=="now"&&nextScheduledTime(campaign).getTime()>Date.now()+1000))return activateCampaignSchedule(campaign);
  if (["multichannel", "operator"].includes(campaign.channel)) return launchMultichannelCampaign(campaign,runtimeUserId);
  if (campaign.channel === "iam") inAppVariants(campaign).forEach(validateInAppSnapshot);
  const experimentFlag = campaign.channel === "feature" ? listResources("feature-flags").find(r => r.data.flagId === campaign.subject && r.status !== "Archived") : undefined;
  if (campaign.channel === "feature" && !experimentFlag) throw new Error("Select a saved Feature Flag before launching an experiment.");
  if (experimentFlag && Number(experimentFlag.data.rollout ?? 0) > 0) throw new Error("Set the Feature Flag's Everyone else rollout to 0 before starting an experiment.");
  const audienceQuery=configuredAudienceSQL(campaign);
  const subscriptionGroupId=typeof campaign.config.subscriptionGroupId==="string"&&campaign.config.subscriptionGroupId?campaign.config.subscriptionGroupId:null;
  subscriptionGroupForChannel(subscriptionGroupId??undefined,campaign.channel);
  if(["sms","whatsapp","line"].includes(campaign.channel)&&!subscriptionGroupId)throw new Error("Select an active subscription group for this channel.");
  const allClauses=[audienceQuery.sql],allValues=audienceQuery.values;
  if(runtimeUserId){allClauses.push("u.id = ?");allValues.push(runtimeUserId);}
  const users = conn.prepare(`SELECT u.id, u.reachable, u.subscribed, u.email, u.email_subscription_status${subscriptionGroupId ? ", m.state AS subscription_state" : ""} FROM users u ${subscriptionGroupId ? "LEFT JOIN subscription_group_memberships m ON m.user_id = u.id AND m.group_id = ?" : ""} WHERE ${allClauses.join(" AND ")} ORDER BY u.id`).all(...(subscriptionGroupId ? [subscriptionGroupId] : []), ...allValues) as { id: string; reachable: number; subscribed: number; email: string; email_subscription_status: string; subscription_state?: SubscriptionState }[];
  // Suppression list entries exclude matching emails and whole domains from sends.
  const suppressionEntries = listResources("suppression-lists").map(row => row.name.toLowerCase().replace(/^@/, ""));
  const isSuppressed = (email: string) => suppressionEntries.some(entry => email.toLowerCase() === entry || email.toLowerCase().endsWith(`@${entry}`));
  // Frequency capping rules limit delivered messages per user inside each window.
  const freqRecord = listResources("frequency-capping-rules")[0];
  const freqData = (freqRecord?.data ?? {}) as { enabled?: boolean; rules?: Array<{ kind: string; limit: number; window: string }> };
  const freqRules = freqData.enabled === true ? (freqData.rules ?? []).filter(rule => rule.limit > 0) : [];
  const freqCappedUsers = new Set<string>();
  for (const rule of freqRules) {
    const ruleChannel = rule.kind === "In-app message" ? "iam" : rule.kind.toLowerCase();
    if (rule.kind !== "All channels" && ruleChannel !== campaign.channel) continue;
    const windowMs = rule.window === "per week" ? 7 * 86400000 : rule.window === "per month" ? 30 * 86400000 : 86400000;
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const channelClause = rule.kind === "All channels" ? "" : " AND channel = ?";
    const channel = rule.kind === "In-app message" ? "iam" : rule.kind.toLowerCase();
    const rows = conn.prepare(`SELECT user_id, count(*) AS sent FROM message_events WHERE event_type = 'delivered' AND created_at >= ?${channelClause} GROUP BY user_id`).all(cutoff, ...(rule.kind === "All channels" ? [] : [channel])) as Array<{ user_id: string; sent: number }>;
    for (const row of rows) if (row.sent >= rule.limit) freqCappedUsers.add(row.user_id);
  }
  const controlGroup = Math.min(100, Math.max(0, Number(campaign.config.controlGroup ?? 20)));
  const configuredMaxUsers = campaign.config.limitVolume ? Math.max(1, Number(campaign.config.maxUsers ?? 100)) : Infinity;
  const maxUsers = campaign.channel === "webhook" ? Math.min(configuredMaxUsers, Math.max(1, Number(process.env.WEBHOOK_MAX_DELIVERIES_PER_RUN ?? 100))) : configuredMaxUsers;
  const subscribed = (user: { email_subscription_status: string; subscription_state?: SubscriptionState }) => {
    if (campaign.channel === "email") return user.email_subscription_status !== "unsubscribed" && (campaign.config.subscribeEligibility !== "opted-in" || user.email_subscription_status === "opted_in") && (!subscriptionGroupId || user.subscription_state === "subscribed");
    if (campaign.channel === "sms" || campaign.channel === "whatsapp" || campaign.channel === "line") return user.subscription_state === "subscribed";
    return true;
  };
  const globalSettings = globalControlSettings();
  const eligible = users.filter(user => user.reachable && subscribed(user) && !heldByGlobalControl(user.id, globalSettings, campaign.config.tags, campaign.channel));
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
  let delivered = 0; let prepared=0,accepted=0,available=0; let failed = 0; let webhookProcessed = 0; let deferredCount = 0; let frequencyCapped = 0; let suppressedCount = 0;
  const webhookVariants = campaign.channel === "webhook" ? normalizeWebhookVariants(campaign) : [];
  for (const user of users) {
    const deliverable = user.reachable && subscribed(user);
    const globalHeld = heldByGlobalControl(user.id, globalSettings, campaign.config.tags, campaign.channel);
    const inControl = deliverable && !globalHeld && createHash("sha256").update(`${campaign.config.holdoutSeed ?? id}:${user.id}`).digest()[0] / 256 * 100 < controlGroup;
    let eventType = !deliverable ? subscribed(user) ? "unreachable" : "suppressed"
      : globalHeld ? "global_control"
      : isSuppressed(user.email) ? "suppressed"
      : freqCappedUsers.has(user.id) ? "frequency_capped"
      : inControl ? "control"
      : (campaign.channel === "webhook" ? webhookProcessed : delivered+prepared+accepted+available) >= maxUsers ? "held_back"
      : quietDeferred || workspaceRateLimited(timestamp) ? "deferred"
      : "delivered";
    if (eventType === "suppressed" && deliverable) suppressedCount += 1;
    if (eventType === "frequency_capped") frequencyCapped += 1;
    if (eventType === "deferred") deferredCount += 1;
    let eventData: Record<string, unknown> = { runId, globalControlGeneration: globalSettings.enabled ? globalSettings.seed : null, globalControlCohort: userGlobalCohort(user.id, globalSettings) };
    const messageIndex=eventType==="delivered"?pickVariant(campaign,createHash("sha256").update(`${id}:${user.id}:variant`).digest().readUInt32BE(0)/0x100000000):0;
    const messageDraft=variantDraft(campaign,messageIndex);
    eventData.variantId=campaignVariants(campaign)[messageIndex].id;
    if (experimentFlag && ["delivered", "control"].includes(eventType)) {
      const rollout = Number((campaign.config.channelValues as Record<string, unknown> | undefined)?.rollout ?? 50);
      const enabled = eventType === "delivered" && stableBucket(`${id}:${user.id}:feature`) < rollout;
      const experiment=objectValue(campaign.config.featureExperiment),definitions=Array.isArray(experiment.variants)?experiment.variants as Array<{id:string;name:string;percentage:number;properties:Record<string,unknown>}>:[];
      let chosen:typeof definitions[number]|undefined=definitions[0];if(definitions.length){let bucket=stableBucket(`${id}:${user.id}:feature-variant`);for(const variant of definitions){bucket-=variant.percentage;if(bucket<0){chosen=variant;break;}}}
      if(eventType==="control")chosen=undefined;
      const properties=eventType==="control"?{}:chosen?objectValue(chosen.properties):objectValue(JSON.parse(campaign.body||"{}"));
      const existing = listResources("feature-assignments").find(r => r.data.flagId === experimentFlag.data.flagId && r.data.userId === user.id && r.data.campaignId === id);
      const data = { flagId: experimentFlag.data.flagId, userId: user.id, campaignId: id, enabled, properties: { ...objectValue(experimentFlag.data.properties), ...properties }, assignedAt: timestamp,...(chosen?{variantId:chosen.id,variantName:chosen.name}:{}) };
      if (existing) updateResource(existing.id, { data }); else createResource({ type: "feature-assignments", name: String(experimentFlag.data.flagId), status: "Active", data });
      eventData = { ...eventData, featureFlag: data.flagId, featureEnabled: enabled,...(chosen?{variantId:chosen.id,variantName:chosen.name}:{}) };
    }
    if (eventType === "delivered" && campaign.channel === "webhook") {
      webhookProcessed += 1;
      const hash = createHash("sha256").update(`${id}:${user.id}:variant`).digest()[0];
      const variant = normalizeWebhookVariants(messageDraft)[0];
      const profile = getUser(user.id);
      const context = webhookContext(profile);
      try {
        const result = await deliverManagedWebhook(variant, context, String(context.language ?? "en"));
        eventData = { ...eventData, webhook: recordWebhookResult(id, user.id, variant, result, false) };
        if (!result.delivered) {eventType = result.retryAt?"deferred":"failed";if(result.retryAt)deferredCount++;}
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : "Webhook delivery failed.";
        eventData = { ...eventData, webhook: recordBlockedWebhook(id, user.id, variant, error, false, context) };
        eventType = "failed";
      }
    }
    if (eventType === "delivered" && campaign.channel === "email") {
      try { eventData = { ...eventData, simulated: true, message: prepareEmailMessage(messageDraft, user.id, "campaign") }; }
      catch (error) { eventType = "failed"; eventData = { ...eventData, error: error instanceof Error ? error.message : "Email compilation failed" }; }
    }
    if (eventType === "delivered" && campaign.channel === "whatsapp") {
      try { const profile = getUser(user.id); const variants = normalizeWhatsAppVariants(messageDraft); const index = 0; const eligibility = whatsAppResponseEligibility(variants[index].mode, latestWhatsAppInbound(profile?.attributes, listResources("user-events").filter(event => event.data.userId === user.id), timestamp), timestamp); if (!eligibility.eligible) throw new Error(eligibility.reason); eventData = { ...eventData, simulated: true, conversationEligibility: eligibility, variantId: variants[index].id, message: prepareWhatsAppMessage(variants[index], customWhatsAppTemplates(messageDraft), { ...profile?.attributes, first_name: profile?.firstName, country: profile?.country, user_id: user.id }) }; }
      catch (cause) { eventType = "failed"; eventData = { ...eventData, simulated: true, error: cause instanceof Error ? cause.message : "WhatsApp rendering failed." }; }
    }
    if (eventType === "delivered" && campaign.channel === "line") {
      try { const profile = getUser(user.id); eventData = { ...eventData, simulated: true, messages: compileLineMessages(messageDraft, { ...profile?.attributes, first_name: profile?.firstName, email: profile?.email, user_id: user.id }) }; }
      catch (cause) { eventType = "failed"; eventData = { ...eventData, error: cause instanceof Error ? cause.message : "LINE compilation failed." }; }
    }
    if(eventType==="delivered"&&campaign.channel==="sms"){
      try{const profile=getUser(user.id);eventData={...eventData,simulated:true,message:compileSms(messageDraft,{...profile?.attributes,first_name:profile?.firstName,phone:profile?.attributes.phone,language:profile?.attributes.language},url=>shortenMessageLink(url,id,user.id))};}catch(error){eventType="failed";eventData={...eventData,error:error instanceof Error?error.message:"SMS rendering failed."};}
    }
    if(eventType==="delivered"&&["email","sms","whatsapp","push","line","banner","content","iam"].includes(campaign.channel)){
      try{
        const profile=getUser(user.id),attributes={event_properties:campaign.config.triggerProperties,api_trigger_properties:campaign.config.triggerProperties,...profile?.attributes,first_name:profile?.firstName,email:profile?.email,user_id:user.id};
        if(campaign.channel==="push")eventData.message=compilePush(messageDraft,attributes);
        if(campaign.channel==="banner"){const values=objectValue(messageDraft.config.channelValues);eventData.message={html:renderBrazeLiquid(values.editorMode==="html"?String(values.html):creativeHtml((values.rows??[]) as CreativeRow[]),attributes),placement:values.placement,priority:values.priority??"Medium"};}
        if(campaign.channel==="content")eventData.message=compileContentCard(messageDraft,attributes);
        if(campaign.channel==="iam")eventData.message=prepareInAppPreview(inAppVariants(messageDraft)[0],attributes);
        if(["iam","banner","content"].includes(campaign.channel))materializeSdkMessage(messageDraft,user.id,eventData.message,campaign.id,eventData.variantId as string);
        const recipient=campaign.channel==="sms"||campaign.channel==="whatsapp"?String(profile?.attributes.phone??profile?.attributes.phone_number??""):campaign.channel==="line"?String(profile?.attributes.native_line_id??""):campaign.channel==="email"?profile?.email??"":user.id;
        const delivery=await dispatchPreparedMessage(messageDraft,recipient,objectValue(eventData.message));eventData={...eventData,simulated:delivery.mode==="preview",delivery};eventType=delivery.status;if(eventType==="prepared")prepared++;if(eventType==="accepted")accepted++;if(eventType==="available")available++;
      }catch(error){eventType="failed";eventData={...eventData,error:error instanceof Error?error.message:"Message preparation failed."};}
    }
    insertEvent.run(uid("evt"), id, campaign.channel, user.id, eventType, timestamp, JSON.stringify(eventData));
    if (eventType === "delivered") {
      delivered += 1;

    } else if (eventType === "unreachable" || eventType === "suppressed" || eventType === "failed") { failed += 1; }
  }
  conn.prepare("INSERT INTO execution_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(runId, id, "completed", eligible.length, delivered, failed, timestamp, JSON.stringify({ campaign, prepared,accepted,available,quietHoursDeferred: quietDeferred, deferredCount, frequencyCapped, suppressionListHits: suppressedCount }));
  if(!messageOverride)conn.prepare("UPDATE campaigns SET status = 'Active', sent = sent + ?, edited_at = ? WHERE id = ?").run(delivered, timestamp, id);
  audit("campaign", id, "launched", { runId, eligible: eligible.length, delivered, prepared, accepted, available, failed, deferred: deferredCount, frequencyCapped, suppressionListHits: suppressedCount });
  return { campaign: messageOverride ?? getCampaign(id), run: { id: runId, eligible: eligible.length, delivered, prepared, accepted, available, failed, deferred: deferredCount, frequencyCapped, suppressionListHits: suppressedCount, quietHoursDeferred: quietDeferred } };
}

async function launchMultichannelCampaign(parent: CampaignRecord,runtimeUserId?:string): Promise<CampaignLaunchResult> {
  const values = objectValue(parent.config.channelValues); const labels = values.channels as string[];
  const content = objectValue(values.channelContent); const links = objectValue(values.childCampaignIds);
  const channels: Record<string, Channel> = {...multichannelChannels,SMS:"sms"};
  const messages=objectValue(parent.config.multichannelMessages);
  const children = labels.map(label => {
    const channel = channels[label]; if (!channel) throw new Error(`Unsupported delivery channel: ${label}.`);
    const source = messages[channel] ? objectValue(messages[channel]) as unknown as CampaignRecord : links[label] ? getCampaign(String(links[label])) : null;
    if (links[label] && (!source || source.channel !== channel)) throw new Error(`Select an existing ${label} Campaign.`);
    const config = { ...(channel === "email" ? emailPreferenceCampaignDefaults(getEmailPreferences().data) : {}), ...source?.config, delivery: parent.config.delivery ?? {}, conversionEvents:parent.config.conversionEvents, controlGroup: parent.config.controlGroup ?? 0, holdoutSeed: parent.id, audienceGroups:parent.config.audienceGroups,audienceSegments:parent.config.audienceSegments,audienceSegmentOperator:parent.config.audienceSegmentOperator,audienceCountry: parent.config.audienceCountry, audienceExcludeCountry: parent.config.audienceExcludeCountry, limitVolume: parent.config.limitVolume, maxUsers: parent.config.maxUsers, tags: parent.config.tags };
    const child: CampaignRecord = { id: parent.id, name: `${parent.name} · ${label}`, channel, status: "Draft", schedule: parent.schedule, audience: parent.audience, subject: source?.subject ?? parent.subject ?? parent.name, body: source?.body ?? String(content[label] ?? ""), conversion: parent.conversion, sent: 0, edited: now(), config };
    const count=campaignVariants(child).length,stored=source?.config?.variantSplits,weights=Array.isArray(stored)&&stored.length===count&&stored.every(weight=>Number.isFinite(Number(weight))&&Number(weight)>=0)?stored.map(Number):Array.from({length:count},()=>1),total=weights.reduce((sum,weight)=>sum+weight,0),remaining=100-Number(child.config.controlGroup??0);
    child.config.variantSplits=weights.map(weight=>total?weight/total*remaining:remaining/count);
    assertCampaignSubscriptionCapabilities(child);
    const issues = [...campaignValidationIssues(child), ...(channel === "email" ? emailVariantSendingIssues(child, getEmailPreferences().data) : [])];
    if (["sms", "whatsapp", "line"].includes(channel)) subscriptionGroupForChannel(String(child.config.subscriptionGroupId ?? ""), channel);
    if (["sms", "whatsapp", "line"].includes(channel) && !child.config.subscriptionGroupId) issues.push(`Select a configured ${label} Campaign with a subscription group.`);
    if (issues.length) throw new Error(`${label}: ${issues.join(" ")}`);
    return child;
  });
  let eligible = 0, delivered = 0, failed = 0, deferred = 0; const childRuns = [];
  for (const child of children) {
    const result = await launchCampaign(parent.id, parent.id, child,runtimeUserId);
    eligible += result.run.eligible; delivered += result.run.delivered; failed += result.run.failed; deferred += "deferred" in result.run ? Number(result.run.deferred) : 0; childRuns.push({ campaignId: child.id, channel: child.channel, run: result.run });
  }
  const id = uid("run"); const timestamp = now();
  db().prepare("INSERT INTO execution_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, parent.id, "completed", eligible, delivered, failed, timestamp, JSON.stringify({ parent, children: childRuns }));
  if(!runtimeUserId)db().prepare("UPDATE campaigns SET status = 'Active', sent = sent + ?, edited_at = ? WHERE id = ?").run(delivered, timestamp, parent.id);
  createResource({ type: "multichannel-runs", name: parent.name, status: "Completed", data: { campaignId: parent.id, children: childRuns, delivered, failed, deferred } });
  audit("campaign", parent.id, "multichannel_launched", { children: children.map(c => c.id), delivered, failed });
  return { campaign: getCampaign(parent.id), run: { id, eligible, delivered, failed, deferred, children: childRuns } };
}

export async function sendTestCampaign(id: string, input: { recipient?: string; mode?: "random" | "existing" | "custom"; customUser?: Record<string, unknown>; variantId?: string; locale?: string; snapshot?:MessageDraft } | string = {}) {
  let campaign = getCampaign(id);
  if (!campaign) throw new Error("Campaign not found");
  const options=typeof input==="string"?{recipient:input}:input;
  if(!options||typeof options!=="object"||Array.isArray(options))throw new Error("Provide valid test options.");
  const parent=campaign,combined=["multichannel","operator"].includes(parent.channel);
  if(options.snapshot){
   const snapshot=options.snapshot;
   if(typeof snapshot!=="object"||Array.isArray(snapshot)||typeof snapshot.channel!=="string"||snapshot.id!==id||snapshot.config!==undefined&&(!snapshot.config||typeof snapshot.config!=="object"||Array.isArray(snapshot.config)))throw new Error("The test snapshot must belong to this Campaign.");
   if(combined){
    const selected=objectValue(parent.config.channelValues).channels,allowed:Record<string,string>={...multichannelChannels,SMS:"sms"};
    if(!Array.isArray(selected)||!selected.some(label=>typeof label==="string"&&allowed[label]===snapshot.channel))throw new Error("Save this channel in the parent Campaign before testing it.");
   }else if(parent.channel!==snapshot.channel)throw new Error("This channel does not belong to the Campaign.");
   campaign={...parent,channel:snapshot.channel as Channel,name:typeof snapshot.name==="string"?snapshot.name:parent.name,subject:snapshot.subject,body:snapshot.body,config:snapshot.config??{}};
  }else if(combined)throw new Error("Select a configured channel snapshot to test.");
  if(!["email","push","iam","content","banner","sms","webhook","whatsapp","line"].includes(campaign.channel))throw new Error("This Campaign has no testable delivery channel.");
  if(options.customUser!==undefined&&(!options.customUser||typeof options.customUser!=="object"||Array.isArray(options.customUser)))throw new Error("Custom user attributes must be a JSON object.");
  campaign={...campaign,schedule:"One time",config:{...campaign.config,delivery:{schemaVersion:3,timing:"now"}}};
  const index=options.variantId?campaignVariants(campaign).findIndex(v=>v.id===options.variantId):0;if(index<0)throw new Error("Message variant not found.");const selectedVariant=campaignVariants(campaign)[index];campaign=variantDraft(campaign,index);campaign.config={...campaign.config,[variantKey(campaign.channel)]:[selectedVariant],variantSplits:[100],controlGroup:0};
  const recipient = options.recipient?.trim() || "user_1";
  if(campaign.channel==="sms"&&!/^\+\d{8,15}$/.test(recipient))throw new Error("Enter an E.164 test recipient phone number.");
  assertCampaignSubscriptionCapabilities(campaign);
  const timestamp = now();
  if (campaign.channel === "webhook") {
    const issues = campaignComposeIssues(campaign);
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
    try { result = await deliverManagedWebhook(variant, context, options.locale || String(context.language ?? "en"), 1); }
    catch (cause) { result = recordBlockedWebhook(id, userId, variant, cause instanceof Error ? cause.message : "Webhook delivery failed.", true, context); }
    const safeResult = result.attempts[0]?.outcome === "blocked" ? result : recordWebhookResult(id, userId, variant, result, true);
    db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), id, campaign.channel, userId, result.delivered ? "delivered" : "failed", timestamp, JSON.stringify({ test: true, recipient, webhook: safeResult }));
    audit("campaign", id, "webhook_test_sent", { recipient, delivered: result.delivered, statusCode: result.attempts.at(-1)?.statusCode ?? null });
    return { recipient, campaign: campaign.name, channel: campaign.channel, createdAt: timestamp, webhook: safeResult, capability: webhookDeliveryCapability() };
  }
  if (campaign.channel === "iam") return {...prepareInAppTest({ campaignId: id, variant: inAppVariants(campaign).find(item => item.id === options.variantId) ?? inAppVariants(campaign)[0], recipients: [recipient], profile: options.customUser ?? {}, override: options.mode === "custom" }),channel:campaign.channel,campaign:campaign.name};
  if (campaign.channel === "whatsapp") return {...prepareWhatsAppTest({ campaignId: id, config: campaign.config, recipients: [recipient], variantId: options.variantId, profile: options.customUser ?? {}, override: options.mode === "custom" }),channel:campaign.channel,campaign:campaign.name};
  const issues=campaignComposeIssues(campaign);if(campaign.channel==="email")issues.push(...emailSendingIssues(campaign,getEmailPreferences().data));if(issues.length)throw new Error(issues.join(" "));
  const previewUser=options.mode==="random"?randomCatalogPreviewUser():getUser(recipient)??searchUsers(recipient,0,20).data.find(u=>u.id===recipient||u.email.toLowerCase()===recipient.toLowerCase());
  const profile={...previewUser?.attributes,first_name:previewUser?.firstName,user_id:previewUser?.id,language:options.locale??previewUser?.attributes.language,...options.customUser};
  const values=objectValue(campaign.config.channelValues);
  const message:Record<string,unknown>=campaign.channel==="email"?prepareEmailMessage(campaign,previewUser?.id??"","test",options.customUser):campaign.channel==="line"?{messages:compileLineMessages(campaign,profile)}:campaign.channel==="sms"?compileSms(campaign,profile,url=>shortenMessageLink(url,id,previewUser?.id??"test_user")):campaign.channel==="push"?compilePush(campaign,profile):campaign.channel==="content"?compileContentCard(campaign,profile):campaign.channel==="banner"?{html:values.editorMode==="html"?values.html:creativeHtml((values.rows??[]) as CreativeRow[])}:{title:campaign.subject,body:campaign.body,settings:values};
  const actualRecipient=campaign.channel==="line"?String(previewUser?.attributes.native_line_id??recipient):recipient;
  const delivery=await dispatchPreparedMessage(campaign,actualRecipient,message,true);
  db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"),id,campaign.channel,previewUser?.id??"test_user",delivery.mode==="preview"?"test_prepared":delivery.status,timestamp,JSON.stringify({test:true,recipient,variantId:campaign.config.previewVariantId,simulated:delivery.mode==="preview",message,delivery}));
  audit("campaign",id,"test_processed",{recipient,status:delivery.status});
  return{recipient,campaign:campaign.name,channel:campaign.channel,variantId:campaign.config.previewVariantId,createdAt:timestamp,message,capability:delivery};

}

// IAM tests prepare an unsaved snapshot and record evidence; no Braze SDK dispatch is attempted.
export function prepareInAppTest(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid in-app test.");
  const value = input as Record<string, unknown>;
  const campaign = typeof value.campaignId === "string" ? getCampaign(value.campaignId) : null;
  if (!campaign || campaign.channel !== "iam") throw new Error("In-app message campaign not found.");
  if (!Array.isArray(value.recipients) || !value.recipients.length || value.recipients.length > 20 || value.recipients.some(item => typeof item !== "string" || !item.trim() || item.length > 254)) throw new Error("Provide between 1 and 20 test recipients.");
  if (value.profile !== undefined && (!value.profile || typeof value.profile !== "object" || Array.isArray(value.profile) || JSON.stringify(value.profile).length > 20000)) throw new Error("Invalid preview profile.");
  const tests = [...new Set(value.recipients as string[])].map(recipient => {
    const user = getUser(recipient) ?? searchUsers(recipient, 0, 20).data.find(item => item.email.toLowerCase() === recipient.toLowerCase());
    const profile = value.override ? value.profile as Record<string, unknown> ?? {} : user ? { ...user.attributes, user_id: user.id, first_name: user.firstName, email: user.email, country: user.country } : {};
    return { recipient, userId: user?.id ?? "custom_test_user", variant: prepareInAppPreview(value.variant, profile) };
  });
  const timestamp = now();
  const record = createResource({ type: "in-app-message-tests", name: `${campaign.name} test`, description: `${tests.length} recipient(s)`, data: { campaignId: campaign.id, tests, simulated: true, delivered: false, createdAt: timestamp } });
  for (const test of tests) db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), campaign.id, "iam", test.userId, "test_prepared", timestamp, JSON.stringify({ test: true, testId: record.id, recipient: test.recipient, simulated: true, variant: test.variant }));
  return { id: record.id, tests, createdAt: timestamp, capability: { mode: "simulation", delivered: false, reason: "Test prepared locally. Device delivery requires a connected Braze SDK." } };
}

// SMS tests use the unsaved editor snapshot and never dispatch to a provider.
export function prepareCanvasSmsTest(canvasId: string, input: unknown) {
  if (!getCanvas(canvasId)) throw new Error("Canvas not found.");
  if (!input || typeof input !== "object") throw new Error("Invalid SMS test.");
  const value = input as Record<string, unknown>;
  if (typeof value.message !== "string" || typeof value.subscriptionGroupId !== "string" || typeof value.nodeId !== "string") throw new Error("Invalid SMS test configuration.");
  const issues = smsIssues(value.message, value.subscriptionGroupId);
  if (issues.length) throw new Error(issues.join(" "));
  subscriptionGroupForChannel(value.subscriptionGroupId, "sms");
  if (!Array.isArray(value.recipients) || !value.recipients.length || value.recipients.length > 20 || value.recipients.some(recipient => typeof recipient !== "string" || !recipient.trim() || recipient.length > 254)) throw new Error("Provide between 1 and 20 test recipients.");
  if (value.profile !== undefined && (!value.profile || typeof value.profile !== "object" || Array.isArray(value.profile) || JSON.stringify(value.profile).length > 20000)) throw new Error("Invalid preview user attributes.");
  const recipients = [...new Set(value.recipients as string[])];
  // Render all recipients before writing any records so invalid Liquid is atomic.
  const tests = recipients.map(recipient => {
    const user = getUser(recipient) ?? searchUsers(recipient, 0, 1).data.find(item => item.email.toLowerCase() === recipient.toLowerCase());
    const profile = value.override ? value.profile as Record<string, unknown> : user ? { ...user.attributes, first_name: user.firstName, email_address: user.email, country: user.country, user_id: user.id } : {};
    const message = smsPreview(value.message as string, profile ?? {}, value.linkShortening !== false);
    if (!message.trim()) throw new Error("The rendered SMS message is empty.");
    return { recipient, message, ...smsMetrics(message) };
  });
  const timestamp = now();
  const record = createResource({ type: "sms-tests", name: `SMS test · ${value.nodeId}`, data: { canvasId, nodeId: value.nodeId, subscriptionGroupId: value.subscriptionGroupId, tests, simulated: true } });
  for (const test of tests) db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), canvasId, "sms", test.recipient, "test_prepared", timestamp, JSON.stringify({ test: true, simulated: true, nodeId: value.nodeId, testId: record.id, ...test }));
  audit("canvas", canvasId, "sms_test_prepared", { testId: record.id, nodeId: value.nodeId, recipients: tests.length });
  return { id: record.id, tests, capability: { mode: "simulation", delivered: false } };
}

export function prepareWhatsAppTest(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Invalid WhatsApp test.");
  const value = input as Record<string, unknown>;
  const canvasId = typeof value.canvasId === "string" ? value.canvasId : undefined;
  const campaignId = typeof value.campaignId === "string" ? value.campaignId : undefined;
  if (Boolean(canvasId) === Boolean(campaignId)) throw new Error("Select exactly one Canvas or campaign.");
  if (canvasId && (!getCanvas(canvasId) || typeof value.nodeId !== "string")) throw new Error("Canvas or message step not found.");
  if(campaignId){const parent=getCampaign(campaignId);if(!parent||!["whatsapp","multichannel","operator"].includes(parent.channel))throw new Error("WhatsApp campaign not found.");if(parent.channel!=="whatsapp"&&(!Array.isArray(objectValue(parent.config.channelValues).channels)||!(objectValue(parent.config.channelValues).channels as unknown[]).includes("WhatsApp")))throw new Error("Save WhatsApp in the parent Campaign before testing it.");}
  if (!value.config || typeof value.config !== "object" || Array.isArray(value.config) || JSON.stringify(value.config).length > 200000) throw new Error("Invalid WhatsApp configuration.");
  const config = value.config as Record<string, unknown>;
  if (typeof config.subscriptionGroupId !== "string" || !config.subscriptionGroupId) throw new Error("Select an active WhatsApp subscription group.");
  subscriptionGroupForChannel(config.subscriptionGroupId, "whatsapp");
  if (!Array.isArray(config.whatsappVariants) || !config.whatsappVariants.length) throw new Error("Configure a WhatsApp message variant.");
  const variant = normalizeWhatsAppVariants({ config }).find(item => item.id === value.variantId) ?? (value.variantId === undefined ? normalizeWhatsAppVariants({ config })[0] : undefined);
  if (!variant) throw new Error("Message variant not found.");
  const issues = validateWhatsAppCampaign({ config: { ...config, whatsappVariants: [variant] } });
  if (issues.length) throw new Error(issues.join(" "));
  if (!Array.isArray(value.recipients) || !value.recipients.length || value.recipients.length > 20 || value.recipients.some(recipient => typeof recipient !== "string" || !recipient.trim() || recipient.length > 254)) throw new Error("Provide between 1 and 20 test recipients.");
  if (value.profile !== undefined && (!value.profile || typeof value.profile !== "object" || Array.isArray(value.profile) || JSON.stringify(value.profile).length > 20000)) throw new Error("Invalid preview user attributes.");
  const tests = [...new Set(value.recipients as string[])].map(recipient => {
    const user = getUser(recipient) ?? searchUsers(recipient, 0, 1).data.find(item => item.email.toLowerCase() === recipient.toLowerCase());
    const profile = value.override ? value.profile as Record<string, unknown> : user ? { ...user.attributes, first_name: user.firstName, email_address: user.email, country: user.country, user_id: user.id } : {};
    return { recipient, conversationEligibility: whatsAppResponseEligibility(variant.mode, user ? latestWhatsAppInbound(user.attributes, listResources("user-events").filter(event => event.data.userId === user.id)) : undefined), ...prepareWhatsAppMessage(variant, customWhatsAppTemplates({ config }), profile ?? {}) };
  });
  const timestamp = now();
  const scopeId = (canvasId ?? campaignId)!;
  const record = createResource({ type: "whatsapp-tests", name: `WhatsApp test · ${variant.name}`, data: { canvasId, campaignId, nodeId: value.nodeId, variantId: variant.id, tests, simulated: true } });
  for (const test of tests) db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), scopeId, "whatsapp", test.recipient, "test_prepared", timestamp, JSON.stringify({ test: true, simulated: true, nodeId: value.nodeId, testId: record.id, ...test }));
  audit(canvasId ? "canvas" : "campaign", scopeId, "whatsapp_test_prepared", { testId: record.id, recipients: tests.length });
  return { id: record.id, tests, capability: { mode: "simulation", delivered: false } };
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
  const attributes = input.attributes ?? {};
  const bot = event === "clicked" && isBotClick(attributes);
  const filtered = bot && getEmailPreferences().data.removeBotClicks;
  db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), campaignId, campaign.channel, userId, filtered ? "bot_clicked" : event, timestamp, JSON.stringify({ external: true, bot, filtered, attributes }));
  if (event === "clicked" && !filtered && typeof attributes.alias === "string") {
    const alias = listResources("link-aliases").find(row => row.name === attributes.alias && row.data.campaignId === campaignId && row.status === "Active");
    const user = getUser(userId); if (alias && user) {
      const clicks = Array.isArray(user.attributes.recentLinkClicks) ? user.attributes.recentLinkClicks : [];
      db().prepare("UPDATE users SET attributes_json = ? WHERE id = ?").run(JSON.stringify({ ...user.attributes, recentLinkClicks: [{ alias: alias.name, url: alias.data.url, clickedAt: timestamp }, ...clicks].slice(0,100) }), userId);
    }
  }
  if(!filtered&&!["conversion","failed","sent","delivered"].includes(event))attributeCampaignConversions(userId,{name:event,properties:{...attributes,campaignId}},uid("external"),timestamp);
  evaluateCampaignMonitoring(campaignId);
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

export function listWorkspaceTags() { return listTags(db()); }
export function workspaceTagAliases() { return listTagAliases(db()); }
export function resolveWorkspaceTags(names: unknown) { return assignTags(db(), names, "canvas"); }
export function createWorkspaceTag(input: { name: unknown; parentId?: unknown }) { return createTag(db(), input); }
export function updateWorkspaceTag(id: string, input: { name?: unknown; parentId?: unknown; expectedUpdatedAt?: unknown }) { return changeTag(db(), id, input); }
export function deleteWorkspaceTag(id: string, expectedUpdatedAt: unknown) { return changeTag(db(), id, { expectedUpdatedAt }, true); }
export function bulkTagCampaigns(ids: unknown, tags: unknown) { return tagCampaigns(db(), ids, tags); }

export function listResources(type: string, q = ""): ResourceRecord[] {
  const rows = db().prepare("SELECT * FROM resources WHERE type = ? AND lower(name) LIKE lower(?) ORDER BY updated_at DESC").all(type, `%${q}%`) as Record<string, unknown>[];
  return rows.map(row => ({ id: String(row.id), type: String(row.type), name: String(row.name), status: String(row.status), description: String(row.description), updatedAt: String(row.updated_at), data: parseJson(String(row.data_json), {}) }));
}
export function createResource(input: Pick<ResourceRecord, "type" | "name"> & Partial<ResourceRecord>) {
  if (input.type === "tag-management") { const tag = createWorkspaceTag({ name: input.name, parentId: input.data?.parentId }); return getResource(tag.id)!; }
  if (input.type === "global-control-group") throw new Error("Use the versioned Global Control Group endpoint.");
  if (workspaceModules[input.type]) {
    validateModule(input.type, input);
    if (workspaceModules[input.type].singleton && listResources(input.type).length) throw new Error("Settings already exist. Reload before saving.");
    assertModuleUnique(input.type, input.data ?? {});
  }
  const record: ResourceRecord = { id: input.id && ["sdk-messages","campaign-jobs","webhook-retries","webhook-hosts"].includes(input.type)?input.id:uid("res"), type: input.type, name: input.name, status: input.status ?? "Draft", description: input.description ?? "New local resource", updatedAt: now(), data: input.type === "email-templates" ? { ...emailPreferenceCampaignDefaults(getEmailPreferences().data), ...input.data } : input.type === "content-blocks" ? { emailBlockTheme: getEmailPreferences().data.editor, width: getEmailPreferences().data.editor.blockWidthMode === "full" ? "100%" : getEmailPreferences().data.editor.blockWidth, ...input.data } : input.data ?? {} };
  if(record.type==="webhook-credentials")record.data=normalizeWebhookCredential(record.data);
  if (record.data.tags !== undefined) record.data = { ...record.data, tags: assignTags(db(), record.data.tags, record.type) };
  db().prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)").run(record.id, record.type, record.name, record.status, record.description, record.updatedAt, JSON.stringify(record.data));
  audit("resource", record.id, "created", { type: record.type }); return record;
}

export function getResource(id: string): ResourceRecord | null {
  const row = db().prepare("SELECT * FROM resources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? { id: String(row.id), type: String(row.type), name: String(row.name), status: String(row.status), description: String(row.description), updatedAt: String(row.updated_at), data: parseJson(String(row.data_json), {}) } : null;
}

export function updateResource(id: string, input: { name?: string; status?: string; description?: string; data?: Record<string, unknown> }, expectedUpdatedAt?: string) {
  const existing = getResource(id);
  if (!existing) throw new Error("Resource not found");
  if (existing.type === "tag-management") { updateWorkspaceTag(id, { name: input.name, parentId: input.data?.parentId, expectedUpdatedAt }); return getResource(id)!; }
  if(existing.type==="webhook-credentials"&&input.data!==undefined)input={...input,data:normalizeWebhookCredential(input.data)};
  if (existing.type === "global-control-group") throw new Error("Use the versioned Global Control Group endpoint.");
  if (existing.type === "email-preferences") throw new Error("Use the versioned email-preferences endpoint to change workspace settings.");
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== existing.updatedAt) throw new Error("Resource changed in another tab. Reload before saving.");
  if (workspaceModules[existing.type]) {
    validateModule(existing.type, { name: input.name ?? existing.name, status: input.status ?? existing.status, data: input.data ?? existing.data }, existing);
    assertModuleUnique(existing.type, input.data ?? existing.data, id);
  }
  if (input.data?.tags !== undefined) input = { ...input, data: { ...input.data, tags: assignTags(db(), input.data.tags, existing.type) } };
  const updatedAt = now();
  db().prepare("UPDATE resources SET name = ?, status = ?, description = ?, updated_at = ?, data_json = ? WHERE id = ?")
    .run(input.name ?? existing.name, input.status ?? existing.status, input.description ?? existing.description, updatedAt, JSON.stringify(input.data ?? existing.data), id);
  audit("resource", id, "updated", { type: existing.type });
  return getResource(id)!;
}

export function deleteResource(id: string, expectedUpdatedAt?: string) {
  const existing = getResource(id);
  if (!existing) throw new Error("Resource not found");
  if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) throw new Error("Resource changed in another tab. Reload before deleting.");
  if (existing.type === "tag-management") { deleteWorkspaceTag(id, expectedUpdatedAt); return existing; }
  if (existing.type === "global-control-group") throw new Error("Disable the Global Control Group using its settings endpoint.");
  if (existing.type === "email-preferences") throw new Error("Use the versioned email-preferences endpoint to change workspace settings.");
  db().prepare("DELETE FROM resources WHERE id = ?").run(id);
  audit("resource", id, "archived", { type: existing.type });
  return existing;
}

export function getEmailPreferences() {
  const existing = listResources("email-preferences")[0];
  return { data: normalizeEmailPreferences(existing?.data), updatedAt: existing?.updatedAt ?? null };
}

export function saveEmailPreferences(data: EmailPreferences, expectedUpdatedAt: string | null) {
  const errors = validateEmailPreferences(data);
  if (errors.length) throw new Error(errors.join("\n"));
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const existing = listResources("email-preferences")[0];
    if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) throw new Error("Email preferences changed in another tab. Reload before saving.");
    const updatedAt = now();
    if (existing) {
      conn.prepare("UPDATE resources SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), updatedAt, existing.id);
    } else {
      conn.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)").run("workspace_email_preferences", "email-preferences", "Email Preferences", "Active", "Workspace email preferences", updatedAt, JSON.stringify(data));
    }
    if (data.removeBotClicks) conn.exec("UPDATE message_events SET event_type = 'bot_clicked' WHERE event_type = 'clicked' AND (json_extract(data_json, '$.bot') = 1 OR json_extract(data_json, '$.attributes.bot') = 1 OR json_extract(data_json, '$.attributes.isBot') = 1)");
    audit("email_preferences", "workspace_email_preferences", "updated", {});
    conn.exec("COMMIT");
    return { data, updatedAt };
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}

const localCanvasId = "canvas_local_main";
export type CanvasRecord = { id: string; name: string; status: string; description: string; updatedAt: string; createdAt: string; createdBy: string; lastEditedBy: string; tags: string[]; team: string; experience: string; targetSegment: string; alertsConfigured: boolean; wizard: CanvasWizardConfig };
function canvasResource(id: string) {
  const resource = getResource(id);
  return resource?.type === "canvas" ? resource : null;
}
function canvasGraph(resource: ResourceRecord): CanvasGraph {
  return isCanvasGraph(resource.data) && resource.data.nodes.length ? resource.data as CanvasGraph : structuredClone(initialCanvasGraph);
}
function canvasRecord(resource: ResourceRecord): CanvasRecord {
  const metadata = resource.data;
  return { id: resource.id, name: resource.name, status: resource.status, description: resource.description,
    updatedAt: resource.updatedAt, createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : resource.updatedAt,
    createdBy: typeof metadata.createdBy === "string" ? metadata.createdBy : "Local workspace",
    lastEditedBy: typeof metadata.lastEditedBy === "string" ? metadata.lastEditedBy : "Local workspace",
    tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : [],
    team: typeof metadata.team === "string" ? metadata.team : "", experience: typeof metadata.experience === "string" ? metadata.experience : "Canvas Flow",
    targetSegment: typeof metadata.targetSegment === "string" ? metadata.targetSegment : "All Users", alertsConfigured: metadata.alertsConfigured === true,
    wizard: normalizeCanvasWizard(metadata.wizard) };
}
export function listCanvases() { return listResources("canvas").map(canvasRecord); }
export function getCanvas(id: string) { const resource = canvasResource(id); return resource ? canvasRecord(resource) : null; }
export function createCanvas(input: { name: string; description?: string; tags?: string[]; graph?: CanvasGraph; wizard?: CanvasWizardConfig }) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("Canvas name must be 1–120 characters.");
  if (listCanvases().some(item => item.name.toLowerCase() === name.toLowerCase() && item.status !== "Archived")) throw new Error("A Canvas with this name already exists.");
  const timestamp = now();
  const resource: ResourceRecord = { id: crypto.randomUUID(), type: "canvas", name, status: "Draft", description: input.description?.trim() ?? "", updatedAt: timestamp,
    data: { ...(input.graph ?? structuredClone(initialCanvasGraph)), createdAt: timestamp, createdBy: "Local workspace", lastEditedBy: "Local workspace", tags: assignTags(db(), input.tags, "canvas"), experience: "Canvas Flow", targetSegment: "All Users", alertsConfigured: false, wizard: input.wizard ?? structuredClone(defaultCanvasWizard) } };
  db().prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)").run(resource.id, resource.type, resource.name, resource.status, resource.description, resource.updatedAt, JSON.stringify(resource.data));
  audit("canvas", resource.id, "created", {});
  return canvasRecord(resource);
}
export function updateCanvas(id: string, input: { name?: string; description?: string; tags?: string[]; status?: string; alertsConfigured?: boolean; wizard?: CanvasWizardConfig }, expectedUpdatedAt?: string) {
  const existing = canvasResource(id);
  if (!existing) throw new Error("Canvas not found.");
  const name = input.name?.trim() ?? existing.name;
  if (!name || name.length > 120) throw new Error("Canvas name must be 1–120 characters.");
  if (input.status && !["Draft", "Active", "Stopped", "Archived"].includes(input.status)) throw new Error("Invalid Canvas status.");
  if (input.tags && (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== "string"))) throw new Error("Invalid tags.");
  if (existing.status === "Active" && input.wizard && JSON.stringify(normalizeCanvasWizard(input.wizard).conversionEvents) !== JSON.stringify(normalizeCanvasWizard(existing.data.wizard).conversionEvents)) throw new Error("Conversion events cannot be changed after a Canvas has launched.");
  if (listCanvases().some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase() && item.status !== "Archived")) throw new Error("A Canvas with this name already exists.");
  return canvasRecord(updateResource(id, { name, description: input.description ?? existing.description, status: input.status ?? existing.status,
    data: { ...existing.data, tags: input.tags ?? existing.data.tags ?? [], alertsConfigured: input.alertsConfigured ?? existing.data.alertsConfigured ?? false,
      wizard: input.wizard ? normalizeCanvasWizard(input.wizard) : existing.data.wizard ?? structuredClone(defaultCanvasWizard), lastEditedBy: "Local workspace" } }, expectedUpdatedAt));
}
export function duplicateCanvas(id: string) {
  const source = canvasResource(id);
  if (!source) throw new Error("Canvas not found.");
  let name = `${source.name} copy`; let suffix = 2;
  while (listCanvases().some(item => item.name.toLowerCase() === name.toLowerCase() && item.status !== "Archived")) name = `${source.name} copy ${suffix++}`;
  const graph = canvasGraph(source);
  return createCanvas({ name, description: source.description, tags: canvasRecord(source).tags, wizard: canvasRecord(source).wizard,
    graph: { ...graph, nodes: graph.nodes.map(node => node.config?.linkedCampaignId ? { ...node, config: { ...node.config, linkedCampaignId: undefined } } : node) } });
}
function resolveCanvasLinkedMessages(graph: CanvasGraph): CanvasGraph {
  return { ...graph, nodes: graph.nodes.map(node => {
    if (node.kind !== "message" || !node.config?.linkedCampaignId) return node;
    const campaign = getCampaign(node.config.linkedCampaignId);
    if (!campaign || campaign.channel !== node.config.channel) return node;
    return { ...node, config: { ...node.config, ...campaign.config, subject: campaign.subject ?? node.config.subject, message: campaign.body ?? node.config.message, linkedCampaignId: campaign.id } };
  }) };
}
export function getCanvasWorkspace(canvasId = localCanvasId) {
  const resource = canvasResource(canvasId);
  const rows = db().prepare("SELECT * FROM canvas_runs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 8").all(canvasId) as Record<string, unknown>[];
  const runs: CanvasRun[] = rows.map(row => {
    const due = db().prepare("SELECT min(due_at) AS due_at FROM canvas_pending_steps WHERE run_id = ?").get(String(row.id)) as { due_at: string | null };
    return { id: String(row.id), createdAt: String(row.created_at), entered: Number(row.entered_count), completed: Number(row.completed_count), messages: Number(row.message_count), traces: parseJson(String(row.traces_json), [] as CanvasTrace[]), nextDueAt: due.due_at };
  });
  return { graph: resource ? resolveCanvasLinkedMessages(canvasGraph(resource)) : null, updatedAt: resource?.updatedAt ?? null, runs, canvas: resource ? canvasRecord(resource) : null };
}

export function saveCanvasGraph(graph: CanvasGraph, expectedUpdatedAt?: string | null, canvasId = localCanvasId) {
  const existing = canvasResource(canvasId);
  if (existing && expectedUpdatedAt !== undefined && expectedUpdatedAt !== existing.updatedAt) throw new Error("Canvas draft changed in another tab. Reload before saving.");
  graph = resolveCanvasLinkedMessages({ ...graph, nodes: graph.nodes.map(node => node.kind === "message" && node.config?.channel === "email" ? { ...node, config: { ...emailPreferenceCampaignDefaults(getEmailPreferences().data), ...((existing?.data as unknown as CanvasGraph)?.nodes?.find(saved => saved.id === node.id)?.config ?? {}), ...node.config } } : node) });
  const updatedAt = now();
  if (!existing && canvasId !== localCanvasId) throw new Error("Canvas not found.");
  db().prepare("INSERT INTO resources VALUES (?, 'canvas', ?, 'Draft', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, data_json=excluded.data_json")
    .run(canvasId, existing?.name ?? "Local canvas draft", existing?.description ?? "Saved visual journey graph", updatedAt, JSON.stringify({ ...existing?.data, ...graph, lastEditedBy: "Local workspace" }));
  audit("canvas", canvasId, existing ? "updated" : "created", { nodeCount: graph.nodes.length, edgeCount: graph.edges.length });
  return { graph, updatedAt };
}

function advanceCanvasUser(graph: CanvasGraph, canvasId: string, runId: string, userId: string, startNodeId: string, timestamp: string, steps: CanvasTrace["steps"]) {
  const globalSettings = globalControlSettings();
  const canvasTags = canvasResource(canvasId)?.data.tags;
  // Also recheck resumed users: enabling holdout must stop pending sends.
  if (heldByGlobalControl(userId, globalSettings, canvasTags)) return { completed: true, messages: 0 };
  let current = graph.nodes.find(node => node.id === startNodeId);
  let messages = 0;
  while (current) {
    steps.push({ nodeId: current.id, label: current.label, kind: current.kind, at: timestamp });
    const routes = graph.edges.filter(([from]) => from === current!.id);
    if (current.kind === "delay" && routes[0]) {
      const dueAt = new Date(new Date(timestamp).getTime() + Number(current.config?.durationHours) * 3_600_000).toISOString();
      db().prepare("INSERT INTO canvas_pending_steps VALUES (?, ?, ?, ?) ON CONFLICT(run_id,user_id) DO UPDATE SET next_node_id=excluded.next_node_id, due_at=excluded.due_at").run(runId, userId, routes[0][1], dueAt);
      return { completed: false, messages };
    }
    if (current.kind === "update" && current.config?.attribute) {
      if (current.config.attribute === "subscribed") {
        if (current.config.value !== "true" && current.config.value !== "false") throw new Error("Set subscribed to true or false before launching.");
        setUserSubscription(userId, current.config.value === "true");
      }
      else if (current.config.attribute === "country" || current.config.attribute === "lifecycle") db().prepare(`UPDATE users SET ${current.config.attribute} = ? WHERE id = ?`).run(current.config.value ?? "", userId);
      else {
        const user = getUser(userId);
        if (user) db().prepare("UPDATE users SET attributes_json = ? WHERE id = ?").run(JSON.stringify({ ...user.attributes, [current.config.attribute]: current.config.value }), userId);
      }
    }
    if (current.kind === "message") {
      const channel = (current.config?.channel ?? "email") as Channel;
      const groupId = typeof current.config?.subscriptionGroupId === "string" ? current.config.subscriptionGroupId : undefined;
      const group = groupId ? getSubscriptionGroup(groupId) : null;
      const user = getUser(userId);
      const expectedChannel = channel === "email" ? "Email" : channel === "sms" ? "SMS" : channel === "whatsapp" ? "WhatsApp" : null;
      const member = group ? db().prepare("SELECT state FROM subscription_group_memberships WHERE group_id = ? AND user_id = ?").get(group.id, userId) as { state: SubscriptionState } | undefined : undefined;
      const sendMode = normalizeCanvasWizard(canvasResource(canvasId)?.data.wizard).send.subscriptionMode;
      const emailEligible = sendMode === "all" || (sendMode === "opted_in_only" ? user?.emailSubscriptionStatus === "opted_in" : user?.emailSubscriptionStatus !== "unsubscribed");
      const eligible = Boolean(user?.reachable) && (channel !== "email" || emailEligible)
        && (channel !== "sms" && channel !== "whatsapp" || Boolean(groupId))
        && (!groupId || group?.status === "Active" && group.channel === expectedChannel && member?.state === "subscribed");
      if (eligible && workspaceRateLimited(timestamp)) {
        const dueAt = new Date(new Date(timestamp).getTime() + 60000).toISOString();
        db().prepare("INSERT INTO canvas_pending_steps VALUES (?, ?, ?, ?) ON CONFLICT(run_id,user_id) DO UPDATE SET next_node_id=excluded.next_node_id, due_at=excluded.due_at").run(runId, userId, current.id, dueAt);
        db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), canvasId, channel, userId, "deferred", timestamp, JSON.stringify({ canvasRunId: runId, nodeId: current.id, reason: "workspace_rate_limit", dueAt }));
        return { completed: false, messages };
      }
      const frequencyHeld = eligible && workspaceFrequencyCapped(userId, channel, timestamp);
      let eventData: Record<string, unknown> = eligible && !frequencyHeld && channel === "email"
        ? { canvasRunId: runId, nodeId: current.id, simulated: true, message: prepareEmailMessage({ subject: current.config?.subject, body: current.config?.message, config: current.config }, userId, "campaign") }
        : { canvasRunId: runId, nodeId: current.id, simulated: true, reason: eligible ? undefined : "subscription_or_reachability" };
      let eventType = eligible ? frequencyHeld ? "frequency_capped" : "delivered" : "suppressed";
      eventData = { ...eventData, globalControlGeneration: globalSettings.enabled ? globalSettings.seed : null, globalControlCohort: userGlobalCohort(userId, globalSettings) };
      if (eventType === "delivered" && channel === "whatsapp") {
        try { const config = current.config ?? {}; const variants = normalizeWhatsAppVariants({ config }); const index = createHash("sha256").update(`${canvasId}:${current.id}:${userId}`).digest()[0] % variants.length; const eligibility = whatsAppResponseEligibility(variants[index].mode, latestWhatsAppInbound(user?.attributes, listResources("user-events").filter(event => event.data.userId === userId), timestamp), timestamp); if (!eligibility.eligible) throw new Error(eligibility.reason); eventData = { ...eventData, conversationEligibility: eligibility, variantId: variants[index].id, message: prepareWhatsAppMessage(variants[index], customWhatsAppTemplates({ config }), { ...user?.attributes, first_name: user?.firstName, country: user?.country, user_id: userId }) }; }
        catch (cause) { eventType = "failed"; eventData = { ...eventData, error: cause instanceof Error ? cause.message : "WhatsApp rendering failed." }; }
      }
      db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)").run(uid("evt"), canvasId, channel, userId, eventType, timestamp, JSON.stringify(eventData));
      if (eventType === "delivered") messages += 1;
    }
    const user = getUser(userId);
    const condition = current.kind === "branch" && current.config?.attribute
      ? String(current.config.attribute === "subscribed" ? user?.subscribed : current.config.attribute === "country" ? user?.country : user?.lifecycle) === current.config.value : true;
    const nextId = routes[current.kind === "branch" && !condition ? 1 : 0]?.[1];
    current = graph.nodes.find(node => node.id === nextId);
  }
  return { completed: true, messages };
}

function canvasFilterMatches(filter: CanvasFilter, user: UserRecord) {
  const actual = filter.field === "emailSubscriptionStatus" ? user.emailSubscriptionStatus : user[filter.field];
  const matches = String(actual).toLowerCase() === filter.value.trim().toLowerCase();
  return filter.operator === "is_not" ? !matches : matches;
}

function canvasAudienceMatches(config: CanvasWizardConfig["audience"], user: UserRecord) {
  const segments = listResources("segments");
  const inSegments = config.segmentIds.every(id => {
    const resource = segments.find(segment => segment.id === id);
    const rule = (resource?.data.filters as Array<{ field?: string; value?: unknown; attribute?: string }> | undefined)?.[0];
    if (!rule) return false;
    const actual = rule.field === "attribute" && rule.attribute ? user.attributes[rule.attribute] : rule.field === "subscribed" ? Number(user.subscribed) : rule.field === "reachable" ? Number(user.reachable) : rule.field === "country" ? user.country : rule.field === "lifecycle" ? user.lifecycle : undefined;
    return String(actual) === String(rule.value);
  });
  const filtersMatch = config.filters.length === 0 || (config.filterOperator === "AND" ? config.filters.every(filter => canvasFilterMatches(filter, user)) : config.filters.some(filter => canvasFilterMatches(filter, user)));
  return inSegments && filtersMatch && !config.exclusionFilters.some(filter => canvasFilterMatches(filter, user)) && !config.exitSegmentIds.some(id => {
    const segment = segments.find(item => item.id === id);
    const rule = (segment?.data.filters as Array<{ field?: string; value?: unknown; attribute?: string }> | undefined)?.[0];
    if (!rule) return false;
    const actual = rule.field === "attribute" && rule.attribute ? user.attributes[rule.attribute] : rule.field === "subscribed" ? Number(user.subscribed) : rule.field === "reachable" ? Number(user.reachable) : rule.field === "country" ? user.country : rule.field === "lifecycle" ? user.lifecycle : undefined;
    return String(actual) === String(rule.value);
  }) && !config.exitFilters.some(filter => canvasFilterMatches(filter, user));
}

export function launchCanvasGraph(canvasId = localCanvasId): CanvasRun {
  const saved = canvasResource(canvasId);
  if (!saved) throw new Error("Save the Canvas draft before launching.");
  if (saved.status === "Archived") throw new Error("Archived Canvases cannot be launched.");
  assertWorkspaceApproval("canvas", canvasId);
  const graph = resolveCanvasLinkedMessages(canvasGraph(saved));
  const wizard = saved.data.wizard ? normalizeCanvasWizard(saved.data.wizard) : null;
  const issues = [...(wizard ? canvasWizardIssues(wizard, graph).map(issue => issue.detail) : validateCanvasGraph(graph)), ...graph.nodes.filter(node => node.kind === "message" && node.config?.channel === "email").flatMap(node => emailSendingIssues({ config: node.config }, getEmailPreferences().data))];
  if (issues.length) throw new Error(issues.join(" "));
  const timestamp = getDemoState().simulatedTime;
  const entry = graph.nodes.find(node => node.kind === "entry")!;
  const reEntry = wizard ? wizard.audience.reentryEnabled ? "window" : "none" : entry.config?.reEntry ?? "none";
  const cutoff = wizard && reEntry === "window" ? wizard.audience.reentryValue * (wizard.audience.reentryUnit === "Hours" ? 3_600_000 : 86_400_000) : reEntry === "after1d" ? 86_400_000 : reEntry === "after7d" ? 7 * 86_400_000 : 0;
  const candidates = db().prepare("SELECT id FROM users WHERE reachable = 1 ORDER BY id LIMIT 100").all() as { id: string }[];
  const globalSettings = globalControlSettings();
  const users = candidates.filter(user => {
    if (heldByGlobalControl(user.id, globalSettings, saved.data.tags)) return false;
    const profile = wizard ? getUser(user.id) : null;
    if (wizard && (!profile || !canvasAudienceMatches(wizard.audience, profile))) return false;
    const history = db().prepare("SELECT last_entered_at FROM canvas_entry_history WHERE canvas_id = ? AND user_id = ?").get(canvasId, user.id) as { last_entered_at: string } | undefined;
    const pending = db().prepare("SELECT 1 FROM canvas_pending_steps p JOIN canvas_runs r ON r.id = p.run_id WHERE r.canvas_id = ? AND p.user_id = ? LIMIT 1").get(canvasId, user.id);
    return !pending && (!history || reEntry === "always" || cutoff > 0 && new Date(timestamp).getTime() - new Date(history.last_entered_at).getTime() >= cutoff);
  }).slice(0, wizard?.audience.volumeEnabled ? Math.min(10, wizard.audience.maxEntries) : 10);
  const runId = uid("canvasrun");
  let messages = 0; let completed = 0;
  const traces: CanvasTrace[] = [];
  db().exec("BEGIN");
  try {
    for (const user of users) {
      db().prepare("INSERT INTO canvas_entry_history VALUES (?, ?, ?) ON CONFLICT(canvas_id,user_id) DO UPDATE SET last_entered_at=excluded.last_entered_at").run(canvasId, user.id, timestamp);
      const steps: CanvasTrace["steps"] = [];
      const result = advanceCanvasUser(graph, canvasId, runId, user.id, entry.id, timestamp, steps);
      messages += result.messages;
      if (result.completed) completed += 1;
      traces.push({ userId: user.id, steps });
    }
    const run: CanvasRun = { id: runId, createdAt: timestamp, entered: users.length, completed, messages, traces };
    db().prepare("INSERT INTO canvas_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(run.id, canvasId, timestamp, run.entered, run.completed, run.messages, JSON.stringify(graph), JSON.stringify(traces));
    db().prepare("UPDATE resources SET status = 'Active' WHERE id = ?").run(canvasId);
    audit("canvas", canvasId, "launched", { runId, entered: run.entered, completed, messages });
    db().exec("COMMIT");
    return run;
  } catch (error) { db().exec("ROLLBACK"); throw error; }
}

function processDueCanvasSteps(timestamp: string) {
  const pending = db().prepare("SELECT run_id, user_id, next_node_id FROM canvas_pending_steps WHERE due_at <= ? ORDER BY due_at, run_id, user_id").all(timestamp) as Array<{ run_id: string; user_id: string; next_node_id: string }>;
  let resumed = 0;
  for (const job of pending) {
    db().exec("BEGIN");
    try {
      const row = db().prepare("SELECT * FROM canvas_runs WHERE id = ?").get(job.run_id) as Record<string, unknown> | undefined;
      if (!row) { db().prepare("DELETE FROM canvas_pending_steps WHERE run_id = ? AND user_id = ?").run(job.run_id, job.user_id); db().exec("COMMIT"); continue; }
      const graph = parseJson(String(row.snapshot_json), { nodes: [], edges: [] } as CanvasGraph);
      const traces = parseJson(String(row.traces_json), [] as CanvasTrace[]);
      const trace = traces.find(item => item.userId === job.user_id);
      db().prepare("DELETE FROM canvas_pending_steps WHERE run_id = ? AND user_id = ?").run(job.run_id, job.user_id);
      const result = advanceCanvasUser(graph, String(row.canvas_id), job.run_id, job.user_id, job.next_node_id, timestamp, trace?.steps ?? []);
      db().prepare("UPDATE canvas_runs SET completed_count = completed_count + ?, message_count = message_count + ?, traces_json = ? WHERE id = ?").run(result.completed ? 1 : 0, result.messages, JSON.stringify(traces), job.run_id);
      resumed += 1;
      db().exec("COMMIT");
    } catch (error) { db().exec("ROLLBACK"); throw error; }
  }
  return resumed;
}

export function listCatalogs() {
  const catalogs = listResources("catalogs"); const conn = db();
  return catalogs.map(catalog => ({ ...catalog, itemCount: (conn.prepare("SELECT count(*) AS count FROM catalog_items WHERE catalog_id = ?").get(catalog.id) as { count: number }).count }));
}
export function createCatalog(input: string | { id?: string; name: string; description?: string; data?: Record<string, unknown> }) {
  const value = typeof input === "string" ? { name: input } : input;
  validateCatalogName(value.name);
  validateFields(catalogFields(value.data ?? {}), "api");
  const duplicate = listResources("catalogs").find(record => record.name.toLowerCase() === value.name.toLowerCase());
  if (duplicate && duplicate.id !== value.id) throw new CatalogValidationError("Catalog names must be unique.", "duplicate_catalog_name");
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

export function createCatalogWithItems(input: { id?: string; name: string; description?: string; fields: CatalogField[]; items: Array<{ id: string; name: string; fields?: Record<string, unknown> }>; source: "browser" | "csv" }) {
  validateCatalogName(input.name); validateFields(input.fields, input.source);
  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.id)) throw new CatalogValidationError(`Duplicate item id: ${item.id}.`, "duplicate_item_id");
    seen.add(item.id); validateCatalogItem(item, input.fields);
  }
  const conn = db(); conn.exec("BEGIN");
  try {
    const record = createCatalog({ id: input.id, name: input.name, description: input.description, data: { fields: input.fields.map(field => field.name), fieldTypes: Object.fromEntries(input.fields.map(field => [field.name, field.type])), source: input.source === "csv" ? "CSV upload" : "Braze", size: `${Math.max(1, Math.ceil(JSON.stringify(input.items).length / 1024))}KB` } });
    const insert = conn.prepare("INSERT INTO catalog_items VALUES (?, ?, ?, ?, ?)"); const timestamp = now();
    for (const item of input.items) insert.run(item.id, record.id, item.name || item.id, JSON.stringify(item.fields ?? {}), timestamp);
    conn.exec("COMMIT"); return { ...record, itemCount: input.items.length };
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}

export function addCatalogFields(catalogId: string, fields: CatalogField[]) {
  const catalog = getResource(catalogId); if (!catalog || catalog.type !== "catalogs") throw new CatalogValidationError("Catalog not found.", "catalog_not_found");
  validateFields(fields, "browser");
  const current = catalogFields(catalog.data); validateFields([...current, ...fields], "api");
  const data = { ...catalog.data, fields: [...current, ...fields].map(field => field.name), fieldTypes: Object.fromEntries([...current, ...fields].map(field => [field.name, field.type])) };
  return updateCatalog(catalogId, { data });
}

export function applyCatalogItemCsvUpdate(catalogId: string, mode: "merge" | "delete", items: Array<{ id: string; name?: string; fields?: Record<string, unknown> }>) {
  const catalog = getResource(catalogId); if (!catalog || catalog.type !== "catalogs") throw new CatalogValidationError("Catalog not found.", "catalog_not_found");
  const fields = catalogFields(catalog.data); const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new CatalogValidationError(`Duplicate item id: ${item.id}.`, "duplicate_item_id");
    ids.add(item.id);
    if (mode === "delete") { if (!item.id?.trim()) throw new CatalogValidationError("Each CSV row requires an id.", "invalid_item_id"); }
    else validateCatalogItem({ ...item, name: item.name ?? item.id }, fields);
  }
  const conn = db(); conn.exec("BEGIN");
  try {
    if (mode === "delete") { const remove = conn.prepare("DELETE FROM catalog_items WHERE catalog_id = ? AND id = ?"); for (const item of items) remove.run(catalogId, item.id); }
    else { const upsert = conn.prepare("INSERT INTO catalog_items VALUES (?, ?, ?, ?, ?) ON CONFLICT(catalog_id,id) DO UPDATE SET name=excluded.name, fields_json=excluded.fields_json, updated_at=excluded.updated_at"); const timestamp = now(); for (const item of items) upsert.run(item.id, catalogId, item.name || item.id, JSON.stringify(item.fields ?? {}), timestamp); }
    audit("catalog_item", catalogId, mode === "delete" ? "csv_deleted" : "csv_merged", { items: items.length }); conn.exec("COMMIT"); return listCatalogItems(catalogId);
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}
export function updateCatalog(id: string, patch: Partial<Pick<ResourceRecord, "name" | "description" | "data" | "status">>) {
  const current = getResource(id); if (!current || current.type !== "catalogs") return null;
  if (patch.name && patch.name !== current.name) throw new CatalogValidationError("Catalog names cannot be changed after creation.", "catalog_name_immutable");
  if (patch.data) {
    const currentFields = catalogFields(current.data); const nextFields = catalogFields(patch.data); validateFields(nextFields, "api");
    for (const field of currentFields) {
      const next = nextFields.find(candidate => candidate.name === field.name);
      if (!next || next.type !== field.type) throw new CatalogValidationError("Existing catalog fields and field types cannot be changed.", "catalog_schema_immutable");
    }
  }
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
export function subscribeCatalogItem(catalogId: string, input: { userId?: string; itemId?: string; subscriptionType?: string }) {
  const userId = String(input.userId ?? "").trim();
  const itemId = String(input.itemId ?? "").trim();
  if (!userId || !itemId) throw new Error("userId and itemId are required");
  const subscriptionType = String(input.subscriptionType ?? "back_in_stock");
  db().prepare("INSERT OR IGNORE INTO catalog_subscriptions VALUES (?, ?, ?, ?, ?)").run(catalogId, userId, itemId, subscriptionType, now());
  audit("catalog", catalogId, "subscribed", { userId, itemId, subscriptionType });
  return listCatalogSubscriptions(catalogId, 10);
}

// Runs the back-in-stock / price-drop rules for a catalog: queues a push
// notification per matching subscription and expires it after sending.
export function runCatalogNotifications(catalogId: string) {
  const catalog = getResource(catalogId);
  if (!catalog) throw new Error("Catalog not found");
  const catalogData = (catalog.data ?? {}) as Record<string, unknown>;
  const settings = (catalogData.settings ?? {}) as { backInStock?: boolean; priceDrop?: boolean; inventoryField?: string; priceField?: string };
  if (!settings.backInStock && !settings.priceDrop) throw new Error("Enable the back-in-stock or price-drop rule first.");
  const items = listCatalogItems(catalogId);
  const subs = db().prepare("SELECT user_id, item_id FROM catalog_subscriptions WHERE catalog_id = ?").all(catalogId) as Array<{ user_id: string; item_id: string }>;
  const insertEvent = db().prepare("INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)");
  const timestamp = now();
  let queued = 0; let skipped = 0;
  for (const sub of subs) {
    if (queued >= 50) { skipped += 1; continue; }
    const item = items.find(candidate => candidate.id === sub.item_id);
    if (!item) { skipped += 1; continue; }
    const fields = item.fields ?? {};
    const inStock = settings.backInStock && settings.inventoryField ? Number(fields[settings.inventoryField] ?? 0) > 0 : false;
    const priceDropped = settings.priceDrop && settings.priceField ? Number(fields[settings.priceField] ?? 0) > 0 : false;
    if (!inStock && !priceDropped) { skipped += 1; continue; }
    const kind = inStock ? "back_in_stock" : "price_drop";
    insertEvent.run(uid("evt"), catalogId, "push", sub.user_id, "delivered", timestamp, JSON.stringify({ catalogNotification: { kind, item: item.id, name: item.name } }));
    db().prepare("DELETE FROM catalog_subscriptions WHERE catalog_id = ? AND user_id = ? AND item_id = ?").run(catalogId, sub.user_id, sub.item_id);
    queued += 1;
  }
  audit("catalog", catalogId, "notification_check", { queued, skipped });
  return { queued, skipped, remaining: Math.max(0, subs.length - queued - skipped) };
}

export function listCatalogItems(catalogId: string, q = ""): Array<{ id: string; name: string; fields: Record<string, unknown>; updatedAt: string }> {
  const rows = db().prepare("SELECT * FROM catalog_items WHERE catalog_id = ? AND (lower(name) LIKE lower(?) OR lower(id) LIKE lower(?)) ORDER BY updated_at DESC").all(catalogId, `%${q}%`, `%${q}%`) as Record<string, unknown>[];
  return rows.map(row => ({ id: String(row.id), name: String(row.name), fields: parseJson<Record<string, unknown>>(String(row.fields_json), {}), updatedAt: String(row.updated_at) }));
}
export function upsertCatalogItem(catalogId: string, input: { id: string; name: string; fields?: Record<string, unknown> }) {
  const catalog = getResource(catalogId); if (!catalog || catalog.type !== "catalogs") throw new CatalogValidationError("Catalog not found.", "catalog_not_found");
  validateCatalogItem(input, catalogFields(catalog.data)); const updatedAt = now();
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
  const catalog = getResource(catalogId); if (!catalog || catalog.type !== "catalogs") throw new CatalogValidationError("Catalog not found.", "catalog_not_found");
  const current = getCatalogSelection(catalogId, originalName ?? input.name);
  validateSelection(input as CatalogSelectionInput, catalogFields(catalog.data), listCatalogSelections(catalogId).length, Boolean(current));
  if (originalName && originalName !== input.name) throw new CatalogValidationError("Selection names cannot be changed after creation.", "selection_name_immutable");
  if (!originalName && current) throw new CatalogValidationError("A selection with this name already exists.", "duplicate_selection_name");
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
  return row ? { ...mapUser(row), globalControlGroup: userGlobalCohort(id, globalControlSettings()) === "control" } : null;
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
  const profile = {
    ...user.attributes,
    user_id: user.id,
    email: user.email,
    email_address: user.email,
    first_name: user.firstName,
    country: user.country,
  };
  const catalog = getResource(catalogId);
  const items = selectCatalogRows(listCatalogItems(catalogId), selection, profile, `${catalog?.name.toLowerCase() ?? catalogId}:${name}`);
  return { selection, user, items };
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
  const canvasPending = db().prepare("SELECT count(*) AS count FROM canvas_pending_steps").get() as { count: number };
  return { simulatedTime: saved?.value ?? now(), pendingReceipts: pending.count, pendingCanvasSteps: canvasPending.count };
}

export function demoAction(action: string) {
  const conn = db();
  if (action === "reset") { conn.exec("DELETE FROM webhook_attempts; DELETE FROM message_events; DELETE FROM execution_runs; DELETE FROM canvas_pending_steps; DELETE FROM canvas_entry_history; DELETE FROM canvas_runs; DELETE FROM demo_receipts; DELETE FROM demo_state; DELETE FROM audit_log; DELETE FROM campaigns; DELETE FROM users; DELETE FROM catalog_subscriptions; DELETE FROM catalog_selections; DELETE FROM catalog_items; DELETE FROM resources; DELETE FROM subscription_group_memberships; DELETE FROM subscription_groups; DELETE FROM preference_center_events; DELETE FROM preference_center_versions; DELETE FROM preference_centers;"); seed(conn); seedSampleCatalog(conn); return { message: "Sample data reset", state: getDemoState() }; }
  if (action === "advance") {
    const current = getDemoState().simulatedTime;
    const next = new Date(new Date(current).getTime() + 86_400_000).toISOString();
    conn.prepare("INSERT INTO demo_state VALUES ('simulated_time', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(next);
    const resumed = processDueCanvasSteps(next);
    audit("demo", "simulated_time", "advanced", { from: current, to: next, resumedCanvasSteps: resumed });
    return { message: `Demo clock advanced to ${next}. ${resumed} Canvas steps resumed.`, state: getDemoState() };
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

export function updateUserEmail(id: string, email: string) {
  const user = getUser(id); if (!user) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const suppressed = db().prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND subscribed = 0 AND id != ? LIMIT 1").get(email, id);
  const changed = user.email.toLowerCase() !== email.toLowerCase();
  const subscribed = changed && getEmailPreferences().data.sending.resubscribe && !suppressed ? true : user.subscribed;
  const emailStatus = subscribed ? changed && !user.subscribed ? "subscribed" : user.emailSubscriptionStatus : "unsubscribed";
  db().prepare("UPDATE users SET email = ?, subscribed = ?, email_subscription_status = ? WHERE id = ?").run(email, subscribed ? 1 : 0, emailStatus, id);
  audit("user", id, "email_updated", { changed, subscribed }); return getUser(id);
}
export function syncEmailLinkAliases(campaign: CampaignRecord) {
  const explicit = Array.isArray(campaign.config.emailLinkAliases) ? campaign.config.emailLinkAliases as Array<{ alias: string; url: string; tracking: boolean }> : [];
  const links = [...extractEmailLinks(campaign.body ?? ""), ...explicit];
  for (const link of links) {
    if (!link.alias.trim() || !/^https?:\/\//i.test(link.url)) continue;
    const existing = listResources("link-aliases").find(row => row.name === link.alias && row.data.campaignId === campaign.id);
    const data = { campaignId: campaign.id, campaignName: campaign.name, url: link.url, editorTracking: link.tracking };
    if (existing) updateResource(existing.id, { data, ...(link.tracking === false ? { status: "Inactive" } : existing.data.editorTracking === false ? { status: "Active" } : {}) });
    else createResource({ type: "link-aliases", name: link.alias, status: link.tracking === false ? "Inactive" : "Active", data });
  }
}
export function emailWorkspaceLiquid(): WorkspaceLiquid {
  const catalogs = listResources("catalogs");
  return { footer: getEmailPreferences().data.pages.footer.enabled ? getEmailPreferences().data.pages.footer.html : "", contentBlocks: Object.fromEntries(listResources("content-blocks").filter(row => row.status !== "Archived").map(row => [row.name,workspaceContentBlockHtml(String(row.data.content ?? ""), row.data.width)])), promotionCodes: Object.fromEntries(listResources("promotion-codes").filter(row => row.status !== "Archived").map(row => [row.name, Array.isArray(row.data.codes) ? row.data.codes as string[] : []])), catalogItems: Object.fromEntries(catalogs.map(catalog => [catalog.name.toLowerCase(), listCatalogItems(catalog.id)])), catalogSelections: Object.fromEntries(catalogs.map(catalog => [catalog.name.toLowerCase(), listCatalogSelections(catalog.id)])) };
}

function assertModuleUnique(type: string, data: Record<string, unknown>, id?: string) {
  const key = ({ "feature-flags": "flagId", "landing-pages": "slug", "localization-settings": "code", "banner-placements": "placementId", "user-management": "email", products: "productId" } as Record<string, string>)[type];
  if (key && listResources(type).some(row => row.id !== id && String(row.data[key]).toLowerCase() === String(data[key]).toLowerCase())) throw new Error(`${key} must be unique in this workspace.`);
}

/** User-data operations used by ingestion, transformations and public forms. */
export function applyProfileRows(rows: Array<Record<string, unknown>>) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error("Provide between 1 and 1,000 rows.");
  for (const row of rows) {
    const id = row.external_id ?? row.id;
    if (typeof id !== "string" || !id.trim() || id.length > 200) throw new Error("Every row needs a valid external_id.");
    if (row.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email))) throw new Error(`Invalid email for ${id}.`);
    if (row.email_subscription_status !== undefined && !["opted_in", "subscribed", "unsubscribed"].includes(String(row.email_subscription_status))) throw new Error("Invalid email subscription status.");
  }
  const conn = db(); let created = 0; let updated = 0;
  conn.exec("SAVEPOINT profile_sync");
  try {
    for (const row of rows) {
      const id = String(row.external_id ?? row.id); const existing = getUser(id);
      const { external_id: _external, id: _id, email, first_name, country, lifecycle, email_subscription_status, attributes, ...custom } = row;
      const status = String(email_subscription_status ?? existing?.emailSubscriptionStatus ?? "subscribed");
      conn.prepare(`INSERT INTO users (id,email,first_name,country,lifecycle,subscribed,reachable,attributes_json,email_subscription_status) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,first_name=excluded.first_name,country=excluded.country,lifecycle=excluded.lifecycle,subscribed=excluded.subscribed,attributes_json=excluded.attributes_json,email_subscription_status=excluded.email_subscription_status`).run(id, String(email ?? existing?.email ?? `${id}@example.test`), String(first_name ?? existing?.firstName ?? ""), String(country ?? existing?.country ?? ""), String(lifecycle ?? existing?.lifecycle ?? "New"), status === "unsubscribed" ? 0 : 1, existing?.reachable === false ? 0 : 1, JSON.stringify({ ...existing?.attributes, ...custom, ...objectValue(attributes) }), status);
      existing ? updated++ : created++;
      audit("user", id, existing ? "profile_updated" : "created", { fields: Object.keys(row) });
    }
    conn.exec("RELEASE profile_sync"); return { created, updated, processed: rows.length };
  } catch (error) { conn.exec("ROLLBACK TO profile_sync; RELEASE profile_sync"); throw error; }
}

function runtimeActiveCampaigns(){return (db().prepare("SELECT * FROM campaigns WHERE status='Active' AND archived_at IS NULL").all() as Record<string,unknown>[]).map(mapCampaign);}
function attributeCampaignConversions(userId:string,event:{name:string;properties?:Record<string,unknown>;productId?:string;price?:number;quantity?:number;currency?:string},sourceEventId:string,timestamp:string){
 const exposures=db().prepare("SELECT * FROM message_events WHERE user_id=? AND event_type IN ('delivered','sent','impression','impressed','control') AND created_at<=? AND COALESCE(json_extract(data_json,'$.test'),0)!=1 AND COALESCE(json_extract(data_json,'$.simulated'),0)!=1 ORDER BY created_at DESC,id DESC").all(userId,timestamp) as Array<{id:string;campaign_id:string;created_at:string;data_json:string}>;
 const seen=new Set<string>(),properties=event.properties??{};
 for(const exposure of exposures){
  if(seen.has(exposure.campaign_id))continue;seen.add(exposure.campaign_id);const campaign=getCampaign(exposure.campaign_id);if(!campaign)continue;
  const entries=resolveConversionEvents(campaign);
  for(const [conversionIndex,definition] of entries.entries()){
   const named=conversionCatalog.find(entry=>entry.type===definition.type),legacy=definition.type==="Makes Purchase"?Boolean(event.productId)||event.name==="purchase":definition.type==="Opens Email"?event.name==="opened"&&(!definition.campaignId||properties.campaignId===definition.campaignId):definition.type==="Clicks Email"?event.name==="clicked"&&(!definition.campaignId||properties.campaignId===definition.campaignId):false;
   const matches=definition.type==="Performs Custom Event"?event.name===definition.eventName:legacy||Boolean(named&&[named.event,definition.type].includes(event.name));
   if(!matches||definition.app&&String(properties.appId??properties.app_id??"")!==definition.app||definition.properties?.some(p=>String(properties[p.key]??"")!==p.value))continue;
   const duration=definition.deadline*({Days:86400000,Hours:3600000,Minutes:60000} as Record<string,number>)[definition.unit];if(!Number.isFinite(duration)||new Date(timestamp).getTime()-new Date(exposure.created_at).getTime()>duration)continue;
   if(db().prepare("SELECT id FROM message_events WHERE campaign_id=? AND user_id=? AND event_type='conversion' AND json_extract(data_json,'$.conversionIndex')=? AND json_extract(data_json,'$.entryEventId')=? LIMIT 1").get(campaign.id,userId,conversionIndex,exposure.id))continue;
   const exposureData=parseJson<Record<string,unknown>>(exposure.data_json,{}),revenue=event.productId?Number(event.price??0)*Number(event.quantity??1):Number(properties.revenue??properties.total_price??properties.value??0);
   db().prepare("INSERT INTO message_events VALUES (?,?,?,?,?,?,?)").run(uid("evt"),campaign.id,campaign.channel,userId,"conversion",timestamp,JSON.stringify({conversionIndex,conversionType:definition.type,sourceEventId,entryEventId:exposure.id,variantId:exposureData.variantId??objectValue(exposureData.attributes).variantId,control:exposureData.control===true,revenue:Number.isFinite(revenue)?revenue:0,currency:event.currency??properties.currency??"USD"}));
  }
 }
}
export function trackProfileEvent(input: { userId: string; name: string; properties?: Record<string, unknown>; productId?: string; price?: number; quantity?: number; currency?: string; createdAt?: string }) {
  if (!getUser(input.userId)) throw new Error("User not found.");
  if (!input.name.trim()) throw new Error("Event name is required.");
  if (!input.productId && listResources("event-blocklist").some(row => row.name === input.name && row.status === "Blocked")) throw new Error("Tracking is blocked for this custom event.");
  if (input.productId && (!Number.isFinite(input.price) || Number(input.price) < 0 || !Number.isFinite(input.quantity ?? 1) || Number(input.quantity ?? 1) <= 0 || !/^[A-Z]{3}$/.test(input.currency ?? "USD"))) throw new Error("Purchases require a nonnegative price, a positive quantity and a three-letter currency.");
  if (input.productId) {
    const product = listResources("products").find(row => row.data.productId === input.productId);
    if (product?.data.trackingEnabled === false) throw new Error("Purchase tracking is disabled for this product.");
  }
  const timestamp=input.createdAt??now();if(!Number.isFinite(new Date(timestamp).getTime()))throw new Error("Choose a valid event timestamp.");
  const event = createResource({ type: "user-events", name: input.name, status: "Recorded", data: { ...input, createdAt: timestamp } });
  attributeCampaignConversions(input.userId,input,event.id,timestamp);
  for(const card of listResources("sdk-messages").filter(r=>r.data.userId===input.userId&&r.data.channel==="content"&&r.status==="Available")){
    const matching=card.data.removalEvent==="purchase"?Boolean(input.productId)||input.name==="purchase":card.data.removalEvent==="custom_event"&&input.name===card.data.removalEventName;
    if(matching&&((card.data.removalProperties??[]) as Array<{key:string;value:string}>).every(p=>String(input.properties?.[p.key]??"")===p.value))updateResource(card.id,{status:"Removed",data:{...card.data,removedAt:now(),removalEventId:event.id}});
  }
  for(const campaign of runtimeActiveCampaigns().filter(c=>c.schedule==="Action-based")){
    if(!campaignTriggeredBy(campaign,input)||!isCampaignUserEligible(campaign,input.userId)||!isWithinCampaignDuration(campaign))continue;const delivery=objectValue(campaign.config.delivery),previous=listResources("campaign-jobs").filter(r=>r.data.campaignId===campaign.id&&r.data.userId===input.userId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    if(previous.length&&(!delivery.reeligible||new Date(previous[0].updatedAt).getTime()+Number(delivery.reentryDays??1)*86400000>Date.now()))continue;
    const due=new Date(Date.now()+Number(delivery.delayMinutes??0)*60000).toISOString();enqueueCampaignJob(campaign,input.userId,due,input.properties??{},event.id);
  }
  audit("user", input.userId, input.productId ? "purchase" : "custom_event", { eventId: event.id, name: input.name });
  return event;
}

export function workspaceTransaction<T>(action: () => T): T { const conn = db(); conn.exec("SAVEPOINT workspace_action"); try { const result = action(); conn.exec("RELEASE workspace_action"); return result; } catch (error) { conn.exec("ROLLBACK TO workspace_action; RELEASE workspace_action"); throw error; } }

export function workspaceAudit(limit = 100) { return db().prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").all(Math.min(10000, Math.max(1, limit))) as Array<{ id: string; entity_type: string; entity_id: string; action: string; created_at: string; detail_json: string }>; }
export function workspaceEventRows(limit = 10000) { return activityLog(Math.min(10000, limit)); }
export function workspaceUsage() { const conn = db(); const count = (table: string) => (conn.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count; return { users: count("users"), campaigns: count("campaigns"), events: count("message_events"), resources: count("resources"), canvasRuns: count("canvas_runs"), customEvents: listResources("user-events").length }; }
export function userFeatureFlags(userId: string) {
  const user = getUser(userId); if (!user) throw new Error("User not found.");
  const assignments = listResources("feature-assignments").filter(r => r.data.userId === userId && getCampaign(String(r.data.campaignId))?.status === "Active");
  return listResources("feature-flags").filter(r => r.status !== "Archived").map(r => { const assignment = assignments.find(a => a.data.flagId === r.data.flagId); return { name: r.name, ...evaluateFlag(r.data, user), ...(assignment ? { enabled: Boolean(assignment.data.enabled), properties: objectValue(assignment.data.properties), matchedRule: "Campaign experiment", campaignId: assignment.data.campaignId } : {}) }; });
}

function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)])); return value; }
export function approvalFingerprint(entity: "campaign" | "canvas", id: string) {
  const record = entity === "campaign" ? getCampaign(id) : canvasResource(id);
  if (!record) throw new Error("Message not found.");
  const snapshot = entity === "campaign" ? (() => { const c = record as CampaignRecord; return { name: c.name, subject: c.subject, body: c.body, audience: c.audience, conversion: c.conversion, schedule: c.schedule, channel: c.channel, config: c.config }; })() : { name: record.name, data: (record as ResourceRecord).data };
  return createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}
function assertWorkspaceApproval(entity: "campaign" | "canvas", id: string) {
  const settings = listResources("approval-workflow")[0]?.data;
  if (!settings?.[entity === "campaign" ? "campaignApproval" : "canvasApproval"]) return;
  if (entity === "campaign" && getCampaign(id)?.channel === "api") return;
  const fingerprint = approvalFingerprint(entity, id);
  const approved = listResources("approval-requests").some(row => row.status === "Approved" && row.data.entity === entity && row.data.entityId === id && row.data.fingerprint === fingerprint);
  if (!approved) throw new Error("Approval is required for the current version. Request review from Approval Workflow before launching.");
}

function workspaceRateLimited(timestamp: string, pending = 0) {
  const limits = listResources("messaging-rate-limits")[0]?.data;
  if (limits?.enforce !== true) return false;
  const at = new Date(timestamp).getTime();
  const counts = (since: number) => Number((db().prepare("SELECT count(*) AS count FROM message_events WHERE event_type = 'delivered' AND created_at >= ? AND created_at <= ?").get(new Date(since).toISOString(), timestamp) as { count: number }).count);
  return counts(at - 60000) + pending >= Number(limits.maxPerMinute) || counts(at - 86400000) + pending >= Number(limits.maxPerDay);
}

function workspaceFrequencyCapped(userId: string, channel: string, timestamp: string) {
  const config = listResources("frequency-capping-rules")[0]?.data;
  if (config?.enabled !== true || !Array.isArray(config.rules)) return false;
  return (config.rules as Array<{ kind: string; limit: number; window: string }>).some(rule => {
    const target = rule.kind === "In-app message" ? "iam" : rule.kind.toLowerCase();
    if (rule.kind !== "All channels" && target !== channel) return false;
    const window = rule.window === "per week" ? 7 * 86400000 : rule.window === "per month" ? 30 * 86400000 : 86400000;
    const cutoff = new Date(new Date(timestamp).getTime() - window).toISOString();
    const count = db().prepare(`SELECT count(*) AS count FROM message_events WHERE user_id = ? AND event_type = 'delivered' AND created_at >= ?${rule.kind === "All channels" ? "" : " AND channel = ?"}`).get(userId, cutoff, ...(rule.kind === "All channels" ? [] : [target])) as { count: number };
    return count.count >= Number(rule.limit);
  });
}
export function prepareEmailMessage(message: { id?: string; subject?: string; body?: string; config?: Record<string, unknown> }, userId: string, kind: "campaign" | "test" | "seed", custom?: Record<string, unknown>) {
  const user = getUser(userId); const profile = { ...user?.attributes, user_id: user?.id, subscribed: user?.subscribed, first_name: user?.firstName, email: user?.email, country: user?.country, ...custom };
  const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const base = (process.env.BRAZE_PUBLIC_URL ?? (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3100")).replace(/\/$/, "");
  const unsubscribe = createResource({ type: "email-subscription-token", name: "Email subscription link", data: { userId, campaignId: message.id, action: "unsubscribe", expiresAt: Date.now() + 30 * 86400000 } });
  const optIn = createResource({ type: "email-subscription-token", name: "Email opt-in link", data: { userId, action: "optIn", expiresAt: Date.now() + 30 * 86400000 } });
  const unsubscribeUrl = `${base}/email/subscription/${unsubscribe.id}`, optInUrl = `${base}/email/subscription/${optIn.id}`;
  const preferences = getEmailPreferences().data;
  const workspace = emailWorkspaceLiquid();
  if (kind === "campaign") {
    const names = [...new Set([...JSON.stringify(message).matchAll(/\{%\s*promotion_code\s+['"]([^'"]+)['"]/g)].map(match => match[1]))];
    for (const name of names) {
      const list = listResources("promotion-codes").find(r => r.name === name && r.status !== "Archived");
      if (!list) throw new Error(`Promotion code list ${name} was not found.`);
      const allocations = listResources("promotion-code-allocations").filter(r => r.data.listId === list.id);
      const existing = allocations.find(r => r.data.userId === userId);
      const code = existing?.data.code ?? (list.data.codes as string[] ?? []).find(code => !allocations.some(r => r.data.code === code));
      if (!code) throw new Error(`Promotion code list ${name} is exhausted.`);
      if (!existing) createResource({ type: "promotion-code-allocations", name, status: "Assigned", data: { listId: list.id, userId, code, campaignId: message.id } });
      workspace.promotionCodes = { ...workspace.promotionCodes, [name]: [String(code)] };
    }
  }
  const attachments=((message.config?.emailAttachments??[]) as Array<{name:string;url:string;mime?:string;content?:string;size?:number}>).map(file=>{const id=/^\/api\/message-assets\/([^/?]+)$/.exec(file.url)?.[1],asset=id?getResource(id):null;return asset?.type==="message-assets"?{...file,mime:String(asset.data.mime),size:Number(asset.data.size),content:String(asset.data.base64)}:file;});
  if(String(message.body).includes("nps_url")){const token=createResource({type:"nps-token",name:"NPS response",data:{campaignId:message.id,userId,expiresAt:Date.now()+30*86400000}});Object.assign(profile,{nps_url:`${base}/api/messages/nps?token=${token.id}`});}
  return compileWorkspaceEmail(message, preferences, { profile, kind, attachments, unsubscribeUrl, optInUrl, pixelUrl: `${base}/api/email-tracking/${unsubscribe.id}?event=opened`, render: source => resolveLiquidPreview(source, { ...profile, unsubscribe_url: unsubscribeUrl, unsubscribe_link: unsubscribeUrl, optin_url: optInUrl, opt_in_url: optInUrl }, "en", workspace, true), trackLink: (url, alias) => {
    const existing = listResources("link-aliases").find(row => row.name === alias && row.status === "Active" && row.data.campaignId === message.id);
    if (!existing) return url;
    const token = createResource({ type: "email-tracking-token", name: alias, data: { userId, campaignId: existing.data.campaignId, alias, url, expiresAt: Date.now() + 30 * 86400000 } });
    return `${base}/api/email-tracking/${token.id}?event=clicked`;
  } });
}


export function listCampaignWorkspaces():Array<{id:string;name:string;current:boolean}>{
 return [{id:"local",name:"Local workspace",current:true},...listResources("workspaces").filter(row=>row.status!=="Archived"&&row.id!=="local").map(row=>({id:row.id,name:row.name,current:false}))];
}
export function copyCampaignToWorkspace(id:string,targetWorkspaceId:string){
 const campaign=getCampaign(id);if(!campaign)throw new Error("Campaign not found.");
 const target=listCampaignWorkspaces().find(workspace=>workspace.id===targetWorkspaceId);if(!target)throw new Error("Choose an existing local workspace.");
 const config=structuredClone(campaign.config);for(const key of ["apiIdentifier","publicId","createdAt","createdBy","lastEditedBy","conversionsLocked","monitoring","approval","approvalFingerprint"])delete config[key];
 config.workspaceId=target.id;config.copiedFrom={campaignId:id,workspaceId:campaign.config.workspaceId??"local"};
 const copy=upsertCampaign({...campaign,id:uid("cmp"),name:`${campaign.name} (Copy)`,status:"Draft",sent:0,config});
 audit("campaign",copy.id,"copied_to_workspace",{user:"Local user",category:"Workspace",before:{sourceCampaignId:id},after:{workspaceId:target.id}});
 return copy;
}
export function getCampaignMonitoring(id:string):CampaignMonitoring{
 if(!getCampaign(id))throw new Error("Campaign not found.");
 const record=getResource(`campaign-monitor:${id}`),alerts=listResources("campaign-monitor-alerts").filter(row=>row.data.campaignId===id);
 return {...defaultCampaignMonitoring(),...record?.data,configured:Boolean(record),localOnly:true,alerts:alerts.map(row=>({id:row.id,createdAt:row.updatedAt,...row.data}))} as CampaignMonitoring;
}
export function saveCampaignMonitoring(id:string,input:unknown){
 if(!getCampaign(id))throw new Error("Campaign not found.");
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Provide Campaign monitoring settings.");
 const value=input as Record<string,unknown>;
 if(typeof value.lowerEnabled!=="boolean"||typeof value.upperEnabled!=="boolean"||!Array.isArray(value.channels)||["lowerDuration","lowerThreshold","upperDuration","upperThreshold"].some(key=>typeof value[key]!=="number"||!Number.isFinite(value[key])))throw new Error("Provide booleans, numeric durations and thresholds, and notification channels.");
 const monitor:CampaignMonitoring={lowerEnabled:value.lowerEnabled,lowerDuration:Number(value.lowerDuration),lowerThreshold:Number(value.lowerThreshold),upperEnabled:value.upperEnabled,upperDuration:Number(value.upperDuration),upperThreshold:Number(value.upperThreshold),channels:[...new Set(value.channels)] as CampaignMonitoring["channels"]};
 monitor.emptyFields=Array.isArray(value.emptyFields)?value.emptyFields.filter((field):field is NonNullable<CampaignMonitoring['emptyFields']>[number]=>typeof field==='string'&&['lowerDuration','lowerThreshold','upperDuration','upperThreshold'].includes(field)&&!monitor[field.startsWith('lower')?'lowerEnabled':'upperEnabled']):[];
 const issues=campaignMonitoringIssues(monitor);if(issues.length)throw new Error(issues.join(" "));
 const before=getCampaignMonitoring(id),timestamp=now();
 db().prepare("INSERT INTO resources VALUES (?, 'campaign-monitoring', ?, 'Active', 'Local Campaign volume monitoring', ?, ?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at").run(`campaign-monitor:${id}`,id,timestamp,JSON.stringify({...monitor,localOnly:true}));
 audit("campaign",id,"monitoring_updated",{user:"Local user",category:"Monitoring",before:{lowerEnabled:before.lowerEnabled,upperEnabled:before.upperEnabled,channels:before.channels},after:monitor});
 return evaluateCampaignMonitoring(id);
}
export function evaluateCampaignMonitoring(id:string,at:Date|string=new Date()){
 const campaign=getCampaign(id);if(!campaign)throw new Error("Campaign not found.");
 const monitor=getCampaignMonitoring(id),time=at instanceof Date?at:new Date(at);if(!Number.isFinite(time.getTime()))throw new Error("Choose a valid monitoring evaluation time.");
 if(!monitor.lowerEnabled&&!monitor.upperEnabled)return monitor;
 for(const side of ["lower","upper"] as const){
  if(!monitor[`${side}Enabled`])continue;const duration=monitor[`${side}Duration`],threshold=monitor[`${side}Threshold`],since=new Date(time.getTime()-duration*60000).toISOString();
  const rows=db().prepare("SELECT id,user_id,event_type,created_at,data_json FROM message_events WHERE campaign_id=? AND created_at>=? AND created_at<=? AND event_type IN ('sent','delivered','impression','impressed')").all(id,since,time.toISOString()) as Array<{id:string;user_id:string;event_type:string;created_at:string;data_json:string}>;
  const count=realCampaignEvents(rows.map(row=>({...row,data:parseJson<Record<string,unknown>>(row.data_json,{})}))).filter(row=>row.event_type==="delivered"||row.event_type==="impression"||row.event_type==="impressed").length;
  const breached=side==="lower"?count<threshold:count>threshold,key=`campaign-monitor-alert:${id}:${side}:${Math.floor(time.getTime()/(duration*60000))}`;
  if(breached&&!getResource(key))db().prepare("INSERT INTO resources VALUES (?, 'campaign-monitor-alerts', ?, 'Recorded', 'Local alert; no external notification dispatched', ?, ?)").run(key,`${campaign.name} ${side} volume`,time.toISOString(),JSON.stringify({campaignId:id,condition:side,count,threshold,duration,channels:monitor.channels,localOnly:true,notificationStatus:"recorded_locally",evaluatedAt:time.toISOString()}));
 }
 const record=getResource(`campaign-monitor:${id}`);if(record)db().prepare("UPDATE resources SET data_json=? WHERE id=?").run(JSON.stringify({...record.data,evaluatedAt:time.toISOString()}),record.id);
 return getCampaignMonitoring(id);
}
export function getCampaignAnalytics(id:string,input:{from?:string;to?:string}={}){
 const campaign=getCampaign(id);if(!campaign)return null;
 const end=input.to??now().slice(0,10),start=input.from??new Date(Date.now()-29*86400000).toISOString().slice(0,10);
 if(!analyticsDateRange(start,end).length)throw new Error("Choose a valid date range of at most 366 days.");
 const rows=db().prepare("SELECT id,user_id,event_type,created_at,data_json FROM message_events WHERE campaign_id=? AND created_at>=? AND created_at<? ORDER BY created_at,id").all(id,`${start}T00:00:00.000Z`,new Date(new Date(`${end}T00:00:00.000Z`).getTime()+86400000).toISOString()) as Array<{id:string;user_id:string;event_type:string;created_at:string;data_json:string}>;
 const logs=db().prepare("SELECT id,action,created_at,detail_json FROM audit_log WHERE entity_type='campaign' AND entity_id=? ORDER BY created_at DESC,id DESC").all(id) as Array<{id:string;action:string;created_at:string;detail_json:string}>;
 const changes=logs.map(row=>{const detail=parseJson<Record<string,unknown>>(row.detail_json,{});return{id:row.id,createdAt:row.created_at,user:String(detail.user??"Local user"),category:String(detail.category??"Campaign activity"),action:row.action,before:detail.before??null,after:detail.after??(Object.keys(detail).length?detail:null)};});
 const audience=estimateConfiguredAudience(campaign);
 return {campaign,events:rows.map(({data_json,...row})=>({...row,data:parseJson<Record<string,unknown>>(data_json,{})})),changes,audience:{...audience,channelBreakdown:[{channel:campaign.channel,reachable:audience.reachable,ltv:audience.ltv}]},monitor:evaluateCampaignMonitoring(id)};
}
