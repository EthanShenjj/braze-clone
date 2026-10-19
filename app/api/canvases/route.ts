import { createCanvas, listCanvases } from "@/lib/braze-store";
import { initialCanvasGraph } from "@/lib/canvas-model";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ data: listCanvases() });
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input.name !== "string" || input.description !== undefined && typeof input.description !== "string" || input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((tag: unknown) => typeof tag !== "string"))) return Response.json({ error: "Invalid Canvas details." }, { status: 400 });
  if (input.template !== undefined && !["welcome", "abandoned", "payment"].includes(input.template)) return Response.json({ error: "Unknown Canvas template." }, { status: 400 });
  const graph = input.template ? structuredClone(initialCanvasGraph) : { nodes: [structuredClone(initialCanvasGraph.nodes[0])], edges: [] as [string, string][] };
  if (input.template === "payment") { graph.nodes[1].label = "Wait until reminder"; graph.nodes[2].label = "Payment reminder email"; graph.nodes[2].config = { channel: "email", subject: "Your payment is coming up", message: "Your payment is coming up soon. Please review your account." }; }
  if (input.template === "abandoned") { graph.nodes[1].label = "Wait 2 hours"; graph.nodes[1].config = { durationHours: 2 }; graph.nodes[2].label = "Abandoned intent email"; graph.nodes[2].config = { channel: "email", subject: "Pick up where you left off", message: "Your items are waiting. Continue where you left off." }; }
  if (input.template === "welcome") { graph.nodes[2].label = "Welcome email"; graph.nodes[2].config = { channel: "email", subject: "Welcome", message: "Welcome! We are glad you are here." }; }
  try { return Response.json(createCanvas({ name: input.name, description: input.description, tags: input.tags, graph }), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Canvas creation failed." }, { status: 400 }); }
}
