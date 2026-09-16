import { createResource, listResources } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/resources/[type]">) {
  const { type } = await context.params; const { searchParams } = new URL(request.url);
  return Response.json({ data: listResources(type, searchParams.get("q") ?? "") });
}

export async function POST(request: Request, context: RouteContext<"/api/resources/[type]">) {
  const { type } = await context.params; const input = await request.json();
  if (!input.name) return Response.json({ error: "name is required" }, { status: 400 });
  return Response.json(createResource({ ...input, type }), { status: 201 });
}
