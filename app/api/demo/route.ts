import { demoAction } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request) { const { action } = await request.json(); return Response.json(demoAction(action)); }
