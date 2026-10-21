import { getResource } from "@/lib/braze-store";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getResource(id);
  if (record?.type !== "whatsapp-media" || typeof record.data.base64 !== "string" || typeof record.data.mimeType !== "string") return new Response(null, { status: 404 });
  return new Response(Buffer.from(record.data.base64, "base64"), { headers: { "Content-Type": record.data.mimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, max-age=3600" } });
}
