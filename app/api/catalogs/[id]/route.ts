import { getResource, updateCatalog } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/catalogs/[id]">) {
  const { id } = await context.params; const catalog = getResource(id);
  return catalog?.type === "catalogs" ? Response.json(catalog) : Response.json({ error: "Catalog not found" }, { status: 404 });
}
export async function PATCH(request: Request, context: RouteContext<"/api/catalogs/[id]">) {
  const { id } = await context.params; const catalog = updateCatalog(id, await request.json());
  return catalog ? Response.json(catalog) : Response.json({ error: "Catalog not found" }, { status: 404 });
}
