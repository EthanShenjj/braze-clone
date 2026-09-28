import { listCatalogSubscriptions, subscribeCatalogItem } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/catalogs/[id]/subscriptions">) {
  const { id } = await context.params;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
  return Response.json({ data: listCatalogSubscriptions(id, limit) });
}

export async function POST(request: Request, context: RouteContext<"/api/catalogs/[id]/subscriptions">) {
  const { id } = await context.params; const input = await request.json().catch(() => ({}));
  try { return Response.json(subscribeCatalogItem(id, input), { status: 201 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to subscribe" }, { status: 400 }); }
}
