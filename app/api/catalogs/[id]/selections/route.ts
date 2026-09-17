import { listCatalogSelections } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/catalogs/[id]/selections">) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ data: listCatalogSelections(id, query) });
}
