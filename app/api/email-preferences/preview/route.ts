import { emailWorkspaceLiquid, getEmailPreferences, getUser, randomCatalogPreviewUser } from "@/lib/braze-store";
import { normalizeEmailPreferences } from "@/lib/email-preferences";
import { resolveLiquidPreview } from "@/lib/email-editor-model";
import { htmlToPlainText } from "@/lib/email-liquid";
import { safeEmailPreview } from "@/lib/email-preview";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await request.json();
    if (!["footer", "unsubscribe", "optIn"].includes(input.kind) || typeof input.html !== "string" || new TextEncoder().encode(input.html).length > 750 * 1024) return Response.json({ error: "Invalid preview." }, { status: 400 });
    const user = input.userId ? getUser(input.userId) : randomCatalogPreviewUser();
    if (!user) return Response.json({ error: "Preview user not found." }, { status: 404 });
    const preferences = input.preferences ? normalizeEmailPreferences(input.preferences) : getEmailPreferences().data;
    const profile = { ...user.attributes, user_id: user.id, first_name: user.firstName, email: user.email, country: user.country, unsubscribe_url: "#unsubscribe-preview", unsubscribe_link: "#unsubscribe-preview", optin_url: "#opt-in-preview", opt_in_url: "#opt-in-preview" };
    const html = resolveLiquidPreview(input.html, profile, "en", { ...emailWorkspaceLiquid(), footer: preferences.pages.footer.enabled ? preferences.pages.footer.html : "" }, true);
    return Response.json({ html: safeEmailPreview(html), text: htmlToPlainText(html), user: { id: user.id, email: user.email, firstName: user.firstName } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Preview failed." }, { status: 400 }); }
}
