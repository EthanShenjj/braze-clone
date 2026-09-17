import { demoAction, getDemoState } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET() { return Response.json(getDemoState()); }

export async function POST(request: Request) {
  const { action } = await request.json().catch(() => ({}));
  try { return Response.json(demoAction(action)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Demo action failed." }, { status: 400 }); }
}
