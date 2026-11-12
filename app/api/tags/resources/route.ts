import { bulkTagResources } from "@/lib/braze-store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await request.json(), workspaceId = new URL(request.url).searchParams.get("workspaceId") || (typeof input?.workspaceId === "string" && input.workspaceId) || "local";
    return Response.json(bulkTagResources(input.resourceType, input.ids, input.tags, workspaceId));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to tag resources." }, { status: 400 }); }
}
