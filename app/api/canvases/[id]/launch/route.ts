import { getCanvas, launchCanvasGraph,processCanvasSmsDeliveries } from "@/lib/braze-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const canvas=getCanvas(id),workspaceId=new URL(request.url).searchParams.get('workspaceId')??'local';
  if (!canvas||(canvas.workspaceId??'local')!==workspaceId) return Response.json({ error: "Canvas not found." }, { status: 404 });
  try { const run=launchCanvasGraph(id);await processCanvasSmsDeliveries();return Response.json(run, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas launch failed." }, { status: 422 }); }
}
