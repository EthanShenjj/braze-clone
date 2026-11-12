import { globalControlReport } from "@/lib/braze-store";

export const runtime = "nodejs";
export function GET(request: Request) { const params=new URL(request.url).searchParams;return Response.json(globalControlReport(Number(params.get("days") ?? 30),params.get('workspaceId')??'local'), { headers: { "Cache-Control": "no-store" } }); }
