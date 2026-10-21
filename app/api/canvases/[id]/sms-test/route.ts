import { prepareCanvasSmsTest } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const input = await request.json().catch(() => null);
  try { return Response.json(prepareCanvasSmsTest(id, input)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not prepare SMS test." }, { status: 400 }); }
}
