import { listCatalogSubscriptions } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/catalogs/[id]/subscriptions">) {
  const { id } = await context.params;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
  return Response.json({ data: listCatalogSubscriptions(id, limit) });
}
