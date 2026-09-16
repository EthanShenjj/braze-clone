import { reportOverview } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request: Request) { return Response.json(reportOverview(new URL(request.url).searchParams.get("days") ?? "30")); }
