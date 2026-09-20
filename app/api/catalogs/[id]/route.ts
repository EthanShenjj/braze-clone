import { getResource, removeCatalog, updateCatalog } from "@/lib/braze-store";
import { sampleCatalogId } from "@/lib/sample-catalog";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/catalogs/[id]">) {
  const { id } = await context.params; const catalog = getResource(id);
  return catalog?.type === "catalogs" ? Response.json(catalog) : Response.json({ error: "Catalog not found" }, { status: 404 });
}
export async function PATCH(request: Request, context: RouteContext<"/api/catalogs/[id]">) {
  const { id } = await context.params;
  if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 });
  const catalog = updateCatalog(id, await request.json());
  return catalog ? Response.json(catalog) : Response.json({ error: "Catalog not found" }, { status: 404 });
}
export async function DELETE(_request: Request, context: RouteContext<"/api/catalogs/[id]">) {
  const { id } = await context.params;
  if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 });
  removeCatalog(id);
  return new Response(null, { status: 204 });
}
