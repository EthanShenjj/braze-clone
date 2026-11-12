import { validateWhatsAppCampaign } from "./whatsapp-model.ts";
import {canvasTriggerIssues} from './canvas-action-model.ts';
import {canvasDeliveryIssues,canvasOptimizerIssues} from './canvas-builder-model.ts';
import {canvasMaxRoutes,canvasStepIssues,canvasPaths} from './canvas-step-model.ts';
import {channelConfigurationIssues} from './channel-message-model.ts';

export type CanvasNodeKind = "entry" | "delay" | "message" | "branch" | "update" | "agent" | "optimizer" | "audience_paths" | "action_paths" | "experiment_paths" | "destination" | "context" | "feature_flag" | "audience_sync";
export type CanvasNode = {
  id: string;
  label: string;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  config?: {
    [key: string]: unknown;
    durationHours?: number;
    channel?: string;
    message?: string;
    subject?: string;
    attribute?: string;
    value?: string;
    reEntry?: "none" | "after1d" | "after7d" | "always";
    conversionEvent?: string;
    conversionDeadlineDays?: number;
    linkedCampaignId?: string;
  };
};
export type CanvasVariant = { id: string; name: string; weight: number };
export type CanvasGraph = { nodes: CanvasNode[]; edges: [string, string][]; variants?: CanvasVariant[] };
export type CanvasTrace = { userId: string; steps: { nodeId: string; label: string; kind: CanvasNodeKind; at: string }[] };
export type CanvasRun = { id: string; createdAt: string; entered: number; completed: number; messages: number; traces: CanvasTrace[]; nextDueAt?: string | null };

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
      && ["entry", "delay", "message", "branch", "update", "agent", "optimizer", "audience_paths", "action_paths", "experiment_paths", "destination", "context", "feature_flag", "audience_sync"].includes(node.kind)
      && Number.isFinite(node.x) && Number.isFinite(node.y)
      && (!node.config || typeof node.config === "object"&&!Array.isArray(node.config)))
    && graph.edges.every(edge => Array.isArray(edge) && edge.length === 2 && edge.every(id => typeof id === "string"))
    && (graph.variants === undefined || Array.isArray(graph.variants) && graph.variants.every(variant => variant && typeof variant.id === "string" && typeof variant.name === "string" && Number.isFinite(variant.weight)));
}

export function validateCanvasGraph(graph: CanvasGraph): string[] {
  const issues: string[] = [];
  const ids = new Set(graph.nodes.map(node => node.id));
  const entries = graph.nodes.filter(node => node.kind === "entry");
  if (entries.length !== 1) issues.push("Add exactly one Audience entry step.");
  if (graph.nodes.length < 2) issues.push("Add at least one step after Audience entry.");
  if (ids.size !== graph.nodes.length) issues.push("Each step must have a unique ID.");
  if (graph.variants && (graph.variants.length === 0 || graph.variants.reduce((total, variant) => total + variant.weight, 0) !== 100)) issues.push("Canvas variant percentages must total 100%.");
  if (graph.variants && graph.variants.length > 1) issues.push("Multiple variants are not supported by the local simulation.");
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
    if (!["entry", "delay", "message", "branch", "update", "context", "audience_paths", "experiment_paths"].includes(node.kind)) issues.push(`The ${node.label} component is not supported by the local simulation.`);
    if (node.kind === "branch") {
      const targets=node.config?.branchTargets as {yes?:string;no?:string}|undefined;
      if (targets ? !targets.yes || !targets.no || outgoing(node.id).length>2 : outgoing(node.id).length!==2) issues.push(`Action path “${node.label}” needs exactly two routes.`);
    }
    if (node.kind !== "branch" && outgoing(node.id).length > canvasMaxRoutes(node)) issues.push(`Step “${node.label}” supports only ${canvasMaxRoutes(node)===1?'one':canvasMaxRoutes(node)} outgoing route${canvasMaxRoutes(node)===1?'':'s'}.`);
    if (node.kind === "delay" && !node.config?.delayMode && (!Number.isFinite(node.config?.durationHours) || Number(node.config?.durationHours) <= 0)) issues.push(`Set a positive delay on “${node.label}”.`);
    if(node.kind==='action_paths')for(const path of canvasPaths(node))for(const trigger of path.triggers??[])issues.push(...canvasTriggerIssues(trigger));
    if(node.kind==='message')issues.push(...canvasDeliveryIssues(node.config??{}));
    if(node.kind==='optimizer')issues.push(...canvasOptimizerIssues(node.config??{}));
    if (node.kind === "message" && (!node.config?.channel || !node.config?.message?.trim()&&!(node.config?.channel==='sms'&&(node.config?.channelValues as {mediaUrl?:string})?.mediaUrl))) issues.push(`Configure a channel and message on “${node.label}”.`);
    if (node.kind === "message" && node.config?.channel === "sms" && !node.config.subscriptionGroupId) issues.push(`Select an SMS subscription group on “${node.label}”.`);
    if(node.kind==='message'&&node.config?.channel==='sms'){
      issues.push(...channelConfigurationIssues({channel:'sms',body:node.config.message,config:node.config}));
      if(node.config.intelligentTiming&&node.config.timingFallback==='custom'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(node.config.timingTime??'17:00')))issues.push(`Choose a valid Intelligent Timing fallback time on “${node.label}”.`);
    }
    if (node.kind === "message" && node.config?.channel === "whatsapp") {
      if (!node.config.subscriptionGroupId) issues.push(`Select a WhatsApp subscription group on “${node.label}”.`);
      issues.push(...validateWhatsAppCampaign({ body: node.config.message, config: node.config }));
    }
    if (node.kind === "branch" && !Array.isArray(node.config?.filterGroups) && !(Array.isArray(node.config?.segmentIds)&&node.config.segmentIds.length) && (!node.config?.attribute || !["country", "lifecycle", "subscribed"].includes(node.config.attribute) || !node.config?.value)) issues.push(`Configure the condition on “${node.label}”.`);
    if (node.kind === "update" && !node.config?.updateMode && (!node.config?.attribute || typeof node.config.value !== "string")) issues.push(`Configure an attribute and value on “${node.label}”.`);
    if (node.kind === "update" && node.config?.attribute === "subscribed" && !["true", "false"].includes(String(node.config.value))) issues.push(`Set subscribed to true or false on “${node.label}”.`);
    if(node.config?.delayMode||node.config?.updateMode||Array.isArray(node.config?.filterGroups)||['context','audience_paths','experiment_paths','action_paths'].includes(node.kind))issues.push(...canvasStepIssues(node));
    for(const target of [...Object.values((node.config?.branchTargets??{}) as Record<string,string>),...(Array.isArray(node.config?.paths)?node.config.paths as Array<{nextNodeId?:string}>:[]).flatMap(path=>path.nextNodeId?[path.nextNodeId]:[])])if(!ids.has(target)||!outgoing(node.id).includes(target))issues.push(`Connect an available destination for “${node.label}”.`);
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
