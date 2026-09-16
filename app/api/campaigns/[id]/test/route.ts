import { sendTestCampaign } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/campaigns/[id]/test">) {
  const { id } = await context.params; const { recipient } = await request.json();
  try { return Response.json(sendTestCampaign(id, recipient)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to send test" }, { status: 404 }); }
}
