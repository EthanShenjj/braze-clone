import { createCatalog, listCatalogs } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET() { return Response.json({ data: listCatalogs() }); }
export async function POST(request: Request) {
  const body = await request.json();
  const input = body.catalog ?? body;
  return input.name ? Response.json(createCatalog({ id: input.id, name: input.name, description: input.description, data: input.data }), { status: 201 }) : Response.json({ error: "name is required" }, { status: 400 });
}
