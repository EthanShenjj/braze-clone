"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bot, ChevronDown, ChevronLeft, ChevronUp, Clock3, ExternalLink, Flag, Gauge, GitBranch, Mail, MousePointerClick, Plus, Send, Settings2, Shuffle, Sparkles, Users, WandSparkles, X } from "lucide-react";
import { type CanvasGraph, type CanvasNode, type CanvasNodeKind, type CanvasRun, initialCanvasGraph, isCanvasGraph, validateCanvasGraph } from "@/lib/canvas-model";
import { defaultCanvasWizard, type CanvasWizardConfig } from "@/lib/canvas-wizard-model";
import { formatDate, formatNumber, normalizeLocale, type Locale } from "@/lib/i18n";
import { registerUnsavedNavigation } from "@/lib/unsaved-navigation";
import { browserCanvasMode, getBrowserCanvas, saveBrowserGraph } from "@/lib/canvas-browser-store";
import styles from "./flow-canvas.module.css";
import CanvasSmsEditor from "./canvas-sms-editor";
import CanvasWhatsAppEditor from "./canvas-whatsapp-editor";
import CanvasStepEditor from './canvas-step-editor';
import CanvasChannelEditor from './canvas-channel-editor';
import CanvasBuildToolbar from './canvas-build-toolbar';
import {removeCanvasStep,connectCanvasRoute,canvasMaxRoutes,canvasPaths,canvasStepDefaults,canvasStepSummary,canvasEditorConfig} from '@/lib/canvas-step-model';
import {normalizeCanvasExperimentConfig} from './canvas-editor-experiment-settings';

type Drag = { id: string; startX: number; startY: number; x: number; y: number; moved: boolean };
type ComponentDrag = { kind: CanvasNodeKind; startX: number; startY: number };
type ComponentItem = { kind: CanvasNodeKind; label: string; tone: string; icon: typeof Mail };
const componentGroups: Array<{ title: string; items: ComponentItem[] }> = [
  { title: "Message Controls", items: [{ kind: "message", label: "Message", tone: "green", icon: Send }, { kind: "delay", label: "Delay", tone: "purple", icon: Clock3 }] },
  { title: "AI Actions", items: [{ kind: "agent", label: "Agent Step", tone: "gray", icon: Bot }, { kind: "optimizer", label: "Content Optimizer", tone: "pink", icon: Sparkles }] },
  { title: "Flow Controls", items: [{ kind: "branch", label: "Decision Split", tone: "red", icon: GitBranch }, { kind: "audience_paths", label: "Audience Paths", tone: "red", icon: Users }, { kind: "action_paths", label: "Action Paths", tone: "red", icon: MousePointerClick }, { kind: "experiment_paths", label: "Experiment Paths", tone: "red", icon: Shuffle }, { kind: "destination", label: "Send to Destination", tone: "blue", icon: Send }] },
  { title: "Audience Updates", items: [{ kind: "context", label: "Context", tone: "blue", icon: Activity }, { kind: "update", label: "User Update", tone: "blue", icon: Users }, { kind: "feature_flag", label: "Feature Flag", tone: "blue", icon: Flag }, { kind: "audience_sync", label: "Audience Sync", tone: "blue", icon: Users }] },
];
const componentByKind = new Map(componentGroups.flatMap(group => group.items).map(item => [item.kind, item]));
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)])):value;
const fingerprint=(value:unknown)=>JSON.stringify(ordered(value));
function savedFingerprint(value:string){try{return fingerprint(JSON.parse(value));}catch{return value;}}
export async function persistCanvasGraph({canvasId,workspaceId,graph,savedGraph,updatedAt,browserDraft=false}:{canvasId:string;workspaceId:string;graph:CanvasGraph;savedGraph:string;updatedAt:string|null;browserDraft?:boolean}):Promise<{changed:boolean;updatedAt:string|null}>{
 if(fingerprint(graph)===savedFingerprint(savedGraph))return{changed:false,updatedAt};
 if(browserDraft){if(!getBrowserCanvas(canvasId,workspaceId))throw Error('Canvas not found in this workspace.');return{changed:true,updatedAt:saveBrowserGraph(canvasId,graph)};}
 const response=await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/graph?workspaceId=${encodeURIComponent(workspaceId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({graph,updatedAt,workspaceId})}),result=await response.json();
 if(!response.ok)throw Error(result.error??'Canvas save failed.');return{changed:true,updatedAt:result.updatedAt};
}
export function canvasEditedStep(node:CanvasNode,label:string,config:NonNullable<CanvasNode['config']>,workspaceId:string,entryOnce=false):CanvasNode{
 let baseline:Record<string,unknown>=['message','optimizer'].includes(node.kind)?{...node.config,workspaceId,channel:node.config?.channel??'',subject:node.config?.subject??'',message:node.config?.message??''}:canvasEditorConfig(node);
 if(node.kind==='experiment_paths')baseline=normalizeCanvasExperimentConfig(baseline,entryOnce);
 const unchanged=fingerprint(config)===fingerprint(node.config??{})||fingerprint(config)===fingerprint(baseline);
 return unchanged&&label===node.label?node:{...node,label,config:unchanged?node.config:config};
}
function variantRoot(graph:CanvasGraph,variantId:string){
 const entry=graph.nodes.find(node=>node.kind==='entry');if(!entry)return null;
 if(Object.hasOwn(entry.config??{},'variantTargets'))return typeof record(entry.config?.variantTargets)[variantId]==='string'?String(record(entry.config?.variantTargets)[variantId]):null;
 const edges=graph.edges.filter(([from])=>from===entry.id);return edges.length===1?edges[0][1]:null;
}
export function canvasMissingVariantRoutes(graph:CanvasGraph):string[]{
 const entry=graph.nodes.find(node=>node.kind==='entry');return(graph.variants??[]).filter(variant=>{if(variant.weight<=0)return false;const root=variantRoot(graph,variant.id),target=graph.nodes.find(node=>node.id===root);return!root||!target||Boolean(target.config?.variantId&&target.config.variantId!==variant.id)||!graph.edges.some(([from,to])=>from===entry?.id&&to===root);}).map(variant=>variant.name);
}
export function connectCanvasVariantRoot(graph:CanvasGraph,variantId:string,nodeId:string):CanvasGraph{
 const entry=graph.nodes.find(node=>node.kind==='entry'),target=graph.nodes.find(node=>node.id===nodeId&&node.kind!=='entry');
 if(!entry||!graph.variants?.some(variant=>variant.id===variantId)||!target||target.config?.variantId&&target.config.variantId!==variantId)return graph;
 const prior=Object.hasOwn(entry.config??{},'variantTargets')?record(entry.config?.variantTargets):Object.fromEntries((graph.variants??[]).flatMap(variant=>{const root=variantRoot(graph,variant.id);return root?[[variant.id,root]]:[];})),targets={...prior,[variantId]:nodeId},roots=[...new Set(Object.values(targets).filter((id):id is string=>typeof id==='string'&&graph.nodes.some(node=>node.id===id)))];
 return{...graph,nodes:graph.nodes.map(node=>node.id===entry.id?{...node,config:{...node.config,variantTargets:targets}}:node),edges:[...graph.edges.filter(([from])=>from!==entry.id),...roots.map(root=>[entry.id,root] as [string,string])]};
}
export function canvasVariantView(graph:CanvasGraph,variantId:string|null):CanvasGraph{
 if(!variantId||!graph.variants?.length)return graph;
 const entry=graph.nodes.find(node=>node.kind==='entry'),root=variantRoot(graph,variantId),walk=(rootId:string|null,owner:string)=>{const seen=new Set<string>(),queue=rootId?[rootId]:[];while(queue.length){const id=queue.shift()!;if(seen.has(id))continue;const node=graph.nodes.find(node=>node.id===id);if(!node||node.config?.variantId&&node.config.variantId!==owner)continue;seen.add(id);queue.push(...graph.edges.filter(([from])=>from===id).map(([,to])=>to));}return seen;},selected=walk(root,variantId),other=new Set((graph.variants??[]).filter(variant=>variant.id!==variantId).flatMap(variant=>[...walk(variantRoot(graph,variant.id),variant.id)]));
 const nodes=graph.nodes.filter(node=>node.kind==='entry'||node.config?.variantId===variantId||!node.config?.variantId&&(selected.has(node.id)||!other.has(node.id))),ids=new Set(nodes.map(node=>node.id));
 return{...graph,nodes,edges:graph.edges.filter(([from,to])=>ids.has(from)&&ids.has(to)&&(from!==entry?.id||to===root))};
}

function arrangeLegacyGraph(graph: CanvasGraph): CanvasGraph {
  const steps = graph.nodes.filter(node => node.kind !== "entry");
  if (!steps.length || !steps.every(node => initialCanvasGraph.nodes.some(seed=>seed.id===node.id&&seed.x===node.x&&seed.y===node.y))) return graph;
  return { ...graph, nodes: graph.nodes.map(node => node.kind === "entry" ? node : { ...node, x: 650, y: 725 + steps.indexOf(node) * 170 }) };
}

type LiveCanvasProps={canvasId:string;canvasName:string;workspaceId?:string;onBack:()=>void;locale?:Locale;notify:(message:string)=>void;embedded?:boolean;wizard?:CanvasWizardConfig;saveRef?:React.MutableRefObject<(()=>Promise<boolean>)|null>;onSaved?:(graph:CanvasGraph,updatedAt:string)=>void;onGraphChange?:(graph:CanvasGraph,dirty:boolean)=>void;revision?:string|null;detailsExpanded?:boolean;onToggleDetails?:()=>void;onSave?:()=>void;onContinue?:()=>void;onBeforeTest?:()=>Promise<boolean>;metadataDirty?:boolean;changeBrief?:(value:CanvasWizardConfig['brief'])=>void;parentSaving?:boolean};
export default function LiveCanvas({canvasId,canvasName,workspaceId:requestedWorkspaceId,onBack,locale:localeValue="en",notify,embedded=false,wizard=defaultCanvasWizard,saveRef,onSaved,onGraphChange,revision,detailsExpanded=false,onToggleDetails,onSave,onContinue,onBeforeTest,metadataDirty=false,changeBrief,parentSaving=false}:LiveCanvasProps) {
  const locale = normalizeLocale(localeValue);
  const [history, setHistory] = useState<CanvasGraph[]>([{nodes:[],edges:[]}]);
  const [cursor, setCursor] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  // Wizard metadata and the graph share one persisted revision. A metadata save
  // must advance the builder's optimistic lock without resetting unsaved nodes.
  const workspaceId=requestedWorkspaceId||new URLSearchParams(typeof window==='undefined'?'':window.location.search).get('workspace')||new URLSearchParams(typeof window==='undefined'?'':window.location.search).get('workspaceId')||'local';
  useEffect(() => { if(revision) setUpdatedAt(revision); }, [revision]);
  const [savedGraph, setSavedGraph] = useState(() => JSON.stringify({nodes:[],edges:[]}));
  const [selected, setSelected] = useState("email");
  const [zoom, setZoom] = useState(1);
  const [simple,setSimple]=useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const componentDragRef = useRef<ComponentDrag | null>(null);
  const suppressComponentClick = useRef(false);
  const editorRef = useRef<HTMLElement | null>(null);
  const stageScrollRef = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [subscriptionGroups, setSubscriptionGroups] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [traceUser, setTraceUser] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [browserDraft, setBrowserDraft] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingKind,setPendingKind]=useState<CanvasNodeKind|null>(null);
  const [placement,setPlacement]=useState({x:650,y:725});
  const [componentsOpen, setComponentsOpen] = useState(true);
  const [entryOpen, setEntryOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [variantMenu, setVariantMenu] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [messageEditorId, setMessageEditorId] = useState<string | null>(null);
  const [stepEditorId,setStepEditorId]=useState<string|null>(null);
  const [stepMenuId,setStepMenuId]=useState<string|null>(null);
  const linkRouteIndex=useRef<number|undefined>(undefined);
  const [versionsOpen,setVersionsOpen]=useState(false),[versions,setVersions]=useState<Array<{id:string;savedAt:string}>>([]);
  const [loaded,setLoaded]=useState(false),[activeVariantId,setActiveVariantId]=useState<string|null>(null);
  const graph = history[cursor];
  const hasUnsavedChanges = fingerprint(graph) !== savedFingerprint(savedGraph);
  const variants=graph.variants??[],activeVariant=variants.find(variant=>variant.id===activeVariantId)??variants[0],entryOnce=wizard.entry.type==='scheduled'&&(wizard.entry.timing==='immediate'||wizard.entry.frequency==='Once');
  const router = useRouter();
  useEffect(()=>{if(loaded)onGraphChange?.(graph,hasUnsavedChanges);},[graph,hasUnsavedChanges,loaded,onGraphChange]);

  useEffect(() => {
    if (!hasUnsavedChanges&&!metadataDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    const unregister = registerUnsavedNavigation(action => { if (window.confirm("Discard unsaved Canvas changes?")) action(); });
    return () => { window.removeEventListener("beforeunload", warn); unregister(); };
  }, [hasUnsavedChanges,metadataDirty]);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);setError('');setBrowserDraft(false);setActiveVariantId(null);
    const local = browserCanvasMode ? getBrowserCanvas(canvasId,workspaceId) : null;
    if (local) {
      setBrowserDraft(true);
      const arranged = arrangeLegacyGraph(local.graph);
      setHistory([arranged]); setCursor(0); setSavedGraph(JSON.stringify(arranged)); setAdding(false);
      setSelected(local.graph.nodes[0]?.id ?? ""); setUpdatedAt(local.canvas.updatedAt);
      setLoaded(true);
      return () => controller.abort();
    }
    void fetch(`/api/canvases/${encodeURIComponent(canvasId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Canvas not found."); return response.json(); }).then(result => {
      if (controller.signal.aborted) return;
      if(!isCanvasGraph(result.graph))throw Error('The saved Canvas graph is invalid.');
      if (isCanvasGraph(result.graph)) {
        const arranged = arrangeLegacyGraph(result.graph);
        setHistory([arranged]); setCursor(0);
        setSavedGraph(JSON.stringify(arranged)); setAdding(false);
        setSelected(result.graph.nodes[0]?.id ?? "");
      }
      setUpdatedAt(result.updatedAt ?? null);
      setRuns(Array.isArray(result.runs) ? result.runs : []);
      setRunId(result.runs?.[0]?.id ?? null);
      setTraceUser(result.runs?.[0]?.traces?.[0]?.userId ?? null);
      setLoaded(true);
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load the saved Canvas draft."); });
    return () => controller.abort();
  }, [canvasId,workspaceId]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/subscription-groups?status=Active&workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal }).then(response => response.json()).then(result => setSubscriptionGroups(result.data ?? [])).catch(() => {});
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    if (!adding) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { setAdding(false);setPendingKind(null); setLinkFrom(null);linkRouteIndex.current=undefined; } };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [adding]);

  useEffect(() => {
    const stage = stageScrollRef.current;
    if (!stage) return;
    stage.scrollLeft = Math.max(0, (1500 * zoom - stage.clientWidth) / 2);
  }, [zoom, componentsOpen, inspectorOpen, expanded]);



  const refreshRuns = async () => {
    if (browserDraft) return;
    const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) return;
    const result = await response.json();
    setRuns(Array.isArray(result.runs) ? result.runs : []);
  };

  const commit = (next: CanvasGraph) => {if(fingerprint(next)===fingerprint(graph))return;setHistory(previous => [...previous.slice(0, cursor + 1), next]); setCursor(cursor + 1); setError(""); };
  const changeNode = (id: string, patch: Partial<CanvasNode>) => commit({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, ...patch } : node) });
  const changeConfig = (id: string, patch: NonNullable<CanvasNode["config"]>) => {
    const node = graph.nodes.find(item => item.id === id);
    if (node) changeNode(id, { config: { ...node.config, ...patch } });
  };
  const add = (kind: CanvasNodeKind, position?: { x: number; y: number }) => {
    const names: Record<CanvasNodeKind, string> = { entry: "Audience entry", delay: "Delay", message: "Message", branch: "Decision Split", update: "User Update", agent: "Agent Step", optimizer: "Content Optimizer", audience_paths: "Audience Paths", action_paths: "Action Paths", experiment_paths: "Experiment Paths", destination: "Send to Destination", context: "Context", feature_flag: "Feature Flag", audience_sync: "Audience Sync" };
    const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`;
    const previous = graph.nodes.find(node => node.id === linkFrom)??(activeVariant&&!variantRoot(graph,activeVariant.id)?graph.nodes.find(node=>node.kind==='entry'):undefined);
    const nextY = Math.max(725, ...canvasVariantView(graph,activeVariant?.id??null).nodes.filter(node => node.kind !== "entry").map(node => node.y + 170));
    const nextNode: CanvasNode = { id, label: names[kind], kind, x: position?.x ?? 650, y: position ? Math.max(position.y,725) : nextY, config:{...(kind==='message'?{channel:'',message:''}:canvasStepDefaults(kind)),...(activeVariant?{variantId:activeVariant.id}:{})} };
    const canConnect = previous && (previous.kind==='entry'&&activeVariant||graph.edges.filter(([from])=>from===previous.id).length<canvasMaxRoutes(previous));
    const next={...graph,nodes:[...graph.nodes,nextNode]};commit(previous&&(canConnect||linkRouteIndex.current!==undefined)?previous.kind==='entry'&&activeVariant?connectCanvasVariantRoot(next,activeVariant.id,id):connectCanvasRoute(next,previous.id,id,linkRouteIndex.current):next);linkRouteIndex.current=undefined;
    setSelected(id); setInspectorOpen(false); setPendingKind(null); setAdding(false); setLinkFrom(null);linkRouteIndex.current=undefined;
    requestAnimationFrame(() => { stageScrollRef.current?.scrollTo({ top: Math.max(0, nextNode.y * zoom - 240), behavior: "smooth" }); });
  };
  const componentPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = componentDragRef.current;
    componentDragRef.current = null;
    if (!current || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 12) return;
    suppressComponentClick.current = true;
    requestAnimationFrame(() => { suppressComponentClick.current = false; });
    const stage = stageScrollRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    add(current.kind, { x: Math.max(20, Math.round((event.clientX - bounds.left + stage.scrollLeft) / zoom - 100)), y: Math.max(725, Math.round((event.clientY - bounds.top + stage.scrollTop) / zoom - 50)) });
  };
  const copy = () => { const node = graph.nodes.find(item => item.id === selected); if (!node || node.kind === "entry") return; const id = `${node.kind}_${crypto.randomUUID().slice(0, 8)}`; commit({ ...graph, nodes: [...graph.nodes, { ...node, id, label: `${node.label} copy`, x: node.x + 40, y: node.y + 45, config: { ...structuredClone(node.config),...(activeVariant?{variantId:activeVariant.id}:{}), linkedCampaignId: undefined,branchTargets:undefined,...(canvasPaths(node).length?{paths:canvasPaths(node).map(path=>({...path,nextNodeId:undefined}))}:{}) } }] }); setSelected(id); };
  const swapBranchRoutes = (id: string) => { const positions = graph.edges.flatMap((edge, index) => edge[0] === id ? [index] : []); if (positions.length !== 2) return; const edges = [...graph.edges]; [edges[positions[0]], edges[positions[1]]] = [edges[positions[1]], edges[positions[0]]]; commit({ ...graph, edges }); };
  const remove = () => {const next=removeCanvasStep(graph,selected);commit({...next,nodes:next.nodes.map(node=>node.kind==='entry'&&Object.hasOwn(node.config??{},'variantTargets')?{...node,config:{...node.config,variantTargets:Object.fromEntries(Object.entries(record(node.config?.variantTargets)).filter(([,target])=>target!==selected))}}:node)});setSelected("");setLinkFrom(null);};
  const selectNode = (id: string) => {
    if(pendingKind)return;
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (linkFrom && linkFrom !== id) {
      const source=graph.nodes.find(node=>node.id===linkFrom);commit(source?.kind==='entry'&&activeVariant?connectCanvasVariantRoot(graph,activeVariant.id,id):connectCanvasRoute(graph,linkFrom,id,linkRouteIndex.current));linkRouteIndex.current=undefined;
      setLinkFrom(null);
    }
    setSelected(id);
    const node = graph.nodes.find(item => item.id === id);
    if (node?.kind === "message" && !node.config?.linkedCampaignId && true) { setMessageEditorId(id); setInspectorOpen(false); }
    else if(node?.kind!=='message'){setStepEditorId(id);setInspectorOpen(false);}
    else setInspectorOpen(true);
  };
  const pointerDown = (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const node = graph.nodes.find(item => item.id === id);
    if (!node) return;
    const next = { id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, moved: false };
    dragRef.current = next;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const dx = (event.clientX - current.startX) / zoom; const dy = (event.clientY - current.startY) / zoom;
    const next = { ...current, x: Math.max(20, graph.nodes.find(node => node.id === current.id)!.x + dx), y: Math.max(20, graph.nodes.find(node => node.id === current.id)!.y + dy), moved: current.moved || Math.abs(dx) + Math.abs(dy) > 4 };
    dragRef.current = next; setDrag(next);
  };
  const pointerUp = () => {
    const current = dragRef.current;
    dragRef.current = null; setDrag(null);
    if (!current?.moved) return;
    suppressClick.current = true;
    changeNode(current.id, { x: current.x, y: current.y });
  };

  const save = async (graphToSave: CanvasGraph = graph) => {
    if(!loaded){setError('Wait for the saved Canvas to load.');return false;}
    if(fingerprint(graphToSave)===savedFingerprint(savedGraph))return true;
    setWorking(true); setError("");
    try {
      const result=await persistCanvasGraph({canvasId,workspaceId,graph:graphToSave,savedGraph,updatedAt,browserDraft});
      if(!result.changed)return true;
      setUpdatedAt(result.updatedAt);setSavedGraph(JSON.stringify(graphToSave));if(result.updatedAt)onSaved?.(graphToSave,result.updatedAt);notify(browserDraft?'Canvas draft saved in this browser.':'Canvas draft saved.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas save failed."); return false; }
    finally { setWorking(false); }
  };
  if (saveRef) saveRef.current = () => save();
  const launch = async () => {
    if (browserDraft) { setError("Save this Canvas to a persistent workspace before launching."); return; }
    const issues = validateCanvasGraph(graph);
    if (issues.length) { setError(issues.join(" ")); return; }
    if (!await save()) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/launch?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Canvas run failed.");
      const run = result as CanvasRun;
      setRuns(previous => [run, ...previous].slice(0, 8)); setRunId(run.id); setTraceUser(run.traces[0]?.userId ?? null);
      await refreshRuns();
      notify(`Canvas activated: ${run.entered} users entered. Inspect execution history for message outcomes.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas run failed."); }
    finally { setWorking(false); }
  };

  const openFullEditor = async (node: CanvasNode) => {
    if (browserDraft) { setError("Linked campaign editing is unavailable for browser-only drafts."); return; }
    const campaignId = node.config?.linkedCampaignId ?? `cmp_canvas_${canvasId.replace(/[^a-z0-9]/gi, "").slice(-6)}_${node.id.replace(/[^a-z0-9]/gi, "").slice(-6)}`;
    if (!node.config?.linkedCampaignId) {
      const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: campaignId,
        name: `Canvas · ${node.label}`,
        channel: node.config?.channel === "push" ? "push" : node.config?.channel === "sms" ? "sms" : node.config?.channel === "iam" ? "iam" : node.config?.channel === "whatsapp" ? "whatsapp" : "email",
        status: "Draft", schedule: "One time", audience: "All Users", conversion: "Start Session",
        subject: node.config?.subject ?? node.label, body: node.config?.message ?? "", config: { ...node.config, workspaceId:new URLSearchParams(window.location.search).get("workspace")||new URLSearchParams(window.location.search).get("workspaceId")||"local" },
      }) });
      if (!response.ok) { setError("Could not create the linked campaign draft."); return; }
    }
    const nextGraph = { ...graph, nodes: graph.nodes.map(item => item.id === node.id ? { ...item, config: { ...item.config, linkedCampaignId: campaignId } } : item) };
    if (!await save(nextGraph)) return;
    if (!node.config?.linkedCampaignId) commit(nextGraph);
    const params=new URLSearchParams(window.location.search);params.set("step","compose");params.set("locale",locale);router.push(`/engagement/campaigns/${campaignId}?${params}`);
  };

  const advanceDemo = async () => {
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "advance" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to advance demo time.");
      await refreshRuns(); notify(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to advance demo time."); }
    finally { setWorking(false); }
  };

  const variantGraph=canvasVariantView(graph,activeVariant?.id??null);
  const visible: CanvasGraph = drag?.moved ? { ...variantGraph, nodes: variantGraph.nodes.map(node => node.id === drag.id ? { ...node, x: drag.x, y: drag.y } : node) } : variantGraph;
  const selectedNode = graph.nodes.find(node => node.id === selected);
  const messageEditorNode = graph.nodes.find(node => node.id === messageEditorId);
  const stepEditorNode=graph.nodes.find(node=>node.id===stepEditorId);
  useEffect(()=>{if(!versionsOpen||browserDraft)return;const controller=new AbortController();void fetch(`/api/canvases/${canvasId}/versions?workspaceId=${encodeURIComponent(new URLSearchParams(window.location.search).get('workspace')||new URLSearchParams(window.location.search).get('workspaceId')||'local')}`,{signal:controller.signal}).then(response=>response.ok?response.json():Promise.reject()).then(value=>setVersions(value.data??[])).catch(()=>{if(!controller.signal.aborted)setError('Could not load Canvas versions.');});return()=>controller.abort();},[versionsOpen,canvasId,browserDraft,updatedAt]);
  const restoreVersion=async(versionId:string)=>{if(hasUnsavedChanges&&!window.confirm('Discard unsaved changes and restore this version?'))return;setWorking(true);try{const response=await fetch(`/api/canvases/${canvasId}/versions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId,updatedAt,workspaceId})}),value=await response.json();if(!response.ok)throw new Error(value.error);setHistory([value.graph]);setCursor(0);setUpdatedAt(value.updatedAt);setSavedGraph(JSON.stringify(value.graph));onSaved?.(value.graph,value.updatedAt);setVersionsOpen(false);notify('Canvas version restored.');}catch(cause){setError(cause instanceof Error?cause.message:'Could not restore this version.');}finally{setWorking(false);}};
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("smsNode");
    if (id && graph.nodes.some(node => node.id === id && node.config?.channel === "sms")) setMessageEditorId(id);
  }, [canvasId, savedGraph]);
  const branchRoutes = selectedNode?.kind === "branch" ? graph.edges.filter(([from]) => from === selectedNode.id) : [];
  const run = runs.find(item => item.id === runId);
  const trace = run?.traces.find(item => item.userId === traceUser) ?? run?.traces[0];
  const stepNodes = visible.nodes.filter(node => node.kind !== "entry");
  const worldHeight = Math.max(1120, ...stepNodes.map(node => node.y + 260));
  const addVariant = () => {
    const entry=graph.nodes.find(node=>node.kind==='entry');if(!entry)return;
    const base=variants.length?variants:[{id:crypto.randomUUID(),name:'Variant 1',weight:100}],added={id:crypto.randomUUID(),name:`Variant ${base.length+1}`,weight:0},targets=Object.hasOwn(entry.config??{},'variantTargets')?record(entry.config?.variantTargets):Object.fromEntries(base.flatMap(variant=>{const root=variantRoot(graph,variant.id);return root?[[variant.id,root]]:[];}));
    const nodes=graph.nodes.map(node=>node.kind==='entry'?{...node,config:{...node.config,variantTargets:targets}}:!variants.length&&!node.config?.variantId?{...node,config:{...node.config,variantId:base[0].id}}:node);
    commit({...graph,nodes,variants:[...base,added]});setActiveVariantId(added.id);setSelected('');setInspectorOpen(false);setVariantMenu(added.id);
  };
  const changeVariant = (id: string, patch: Partial<(typeof variants)[number]>) => commit({ ...graph, variants: variants.map(variant => variant.id === id ? { ...variant, ...patch } : variant) });
  const removeVariant = (id: string) => {
    if (variants.length === 1) return;
    const remaining = variants.filter(variant => variant.id !== id),weight=remaining.reduce((sum,variant)=>sum+variant.weight,0),removed=new Set(graph.nodes.filter(node=>node.config?.variantId===id).map(node=>node.id));
    let next=graph;for(const nodeId of removed)next=removeCanvasStep(next,nodeId);
    const nodes=next.nodes.map(node=>node.kind==='entry'&&Object.hasOwn(node.config??{},'variantTargets')?{...node,config:{...node.config,variantTargets:Object.fromEntries(Object.entries(record(node.config?.variantTargets)).filter(([variantId,target])=>variantId!==id&&!removed.has(String(target))))}}:node);
    let assigned=0;const redistributed=remaining.map((variant,index)=>{const nextWeight=weight?(index===remaining.length-1?100-assigned:Math.round(variant.weight/weight*10000)/100):variant.weight;assigned+=nextWeight;return{...variant,weight:nextWeight};});
    commit({...next,nodes,variants:redistributed});setActiveVariantId(remaining[0]?.id??null);setSelected('');
    setVariantMenu(null);
  };
  const cleanUp = () => {
    const ordered = canvasVariantView(graph,activeVariant?.id??null).nodes.filter(node => node.kind !== "entry");
    commit({ ...graph, nodes: graph.nodes.map(node => !ordered.some(item=>item.id===node.id) ? node : { ...node, x: 650, y: 725 + ordered.findIndex(item=>item.id===node.id) * 170 }) });
    notify("Canvas steps arranged.");
  };
  const scheduleSummary = wizard.entry.type === "scheduled" ? wizard.entry.timing === "immediate" ? "As soon as Canvas is launched" : wizard.entry.frequency ? `${wizard.entry.frequency} · ${wizard.entry.startDate || "date not set"}` : "No schedule selected." : wizard.entry.type === "action" ? `${wizard.entry.triggers.length} action trigger${wizard.entry.triggers.length === 1 ? "" : "s"}` : "API-triggered entry";
  const audienceSummary = wizard.audience.segmentIds.length || wizard.audience.filters.length ? `${wizard.audience.segmentIds.length} segment${wizard.audience.segmentIds.length === 1 ? "" : "s"}, ${wizard.audience.filters.length} filter${wizard.audience.filters.length === 1 ? "" : "s"}` : "All eligible users";
  const exitSummary = wizard.audience.exceptions.length || wizard.audience.exitSegmentIds.length || wizard.audience.exitFilters.length ? `${wizard.audience.exceptions.length} exception${wizard.audience.exceptions.length === 1 ? "" : "s"}, ${wizard.audience.exitSegmentIds.length} segment${wizard.audience.exitSegmentIds.length === 1 ? "" : "s"}` : "No exit criteria selected.";
  const selectVariant=(id:string)=>{setActiveVariantId(id);setSelected('');setInspectorOpen(false);setAdding(false);setPendingKind(null);setLinkFrom(null);setVariantMenu(null);};
  const finishStep=(node:CanvasNode,label:string,config:NonNullable<CanvasNode['config']>)=>{const next=canvasEditedStep(node,label,config,workspaceId,entryOnce);if(next!==node)changeNode(node.id,next);};

  useEffect(()=>{const sync=()=>setExpanded(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
  const fullscreen=()=>{if(document.fullscreenElement){void document.exitFullscreen().catch(()=>setExpanded(false));setExpanded(false);}else if(editorRef.current?.requestFullscreen){void editorRef.current.requestFullscreen().then(()=>setExpanded(true)).catch(()=>setExpanded(value=>!value));}else setExpanded(value=>!value);};
  return <section data-details={detailsExpanded} data-simple={simple} ref={editorRef} className={`${styles.editor} ${embedded ? styles.embedded : ""} ${expanded ? styles.expanded : ""}`} aria-label="Canvas flow builder" aria-busy={!loaded||working}>
    <div className={styles.toolbar}>
      <div><strong>{embedded ? "Build Canvas" : canvasName}</strong><span>Drag, drop, and connect components to build your user journey.</span></div>
      <div className={styles.toolbarActions}>
        {!embedded && <button onClick={onBack}>All Canvases</button>}
        <button disabled={cursor === 0 || working} onClick={() => setCursor(cursor - 1)}>Undo</button>
        <button disabled={cursor === history.length - 1 || working} onClick={() => setCursor(cursor + 1)}>Redo</button>
        <button disabled={working||!loaded||!hasUnsavedChanges} onClick={() => void save()}>{working ? "Saving…" : "Save Draft"}</button>
        {!embedded && <button disabled={browserDraft || working} onClick={() => void launch()}>Launch Canvas</button>}
      </div>
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <div className={styles.surface}>
      {componentsOpen ? <aside className={styles.components} aria-label="Components">
        <div className={styles.componentsHead}><div><strong>Components</strong><p>Select components to build your user journey.</p></div><button aria-label="Collapse components" onClick={() => setComponentsOpen(false)}><ChevronLeft size={21}/></button></div>
        <div className={styles.componentScroll}>{componentGroups.map(group => <div className={styles.group} key={group.title}><h3>{group.title}</h3>{group.items.map(item => { const Icon = item.icon; return <button className={styles.component} key={item.kind} onPointerDown={event => { if (event.button !== 0) return; componentDragRef.current = { kind: item.kind, startX: event.clientX, startY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={componentPointerUp} onPointerCancel={() => { componentDragRef.current = null; }} disabled={!loaded||working} onClick={() => { if (suppressComponentClick.current) { suppressComponentClick.current = false; return; } setPendingKind(item.kind);setAdding(true); }}><span className={`${styles.componentIcon} ${styles[item.tone]}`}><Icon size={19}/></span><span>{item.label}</span></button>; })}</div>)}</div>
        <button className={styles.cleanUp} onClick={cleanUp}><WandSparkles size={21}/> Clean Up Canvas</button>
      </aside> : <button className={styles.openComponents} onClick={() => setComponentsOpen(true)}>Components <ChevronDown size={16}/></button>}
      <div className={styles.stage}>
        <button className={styles.versionTrigger} disabled={browserDraft} onClick={()=>setVersionsOpen(!versionsOpen)} aria-expanded={versionsOpen}>Version history</button>{versionsOpen&&<div className={styles.versionsPanel}><strong>Saved Canvas versions</strong>{versions.length?versions.map(version=><div key={version.id}><time>{new Date(version.savedAt).toLocaleString()}</time><button disabled={working} onClick={()=>void restoreVersion(version.id)}>Restore</button></div>):<p>No earlier graph versions.</p>}</div>}
        <div className={styles.stageTools}>{variants.length>0&&<label style={{fontSize:12,marginRight:12}}>Variant <select aria-label="Canvas variant" value={activeVariant?.id??''} disabled={working||Boolean(messageEditorId||stepEditorId)} onChange={event=>selectVariant(event.target.value)}>{variants.map(variant=><option key={variant.id} value={variant.id}>{variant.name} ({variant.weight}%)</option>)}</select></label>}<button onClick={embedded&&onToggleDetails?onToggleDetails:()=>setExpanded(value=>!value)}>{embedded?(detailsExpanded?"Collapse":"Expand"):expanded?"Collapse":"Expand"} <ChevronDown size={17}/></button></div>
        {!embedded&&<div className={styles.zoom}><button aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.6, Math.round((value - .1) * 10) / 10))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.5, Math.round((value + .1) * 10) / 10))}>+</button></div>}
        <div className={styles.stageScroll} ref={stageScrollRef}><div className={`${styles.world} ${pendingKind?styles.placing:''}`} style={{ height: worldHeight, transform: `scale(${zoom})`,pointerEvents:!loaded||working?'none':undefined }} onPointerMove={event=>{if(!pendingKind)return;const rect=event.currentTarget.getBoundingClientRect();setPlacement({x:Math.max(20,Math.round(((event.clientX-rect.left)/zoom-650)/240)*240+650),y:Math.max(725,Math.round(((event.clientY-rect.top)/zoom-725)/170)*170+725)});}} onClick={event=>{if(pendingKind&&event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();add(pendingKind,{x:Math.max(20,Math.round(((event.clientX-rect.left)/zoom-650)/240)*240+650),y:Math.max(725,Math.round(((event.clientY-rect.top)/zoom-725)/170)*170+725)});}}}>
          {pendingKind&&<div className={styles.placementPreview} style={{left:placement.x,top:placement.y}}>{componentByKind.get(pendingKind)?.label}</div>}
          <div className={`${styles.entryCard} ${entryOpen ? "" : styles.entryCollapsed}`}>
            <button className={styles.entryHeader} onClick={() => setEntryOpen(value => !value)}>Entry Rules {entryOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</button>
            {entryOpen && <div className={styles.entryBody}>
              <div className={styles.entryRule}><Clock3 size={22}/><div><strong>Schedule</strong><p>{scheduleSummary}</p></div></div>
              <div className={styles.entryRule}><Users size={22}/><div><strong>Audience</strong><p>{audienceSummary}</p></div></div>
              <div className={styles.entryRule}><X size={22}/><div><strong>Exit Criteria</strong><p>{exitSummary}</p></div></div>
              <div className={styles.entryRule}><Gauge size={22}/><div><strong>Controls</strong><p>{wizard.audience.reentryEnabled ? "Users can re-enter this Canvas." : "Users are not eligible to re-enter this Canvas."}</p></div></div>
            </div>}
          </div>
          <div className={styles.entryConnector} style={{ top: entryOpen ? 434 : 106 }}/>
          <button className={styles.addVariant} style={{ top: entryOpen ? 477 : 150 }} disabled={adding||working||!loaded} onClick={addVariant}><Plus size={22}/> Add Variant</button>
          <div className={styles.variantRail} style={{ top: entryOpen ? 574 : 246 }}>
            {!variants.length&&<div className={styles.variantWrap}><div className={styles.variant}><strong>Default path</strong></div></div>}{variants.map(variant => <div className={styles.variantWrap} key={variant.id}><div className={styles.variant}><span className={styles.variantWeight}>{variant.weight}%</span><button style={{border:0,background:'transparent',fontWeight:600,textDecoration:activeVariant?.id===variant.id?'underline':undefined}} aria-pressed={activeVariant?.id===variant.id} onClick={()=>selectVariant(variant.id)}>{variant.name}</button><button aria-label={`Settings for ${variant.name}`} onClick={() => setVariantMenu(current => current === variant.id ? null : variant.id)}><Settings2 size={21}/></button></div>
              {variantMenu === variant.id && <div className={styles.variantMenu}><label>Variant name<input value={variant.name} onChange={event => changeVariant(variant.id, { name: event.target.value })}/></label><label>Distribution %<input type="number" min="0" max="100" value={variant.weight} onChange={event => changeVariant(variant.id, { weight: Math.min(100, Math.max(0, Number(event.target.value))) })}/></label><label>Entry step<select aria-label={`Entry step for ${variant.name}`} value={variantRoot(graph,variant.id)??''} onChange={event=>{if(event.target.value)commit(connectCanvasVariantRoot(graph,variant.id,event.target.value));}}><option value="">Connect an entry step…</option>{graph.nodes.filter(node=>node.kind!=='entry'&&(!node.config?.variantId||node.config.variantId===variant.id)).map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label>{variant.weight>0&&!variantRoot(graph,variant.id)&&<p role="status">Connect an entry step before activating this variant.</p>}<button onClick={()=>{selectVariant(variant.id);setLinkFrom(graph.nodes.find(node=>node.kind==='entry')?.id??null);setAdding(true);}}>Add entry step</button><button disabled={variants.length === 1} onClick={() => removeVariant(variant.id)}>Delete variant</button></div>}
            </div>)}
          </div>
          {stepNodes.length === 0 && <button className={styles.firstAddStep} onClick={() => { setLinkFrom(graph.nodes.find(node => node.kind === "entry")?.id ?? null); setAdding(true); }}><Plus size={19}/> Add Step</button>}
          <svg className={styles.edges} width="1500" height={worldHeight} aria-hidden="true">{visible.edges.filter(([from])=>from===graph.nodes.find(node=>node.kind==='entry')?.id).map(([from,to])=>{const target=visible.nodes.find(node=>node.id===to);return target?<line key={`${from}-${to}`} x1="750" y1={entryOpen ? 625 : 297} x2={target.x+100} y2={target.y}/>:null;})}{visible.edges.filter(([from]) => from !== "entry").map(([from, to]) => { const start = visible.nodes.find(node => node.id === from); const end = visible.nodes.find(node => node.id === to); const index = start?.kind === "branch" ? visible.edges.filter(edge => edge[0] === from).findIndex(edge => edge[1] === to) : -1; return start && end ? <g key={`${from}-${to}`}><line x1={start.x + 100} y1={start.y + (simple?62:100)} x2={end.x + 100} y2={end.y}/>{index >= 0 && <text x={(start.x + end.x) / 2 + 100} y={(start.y + end.y + 100) / 2 - 8}>{index === 0 ? "Yes" : "No"}</text>}</g> : null; })}</svg>
          {stepNodes.map(node => { const component = componentByKind.get(node.kind); const Icon = component?.icon ?? Mail; const outgoing = graph.edges.filter(([from]) => from === node.id).length; return <div className={styles.nodeWrap} style={{ left: node.x, top: node.y }} key={node.id}><button className={`${styles.flowNode} ${selected === node.id && inspectorOpen ? styles.nodeSelected : ""} ${linkFrom === node.id ? styles.nodeLinkSource : ""}`} onPointerDown={event => pointerDown(node.id, event)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => selectNode(node.id)}><span className={`${styles.nodeIcon} ${styles[component?.tone ?? "green"]}`}><Icon size={20}/></span><span><small>{component?.label ?? node.kind}</small><strong>{node.label}</strong>{canvasStepSummary(node)&&<em className={styles.stepSummary}>{canvasStepSummary(node)}</em>}</span><Settings2 size={17}/></button><button className={styles.nodeSettings} aria-label={`Step actions for ${node.label}`} onClick={()=>{setSelected(node.id);setStepMenuId(stepMenuId===node.id?null:node.id);}}><Settings2 size={17}/></button>{stepMenuId===node.id&&<div className={styles.stepMenu}><button onClick={()=>{setStepMenuId(null);selectNode(node.id);}}>Edit</button><button onClick={()=>{copy();setStepMenuId(null);}}>Copy step</button><button onClick={()=>{remove();setStepMenuId(null);}}>Delete step</button></div>}{canvasMaxRoutes(node)>1&&<div className={styles.pathPorts}>{(node.kind==='branch'?[{id:'yes',name:'Yes'},{id:'no',name:'No'}]:canvasPaths(node)).map((path,index)=><button key={path.id} aria-label={`Connect ${path.name} from ${node.label}`} onClick={()=>{setLinkFrom(node.id);linkRouteIndex.current=index;setAdding(true);setInspectorOpen(false);}}>{path.name}<Plus size={13}/></button>)}</div>}{outgoing < canvasMaxRoutes(node) && canvasMaxRoutes(node)===1 && <button className={styles.nodeAddStep} aria-label={`Add step after ${node.label}`} onClick={() => { setSelected(node.id); setLinkFrom(node.id); setAdding(true); setInspectorOpen(false); }}><Plus size={17}/></button>}</div>; })}
        </div></div>
        {linkFrom && <div className={styles.connectHint}>Select a destination step or choose a component to add.</div>}
      </div>
      {inspectorOpen && selectedNode && selectedNode.kind !== "entry" && <aside className={styles.inspector} aria-label="Step inspector">
        <div className={styles.inspectorHead}><strong>{componentByKind.get(selectedNode.kind)?.label ?? selectedNode.kind}</strong><button aria-label="Close step inspector" onClick={() => setInspectorOpen(false)}><X size={18}/></button></div>
        <div className={styles.inspectorBody}>
          <label>Step name<input value={selectedNode.label} onChange={event => changeNode(selected, { label: event.target.value })}/></label>
          {selectedNode.kind === "delay" && <label>Delay (hours)<input type="number" min="1" value={selectedNode.config?.durationHours ?? 24} onChange={event => changeConfig(selected, { durationHours: Number(event.target.value) })}/></label>}
          {selectedNode.kind === "message" && <><label>Channel<select disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={selectedNode.config?.channel ?? "email"} onChange={event => { changeConfig(selected, { channel: event.target.value, subscriptionGroupId: undefined }); if (["sms", "whatsapp"].includes(event.target.value)) { setMessageEditorId(selected); setInspectorOpen(false); } }}><option value="email">Email</option><option value="push">Push notification</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="iam">In-app message</option></select></label>{["email", "sms", "whatsapp"].includes(selectedNode.config?.channel ?? "email") && <label>Subscription group<select disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={String(selectedNode.config?.subscriptionGroupId ?? "")} onChange={event => changeConfig(selected, { subscriptionGroupId: event.target.value || undefined })}><option value="">{selectedNode.config?.channel === "sms" ? "Select a group" : "No group filter"}</option>{subscriptionGroups.filter(group => group.channel === (selectedNode.config?.channel === "sms" ? "SMS" : selectedNode.config?.channel === "whatsapp" ? "WhatsApp" : "Email")).map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>}<label>Subject<input disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={selectedNode.config?.subject ?? ""} onChange={event => changeConfig(selected, { subject: event.target.value })}/></label><label>Message<textarea disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={selectedNode.config?.message ?? ""} onChange={event => changeConfig(selected, { message: event.target.value })}/></label>{["sms", "whatsapp"].includes(selectedNode.config?.channel ?? "") && !selectedNode.config?.linkedCampaignId && <button onClick={() => { setMessageEditorId(selected); setInspectorOpen(false); }}>Edit {selectedNode.config?.channel === "whatsapp" ? "WhatsApp" : "SMS"} message</button>}<button onClick={() => void openFullEditor(selectedNode)}><ExternalLink size={15}/> Open in full editor</button>{selectedNode.config?.linkedCampaignId && <button onClick={() => changeConfig(selected, { linkedCampaignId: undefined })}>Unlink campaign</button>}</>}
          {selectedNode.kind === "branch" && <><label>Attribute<select value={selectedNode.config?.attribute ?? "country"} onChange={event => changeConfig(selected, { attribute: event.target.value })}><option value="country">Country</option><option value="lifecycle">Lifecycle</option><option value="subscribed">Subscribed</option></select></label><label>Equals<input value={selectedNode.config?.value ?? ""} onChange={event => changeConfig(selected, { value: event.target.value })}/></label><small>Yes → {graph.nodes.find(node => node.id === branchRoutes[0]?.[1])?.label ?? "Connect a step"}</small><small>No → {graph.nodes.find(node => node.id === branchRoutes[1]?.[1])?.label ?? "Connect a step"}</small><button disabled={branchRoutes.length !== 2} onClick={() => swapBranchRoutes(selectedNode.id)}>Swap Yes / No routes</button></>}
          {selectedNode.kind === "update" && <><label>Attribute<input value={selectedNode.config?.attribute ?? ""} onChange={event => changeConfig(selected, { attribute: event.target.value })}/></label><label>New value<input value={selectedNode.config?.value ?? ""} onChange={event => changeConfig(selected, { value: event.target.value })}/></label></>}
          {!["message", "delay", "branch", "update"].includes(selectedNode.kind) && <><p>Configure this step before activation. Execution uses the workspace services required by this component.</p><label>Notes<textarea value={String(selectedNode.config?.notes ?? "")} onChange={event => changeConfig(selected, { notes: event.target.value })}/></label></>}
          <div className={styles.inspectorActions}><button onClick={() => { setLinkFrom(selected); setAdding(true); setInspectorOpen(false); }}>Connect from this step</button><button onClick={copy}>Copy step</button><button className={styles.danger} onClick={() => { remove(); setInspectorOpen(false); }}>Delete step</button></div>
          <div className={styles.execution}><strong>Execution</strong><button disabled={browserDraft} onClick={() => void refreshRuns()}>Refresh execution</button>{runs.length ? <><label>Run<select value={run?.id ?? ""} onChange={event => { const next = runs.find(item => item.id === event.target.value); setRunId(next?.id ?? null); setTraceUser(next?.traces[0]?.userId ?? null); }}>{runs.map(item => <option key={item.id} value={item.id}>{formatDate(locale, item.createdAt, { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><small>{formatNumber(locale, run?.entered ?? 0)} entered · {formatNumber(locale, run?.completed ?? 0)} completed · {formatNumber(locale, run?.messages ?? 0)} messages</small>{run?.nextDueAt && <button disabled={working} onClick={() => void advanceDemo()}>Advance demo by one day</button>}{trace?.steps.map((step, index) => <small key={`${step.nodeId}-${index}`}>✓ {step.label}</small>)}</> : <small>{browserDraft ? "Browser-only drafts have no execution history." : "Launch to inspect execution history."}</small>}</div>
        </div>
      </aside>}
    </div>
    {stepEditorNode?.kind==='optimizer'?<CanvasChannelEditor key={stepEditorNode.id} node={stepEditorNode} canvasId={canvasId} locale={locale} workspaceId={workspaceId} quietEnabled={wizard.send.quietEnabled} connected={graph.edges.some(([,to])=>to===stepEditorNode.id)} onDone={(config,label)=>{finishStep(stepEditorNode,label,config);setStepEditorId(null);}} onChannel={()=>{}}/>:stepEditorNode&&<CanvasStepEditor key={stepEditorNode.id} node={stepEditorNode} graph={graph} workspaceId={workspaceId} canvasId={canvasId} entryOnce={entryOnce} conversionEvents={wizard.conversionEvents} connected={graph.edges.some(([,to])=>to===stepEditorNode.id)} onDone={(label,config)=>{finishStep(stepEditorNode,label,config);setStepEditorId(null);}}/>}
    {messageEditorNode?.config?.channel&&!['sms','whatsapp'].includes(messageEditorNode.config.channel)?<CanvasChannelEditor key={messageEditorNode.id+messageEditorNode.config.channel} node={messageEditorNode} canvasId={canvasId} locale={locale} workspaceId={workspaceId} quietEnabled={wizard.send.quietEnabled} connected={graph.edges.some(([,to])=>to===messageEditorNode.id)} onDone={(config,label)=>{finishStep(messageEditorNode,label,config);setMessageEditorId(null);}} onChannel={(channel,config)=>changeConfig(messageEditorNode.id,{...config,channel,subscriptionGroupId:undefined})}/> : messageEditorNode?.config?.channel === "whatsapp" ? <CanvasWhatsAppEditor key={messageEditorNode.id} node={messageEditorNode} canvasId={canvasId} workspaceId={workspaceId} quietEnabled={wizard.send.quietEnabled} testAvailable={!browserDraft} onOtherChannel={(channel, config) => { changeConfig(messageEditorNode.id, { ...config, channel, subscriptionGroupId: undefined }); }} connected={graph.edges.some(([, to]) => to === messageEditorNode.id)} onDone={config => { changeConfig(messageEditorNode.id, config); setMessageEditorId(null); }}/> : messageEditorNode && <CanvasSmsEditor key={messageEditorNode.id} node={messageEditorNode} canvasId={canvasId} workspaceId={workspaceId} quietEnabled={wizard.send.quietEnabled} groups={subscriptionGroups} testAvailable={!browserDraft} connected={graph.edges.some(([, to]) => to === messageEditorNode.id)} onDone={config => { changeConfig(messageEditorNode.id, config); setMessageEditorId(null); }} onOtherChannel={(channel,config) => { changeConfig(messageEditorNode.id, { ...config,channel, subscriptionGroupId: undefined }); setInspectorOpen(false); }}/> }
    {embedded&&!adding&&<CanvasBuildToolbar graph={graph} wizard={wizard} workspaceId={workspaceId} canvasId={browserDraft?undefined:canvasId} dirty={hasUnsavedChanges||metadataDirty} onBeforeTest={onBeforeTest??(()=>save())} busy={!loaded||working||parentSaving} zoom={zoom} onZoom={setZoom} simple={simple} onSimple={setSimple} fullscreen={expanded} onFullscreen={fullscreen} onSave={onSave??(()=>void save())} onContinue={onContinue??(()=>{})} changeBrief={changeBrief??(()=>{})}/>}
    {adding && <div className={styles.addBar}><button onClick={() => { setAdding(false);setPendingKind(null); setLinkFrom(null);linkRouteIndex.current=undefined; }}>Cancel Add Step</button><span>or Press <kbd>Esc</kbd></span></div>}
  </section>;
}
