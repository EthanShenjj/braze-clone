import { applyProfileRows, getUser, listResources, trackProfileEvent, userFeatureFlags, workspaceTransaction } from "@/lib/braze-store";
import { authorizeSdk } from "@/lib/integration-auth";
import { evaluateFlag, objectValue } from "@/lib/workspace-modules";
export const runtime = "nodejs";
export function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId") ?? ""; const app = authorizeSdk(request, userId); const user = getUser(userId); if (!user) return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ feature_flags: userFeatureFlags(user.id), banners: listResources("banners").filter(r => r.status === "Active" && (!r.data.expiresAt || new Date(String(r.data.expiresAt)).getTime() > Date.now())), geofences: app.data.geofences ? listResources("locations").filter(r => r.status === "Active") : [] });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 }); }
}
export async function POST(request: Request) {
  try {
    const input = await request.json(); const id = String(input.external_id ?? ""); if (!id) throw new Error("external_id is required."); const app = authorizeSdk(request, id);
    const result = workspaceTransaction(() => {
      const profile = applyProfileRows([{ ...objectValue(input.attributes), external_id: id }]);
      if (input.session === true) trackProfileEvent({ userId: id, name: "session_start", properties: { appId: app.id } });
      if (input.event) trackProfileEvent({ userId: id, name: String(input.event), properties: { ...objectValue(input.properties), appId: app.id } });
      return profile;
    });
    return Response.json({ message: "success", ...result });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid SDK request." }, { status: 400 }); }
}
