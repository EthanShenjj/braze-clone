import { applyCatalogItemCsvUpdate } from "@/lib/braze-store";
import { catalogErrorResponse } from "@/lib/catalog-api";
import { sampleCatalogId } from "@/lib/sample-catalog";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (id === sampleCatalogId) return Response.json({ error: "Sample_Catalog is view only" }, { status: 403 });
    const input = await request.json() as { mode?: "merge" | "delete"; items?: Array<{ id: string; name?: string; fields?: Record<string, unknown> }> };
    if (!input.mode || !Array.isArray(input.items)) return Response.json({ error: "mode and items are required" }, { status: 400 });
    return Response.json({ data: applyCatalogItemCsvUpdate(id, input.mode, input.items) });
  } catch (error) { return catalogErrorResponse(error); }
}
