import { removeCatalogItem, upsertCatalogItem } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/catalogs/[id]/items/[itemId]">) { const { id, itemId } = await context.params; const input = await request.json(); return Response.json(upsertCatalogItem(id, { ...input, id: itemId })); }
export async function DELETE(_request: Request, context: RouteContext<"/api/catalogs/[id]/items/[itemId]">) { const { id, itemId } = await context.params; removeCatalogItem(id, itemId); return new Response(null, { status: 204 }); }
