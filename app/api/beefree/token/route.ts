import type { IToken } from "@beefree.io/sdk/dist/types/bee";

const authUrl = "https://auth.getbee.io/loginV2";

function validToken(value: unknown): value is IToken {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<IToken>;
  return typeof token.access_token === "string" && token.access_token.length > 0 && token.v2 === true;
}

export async function POST() {
  const clientId = process.env.BEEFREE_CLIENT_ID;
  const clientSecret = process.env.BEEFREE_CLIENT_SECRET;
  const uid = process.env.BEEFREE_UID || "braze-local-user";

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Beefree is not configured. Set BEEFREE_CLIENT_ID and BEEFREE_CLIENT_SECRET on the server." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, uid }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !validToken(payload)) {
      console.error("Beefree authentication failed", { status: response.status });
      return Response.json({ error: "Beefree authentication failed. Check the server credentials and application status." }, { status: 502 });
    }
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Beefree authentication request failed", error);
    return Response.json({ error: "Beefree authentication is temporarily unavailable." }, { status: 502 });
  }
}
