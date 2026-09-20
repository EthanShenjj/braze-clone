import { webhookDeliveryCapability } from "@/lib/braze-store";

export const runtime = "nodejs";

export function GET() { return Response.json(webhookDeliveryCapability()); }
