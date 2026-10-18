import { getResource } from "@/lib/braze-store";
import { safeEmailPreview } from "@/lib/email-preview";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const record = getResource((await params).token);
  if (!record || record.type !== "email-preview-share" || Number(record.data.expiresAt) < Date.now()) return new Response("This preview has expired.", { status: 404 });
  return new Response(safeEmailPreview(String(record.data.html)), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox allow-popups; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } });
}
