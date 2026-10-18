import { getResource, recordExternalEvent } from "@/lib/braze-store";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = getResource((await params).token);
  if (!token || !["email-tracking-token", "email-subscription-token"].includes(token.type) || Number(token.data.expiresAt) < Date.now()) return new Response(null, { status: 404 });
  const event = token.type === "email-tracking-token" ? "clicked" : "opened";
  if (typeof token.data.campaignId === "string") recordExternalEvent(token.data.campaignId, { userId: String(token.data.userId), event, attributes: { alias: token.data.alias, userAgent: request.headers.get("user-agent") ?? "" } });
  if (event === "clicked") {
    const url = String(token.data.url); if (!/^https?:\/\//i.test(url)) return new Response(null, { status: 400 });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  return new Response(Uint8Array.from(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")), { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
}
