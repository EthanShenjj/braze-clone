import { getCanvas, saveCanvasGraph } from "@/lib/braze-store";
import { isCanvasGraph } from "@/lib/canvas-model";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!getCanvas(id)) return Response.json({ error: "Canvas not found." }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (!isCanvasGraph(input?.graph)) return Response.json({ error: "Invalid Canvas graph." }, { status: 400 });
  try { return Response.json(saveCanvasGraph(input.graph, input.updatedAt, id)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas save failed." }, { status: 409 }); }
}
