import { workspaceAction, workspaceSnapshot } from "@/lib/workspace-service";
export const runtime = "nodejs";
export async function GET(request: Request, context: RouteContext<"/api/workspace/[module]">) {
  try { return Response.json(workspaceSnapshot((await context.params).module, new URL(request.url).searchParams)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load workspace." }, { status: 400 }); }
}
export async function POST(request: Request, context: RouteContext<"/api/workspace/[module]">) {
  try { return Response.json(await workspaceAction((await context.params).module, await request.json())); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to perform action." }, { status: 400 }); }
}
