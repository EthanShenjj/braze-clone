export type CanvasNodeKind = "entry" | "delay" | "message" | "branch" | "update";
export type CanvasNode = {
  id: string;
  label: string;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  config?: {
    durationHours?: number;
    channel?: string;
    message?: string;
    attribute?: string;
    value?: string;
  };
};
export type CanvasGraph = { nodes: CanvasNode[]; edges: [string, string][] };
export type CanvasTrace = { userId: string; steps: { nodeId: string; label: string; kind: CanvasNodeKind; at: string }[] };
export type CanvasRun = { id: string; createdAt: string; entered: number; completed: number; messages: number; traces: CanvasTrace[] };

export const initialCanvasGraph: CanvasGraph = {
  nodes: [
    { id: "entry", label: "Audience entry", kind: "entry", x: 110, y: 190 },
    { id: "delay", label: "Delay · 1 day", kind: "delay", x: 360, y: 190, config: { durationHours: 24 } },
    { id: "email", label: "Email message", kind: "message", x: 610, y: 190, config: { channel: "email", message: "Welcome to our latest offers." } },
  ],
  edges: [["entry", "delay"], ["delay", "email"]],
};

export function isCanvasGraph(value: unknown): value is CanvasGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<CanvasGraph>;
  return Array.isArray(graph.nodes) && Array.isArray(graph.edges)
    && graph.nodes.every(node => node && typeof node.id === "string" && typeof node.label === "string"
      && ["entry", "delay", "message", "branch", "update"].includes(node.kind)
      && Number.isFinite(node.x) && Number.isFinite(node.y)
      && (!node.config || typeof node.config === "object"))
    && graph.edges.every(edge => Array.isArray(edge) && edge.length === 2 && edge.every(id => typeof id === "string"));
}

export function validateCanvasGraph(graph: CanvasGraph): string[] {
  const issues: string[] = [];
  const ids = new Set(graph.nodes.map(node => node.id));
  const entries = graph.nodes.filter(node => node.kind === "entry");
  if (entries.length !== 1) issues.push("Add exactly one Audience entry step.");
  if (graph.nodes.length < 2) issues.push("Add at least one step after Audience entry.");
  if (ids.size !== graph.nodes.length) issues.push("Each step must have a unique ID.");
  const edges = new Set<string>();
  for (const [from, to] of graph.edges) {
    if (!ids.has(from) || !ids.has(to) || from === to) issues.push("Remove invalid or self-referencing connections.");
    const key = `${from}\u0000${to}`;
    if (edges.has(key)) issues.push("Remove duplicate connections.");
    edges.add(key);
  }
  if (issues.length) return [...new Set(issues)];

  const outgoing = (id: string) => graph.edges.filter(edge => edge[0] === id).map(edge => edge[1]);
  for (const node of graph.nodes) {
    if (node.kind === "branch" && outgoing(node.id).length !== 2) issues.push(`Action path “${node.label}” needs exactly two routes.`);
    if (node.kind !== "branch" && outgoing(node.id).length > 1) issues.push(`Step “${node.label}” supports only one outgoing route.`);
    if (node.kind === "delay" && (!Number.isFinite(node.config?.durationHours) || Number(node.config?.durationHours) <= 0)) issues.push(`Set a positive delay on “${node.label}”.`);
    if (node.kind === "message" && (!node.config?.channel || !node.config?.message?.trim())) issues.push(`Configure a channel and message on “${node.label}”.`);
    if (node.kind === "branch" && (!node.config?.attribute || !["country", "lifecycle", "subscribed"].includes(node.config.attribute) || !node.config?.value)) issues.push(`Configure the condition on “${node.label}”.`);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let cycle = false;
  const walk = (id: string) => {
    if (visiting.has(id)) { cycle = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing(id)) walk(next);
    visiting.delete(id);
    visited.add(id);
  };
  if (entries[0]) walk(entries[0].id);
  if (cycle) issues.push("Remove loops from the journey before launch.");
  if (visited.size !== graph.nodes.length) issues.push("Connect every step to Audience entry.");
  return issues;
}
