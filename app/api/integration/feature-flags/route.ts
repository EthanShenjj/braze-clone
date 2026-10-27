import { getUser, userFeatureFlags } from "@/lib/braze-store";
import { authorizeIntegration } from "@/lib/integration-auth";
import { evaluateFlag } from "@/lib/workspace-modules";
export const runtime = "nodejs";
export function GET(request: Request) {
  try { authorizeIntegration(request, "feature_flags.read"); const user = getUser(new URL(request.url).searchParams.get("userId") ?? ""); if (!user) return Response.json({ error: "User not found." }, { status: 404 }); return Response.json({ feature_flags: userFeatureFlags(user.id) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 }); }
}
