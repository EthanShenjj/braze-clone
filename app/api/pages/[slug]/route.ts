import { submitLandingPage } from "@/lib/workspace-service";
export const runtime = "nodejs";
export async function POST(request: Request, context: RouteContext<"/api/pages/[slug]">) {
  try { return Response.json(submitLandingPage((await context.params).slug, await request.json())); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to submit." }, { status: 400 }); }
}
