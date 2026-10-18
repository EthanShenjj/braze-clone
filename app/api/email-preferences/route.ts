import { canEditEmailPreferences } from "@/lib/email-preferences-access";
import { getEmailPreferences, saveEmailPreferences } from "@/lib/braze-store";
import { validateEmailPreferences, type EmailPreferences } from "@/lib/email-preferences";

export const runtime = "nodejs";

export function GET() { return Response.json({ ...getEmailPreferences(), permissions: { canEdit: canEditEmailPreferences() } }); }

export async function PUT(request: Request) {
  if (!canEditEmailPreferences()) return Response.json({ error: "You do not have permission to edit email preferences." }, { status: 403 });
  let input: { data?: unknown; expectedUpdatedAt?: unknown };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  const errors = validateEmailPreferences(input.data);
  if (errors.length) return Response.json({ error: "Check the highlighted email preferences.", errors }, { status: 400 });
  if (input.expectedUpdatedAt !== null && typeof input.expectedUpdatedAt !== "string") return Response.json({ error: "A settings version is required. Reload before saving." }, { status: 400 });
  try { return Response.json(saveEmailPreferences(input.data as EmailPreferences, input.expectedUpdatedAt)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save email preferences." }, { status: 409 }); }
}
