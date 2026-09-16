import { activityLog } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET() { return Response.json({ data: activityLog() }); }
