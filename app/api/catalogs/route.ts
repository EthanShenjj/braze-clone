import { createCatalog, createCatalogWithItems, listCatalogs } from "@/lib/braze-store";
import { catalogErrorResponse } from "@/lib/catalog-api";

export const runtime = "nodejs";

export function GET() { return Response.json({ data: listCatalogs() }); }
export async function POST(request: Request) {
  try {
    const body = await request.json(); const input = body.catalog ?? body;
    if (input.atomic) return Response.json(createCatalogWithItems(input), { status: 201 });
    return input.name ? Response.json(createCatalog({ id: input.id, name: input.name, description: input.description, data: input.data }), { status: 201 }) : Response.json({ error: "name is required" }, { status: 400 });
  } catch (error) { return catalogErrorResponse(error); }
}
