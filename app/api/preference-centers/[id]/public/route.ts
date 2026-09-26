import { getPublicPreferenceCenter, submitPublicPreferenceCenter } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/preference-centers/[id]/public">) {
  const { id } = await context.params; const { searchParams } = new URL(request.url);
  const user = searchParams.get("user") ?? ""; const result = getPublicPreferenceCenter(id, user, searchParams.get("token"));
  return result ? Response.json(result) : Response.json({ error: "This preference center link is unavailable." }, { status: 404 });
}

export async function POST(request: Request, context: RouteContext<"/api/preference-centers/[id]/public">) {
  const { id } = await context.params;
  const input = await request.json() as { userId?: unknown; token?: unknown; states?: unknown };
  if (typeof input.userId !== "string" || typeof input.token !== "string" || !input.states || typeof input.states !== "object") return Response.json({ error: "A valid recipient link and subscription choices are required." }, { status: 400 });
  try {
    const states = Object.fromEntries(Object.entries(input.states).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>;
    const result = submitPublicPreferenceCenter(id, input.userId, input.token, states);
    return result ? Response.json(result) : Response.json({ error: "This preference center link is unavailable." }, { status: 404 });
  } catch { return Response.json({ error: "We couldn't save your preferences. Please try again." }, { status: 500 }); }
}
