import { launchCampaign } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/campaigns/[id]/launch">) {
  const { id } = await context.params;
  try { return Response.json(launchCampaign(id)); } catch (error) { const message = error instanceof Error ? error.message : "Unable to launch campaign"; return Response.json({ error: message }, { status: message === "Campaign not found" ? 404 : 400 }); }
}
