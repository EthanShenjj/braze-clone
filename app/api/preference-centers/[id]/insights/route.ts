import { createPreferenceCenterLink, listPreferenceCenterVersions, preferenceCenterAnalytics } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/preference-centers/[id]/insights">) {
  const { id } = await context.params; const { searchParams } = new URL(request.url); const userId = searchParams.get("user") ?? "user_1";
  return Response.json({ analytics: preferenceCenterAnalytics(id), versions: listPreferenceCenterVersions(id), link: createPreferenceCenterLink(id, userId) });
}
