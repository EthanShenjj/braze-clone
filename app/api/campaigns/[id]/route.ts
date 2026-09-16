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
  return Response.json(upsertCampaign({ ...current, ...input, id }));
}

export async function DELETE(_request: Request, context: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await context.params; archiveCampaign(id); return new Response(null, { status: 204 });
}
