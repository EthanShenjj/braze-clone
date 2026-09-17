import { getCatalogSelection } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]">) {
  const { id, name } = await context.params;
  const selection = getCatalogSelection(id, decodeURIComponent(name));
  return selection ? Response.json(selection) : Response.json({ error: "Selection not found" }, { status: 404 });
}
