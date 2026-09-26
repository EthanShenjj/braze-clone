import { recordExternalEvent } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/campaigns/[id]/events">) {
  const { id } = await context.params; const input = await request.json().catch(() => ({}));
  try { return Response.json(recordExternalEvent(id, input)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to record event" }, { status: 400 }); }
}
