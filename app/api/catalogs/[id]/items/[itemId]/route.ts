import { removeCatalogItem, upsertCatalogItem } from "@/lib/braze-store";
import { sampleCatalogId } from "@/lib/sample-catalog";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/catalogs/[id]/items/[itemId]">) { const { id, itemId } = await context.params; if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 }); const input = await request.json(); return Response.json(upsertCatalogItem(id, { ...input, id: itemId })); }
export async function DELETE(_request: Request, context: RouteContext<"/api/catalogs/[id]/items/[itemId]">) { const { id, itemId } = await context.params; if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 }); removeCatalogItem(id, itemId); return new Response(null, { status: 204 }); }
