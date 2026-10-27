import { applyProfileRows, trackProfileEvent, workspaceTransaction } from "@/lib/braze-store";
import { authorizeIntegration } from "@/lib/integration-auth";
import { objectValue } from "@/lib/workspace-modules";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await request.json(); const attributes = input.attributes ?? []; const events = input.events ?? []; const purchases = input.purchases ?? [];
    if (![attributes, events, purchases].every(Array.isArray) || attributes.length + events.length + purchases.length > 1000 || !attributes.length && !events.length && !purchases.length) throw new Error("Provide up to 1,000 attributes, events or purchases.");
    if (attributes.length) authorizeIntegration(request, "users.track"); if (events.length) authorizeIntegration(request, "events.track"); if (purchases.length) authorizeIntegration(request, "purchases.track");
    const result = workspaceTransaction(() => {
      const profiles = attributes.length ? applyProfileRows(attributes) : { processed: 0 };
      for (const row of events) trackProfileEvent({ userId: String(row.external_id), name: String(row.name ?? ""), properties: objectValue(row.properties) });
      for (const row of purchases) trackProfileEvent({ userId: String(row.external_id), name: "purchase", productId: String(row.product_id ?? ""), price: Number(row.price), quantity: Number(row.quantity ?? 1), currency: String(row.currency ?? "USD"), properties: objectValue(row.properties) });
      return { attributes_processed: profiles.processed, events_processed: events.length, purchases_processed: purchases.length };
    });
    return Response.json({ message: "success", ...result });
  } catch (error) { const message = error instanceof Error ? error.message : "Invalid request."; return Response.json({ error: message }, { status: /Bearer|permission/.test(message) ? 401 : 400 }); }
}
