import { createPreferenceCenter, listPreferenceCenters } from "@/lib/braze-store";
import { normalizePreferenceCenterConfig } from "@/lib/preference-center-model";

export const runtime = "nodejs";

export function GET() { return Response.json({ data: listPreferenceCenters() }); }

export async function POST(request: Request) {
  const input = await request.json() as { name?: unknown; description?: unknown; groupIds?: unknown; status?: unknown; config?: unknown };
  if (typeof input.name !== "string" || !Array.isArray(input.groupIds)) return Response.json({ error: "name and groupIds are required" }, { status: 400 });
  try { return Response.json(createPreferenceCenter({ name: input.name, description: typeof input.description === "string" ? input.description : "", groupIds: input.groupIds.filter((value): value is string => typeof value === "string"), status: input.status === "Active" ? "Active" : "Draft", config: normalizePreferenceCenterConfig(input.config) }), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to create preference center" }, { status: 400 }); }
}
