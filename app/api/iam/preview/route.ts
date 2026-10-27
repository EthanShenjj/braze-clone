import { getUser, randomCatalogPreviewUser, searchUsers } from "@/lib/braze-store";
import { prepareInAppPreview, validateInAppSnapshot } from "@/lib/in-app-runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || !["random", "existing", "custom", "language"].includes(input.mode)) throw new Error("Select a preview user mode.");
    if (input.validateOnly === true) { validateInAppSnapshot(input.variant); return Response.json({ valid: true }); }
    const user = input.mode === "random" ? randomCatalogPreviewUser() : input.userId ? getUser(String(input.userId)) ?? searchUsers(String(input.userId), 0, 1).data[0] : null;
    if (input.mode === "existing" && !user) throw new Error("Select an existing user.");
    if (input.profile !== undefined && (!input.profile || typeof input.profile !== "object" || Array.isArray(input.profile) || JSON.stringify(input.profile).length > 20000)) throw new Error("Invalid preview profile.");
    const profile = input.mode === "custom" || input.mode === "language" ? input.profile ?? {} : user ? { ...user.attributes, user_id: user.id, first_name: user.firstName, email: user.email, country: user.country } : {};
    return Response.json({ variant: prepareInAppPreview(input.variant, profile), profile });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to preview message." }, { status: 400 }); }
}
