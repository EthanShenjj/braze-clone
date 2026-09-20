import { createRecommendation } from "@/lib/braze-store";
import { writeRecommendationCookie } from "@/lib/recommendation-cookie";

export const runtime = "nodejs";

export async function POST() {
  const recommendation = createRecommendation();
  await writeRecommendationCookie(recommendation);
  return Response.json(recommendation, { status: 201 });
}
