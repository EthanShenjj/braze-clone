import { getGlobalControlSnapshot, saveGlobalControl } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET(request:Request) {
  return Response.json(getGlobalControlSnapshot(new URL(request.url).searchParams.get('workspaceId')??'local'), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    return Response.json(saveGlobalControl(body, body?.expectedUpdatedAt,typeof body?.workspaceId==='string'?body.workspaceId:new URL(request.url).searchParams.get('workspaceId')??'local'));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Global Control Group settings.";
    return Response.json({ error: message }, { status: error&&typeof error==='object'&&'status' in error&&error.status===403?403:/another tab|Disable the current/.test(message) ? 409 : 400 });
  }
}
