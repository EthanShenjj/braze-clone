import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createResource, listResources, updateResource } from "./braze-store";
export const integrationScopes = ["users.track", "events.track", "purchases.track", "feature_flags.read"];
export function issueIntegrationKey(name: string, scopes: string[]) {
  if (!name?.trim() || !Array.isArray(scopes) || !scopes.length || scopes.some(s => !integrationScopes.includes(s))) throw new Error("Enter a name and select supported API permissions.");
  const key = `brz_${randomBytes(32).toString("hex")}`;
  const record = createResource({ type: "integration-api-keys", name: name.trim(), status: "Active", data: { hash: createHash("sha256").update(key).digest("hex"), prefix: `${key.slice(0, 12)}…`, scopes } });
  return { ...safeKey(record), key };
}
function safeKey(row: ReturnType<typeof createResource>) { const { hash: _hash, ...data } = row.data; return { ...row, data }; }
export function listIntegrationKeys() { return listResources("integration-api-keys").map(safeKey); }
export function revokeIntegrationKey(id: string, revision: string) { const row = listResources("integration-api-keys").find(r => r.id === id); if (!row) throw new Error("API key not found."); return safeKey(updateResource(id, { status: "Revoked" }, revision)); }
export function authorizeIntegration(request: Request, scope: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token.startsWith("brz_") || token.length > 200) throw new Error("A valid Bearer API key is required.");
  const hash = createHash("sha256").update(token).digest("hex");
  const row = listResources("integration-api-keys").find(r => r.status === "Active" && typeof r.data.hash === "string" && r.data.hash.length === hash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(r.data.hash)));
  if (!row || !Array.isArray(row.data.scopes) || !row.data.scopes.includes(scope)) throw new Error(`The API key needs ${scope} permission.`);
  return row;
}
export function authorizeSdk(request: Request, userId: string) {
  const key = request.headers.get("x-app-identifier") ?? "";
  const app = listResources("app-settings").find(r => r.status === "Active" && r.data.apiIdentifier === key);
  if (!app) throw new Error("A valid X-App-Identifier is required.");
  const signature = request.headers.get("x-sdk-signature");
  if (app.data.sdkAuthentication === "Required" || signature) {
    if (!process.env.SDK_AUTH_SECRET) throw new Error("SDK_AUTH_SECRET must be configured for SDK authentication.");
    const expected = createHmac("sha256", process.env.SDK_AUTH_SECRET).update(userId).digest("hex");
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("A valid user authentication signature is required.");
  }
  return app;
}
