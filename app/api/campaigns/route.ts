import { listCampaigns, upsertCampaign } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return Response.json(listCampaigns({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: Number(searchParams.get("limit") ?? 12),
    offset: Number(searchParams.get("offset") ?? 0),
    sort: searchParams.get("sort") ?? undefined,
  }));
}

export async function POST(request: Request) {
  const input = await request.json();
  if (!input.id || !input.name || !input.channel) return Response.json({ error: "id, name, and channel are required" }, { status: 400 });
  return Response.json(upsertCampaign(input), { status: 201 });
}
