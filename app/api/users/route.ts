import { importUsers, searchUsers, updateUserEmail, setUserSubscription, setUserEmailSubscriptionStatus } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return Response.json(searchUsers(params.get("q") ?? "", Number(params.get("start") ?? 0), Number(params.get("limit") ?? 20)));
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || !Array.isArray(input.rows)) return Response.json({ error: "Provide a rows array of user objects." }, { status: 400 });
  const clean = input.rows.filter((row: unknown) => row && typeof row === "object" && !Array.isArray(row)) as Array<Record<string, string>>;
  return Response.json(importUsers(clean));
}

export async function PATCH(request: Request) {
  const input = await request.json().catch(() => null);
  if (typeof input?.id === "string" && typeof input.email === "string") { try { const user = updateUserEmail(input.id, input.email); return user ? Response.json(user) : Response.json({ error: "User not found." }, { status: 404 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid email." }, { status: 400 }); } }
  if (typeof input?.id === "string" && ["opted_in", "subscribed", "unsubscribed"].includes(input.emailSubscriptionStatus)) {
    const user = setUserEmailSubscriptionStatus(input.id, input.emailSubscriptionStatus);
    return user ? Response.json(user) : Response.json({ error: "User not found." }, { status: 404 });
  }
  if (!input || typeof input.id !== "string" || typeof input.subscribed !== "boolean") return Response.json({ error: "Provide a user ID and subscription state." }, { status: 400 });
  const user = setUserSubscription(input.id, input.subscribed);
  return user ? Response.json(user) : Response.json({ error: "User not found." }, { status: 404 });
}
