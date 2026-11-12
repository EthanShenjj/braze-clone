import { type SubscriptionChannel } from "@/lib/braze-store";
import { AudienceManagementError,scopedSubscriptionGroup,updateManagedSubscriptionGroup } from "@/lib/audience-management-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/subscription-groups/[id]">) {
  try{const {id}=await context.params;return Response.json(scopedSubscriptionGroup(id,new URL(request.url).searchParams.get('workspaceId')??'local'));}catch(error){return Response.json({error:error instanceof Error?error.message:'Subscription group not found'},{status:error instanceof AudienceManagementError?error.status:400});}
}

export async function PATCH(request: Request, context: RouteContext<"/api/subscription-groups/[id]">) {
  const { id } = await context.params;
  const input = await request.json() as { name?: unknown; description?: unknown; channel?: unknown; status?: unknown; capabilities?:unknown;settings?:unknown;expectedUpdatedAt?:unknown;workspaceId?:unknown };
  if (input.channel !== undefined && !["Email", "SMS", "WhatsApp", "LINE"].includes(String(input.channel))) return Response.json({ error: "Unsupported channel" }, { status: 400 });
  if (input.status !== undefined && !["Active", "Archived"].includes(String(input.status))) return Response.json({ error: "Unsupported status" }, { status: 400 });
  try {
    const result = updateManagedSubscriptionGroup(id, { name: typeof input.name === "string" ? input.name : undefined, description: typeof input.description === "string" ? input.description : undefined, channel: input.channel as SubscriptionChannel | undefined, status: input.status as "Active" | "Archived" | undefined, capabilities:input.capabilities as {sms:boolean;mms:boolean;rcs:boolean}|undefined,settings:input.settings,expectedUpdatedAt:input.expectedUpdatedAt },typeof input.workspaceId==='string'?input.workspaceId:new URL(request.url).searchParams.get('workspaceId')??'local');
    return result ? Response.json(result) : Response.json({ error: "Subscription group not found" }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update subscription group" }, { status: error instanceof AudienceManagementError?error.status:400 }); }
}
