import { getRecommendation, updateRecommendation } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/recommendations/[id]">) {
  const { id } = await context.params;
  const recommendation = getRecommendation(id);
  return recommendation ? Response.json(recommendation) : Response.json({ error: "Recommendation not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext<"/api/recommendations/[id]">) {
  const { id } = await context.params;
  const recommendation = updateRecommendation(id, await request.json());
  return recommendation ? Response.json(recommendation) : Response.json({ error: "Recommendation not found" }, { status: 404 });
}
