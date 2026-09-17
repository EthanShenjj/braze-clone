import { getCanvasWorkspace, launchCanvasGraph, saveCanvasGraph } from "@/lib/braze-store";
import { isCanvasGraph } from "@/lib/canvas-model";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getCanvasWorkspace());
}

export async function PUT(request: Request) {
  const input = await request.json().catch(() => null);
  if (!isCanvasGraph(input?.graph)) return Response.json({ error: "Invalid Canvas graph." }, { status: 400 });
  try {
    return Response.json(saveCanvasGraph(input.graph, input.updatedAt));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Canvas save failed." }, { status: 409 });
  }
}

export async function POST() {
  try {
    return Response.json(launchCanvasGraph(), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Canvas launch failed." }, { status: 422 });
  }
}
