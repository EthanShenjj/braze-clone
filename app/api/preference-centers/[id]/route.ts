import { getPreferenceCenter, updatePreferenceCenter } from "@/lib/braze-store";
import { normalizePreferenceCenterConfig } from "@/lib/preference-center-model";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/preference-centers/[id]">) {
  const { id } = await context.params;
  const result = getPreferenceCenter(id);
  return result ? Response.json(result) : Response.json({ error: "Preference center not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext<"/api/preference-centers/[id]">) {
  const { id } = await context.params;
  const input = await request.json() as { name?: unknown; description?: unknown; groupIds?: unknown; status?: unknown; config?: unknown };
  const result = updatePreferenceCenter(id, {
    name: typeof input.name === "string" ? input.name : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    groupIds: Array.isArray(input.groupIds) ? input.groupIds.filter((value): value is string => typeof value === "string") : undefined,
    status: input.status === "Active" || input.status === "Draft" || input.status === "Archived" ? input.status : undefined,
    config: input.config === undefined ? undefined : normalizePreferenceCenterConfig(input.config),
  });
  return result ? Response.json(result) : Response.json({ error: "Preference center not found" }, { status: 404 });
}
