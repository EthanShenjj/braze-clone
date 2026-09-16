import { listCatalogItems, upsertCatalogItem } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/catalogs/[id]/items">) { const { id } = await context.params; return Response.json({ data: listCatalogItems(id, new URL(request.url).searchParams.get("q") ?? "") }); }
export async function POST(request: Request, context: RouteContext<"/api/catalogs/[id]/items">) { const { id } = await context.params; const input = await request.json(); if (!input.id || !input.name) return Response.json({ error: "id and name are required" }, { status: 400 }); return Response.json(upsertCatalogItem(id, input), { status: 201 }); }
