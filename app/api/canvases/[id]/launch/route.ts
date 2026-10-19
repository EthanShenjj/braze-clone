import { getCanvas, launchCanvasGraph } from "@/lib/braze-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!getCanvas(id)) return Response.json({ error: "Canvas not found." }, { status: 404 });
  try { return Response.json(launchCanvasGraph(id), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas launch failed." }, { status: 422 }); }
}
