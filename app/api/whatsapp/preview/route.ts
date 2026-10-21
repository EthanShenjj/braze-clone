import { createResource } from "@/lib/braze-store";
import { customWhatsAppTemplates, normalizeWhatsAppVariants, prepareWhatsAppMessage } from "@/lib/whatsapp-model";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input?.config || typeof input.config !== "object" || JSON.stringify(input).length > 200000) return Response.json({ error: "Provide a valid WhatsApp preview." }, { status: 400 });
  try {
    const variant = normalizeWhatsAppVariants(input).find(item => item.id === input.variantId);
    if (!variant) throw new Error("Select a valid variant.");
    const profile = input.profile;
    if (profile !== undefined && (!profile || typeof profile !== "object" || Array.isArray(profile) || JSON.stringify(profile).length > 20000)) throw new Error("Provide a valid profile object.");
    const payload = prepareWhatsAppMessage(variant, customWhatsAppTemplates(input), profile ?? {});
    const record = createResource({ type: "whatsapp-preview-share", name: "WhatsApp preview", data: { payload, expiresAt: Date.now() + 7 * 86400000 } });
    return Response.json({ url: `/whatsapp/preview/${record.id}` });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid preview." }, { status: 400 }); }
}
