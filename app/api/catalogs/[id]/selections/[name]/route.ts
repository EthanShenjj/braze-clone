import { getCatalogSelection, removeCatalogSelection, upsertCatalogSelection } from "@/lib/braze-store";
import { catalogErrorResponse } from "@/lib/catalog-api";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  const { id, name } = await context.params;
  const selection = getCatalogSelection(id, decodeURIComponent(name));
  return selection ? Response.json(selection) : Response.json({ error: "Selection not found" }, { status: 404 });
}
export async function PATCH(request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  try { const { id, name } = await context.params; return Response.json(upsertCatalogSelection(id, await request.json(), decodeURIComponent(name))); } catch (error) { return catalogErrorResponse(error); }
}
export async function DELETE(_request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  const { id, name } = await context.params;
  removeCatalogSelection(id, decodeURIComponent(name));
  return new Response(null, { status: 204 });
}
