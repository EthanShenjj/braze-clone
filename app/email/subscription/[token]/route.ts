import { getEmailPreferences, getResource, getUser, setUserSubscription } from "@/lib/braze-store";
import { renderBrazeLiquid } from "@/lib/email-liquid";
import { safeEmailPreview } from "@/lib/email-preview";
export const runtime = "nodejs";
async function handle(request: Request, token: string, submit: boolean) {
  const record = getResource(token);
  if (!record || record.type !== "email-subscription-token" || Number(record.data.expiresAt) < Date.now()) return new Response("Subscription link is invalid or expired.", { status: 404 });
  const user = getUser(String(record.data.userId)); if (!user) return new Response("User not found.", { status: 404 });
  const optIn = record.data.action === "optIn";
  if (!submit) return new Response(`<html><body><h1>${optIn ? "Subscribe to emails" : "Unsubscribe from emails"}</h1><form method="post"><button type="submit">${optIn ? "Confirm subscription" : "Confirm unsubscribe"}</button></form></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  setUserSubscription(user.id, optIn);
  const page = getEmailPreferences().data.pages[optIn ? "optIn" : "unsubscribe"];
  const html = page.enabled ? renderBrazeLiquid(page.html, { ...user.attributes, first_name: user.firstName, email: user.email, user_id: user.id }) : `<h1>${optIn ? "Thanks for subscribing!" : "You have been unsubscribed"}</h1>`;
  return new Response(safeEmailPreview(html), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; form-action 'none'; base-uri 'none'" } });
}
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) { return handle(request, (await params).token, false); }
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) { return handle(request, (await params).token, true); }
