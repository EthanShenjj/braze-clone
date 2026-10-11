import { listUserAttributeNames } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ data: listUserAttributeNames() });
}
