import { createSubscriptionGroup, listSubscriptionGroups, type SubscriptionChannel } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json({ data: listSubscriptionGroups({ q: searchParams.get("q") ?? undefined, channel: searchParams.get("channel") ?? undefined, status: searchParams.get("status") ?? undefined }) });
}

export async function POST(request: Request) {
  const input = await request.json() as { name?: unknown; description?: unknown; channel?: unknown };
  if (typeof input.name !== "string" || !["Email", "SMS", "WhatsApp"].includes(String(input.channel))) return Response.json({ error: "name and a supported channel are required" }, { status: 400 });
  try {
    return Response.json(createSubscriptionGroup({ name: input.name, description: typeof input.description === "string" ? input.description : "", channel: input.channel as SubscriptionChannel }), { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create subscription group" }, { status: 400 }); }
}
