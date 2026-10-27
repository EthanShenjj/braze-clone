import { createWorkspaceTag, listWorkspaceTags, workspaceTagAliases } from "@/lib/braze-store";

export const runtime = "nodejs";
export function GET() { return Response.json({ data: listWorkspaceTags(), aliases: workspaceTagAliases() }); }
export async function POST(request: Request) {
  try { return Response.json(createWorkspaceTag(await request.json()), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create tag." }, { status: 400 }); }
}
