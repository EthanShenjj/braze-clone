import { getGlobalControlSnapshot, saveGlobalControl } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET() {
  return Response.json(getGlobalControlSnapshot(), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    return Response.json(saveGlobalControl(body, body?.expectedUpdatedAt));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Global Control Group settings.";
    return Response.json({ error: message }, { status: /another tab|Disable the current/.test(message) ? 409 : 400 });
  }
}
