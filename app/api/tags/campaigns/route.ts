import { bulkTagCampaigns } from "@/lib/braze-store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const input = await request.json(); return Response.json(bulkTagCampaigns(input.ids, input.tags)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to tag Campaigns." }, { status: 400 }); }
}
