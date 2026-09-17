import { previewCatalogSelection } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/catalogs/[id]/selections/[name]/preview">) {
  const { id, name } = await context.params;
  const body = await request.json().catch(() => ({})) as { userId?: string };
  const preview = previewCatalogSelection(id, decodeURIComponent(name), body.userId);
  return preview ? Response.json(preview) : Response.json({ error: "Selection or user not found" }, { status: 404 });
}
