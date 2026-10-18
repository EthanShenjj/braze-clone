import { getPublicPreferenceCenter, submitPublicPreferenceCenter } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/preference-centers/[id]/public">) {
  const { id } = await context.params; const { searchParams } = new URL(request.url);
  const user = searchParams.get("user") ?? ""; const result = getPublicPreferenceCenter(id, user, searchParams.get("token"));
  return result ? Response.json(result, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }) : Response.json({ error: "This preference center link is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteContext<"/api/preference-centers/[id]/public">) {
  const { id } = await context.params;
  const input = await request.json() as { userId?: unknown; token?: unknown; states?: unknown; action?: unknown };
  if (typeof input.userId !== "string" || typeof input.token !== "string" || !input.states || typeof input.states !== "object" || Array.isArray(input.states) || (input.action !== undefined && !["groups", "global_unsubscribe"].includes(String(input.action)))) return Response.json({ error: "A valid recipient link and subscription choices are required." }, { status: 400 });
  try {
    const states = Object.fromEntries(Object.entries(input.states).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>;
    const result = submitPublicPreferenceCenter(id, input.userId, input.token, states, input.action === "global_unsubscribe" ? "global_unsubscribe" : "groups");
    return result ? Response.json(result) : Response.json({ error: "This preference center link is unavailable." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "We couldn't save your preferences. Please try again." }, { status: error instanceof Error && error.message.startsWith("Provide a choice") ? 400 : 500 }); }
}
