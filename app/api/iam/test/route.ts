import { prepareInAppTest } from "@/lib/braze-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return Response.json(prepareInAppTest(await request.json())); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to prepare test." }, { status: 400 }); }
}
