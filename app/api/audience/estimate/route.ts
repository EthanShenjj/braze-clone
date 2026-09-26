import { estimateAudience, listResources, type AudienceFilter } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience") ?? "All Users";
  // A saved segment resource with the requested name contributes its filters to the estimate.
  const saved = listResources("segments").find(row => row.name.toLowerCase() === audience.toLowerCase());
  const savedData = (saved?.data ?? {}) as Record<string, unknown>;
  const filters = (Array.isArray(savedData.filters) ? savedData.filters : []) as AudienceFilter[];
  return Response.json(estimateAudience(audience, searchParams.get("country") ?? undefined, searchParams.get("excludeCountry") ?? undefined, searchParams.get("eligibility") ?? "subscribed", searchParams.get("subscriptionGroupId") ?? undefined, filters));
}
