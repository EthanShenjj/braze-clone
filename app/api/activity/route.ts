import { activityLog } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request: Request) { const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50); return Response.json({ data: activityLog(Number.isFinite(limit) ? Math.max(1, Math.min(10000, Math.floor(limit))) : 50) }); }
