import { estimateAudience } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json(estimateAudience(searchParams.get("audience") ?? "All Users", searchParams.get("country") ?? undefined, searchParams.get("excludeCountry") ?? undefined, searchParams.get("eligibility") ?? "subscribed"));
}
