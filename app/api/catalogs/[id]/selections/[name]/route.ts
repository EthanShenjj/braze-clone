import { getCatalogSelection, removeCatalogSelection, upsertCatalogSelection } from "@/lib/braze-store";
import { sampleCatalogId } from "@/lib/sample-catalog";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  const { id, name } = await context.params;
  const selection = getCatalogSelection(id, decodeURIComponent(name));
  return selection ? Response.json(selection) : Response.json({ error: "Selection not found" }, { status: 404 });
}
export async function PATCH(request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  const { id, name } = await context.params;
  if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 });
  return Response.json(upsertCatalogSelection(id, await request.json(), decodeURIComponent(name)));
}
export async function DELETE(_request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  const { id, name } = await context.params;
  if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 });
  removeCatalogSelection(id, decodeURIComponent(name));
  return new Response(null, { status: 204 });
}
