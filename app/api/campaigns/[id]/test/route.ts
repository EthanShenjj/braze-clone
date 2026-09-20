import { sendTestCampaign } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/campaigns/[id]/test">) {
  const { id } = await context.params; const input = await request.json();
  try { return Response.json(await sendTestCampaign(id, input)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to send test" }, { status: 400 }); }
}
