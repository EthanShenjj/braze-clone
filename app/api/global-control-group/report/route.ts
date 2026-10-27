import { globalControlReport } from "@/lib/braze-store";

export const runtime = "nodejs";
export function GET(request: Request) { return Response.json(globalControlReport(Number(new URL(request.url).searchParams.get("days") ?? 30)), { headers: { "Cache-Control": "no-store" } }); }
