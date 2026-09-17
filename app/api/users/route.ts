import { searchUsers, setUserSubscription } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return Response.json(searchUsers(params.get("q") ?? "", Number(params.get("start") ?? 0), Number(params.get("limit") ?? 20)));
}

export async function PATCH(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input.id !== "string" || typeof input.subscribed !== "boolean") return Response.json({ error: "Provide a user ID and subscription state." }, { status: 400 });
  const user = setUserSubscription(input.id, input.subscribed);
  return user ? Response.json(user) : Response.json({ error: "User not found." }, { status: 404 });
}
