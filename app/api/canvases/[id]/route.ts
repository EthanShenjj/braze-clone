import { duplicateCanvas, getCanvas, getCanvasWorkspace, updateCanvas } from "@/lib/braze-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const canvas = getCanvas(id);
  return canvas ? Response.json(getCanvasWorkspace(id)) : Response.json({ error: "Canvas not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!getCanvas(id)) return Response.json({ error: "Canvas not found." }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "Invalid Canvas details." }, { status: 400 });
  if (input.name !== undefined && typeof input.name !== "string" || input.description !== undefined && typeof input.description !== "string" || input.status !== undefined && typeof input.status !== "string" || input.alertsConfigured !== undefined && typeof input.alertsConfigured !== "boolean" || input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((tag: unknown) => typeof tag !== "string")) || input.wizard !== undefined && (!input.wizard || typeof input.wizard !== "object" || Array.isArray(input.wizard))) return Response.json({ error: "Invalid Canvas details." }, { status: 400 });
  try { return Response.json(updateCanvas(id, input, input.updatedAt)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas update failed." }, { status: 409 }); }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!getCanvas(id)) return Response.json({ error: "Canvas not found." }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (input?.action !== "duplicate") return Response.json({ error: "Unknown Canvas action." }, { status: 400 });
  try { return Response.json(duplicateCanvas(id), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas duplication failed." }, { status: 400 }); }
}
