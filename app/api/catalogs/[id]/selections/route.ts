import { listCatalogSelections, upsertCatalogSelection } from "@/lib/braze-store";
import { catalogErrorResponse } from "@/lib/catalog-api";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/catalogs/[id]/selections">) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ data: listCatalogSelections(id, query) });
}
export async function POST(request: Request, context: RouteContext<"/api/catalogs/[id]/selections">) {
  try { const { id } = await context.params; const input = await request.json(); return Response.json(upsertCatalogSelection(id, input), { status: 201 }); } catch (error) { return catalogErrorResponse(error); }
}
