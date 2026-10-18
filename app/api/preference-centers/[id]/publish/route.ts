import { publishPreferenceCenter } from "@/lib/braze-store";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = publishPreferenceCenter(id);
  return result ? Response.json(result) : Response.json({ error: "Preference center not found" }, { status: 404 });
}
