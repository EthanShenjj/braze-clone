import { validateInAppSnapshot } from "@/lib/in-app-runtime";
import { createResource, deleteResource, getResource, listResources, updateResource, managedWebhookCredentialMetadata } from "@/lib/braze-store";

export const runtime = "nodejs";
const actionOnly = new Set(["approval-requests", "user-events", "exports-log", "ingestion-runs", "transformation-runs", "agent-runs", "landing-page-submissions", "integration-api-keys", "promotion-code-allocations", "feature-assignments", "campaign-jobs", "sdk-messages", "message-assets", "message-links", "nps-token", "nps-responses", "webhook-retries", "webhook-hosts", "campaign-audience-calculations"]);

export async function GET(request: Request, context: RouteContext<"/api/resources/[type]">) {
  const { type } = await context.params; const { searchParams } = new URL(request.url);
  if (["message-assets","nps-token","message-links","sdk-messages","webhook-retries","webhook-hosts","campaign-jobs","campaign-audience-calculations"].includes(type))return Response.json({error:"Use the dedicated message endpoint."},{status:403});
  if (type === "integration-api-keys") return Response.json({ error: "Use /api/workspace/api-keys to view redacted key metadata." }, { status: 400 });
  const records=listResources(type,searchParams.get("q")??"");
  return Response.json({ data:type==="webhook-credentials"?records.map(managedWebhookCredentialMetadata):records });
}

export async function POST(request: Request, context: RouteContext<"/api/resources/[type]">) {
  if (actionOnly.has((await context.params).type)) return Response.json({ error: "Use the dedicated workspace action endpoint." }, { status: 400 });
  if ((await context.params).type === "global-control-group") return Response.json({ error: "Use /api/global-control-group." }, { status: 400 });
  const { type } = await context.params; if (type === "email-preferences") return Response.json({ error: "Use the versioned email-preferences endpoint to change workspace settings." }, { status: 400 }); const input = await request.json();
  if (!input.name) return Response.json({ error: "name is required" }, { status: 400 });
  try { if (type === "in-app-message-templates" && input.data?.variant !== undefined) validateInAppSnapshot(input.data.variant); const record=createResource({ ...input, type });return Response.json(type==="webhook-credentials"?managedWebhookCredentialMetadata(record):record, { status: 201 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create resource" }, { status: 400 }); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/resources/[type]">) {
  if (actionOnly.has((await context.params).type)) return Response.json({ error: "Use the dedicated workspace action endpoint." }, { status: 400 });
  const { type } = await context.params; if (type === "email-preferences") return Response.json({ error: "Use the versioned email-preferences endpoint to change workspace settings." }, { status: 400 }); const input = await request.json();
  if (!input.id) return Response.json({ error: "id is required" }, { status: 400 });
  if (getResource(String(input.id))?.type !== type) return Response.json({ error: "Resource not found" }, { status: 404 });
  try {
    if (type === "in-app-message-templates" && input.data?.variant !== undefined) validateInAppSnapshot(input.data.variant);
    const updated = updateResource(String(input.id), { name: input.name, status: input.status, description: input.description, data: input.data }, input.expectedUpdatedAt === undefined ? undefined : String(input.expectedUpdatedAt));
    return Response.json(type==="webhook-credentials"&&updated?managedWebhookCredentialMetadata(updated):updated);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update resource" }, { status: 409 }); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/resources/[type]">) {
  if (actionOnly.has((await context.params).type)) return Response.json({ error: "Recorded workspace history cannot be deleted through resources." }, { status: 400 });
  const { type } = await context.params; if (type === "email-preferences") return Response.json({ error: "Workspace preferences cannot be deleted through resources." }, { status: 400 }); const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  if (getResource(id)?.type !== type) return Response.json({ error: "Resource not found" }, { status: 404 });
  try { return Response.json(deleteResource(id, searchParams.get("expectedUpdatedAt") ?? undefined)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to delete resource" }, { status: 404 }); }
}
