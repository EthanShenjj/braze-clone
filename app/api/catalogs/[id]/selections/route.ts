import { listCatalogSelections, upsertCatalogSelection } from "@/lib/braze-store";
import { sampleCatalogId } from "@/lib/sample-catalog";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/catalogs/[id]/selections">) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ data: listCatalogSelections(id, query) });
}
export async function POST(request: Request, context: RouteContext<"/api/catalogs/[id]/selections">) {
  const { id } = await context.params;
  if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 });
  const input = await request.json();
  if (!input.name || !Array.isArray(input.filters)) return Response.json({ error: "name and filters are required" }, { status: 400 });
  return Response.json(upsertCatalogSelection(id, input), { status: 201 });
}
