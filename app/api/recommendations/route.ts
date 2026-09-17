import { createRecommendation } from "@/lib/braze-store";

export const runtime = "nodejs";

export function POST() {
  return Response.json(createRecommendation(), { status: 201 });
}
