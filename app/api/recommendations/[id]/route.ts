import { getRecommendation, updateRecommendation } from "@/lib/braze-store";
import { readRecommendationCookie, writeRecommendationCookie } from "@/lib/recommendation-cookie";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/recommendations/[id]">) {
  const { id } = await context.params;
  const recommendation = getRecommendation(id) ?? await readRecommendationCookie(id);
  return recommendation ? Response.json(recommendation) : Response.json({ error: "Recommendation not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext<"/api/recommendations/[id]">) {
  const { id } = await context.params;
  const recommendation = updateRecommendation(id, await request.json(), await readRecommendationCookie(id));
  if (!recommendation) return Response.json({ error: "Recommendation not found" }, { status: 404 });
  await writeRecommendationCookie(recommendation);
  return Response.json(recommendation);
}
