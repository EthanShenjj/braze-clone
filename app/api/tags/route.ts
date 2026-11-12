import { createWorkspaceTag, listWorkspaceTags, workspaceTagAliases } from "@/lib/braze-store";

export const runtime = "nodejs";
export function GET(request: Request) {
  const query = new URL(request.url).searchParams, workspaceId = query.get("workspaceId") || "local";
  const context = query.get("context"), search = (query.get("q") || "").toLocaleLowerCase();
  let tags = listWorkspaceTags(workspaceId);
  if (context === "active-engagement") tags = tags.filter(tag => tag.usages.some(usage => usage.direct !== false && ["campaign", "canvas"].includes(usage.type) && usage.status === "Active"));
  if (search) tags = tags.filter(tag => tag.path.toLocaleLowerCase().includes(search));
  return Response.json({ data: tags, aliases: workspaceTagAliases(workspaceId) });
}
export async function POST(request: Request) {
  try {
    const input = await request.json(), workspaceId = new URL(request.url).searchParams.get("workspaceId") || (typeof input?.workspaceId === "string" && input.workspaceId) || "local";
    return Response.json(createWorkspaceTag(input, workspaceId), { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create tag." }, { status: 400 }); }
}
