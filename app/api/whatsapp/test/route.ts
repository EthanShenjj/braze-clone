import { prepareWhatsAppTest } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  try { return Response.json(prepareWhatsAppTest(input)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not prepare WhatsApp test." }, { status: 400 }); }
}
