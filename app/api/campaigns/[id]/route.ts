import { archiveCampaign, getCampaign, stopCampaign, upsertCampaign } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await context.params; const campaign = getCampaign(id);
  return campaign ? Response.json(campaign) : Response.json({ error: "Campaign not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await context.params; const current = getCampaign(id);
  if (!current) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const input = await request.json();
  if (input.status === "Stopped") return Response.json(stopCampaign(id));
  try { return Response.json(upsertCampaign({ ...current, ...input, id })); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Campaign could not be saved." }, { status: 400 }); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await context.params; archiveCampaign(id); return new Response(null, { status: 204 });
}
