import { getSubscriptionGroup, updateSubscriptionGroup, type SubscriptionChannel } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/subscription-groups/[id]">) {
  const { id } = await context.params; const group = getSubscriptionGroup(id);
  return group ? Response.json(group) : Response.json({ error: "Subscription group not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext<"/api/subscription-groups/[id]">) {
  const { id } = await context.params;
  const input = await request.json() as { name?: unknown; description?: unknown; channel?: unknown; status?: unknown };
  if (input.channel !== undefined && !["Email", "SMS", "WhatsApp"].includes(String(input.channel))) return Response.json({ error: "Unsupported channel" }, { status: 400 });
  if (input.status !== undefined && !["Active", "Archived"].includes(String(input.status))) return Response.json({ error: "Unsupported status" }, { status: 400 });
  try {
    const result = updateSubscriptionGroup(id, { name: typeof input.name === "string" ? input.name : undefined, description: typeof input.description === "string" ? input.description : undefined, channel: input.channel as SubscriptionChannel | undefined, status: input.status as "Active" | "Archived" | undefined });
    return result ? Response.json(result) : Response.json({ error: "Subscription group not found" }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update subscription group" }, { status: 400 }); }
}
