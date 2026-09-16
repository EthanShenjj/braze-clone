import { createCatalog, listCatalogs } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET() { return Response.json({ data: listCatalogs() }); }
export async function POST(request: Request) {
  const { name } = await request.json();
  return name ? Response.json(createCatalog(name), { status: 201 }) : Response.json({ error: "name is required" }, { status: 400 });
}
