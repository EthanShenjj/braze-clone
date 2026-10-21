import { createResource } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (typeof input?.message !== "string" || !input.message.trim() || input.message.length > 20000) return Response.json({ error: "Provide a message of 1–20,000 characters." }, { status: 400 });
  const record = createResource({ type: "sms-preview-share", name: "SMS preview", data: { message: input.message, expiresAt: Date.now() + 7 * 86400000 } });
  return Response.json({ url: `/sms/preview/${record.id}` });
}
