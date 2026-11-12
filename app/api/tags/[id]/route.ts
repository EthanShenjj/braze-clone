import { deleteWorkspaceTag, updateWorkspaceTag } from "@/lib/braze-store";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json(), workspaceId = new URL(request.url).searchParams.get("workspaceId") || (typeof input?.workspaceId === "string" && input.workspaceId) || "local";
    return Response.json(updateWorkspaceTag((await context.params).id, input, workspaceId));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update tag." }, { status: 409 }); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(deleteWorkspaceTag((await context.params).id, query.get("expectedUpdatedAt"), query.get("workspaceId") || "local"));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to delete tag." }, { status: 409 }); }
}
