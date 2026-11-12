import { bulkTagCampaigns } from "@/lib/braze-store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await request.json(), workspaceId = new URL(request.url).searchParams.get("workspaceId") || (typeof input?.workspaceId === "string" && input.workspaceId) || "local";
    return Response.json(bulkTagCampaigns(input.ids, input.tags, workspaceId, input.mode));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to tag Campaigns." }, { status: 400 }); }
}
