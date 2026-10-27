import { tagNames } from "./tag-model.ts";
import type { CanvasRecord } from "./braze-store";
import { initialCanvasGraph, type CanvasGraph } from "./canvas-model.ts";
import { defaultCanvasWizard } from "./canvas-wizard-model.ts";

type BrowserCanvas = { canvas: CanvasRecord; graph: CanvasGraph };
const key = "braze-canvas-browser-drafts-v1";

export const browserCanvasMode = process.env.NEXT_PUBLIC_CANVAS_BROWSER_STORAGE === "true";

function read(): BrowserCanvas[] {
  const value = localStorage.getItem(key);
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Browser Canvas drafts could not be read.");
  return parsed as BrowserCanvas[];
}

function write(items: BrowserCanvas[]) {
  try { localStorage.setItem(key, JSON.stringify(items)); }
  catch { throw new Error("Browser storage is unavailable or full. Canvas changes were not saved."); }
}

export function listBrowserCanvases() { return read().map(item => item.canvas); }
export function getBrowserCanvas(id: string) { return read().find(item => item.canvas.id === id) ?? null; }

export function createBrowserCanvas(input: { name: string; description?: string; tags?: string[]; template?: string; graph?: CanvasGraph; wizard?: CanvasRecord["wizard"] }) {
  const items = read();
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("Canvas name must be 1–120 characters.");
  if (items.some(item => item.canvas.name.toLowerCase() === name.toLowerCase() && item.canvas.status !== "Archived")) throw new Error("A Canvas with this name already exists.");
  const timestamp = new Date().toISOString();
  const canvas: CanvasRecord = { id: crypto.randomUUID(), name, description: input.description?.trim() ?? "", status: "Draft", createdAt: timestamp, updatedAt: timestamp, createdBy: "Browser workspace", lastEditedBy: "Browser workspace", tags: tagNames(input.tags, true), team: "", experience: "Canvas Flow", targetSegment: "All Users", alertsConfigured: false, wizard: input.wizard ?? structuredClone(defaultCanvasWizard) };
  const graph = input.graph ?? (input.template ? structuredClone(initialCanvasGraph) : { nodes: [structuredClone(initialCanvasGraph.nodes[0])], edges: [] as [string, string][] });
  if (input.template === "payment") { graph.nodes[1].label = "Wait until reminder"; graph.nodes[2].label = "Payment reminder email"; graph.nodes[2].config = { channel: "email", subject: "Your payment is coming up", message: "Your payment is coming up soon. Please review your account." }; }
  if (input.template === "abandoned") { graph.nodes[1].label = "Wait 2 hours"; graph.nodes[1].config = { durationHours: 2 }; graph.nodes[2].label = "Abandoned intent email"; graph.nodes[2].config = { channel: "email", subject: "Pick up where you left off", message: "Your items are waiting. Continue where you left off." }; }
  if (input.template === "welcome") { graph.nodes[2].label = "Welcome email"; graph.nodes[2].config = { channel: "email", subject: "Welcome", message: "Welcome! We are glad you are here." }; }
  write([...items, { canvas, graph }]);
  return canvas;
}

export function patchBrowserCanvas(id: string, patch: Partial<CanvasRecord>) {
  const items = read();
  const item = items.find(entry => entry.canvas.id === id);
  if (!item) throw new Error("Canvas not found in this browser.");
  const name = (patch.name ?? item.canvas.name).trim();
  if (!name || name.length > 120) throw new Error("Canvas name must be 1–120 characters.");
  if (items.some(entry => entry.canvas.id !== id && entry.canvas.name.toLowerCase() === name.toLowerCase() && entry.canvas.status !== "Archived")) throw new Error("A Canvas with this name already exists.");
  item.canvas = { ...item.canvas, ...patch, tags: tagNames(patch.tags ?? item.canvas.tags, true), name, updatedAt: new Date().toISOString(), lastEditedBy: "Browser workspace" };
  write(items);
  return item.canvas;
}

export function saveBrowserGraph(id: string, graph: CanvasGraph) {
  const items = read();
  const item = items.find(entry => entry.canvas.id === id);
  if (!item) throw new Error("Canvas not found in this browser.");
  item.graph = graph;
  item.canvas.updatedAt = new Date().toISOString();
  write(items);
  return item.canvas.updatedAt;
}

export function duplicateBrowserCanvas(id: string) {
  const source = getBrowserCanvas(id);
  if (!source) throw new Error("Canvas not found in this browser.");
  const existingNames = new Set(listBrowserCanvases().filter(item => item.status !== "Archived").map(item => item.name.toLowerCase()));
  let name = `${source.canvas.name} copy`;
  let suffix = 2;
  while (existingNames.has(name.toLowerCase())) name = `${source.canvas.name} copy ${suffix++}`;
  return createBrowserCanvas({ name, description: source.canvas.description, tags: source.canvas.tags, wizard: source.canvas.wizard, graph: { ...source.graph, nodes: source.graph.nodes.map(node => node.config?.linkedCampaignId ? { ...node, config: { ...node.config, linkedCampaignId: undefined } } : node) } });
}
