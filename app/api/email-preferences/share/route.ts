import { createResource } from "@/lib/braze-store";
import { safeEmailPreview } from "@/lib/email-preview";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (typeof input?.html !== "string" || input.html.length > 1000000) return Response.json({ error: "Invalid preview." }, { status: 400 });
  const record = createResource({ type: "email-preview-share", name: "Email preview", data: { html: safeEmailPreview(input.html), expiresAt: Date.now() + 7 * 86400000 } });
  return Response.json({ url: `/email/preview/${record.id}`, expiresAt: record.data.expiresAt });
}
