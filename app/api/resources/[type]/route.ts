import { createResource, deleteResource, listResources, updateResource } from "@/lib/braze-store";

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

export async function PATCH(request: Request, context: RouteContext<"/api/resources/[type]">) {
  const { type } = await context.params; const input = await request.json();
  if (!input.id) return Response.json({ error: "id is required" }, { status: 400 });
  try {
    const updated = updateResource(String(input.id), { name: input.name, status: input.status, description: input.description, data: input.data }, input.expectedUpdatedAt === undefined ? undefined : String(input.expectedUpdatedAt));
    return Response.json(updated);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to update resource" }, { status: 409 }); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/resources/[type]">) {
  const { type } = await context.params; const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  try { return Response.json(deleteResource(id)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to delete resource" }, { status: 404 }); }
}
