import { getFrequencyCappingSnapshot, saveFrequencyCapping } from "@/lib/braze-store";
export const runtime = "nodejs";
export function GET(request: Request) {
  return Response.json(getFrequencyCappingSnapshot(new URL(request.url).searchParams.get("workspaceId") ?? "local"), { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || typeof body.workspaceId !== "string" || !body.workspaceId.trim()) return Response.json({ error: "Choose a workspace." }, { status: 400 });
    return Response.json(saveFrequencyCapping(body.settings, body.expectedUpdatedAt, body.workspaceId));
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && [403, 409].includes(Number(error.status)) ? Number(error.status) : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save frequency rules." }, { status });
  }
}
