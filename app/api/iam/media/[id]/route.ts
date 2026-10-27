import { getResource } from "@/lib/braze-store";
export const runtime = "nodejs";
export async function GET(_request: Request, context: RouteContext<"/api/iam/media/[id]">) {
  const { id } = await context.params; const row = getResource(id);
  if (row?.type !== "iam-media" || typeof row.data.base64 !== "string" || !["image/png", "image/jpeg", "image/gif"].includes(String(row.data.mimeType))) return new Response(null, { status: 404 });
  return new Response(Buffer.from(row.data.base64, "base64"), { headers: { "Content-Type": String(row.data.mimeType), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
