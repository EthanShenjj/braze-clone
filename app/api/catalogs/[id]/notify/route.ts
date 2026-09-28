import { runCatalogNotifications } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/catalogs/[id]/notify">) {
  const { id } = await context.params;
  try { return Response.json(runCatalogNotifications(id)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to run notification check" }, { status: 400 }); }
}
