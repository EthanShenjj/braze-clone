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

const workspaceOf = (canvas: CanvasRecord) => canvas.workspaceId ?? "local";
export function listBrowserCanvases(workspaceId = "local") { return read().filter(item => workspaceOf(item.canvas) === workspaceId).map(item => item.canvas); }
export function getBrowserCanvas(id: string, workspaceId?: string) { return read().find(item => item.canvas.id === id && (workspaceId === undefined || workspaceOf(item.canvas) === workspaceId)) ?? null; }

// Registry renames also apply to browser-only drafts, which the server cannot update.
// Keep deleted names visible so an editor can remove them before saving.
export function resolveBrowserCanvasTagRenames(tags: string[], aliases: Record<string, string | null>) {
  return [...new Set(tags.map(name => Object.hasOwn(aliases, name) && aliases[name] !== null ? aliases[name] : name))];
}

export function reconcileBrowserCanvasTags(aliases: Record<string, string | null>, workspaceId = "local") {
  const items = read();
  let changed = false;
  for (const item of items) {
    if (workspaceOf(item.canvas) !== workspaceId) continue;
    const tags = resolveBrowserCanvasTagRenames(item.canvas.tags, aliases);
    if (JSON.stringify(tags) !== JSON.stringify(item.canvas.tags)) {
      item.canvas = { ...item.canvas, tags };
      changed = true;
    }
  }
  if (changed) write(items);
  return items.filter(item => workspaceOf(item.canvas) === workspaceId).map(item => item.canvas);
}

export function createBrowserCanvas(input: { name: string; description?: string; tags?: string[]; template?: string; graph?: CanvasGraph; wizard?: CanvasRecord["wizard"]; workspaceId?: string }) {
  const items = read();
  const workspaceId = input.workspaceId ?? "local";
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("Canvas name must be 1–120 characters.");
  if (items.some(item => workspaceOf(item.canvas) === workspaceId && item.canvas.name.toLowerCase() === name.toLowerCase() && item.canvas.status !== "Archived")) throw new Error("A Canvas with this name already exists.");
  const timestamp = new Date().toISOString();
  const canvas: CanvasRecord = { id: crypto.randomUUID(), workspaceId, name, description: input.description?.trim() ?? "", status: "Draft", createdAt: timestamp, updatedAt: timestamp, createdBy: "Browser workspace", lastEditedBy: "Browser workspace", tags: tagNames(input.tags, true), team: "", experience: "Canvas Flow", targetSegment: "All Users", alertsConfigured: false, wizard: input.wizard ?? structuredClone(defaultCanvasWizard) };
  const graph = input.graph ?? (input.template ? structuredClone(initialCanvasGraph) : { nodes: [structuredClone(initialCanvasGraph.nodes[0])], edges: [] as [string, string][] });
  if (input.template === "payment") { graph.nodes[1].label = "Wait until reminder"; graph.nodes[2].label = "Payment reminder email"; graph.nodes[2].config = { channel: "email", subject: "Your payment is coming up", message: "Your payment is coming up soon. Please review your account." }; }
  if (input.template === "abandoned") { graph.nodes[1].label = "Wait 2 hours"; graph.nodes[1].config = { durationHours: 2 }; graph.nodes[2].label = "Abandoned intent email"; graph.nodes[2].config = { channel: "email", subject: "Pick up where you left off", message: "Your items are waiting. Continue where you left off." }; }
  if (input.template === "welcome") { graph.nodes[2].label = "Welcome email"; graph.nodes[2].config = { channel: "email", subject: "Welcome", message: "Welcome! We are glad you are here." }; }
  write([...items, { canvas, graph }]);
  return canvas;
}

export function patchBrowserCanvas(id: string, patch: Partial<CanvasRecord>, workspaceId?: string) {
  const items = read();
  const item = items.find(entry => entry.canvas.id === id && (workspaceId === undefined || workspaceOf(entry.canvas) === workspaceId));
  if (!item) throw new Error("Canvas not found in this browser.");
  if (patch.workspaceId !== undefined && patch.workspaceId !== workspaceOf(item.canvas)) throw new Error("Canvas cannot move between workspaces.");
  const name = (patch.name ?? item.canvas.name).trim();
  if (!name || name.length > 120) throw new Error("Canvas name must be 1–120 characters.");
  if (items.some(entry => entry.canvas.id !== id && workspaceOf(entry.canvas) === workspaceOf(item.canvas) && entry.canvas.name.toLowerCase() === name.toLowerCase() && entry.canvas.status !== "Archived")) throw new Error("A Canvas with this name already exists.");
  item.canvas = { ...item.canvas, ...patch, tags: tagNames(patch.tags ?? item.canvas.tags, true), name, updatedAt: new Date().toISOString(), lastEditedBy: "Browser workspace" };
  write(items);
  return item.canvas;
}

export function tagBrowserCanvases(ids: string[], tags: string[], workspaceId = "local") {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) throw new Error("Select at least one Canvas.");
  const items = read();
  if (uniqueIds.some(id => !items.some(item => item.canvas.id === id && workspaceOf(item.canvas) === workspaceId))) throw new Error("A selected Canvas is no longer available in this browser workspace.");
  const names = tagNames(tags, true);
  const timestamp = new Date().toISOString();
  for (const item of items) {
    if (uniqueIds.includes(item.canvas.id)) item.canvas = { ...item.canvas, tags: [...names], updatedAt: timestamp, lastEditedBy: "Browser workspace" };
  }
  write(items);
  return items.filter(item => uniqueIds.includes(item.canvas.id)).map(item => item.canvas);
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

export function duplicateBrowserCanvas(id: string, workspaceId?: string) {
  const source = getBrowserCanvas(id, workspaceId);
  if (!source) throw new Error("Canvas not found in this browser.");
  const existingNames = new Set(listBrowserCanvases(workspaceOf(source.canvas)).filter(item => item.status !== "Archived").map(item => item.name.toLowerCase()));
  let name = `${source.canvas.name} copy`;
  let suffix = 2;
  while (existingNames.has(name.toLowerCase())) name = `${source.canvas.name} copy ${suffix++}`;
  return createBrowserCanvas({ workspaceId: workspaceOf(source.canvas), name, description: source.canvas.description, tags: source.canvas.tags, wizard: source.canvas.wizard, graph: { ...source.graph, nodes: source.graph.nodes.map(node => node.config?.linkedCampaignId ? { ...node, config: { ...node.config, linkedCampaignId: undefined } } : node) } });
}
