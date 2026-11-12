import { type SubscriptionChannel } from "@/lib/braze-store";
import { createManagedSubscriptionGroup,scopedSubscriptionGroups } from "@/lib/audience-management-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json({ data: scopedSubscriptionGroups(searchParams.get('workspaceId')??searchParams.get('workspace')??'local',{ q: searchParams.get("q") ?? undefined, channel: searchParams.get("channel") ?? undefined, status: searchParams.get("status") ?? undefined }) });
}

export async function POST(request: Request) {
  const input = await request.json() as { name?: unknown; description?: unknown; channel?: unknown; capabilities?:unknown;workspaceId?:unknown };
  if (typeof input.name !== "string" || !["Email", "SMS", "WhatsApp", "LINE"].includes(String(input.channel))) return Response.json({ error: "name and a supported channel are required" }, { status: 400 });
  try {
    if(typeof input.description==='string'&&input.description.length>250)throw new Error('Description must contain at most 250 characters.');
    return Response.json(createManagedSubscriptionGroup({ name: input.name, description: typeof input.description === "string" ? input.description : "", channel: input.channel as SubscriptionChannel,capabilities:input.capabilities },typeof input.workspaceId==='string'?input.workspaceId:'local'), { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create subscription group" }, { status: 400 }); }
}
