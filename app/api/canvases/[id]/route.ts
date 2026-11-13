import { copyCanvasToWorkspace, duplicateCanvas, getCanvas, getCanvasWorkspace, updateCanvas } from "@/lib/braze-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const canvas = getCanvas(id);
  const scope=new URL(request.url).searchParams.get("workspaceId")??'local';
  return canvas&&(canvas.workspaceId??"local")===scope ? Response.json(getCanvasWorkspace(id)) : Response.json({ error: "Canvas not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!getCanvas(id)) return Response.json({ error: "Canvas not found." }, { status: 404 });
  const input = await request.json().catch(() => null);
  const scope=new URL(request.url).searchParams.get('workspaceId')??input?.workspaceId??'local';
  if((getCanvas(id)?.workspaceId??'local')!==scope||input?.workspaceId!==undefined&&input.workspaceId!==scope)return Response.json({error:'Canvas not found.'},{status:404});
  if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "Invalid Canvas details." }, { status: 400 });
  if (input.name !== undefined && typeof input.name !== "string" || input.description !== undefined && typeof input.description !== "string" || input.status !== undefined && typeof input.status !== "string" || input.alertsConfigured !== undefined && typeof input.alertsConfigured !== "boolean" || input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((tag: unknown) => typeof tag !== "string")) || input.wizard !== undefined && (!input.wizard || typeof input.wizard !== "object" || Array.isArray(input.wizard))) return Response.json({ error: "Invalid Canvas details." }, { status: 400 });
  try { return Response.json(updateCanvas(id, input, input.updatedAt)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas update failed." }, { status: 409 }); }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!getCanvas(id)) return Response.json({ error: "Canvas not found." }, { status: 404 });
  const input = await request.json().catch(() => null);
  const scope=new URL(request.url).searchParams.get('workspaceId')??input?.workspaceId??'local';
  if((getCanvas(id)?.workspaceId??'local')!==scope||input?.workspaceId!==undefined&&input.workspaceId!==scope)return Response.json({error:'Canvas not found.'},{status:404});
  if(input?.action==='copy_to_workspace'){
   if(typeof input.targetWorkspaceId!=='string')return Response.json({error:'Choose a workspace.'},{status:400});
   try{return Response.json(copyCanvasToWorkspace(id,input.targetWorkspaceId),{status:201});}catch(error){return Response.json({error:error instanceof Error?error.message:'Canvas copy failed.'},{status:400});}
  }
  if (input?.action !== "duplicate") return Response.json({ error: "Unknown Canvas action." }, { status: 400 });
  try { return Response.json(duplicateCanvas(id), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas duplication failed." }, { status: 400 }); }
}
