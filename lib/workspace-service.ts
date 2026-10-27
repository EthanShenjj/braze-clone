import "server-only";
import { randomUUID } from "node:crypto";
import { applyProfileRows, approvalFingerprint, createResource, getCampaign, getResource, getUser, listCampaigns, listCanvases, listResources, trackProfileEvent, updateResource, userFeatureFlags, workspaceAudit, workspaceEventRows, workspaceUsage, workspaceTransaction } from "./braze-store";
import { evaluateFlag, objectValue, transformPayload, WorkspaceValidationError } from "./workspace-modules";
import { issueIntegrationKey, listIntegrationKeys, revokeIntegrationKey } from "./integration-auth";

export function workspaceSnapshot(module: string, params: URLSearchParams) {
  if (module === "delivery-metadata") {
    const blocked = new Set(listResources("event-blocklist").filter(row => row.status === "Blocked").map(row => row.name));
    const events = new Map<string, Record<string, string>>();
    for (const row of listResources("user-events")) {
      if (blocked.has(row.name) || row.data.productId) continue;
      const properties = events.get(row.name) ?? {};
      for (const [key, value] of Object.entries(objectValue(row.data.properties))) if (value !== null && ["string", "number", "boolean"].includes(typeof value)) properties[key] = typeof value;
      events.set(row.name, properties);
    }
    return { events: [...events].sort(([a], [b]) => a.localeCompare(b)).map(([name, properties]) => ({ name, properties })), apps: listResources("app-settings").map(row => ({ id: row.id, name: row.name })), campaigns: listCampaigns({ limit: 1000, status: "All" }).data.map(row => ({ id: row.id, name: row.name, status: row.status, channel: row.channel, priority: String(objectValue(row.config?.delivery).iamPriority ?? "Medium") })) };
  }
  if (module === "api-keys") return { data: listIntegrationKeys(), apps: listResources("app-settings") };
  if (module === "calendar") return { campaigns: listCampaigns({ limit: 1000, status: "All" }).data, canvases: listCanvases() };
  if (module === "events") return { data: workspaceEventRows().filter(row => !params.get("user") || String(row.user_id).includes(params.get("user")!)), userEvents: listResources("user-events"), audit: workspaceAudit(500) };
  if (module === "usage") return { usage: workspaceUsage(), plan: "Local workspace", externalBilling: false };
  if (module === "performance") return { usage: workspaceUsage(), userEvents: listResources("user-events"), audit: workspaceAudit(10000), apps: listResources("app-settings") };
  if (module === "approvals") return { settings: listResources("approval-workflow")[0] ?? null, requests: listResources("approval-requests"), campaigns: listCampaigns({ limit: 1000, status: "All" }).data, canvases: listCanvases() };
  if (module === "diagnostics") {
    const events = workspaceEventRows();
    return { data: events, issues: events.filter(row => ["failed", "unreachable", "suppressed", "deferred", "frequency_capped"].includes(String(row.event_type))), credentials: { apns: Boolean(process.env.APNS_KEY), fcm: Boolean(process.env.FCM_SERVICE_ACCOUNT), webPush: Boolean(process.env.WEB_PUSH_PRIVATE_KEY), ai: Boolean(process.env.WORKSPACE_AI_ENDPOINT && process.env.WORKSPACE_AI_API_KEY) } };
  }
  if (module === "flag-evaluation") {
    const user = getUser(params.get("userId") ?? ""); if (!user) throw new WorkspaceValidationError("Select an existing user.");
    return { data: userFeatureFlags(user.id) };
  }
  throw new WorkspaceValidationError("Unknown workspace view.");
}

export async function workspaceAction(module: string, input: Record<string, unknown>) {
  const action = String(input.action ?? "");
  if (module === "api-keys" && action === "create") return issueIntegrationKey(String(input.name ?? ""), input.scopes as string[]);
  if (module === "api-keys" && action === "revoke") return revokeIntegrationKey(String(input.id), String(input.expectedUpdatedAt));
  if (module === "approvals") {
    if (action === "request") {
      const entity = input.entity === "canvas" ? "canvas" : "campaign"; const id = String(input.entityId ?? "");
      const fingerprint = approvalFingerprint(entity, id);
      const duplicate = listResources("approval-requests").find(r => r.data.entityId === id && r.data.fingerprint === fingerprint && ["Pending", "Approved"].includes(r.status));
      if (duplicate) return duplicate;
      const name = entity === "campaign" ? getCampaign(id)?.name : getResource(id)?.name;
      return createResource({ type: "approval-requests", name: name!, status: "Pending", data: { entity, entityId: id, fingerprint, requestedAt: new Date().toISOString(), comment: String(input.comment ?? "") } });
    }
    if (["approve", "reject"].includes(action)) {
      const request = requireResource(input.id, "approval-requests");
      if (request.status !== "Pending") throw new WorkspaceValidationError("This request has already been reviewed.");
      const currentHash = approvalFingerprint(request.data.entity as "canvas" | "campaign", String(request.data.entityId));
      if (currentHash !== request.data.fingerprint) throw new WorkspaceValidationError("The content changed after this request. Request a new review.");
      return updateResource(request.id, { status: action === "approve" ? "Approved" : "Rejected", data: { ...request.data, reviewedAt: new Date().toISOString(), reviewComment: String(input.comment ?? "") } }, String(input.expectedUpdatedAt ?? ""));
    }
  }
  if (module === "profiles" && action === "apply") return applyProfileRows(input.rows as Array<Record<string, unknown>>);
  if (module === "profiles" && action === "track") {
    const properties = objectValue(input.properties);
    return trackProfileEvent({ userId: String(input.userId ?? ""), name: String(input.name ?? ""), properties, ...(input.productId ? { productId: String(input.productId), price: Number(input.price), quantity: Number(input.quantity ?? 1), currency: String(input.currency ?? "USD") } : {}) });
  }
  if (module === "cloud-data-ingestion" && ["validate", "sync"].includes(action)) {
    const record = requireResource(input.id, module); const rows = record.data.rows as Array<Record<string, unknown>>;
    if (record.status === "Paused") throw new WorkspaceValidationError("Resume this integration before syncing.");
    if (!rows?.length) throw new WorkspaceValidationError("Source contains no rows.");
    for (const row of rows) if (typeof (row.external_id ?? row.id) !== "string") throw new WorkspaceValidationError("Each source row needs an external_id.");
    if (action === "validate") return { valid: true, rows: rows.length, preview: rows.slice(0, 10), connectionTested: false };
    const startedAt = new Date().toISOString();
    let result: unknown;
    if (record.data.dataType === "User attributes") result = applyProfileRows(rows);
    else {
      const events = rows.map(row => { const id = String(row.external_id ?? row.id); if (!getUser(id)) throw new WorkspaceValidationError(`User ${id} does not exist. Sync attributes first.`); if (!row.name && !row.product_id) throw new WorkspaceValidationError("Each event needs name or product_id."); return row; });
      result = workspaceTransaction(() => ({ processed: events.map(row => trackProfileEvent({ userId: String(row.external_id ?? row.id), name: String(row.name ?? "purchase"), properties: objectValue(row.properties), ...(row.product_id ? { productId: String(row.product_id), price: Number(row.price ?? 0), quantity: Number(row.quantity ?? 1), currency: String(row.currency ?? "USD") } : {}) })).length }));
    }
    const run = createResource({ type: "ingestion-runs", name: record.name, status: "Completed", data: { integrationId: record.id, startedAt, result, mode: "Manual source rows" } });
    updateResource(record.id, { data: { ...record.data, lastSync: startedAt } }, record.updatedAt);
    return run;
  }
  if (module === "data-transformation" && ["preview", "apply"].includes(action)) {
    const record = requireResource(input.id, module); const payload = input.payload ?? record.data.samplePayload; const result = transformPayload(record.data, payload);
    if (action === "preview") return result;
    if (record.status !== "Active") throw new WorkspaceValidationError("Activate the transformation before applying it.");
    const applied = record.data.destination === "Custom event" ? trackProfileEvent({ userId: result.external_id, name: String(record.data.eventName ?? ""), properties: result.attributes }) : applyProfileRows([{ ...result.attributes, external_id: result.external_id }]);
    createResource({ type: "transformation-runs", name: record.name, status: "Completed", data: { transformationId: record.id, result } });
    updateResource(record.id, { data: { ...record.data, lastRun: new Date().toISOString() } }, record.updatedAt);
    return applied;
  }
  if (module === "landing-pages" && action === "publish") {
    const record = requireResource(input.id, module);
    if (!String(record.data.html ?? "").trim()) throw new WorkspaceValidationError("Add page content before publishing.");
    if (record.data.surveyId) { const survey = requireResource(record.data.surveyId, "surveys"); if (survey.status !== "Active") throw new WorkspaceValidationError("The selected survey must be active."); }
    return updateResource(record.id, { status: "Published", data: { ...record.data, publishedAt: new Date().toISOString(), published: { ...record.data } } }, String(input.expectedUpdatedAt ?? ""));
  }
  if (["currents", "data-sharing"].includes(module) && action === "export") {
    const record = requireResource(input.id, module);
    const datasets = Array.isArray(record.data.datasets) ? record.data.datasets as string[] : ["message_events"];
    const selectedEvents = Array.isArray(record.data.events) ? record.data.events as string[] : [];
    const payload: Record<string, unknown> = {};
    if (module === "currents" || datasets.includes("message_events")) payload.message_events = workspaceEventRows().filter(e => module !== "currents" || selectedEvents.includes(String(e.event_type)));
    if (datasets.includes("user_events")) payload.user_events = listResources("user-events");
    if (datasets.includes("campaigns")) payload.campaigns = listCampaigns({ limit: 1000, status: "All" }).data;
    const exportedAt = new Date().toISOString();
    createResource({ type: "exports-log", name: `${record.name} export`, status: "Completed", data: { sourceId: record.id, exportedAt, payload, rowCount: Object.values(payload).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0), destination: "Download" } });
    updateResource(record.id, { data: { ...record.data, lastExport: exportedAt } }, record.updatedAt);
    return payload;
  }
  if (module === "technology-partners" && action === "check") {
    const record = requireResource(input.id, module); const variable = String(record.data.credentialEnv ?? "");
    if (!/^[A-Z][A-Z0-9_]+$/.test(variable)) throw new WorkspaceValidationError("Enter a server environment variable name.");
    return { credentialAvailable: Boolean(process.env[variable]), externalConnectionTested: false, message: process.env[variable] ? "Server credential is present. External delivery has not been tested." : "The server environment variable is missing." };
  }
  if (module === "agents" && action === "run") {
    const record = getResource(String(input.id));
    if (!record || !["canvas-step-agents", "data-agents", "catalog-agents", "ai-decisioning"].includes(record.type)) throw new WorkspaceValidationError("Agent not found.");
    if (!process.env.WORKSPACE_AI_ENDPOINT || !process.env.WORKSPACE_AI_API_KEY) throw new WorkspaceValidationError("Configure WORKSPACE_AI_ENDPOINT and WORKSPACE_AI_API_KEY on the server to run agents.");
    // Keep provider configuration on the server; no model is fabricated when unavailable.
    const endpoint = new URL(process.env.WORKSPACE_AI_ENDPOINT);
    if (endpoint.protocol !== "https:") throw new WorkspaceValidationError("The workspace AI endpoint must use HTTPS.");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WORKSPACE_AI_API_KEY}` }, body: JSON.stringify({ model: process.env.WORKSPACE_AI_MODEL, messages: [{ role: "system", content: String(record.data.instructions ?? record.data.objective) }, { role: "user", content: String(input.prompt ?? "") }] }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new WorkspaceValidationError(`The configured AI provider returned ${response.status}.`);
    const result = await response.json(); return createResource({ type: "agent-runs", name: record.name, status: "Completed", data: { agentId: record.id, result } });
  }
  if (module === "exports" && action === "create") {
    const allowed = ["message_events", "campaigns", "user_events"];
    if (!allowed.includes(String(input.dataset))) throw new WorkspaceValidationError("Select an export dataset.");
    const payload = input.dataset === "campaigns" ? listCampaigns({ limit: 1000, status: "All" }).data : input.dataset === "user_events" ? listResources("user-events") : workspaceEventRows();
    return createResource({ type: "exports-log", name: `${input.dataset} export`, status: "Completed", data: { dataset: input.dataset, payload, rowCount: payload.length, exportedAt: new Date().toISOString() } });
  }
  throw new WorkspaceValidationError("This action is not supported.");
}

function requireResource(id: unknown, type: string) { const resource = getResource(String(id ?? "")); if (!resource || resource.type !== type) throw new WorkspaceValidationError("Resource not found."); return resource; }

export function getPublishedPage(slug: string) {
  const row = listResources("landing-pages").find(p => p.data.slug === slug && p.status === "Published");
  if (!row) return null;
  const data = objectValue(row.data.published);
  return { ...row, data, survey: data.surveyId ? getResource(String(data.surveyId)) : null };
}
export function submitLandingPage(slug: string, input: Record<string, unknown>) {
  const page = getPublishedPage(slug); if (!page) throw new WorkspaceValidationError("Published page not found.");
  const email = String(input.email ?? "").trim().toLowerCase();
  if (page.data.collectEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WorkspaceValidationError("Enter a valid email address.");
  const answers = objectValue(input.answers);
  const questions = (page.survey?.data.questions ?? []) as Array<{ id: string; label: string; type: string; required?: boolean; options?: string[] }>;
  for (const q of questions) {
    const value = answers[q.id];
    if (q.required && (value == null || value === "" || Array.isArray(value) && !value.length)) throw new WorkspaceValidationError(`${q.label} is required.`);
    if (value == null || value === "") continue;
    if (q.type === "rating" && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5)) throw new WorkspaceValidationError("Select a rating from 1 to 5.");
    if (q.type === "single_choice" && !q.options?.includes(String(value))) throw new WorkspaceValidationError("Select a valid option.");
    if (q.type === "multiple_choice" && (!Array.isArray(value) || value.some(v => !q.options?.includes(String(v))))) throw new WorkspaceValidationError("Select valid options.");
    if (q.type === "text" && (typeof value !== "string" || value.length > 5000)) throw new WorkspaceValidationError("Answer must contain at most 5,000 characters.");
  }
  // Public submissions cannot mutate an existing identified profile without a signed link.
  const userId = `lead_${randomUUID()}`;
  if (email) applyProfileRows([{ external_id: userId, email, email_subscription_status: input.consent === true ? "opted_in" : "unsubscribed", attributes: { source_landing_page: page.id, ...Object.fromEntries(questions.map(q => [`survey_${q.id}`, answers[q.id] ?? null])) } }]);
  createResource({ type: "landing-page-submissions", name: page.name, status: "Received", data: { pageId: page.id, surveyId: page.survey?.id, userId: email ? userId : null, answers: Object.fromEntries(questions.map(q => [q.id, answers[q.id] ?? null])) } });
  return { success: true, message: String(page.data.successMessage || page.survey?.data.successMessage || "Thank you.") };
}
