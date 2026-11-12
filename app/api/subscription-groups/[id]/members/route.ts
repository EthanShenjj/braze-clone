import { listSubscriptionMembers, setSubscriptionMember, type SubscriptionState } from "@/lib/braze-store";
import { scopedSubscriptionGroup } from "@/lib/audience-management-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/subscription-groups/[id]/members">) {
  const { id } = await context.params; const { searchParams } = new URL(request.url);
  try{scopedSubscriptionGroup(id,searchParams.get('workspaceId')??'local');}catch(error){return Response.json({error:error instanceof Error?error.message:'Subscription group not found.'},{status:404});}
  const result = listSubscriptionMembers(id, { q: searchParams.get("q") ?? undefined, state: searchParams.get("state") ?? undefined, start: Number(searchParams.get("start") ?? 0), limit: Number(searchParams.get("limit") ?? 20) });
  return result ? Response.json(result) : Response.json({ error: "Subscription group not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext<"/api/subscription-groups/[id]/members">) {
  const { id } = await context.params; const input = await request.json() as { userId?: unknown; state?: unknown;workspaceId?:unknown };
  try{scopedSubscriptionGroup(id,typeof input.workspaceId==='string'?input.workspaceId:new URL(request.url).searchParams.get('workspaceId')??'local');}catch(error){return Response.json({error:error instanceof Error?error.message:'Subscription group not found.'},{status:404});}
  if (typeof input.userId !== "string" || !["subscribed", "unsubscribed"].includes(String(input.state))) return Response.json({ error: "userId and state are required" }, { status: 400 });
  const result = setSubscriptionMember(id, input.userId, input.state as SubscriptionState);
  return result ? Response.json(result) : Response.json({ error: "Subscription group or user not found" }, { status: 404 });
}
