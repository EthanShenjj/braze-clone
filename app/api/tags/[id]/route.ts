import { deleteWorkspaceTag, updateWorkspaceTag } from "@/lib/braze-store";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(updateWorkspaceTag((await context.params).id, await request.json())); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update tag." }, { status: 409 }); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(deleteWorkspaceTag((await context.params).id, new URL(request.url).searchParams.get("expectedUpdatedAt"))); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to delete tag." }, { status: 409 }); }
}
