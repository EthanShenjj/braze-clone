import { getCampaign, listWebhookAttempts } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getCampaign(id)) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  return Response.json({ data: listWebhookAttempts(id, limit) });
}
