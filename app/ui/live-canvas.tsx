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

function arrangeLegacyGraph(graph: CanvasGraph): CanvasGraph {
  const steps = graph.nodes.filter(node => node.kind !== "entry");
  if (!steps.length || !steps.every(node => node.y < 600)) return graph;
  return { ...graph, nodes: graph.nodes.map(node => node.kind === "entry" ? node : { ...node, x: 610, y: 725 + steps.indexOf(node) * 170 }) };
}

export default function LiveCanvas({ canvasId, canvasName, onBack, locale: localeValue = "en", notify, embedded = false, wizard = defaultCanvasWizard, saveRef, onSaved }: { canvasId: string; canvasName: string; onBack: () => void; locale?: Locale; notify: (message: string) => void; embedded?: boolean; wizard?: CanvasWizardConfig; saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null>; onSaved?: (graph: CanvasGraph, updatedAt: string) => void }) {
  const locale = normalizeLocale(localeValue);
  const [history, setHistory] = useState<CanvasGraph[]>([initialCanvasGraph]);
  const [cursor, setCursor] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [savedGraph, setSavedGraph] = useState(() => JSON.stringify(initialCanvasGraph));
  const [selected, setSelected] = useState("email");
  const [zoom, setZoom] = useState(1);
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
  const [componentsOpen, setComponentsOpen] = useState(true);
  const [entryOpen, setEntryOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [variantMenu, setVariantMenu] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [messageEditorId, setMessageEditorId] = useState<string | null>(null);
  const graph = history[cursor];
  const hasUnsavedChanges = JSON.stringify(graph) !== savedGraph;
  const router = useRouter();

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    const unregister = registerUnsavedNavigation(action => { if (window.confirm("Discard unsaved Canvas changes?")) action(); });
    return () => { window.removeEventListener("beforeunload", warn); unregister(); };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const controller = new AbortController();
    const local = browserCanvasMode ? getBrowserCanvas(canvasId) : null;
    if (local) {
      setBrowserDraft(true);
      const arranged = arrangeLegacyGraph(local.graph);
      setHistory([arranged]); setCursor(0); setSavedGraph(JSON.stringify(arranged)); setAdding(arranged.nodes.length === 1);
      setSelected(local.graph.nodes[0]?.id ?? ""); setUpdatedAt(local.canvas.updatedAt);
      return () => controller.abort();
    }
    void fetch(`/api/canvases/${encodeURIComponent(canvasId)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Canvas not found."); return response.json(); }).then(result => {
      if (controller.signal.aborted) return;
      if (isCanvasGraph(result.graph)) {
        const arranged = arrangeLegacyGraph(result.graph);
        setHistory([arranged]); setCursor(0);
        setSavedGraph(JSON.stringify(arranged)); setAdding(arranged.nodes.length === 1);
        setSelected(result.graph.nodes[0]?.id ?? "");
      }
      setUpdatedAt(result.updatedAt ?? null);
      setRuns(Array.isArray(result.runs) ? result.runs : []);
      setRunId(result.runs?.[0]?.id ?? null);
      setTraceUser(result.runs?.[0]?.traces?.[0]?.userId ?? null);
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load the saved Canvas draft."); });
    return () => controller.abort();
  }, [canvasId]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/subscription-groups?status=Active", { signal: controller.signal }).then(response => response.json()).then(result => setSubscriptionGroups(result.data ?? [])).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!adding) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { setAdding(false); setLinkFrom(null); } };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [adding]);

  useEffect(() => {
    const stage = stageScrollRef.current;
    if (!stage) return;
    stage.scrollLeft = Math.max(0, (1500 * zoom - stage.clientWidth) / 2);
  }, [zoom, componentsOpen, inspectorOpen, expanded]);

  useEffect(() => {
    if (!embedded) return;
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start" }));
  }, [embedded]);

  const refreshRuns = async () => {
    if (browserDraft) return;
    const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}`);
    if (!response.ok) return;
    const result = await response.json();
    setRuns(Array.isArray(result.runs) ? result.runs : []);
  };

  const commit = (next: CanvasGraph) => { setHistory(previous => [...previous.slice(0, cursor + 1), next]); setCursor(cursor + 1); setError(""); };
  const changeNode = (id: string, patch: Partial<CanvasNode>) => commit({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, ...patch } : node) });
  const changeConfig = (id: string, patch: NonNullable<CanvasNode["config"]>) => {
    const node = graph.nodes.find(item => item.id === id);
    if (node) changeNode(id, { config: { ...node.config, ...patch } });
  };
  const add = (kind: CanvasNodeKind, position?: { x: number; y: number }) => {
    const names: Record<CanvasNodeKind, string> = { entry: "Audience entry", delay: "Delay", message: "Message", branch: "Decision Split", update: "User Update", agent: "Agent Step", optimizer: "Content Optimizer", audience_paths: "Audience Paths", action_paths: "Action Paths", experiment_paths: "Experiment Paths", destination: "Send to Destination", context: "Context", feature_flag: "Feature Flag", audience_sync: "Audience Sync" };
    const configs: Partial<Record<CanvasNodeKind, CanvasNode["config"]>> = { delay: { durationHours: 24 }, message: { channel: "", message: "" }, branch: { attribute: "country", value: "" }, update: { attribute: "plan", value: "" } };
    const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`;
    const previous = graph.nodes.find(node => node.id === linkFrom) ?? graph.nodes.at(-1);
    const nextY = Math.max(725, ...graph.nodes.filter(node => node.kind !== "entry").map(node => node.y + 170));
    const nextNode: CanvasNode = { id, label: names[kind], kind, x: position?.x ?? 610, y: position ? Math.max(position.y, nextY) : nextY, config: configs[kind] };
    const canConnect = previous && !graph.edges.some(([from]) => from === previous.id) || previous?.kind === "branch" && graph.edges.filter(([from]) => from === previous.id).length < 2;
    commit({ ...graph, nodes: [...graph.nodes, nextNode], edges: canConnect && previous ? [...graph.edges, [previous.id, id]] : graph.edges });
    setSelected(id); setInspectorOpen(kind !== "message"); if (kind === "message") setMessageEditorId(id); setAdding(false); setLinkFrom(null);
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
    add(current.kind, { x: Math.max(20, Math.round((event.clientX - bounds.left + stage.scrollLeft) / zoom - 140)), y: Math.max(725, Math.round((event.clientY - bounds.top + stage.scrollTop) / zoom - 50)) });
  };
  const copy = () => { const node = graph.nodes.find(item => item.id === selected); if (!node || node.kind === "entry") return; const id = `${node.kind}_${crypto.randomUUID().slice(0, 8)}`; commit({ ...graph, nodes: [...graph.nodes, { ...node, id, label: `${node.label} copy`, x: node.x + 40, y: node.y + 45, config: { ...node.config, linkedCampaignId: undefined } }] }); setSelected(id); };
  const swapBranchRoutes = (id: string) => { const positions = graph.edges.flatMap((edge, index) => edge[0] === id ? [index] : []); if (positions.length !== 2) return; const edges = [...graph.edges]; [edges[positions[0]], edges[positions[1]]] = [edges[positions[1]], edges[positions[0]]]; commit({ ...graph, edges }); };
  const remove = () => { commit({ nodes: graph.nodes.filter(node => node.id !== selected), edges: graph.edges.filter(edge => !edge.includes(selected)) }); setSelected(""); setLinkFrom(null); };
  const selectNode = (id: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (linkFrom && linkFrom !== id) {
      if (!graph.edges.some(([from, to]) => from === linkFrom && to === id)) commit({ ...graph, edges: [...graph.edges, [linkFrom, id]] });
      setLinkFrom(null);
    }
    setSelected(id);
    const node = graph.nodes.find(item => item.id === id);
    if (node?.kind === "message" && !node.config?.linkedCampaignId && (!node.config?.channel || ["sms", "whatsapp"].includes(node.config.channel))) { setMessageEditorId(id); setInspectorOpen(false); }
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
    setWorking(true); setError("");
    try {
      if (browserDraft) {
        const timestamp = saveBrowserGraph(canvasId, graphToSave);
        setUpdatedAt(timestamp); setSavedGraph(JSON.stringify(graphToSave)); onSaved?.(graphToSave, timestamp); notify("Canvas draft saved in this browser.");
        return true;
      }
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/graph`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graph: graphToSave, updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Canvas save failed.");
      setUpdatedAt(result.updatedAt); setSavedGraph(JSON.stringify(graphToSave)); onSaved?.(graphToSave, result.updatedAt); notify("Canvas draft saved to local SQLite.");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas save failed."); return false; }
    finally { setWorking(false); }
  };
  if (saveRef) saveRef.current = () => save();
  const launch = async () => {
    if (browserDraft) { setError("Browser-only drafts cannot launch a simulation."); return; }
    const issues = validateCanvasGraph(graph);
    if (issues.length) { setError(issues.join(" ")); return; }
    if (!await save()) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/launch`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Canvas run failed.");
      const run = result as CanvasRun;
      setRuns(previous => [run, ...previous].slice(0, 8)); setRunId(run.id); setTraceUser(run.traces[0]?.userId ?? null);
      await refreshRuns();
      notify(`Canvas run recorded: ${run.entered} users entered, ${run.messages} messages simulated.`);
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
        subject: node.config?.subject ?? node.label, body: node.config?.message ?? "", config: { ...node.config },
      }) });
      if (!response.ok) { setError("Could not create the linked campaign draft."); return; }
    }
    const nextGraph = { ...graph, nodes: graph.nodes.map(item => item.id === node.id ? { ...item, config: { ...item.config, linkedCampaignId: campaignId } } : item) };
    if (!await save(nextGraph)) return;
    if (!node.config?.linkedCampaignId) commit(nextGraph);
    router.push(`/engagement/campaigns/${campaignId}?step=compose&locale=${locale}`);
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

  const visible: CanvasGraph = drag?.moved ? { ...graph, nodes: graph.nodes.map(node => node.id === drag.id ? { ...node, x: drag.x, y: drag.y } : node) } : graph;
  const selectedNode = graph.nodes.find(node => node.id === selected);
  const messageEditorNode = graph.nodes.find(node => node.id === messageEditorId);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("smsNode");
    if (id && graph.nodes.some(node => node.id === id && node.config?.channel === "sms")) setMessageEditorId(id);
  }, [canvasId, savedGraph]);
  const branchRoutes = selectedNode?.kind === "branch" ? graph.edges.filter(([from]) => from === selectedNode.id) : [];
  const run = runs.find(item => item.id === runId);
  const trace = run?.traces.find(item => item.userId === traceUser) ?? run?.traces[0];
  const variants = graph.variants?.length ? graph.variants : [{ id: "variant_1", name: "Variant 1", weight: 100 }];
  const stepNodes = visible.nodes.filter(node => node.kind !== "entry");
  const worldHeight = Math.max(1120, ...stepNodes.map(node => node.y + 260));
  const addVariant = () => {
    const next = [...variants, { id: crypto.randomUUID(), name: `Variant ${variants.length + 1}`, weight: 0 }];
    const share = Math.floor(100 / next.length);
    commit({ ...graph, variants: next.map((variant, index) => ({ ...variant, weight: share + (index === 0 ? 100 - share * next.length : 0) })) });
  };
  const changeVariant = (id: string, patch: Partial<(typeof variants)[number]>) => commit({ ...graph, variants: variants.map(variant => variant.id === id ? { ...variant, ...patch } : variant) });
  const removeVariant = (id: string) => {
    if (variants.length === 1) return;
    const remaining = variants.filter(variant => variant.id !== id);
    const share = Math.floor(100 / remaining.length);
    commit({ ...graph, variants: remaining.map((variant, index) => ({ ...variant, weight: share + (index === 0 ? 100 - share * remaining.length : 0) })) });
    setVariantMenu(null);
  };
  const cleanUp = () => {
    const ordered = graph.nodes.filter(node => node.kind !== "entry");
    commit({ ...graph, nodes: graph.nodes.map(node => node.kind === "entry" ? node : { ...node, x: 610, y: 725 + ordered.indexOf(node) * 170 }) });
    notify("Canvas steps arranged.");
  };
  const scheduleSummary = wizard.entry.type === "scheduled" ? wizard.entry.timing === "immediate" ? "As soon as Canvas is launched" : wizard.entry.frequency ? `${wizard.entry.frequency} · ${wizard.entry.startDate || "date not set"}` : "No schedule selected." : wizard.entry.type === "action" ? `${wizard.entry.triggers.length} action trigger${wizard.entry.triggers.length === 1 ? "" : "s"}` : "API-triggered entry";
  const audienceSummary = wizard.audience.segmentIds.length || wizard.audience.filters.length ? `${wizard.audience.segmentIds.length} segment${wizard.audience.segmentIds.length === 1 ? "" : "s"}, ${wizard.audience.filters.length} filter${wizard.audience.filters.length === 1 ? "" : "s"}` : "All eligible users";
  const exitSummary = wizard.audience.exceptions.length || wizard.audience.exitSegmentIds.length || wizard.audience.exitFilters.length ? `${wizard.audience.exceptions.length} exception${wizard.audience.exceptions.length === 1 ? "" : "s"}, ${wizard.audience.exitSegmentIds.length} segment${wizard.audience.exitSegmentIds.length === 1 ? "" : "s"}` : "No exit criteria selected.";

  return <section ref={editorRef} className={`${styles.editor} ${embedded ? styles.embedded : ""} ${expanded ? styles.expanded : ""}`} aria-label="Canvas flow builder">
    <div className={styles.toolbar}>
      <div><strong>{embedded ? "Build Canvas" : canvasName}</strong><span>Drag, drop, and connect components to build your user journey.</span></div>
      <div className={styles.toolbarActions}>
        {!embedded && <button onClick={onBack}>All Canvases</button>}
        <button disabled={cursor === 0 || working} onClick={() => setCursor(cursor - 1)}>Undo</button>
        <button disabled={cursor === history.length - 1 || working} onClick={() => setCursor(cursor + 1)}>Redo</button>
        <button disabled={working} onClick={() => void save()}>{working ? "Saving…" : "Save Draft"}</button>
        {!embedded && <button disabled={browserDraft || working} onClick={() => void launch()}>Launch Canvas</button>}
      </div>
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <div className={styles.surface}>
      {componentsOpen ? <aside className={styles.components} aria-label="Components">
        <div className={styles.componentsHead}><div><strong>Components</strong><p>Select components to build your user journey.</p></div><button aria-label="Collapse components" onClick={() => setComponentsOpen(false)}><ChevronLeft size={21}/></button></div>
        <div className={styles.componentScroll}>{componentGroups.map(group => <div className={styles.group} key={group.title}><h3>{group.title}</h3>{group.items.map(item => { const Icon = item.icon; return <button className={styles.component} key={item.kind} onPointerDown={event => { if (event.button !== 0) return; componentDragRef.current = { kind: item.kind, startX: event.clientX, startY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={componentPointerUp} onPointerCancel={() => { componentDragRef.current = null; }} onClick={() => { if (suppressComponentClick.current) { suppressComponentClick.current = false; return; } add(item.kind); }}><span className={`${styles.componentIcon} ${styles[item.tone]}`}><Icon size={19}/></span><span>{item.label}</span></button>; })}</div>)}</div>
        <button className={styles.cleanUp} onClick={cleanUp}><WandSparkles size={21}/> Clean Up Canvas</button>
      </aside> : <button className={styles.openComponents} onClick={() => setComponentsOpen(true)}>Components <ChevronDown size={16}/></button>}
      <div className={styles.stage}>
        <div className={styles.stageTools}><button onClick={() => setExpanded(value => !value)}>{expanded ? "Collapse" : "Expand"} <ChevronDown size={17}/></button></div>
        <div className={styles.zoom}><button aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.6, Math.round((value - .1) * 10) / 10))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.5, Math.round((value + .1) * 10) / 10))}>+</button></div>
        <div className={styles.stageScroll} ref={stageScrollRef}><div className={styles.world} style={{ height: worldHeight, transform: `scale(${zoom})` }}>
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
          <button className={styles.addVariant} style={{ top: entryOpen ? 477 : 150 }} disabled={adding} onClick={addVariant}><Plus size={22}/> Add Variant</button>
          <div className={styles.variantRail} style={{ top: entryOpen ? 574 : 246 }}>
            {variants.map(variant => <div className={styles.variantWrap} key={variant.id}><div className={styles.variant}><span className={styles.variantWeight}>{variant.weight}%</span><strong>{variant.name}</strong><button aria-label={`Settings for ${variant.name}`} onClick={() => setVariantMenu(current => current === variant.id ? null : variant.id)}><Settings2 size={21}/></button></div>
              {variantMenu === variant.id && <div className={styles.variantMenu}><label>Variant name<input value={variant.name} onChange={event => changeVariant(variant.id, { name: event.target.value })}/></label><label>Distribution %<input type="number" min="0" max="100" value={variant.weight} onChange={event => changeVariant(variant.id, { weight: Math.min(100, Math.max(0, Number(event.target.value))) })}/></label><button disabled={variants.length === 1} onClick={() => removeVariant(variant.id)}>Delete variant</button></div>}
            </div>)}
          </div>
          {stepNodes.length === 0 && <button className={styles.firstAddStep} onClick={() => { setLinkFrom(graph.nodes.find(node => node.kind === "entry")?.id ?? null); setAdding(true); }}><Plus size={19}/> Add Step</button>}
          <svg className={styles.edges} width="1500" height={worldHeight} aria-hidden="true"><line x1="750" y1={entryOpen ? 625 : 297} x2="750" y2={stepNodes[0]?.y ?? 700}/>{visible.edges.filter(([from]) => from !== "entry").map(([from, to]) => { const start = visible.nodes.find(node => node.id === from); const end = visible.nodes.find(node => node.id === to); const index = start?.kind === "branch" ? visible.edges.filter(edge => edge[0] === from).findIndex(edge => edge[1] === to) : -1; return start && end ? <g key={`${from}-${to}`}><line x1={start.x + 140} y1={start.y + 100} x2={end.x + 140} y2={end.y}/>{index >= 0 && <text x={(start.x + end.x) / 2 + 140} y={(start.y + end.y + 100) / 2 - 8}>{index === 0 ? "Yes" : "No"}</text>}</g> : null; })}</svg>
          {stepNodes.map(node => { const component = componentByKind.get(node.kind); const Icon = component?.icon ?? Mail; const outgoing = graph.edges.filter(([from]) => from === node.id).length; return <div className={styles.nodeWrap} style={{ left: node.x, top: node.y }} key={node.id}><button className={`${styles.flowNode} ${selected === node.id && inspectorOpen ? styles.nodeSelected : ""} ${linkFrom === node.id ? styles.nodeLinkSource : ""}`} onPointerDown={event => pointerDown(node.id, event)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => selectNode(node.id)}><span className={`${styles.nodeIcon} ${styles[component?.tone ?? "green"]}`}><Icon size={20}/></span><span><small>{component?.label ?? node.kind}</small><strong>{node.label}</strong></span><Settings2 size={17}/></button><button className={styles.nodeSettings} aria-label={`Step actions for ${node.label}`} onClick={() => { setSelected(node.id); setInspectorOpen(true); setMessageEditorId(null); }}><Settings2 size={17}/></button>{outgoing < (node.kind === "branch" ? 2 : 1) && <button className={styles.nodeAddStep} aria-label={`Add step after ${node.label}`} onClick={() => { setSelected(node.id); setLinkFrom(node.id); setAdding(true); setInspectorOpen(false); }}><Plus size={17}/></button>}</div>; })}
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
          {!["message", "delay", "branch", "update"].includes(selectedNode.kind) && <><p>This component can be configured as a draft. Local simulation is not available for this component.</p><label>Notes<textarea value={String(selectedNode.config?.notes ?? "")} onChange={event => changeConfig(selected, { notes: event.target.value })}/></label></>}
          <div className={styles.inspectorActions}><button onClick={() => { setLinkFrom(selected); setAdding(true); setInspectorOpen(false); }}>Connect from this step</button><button onClick={copy}>Copy step</button><button className={styles.danger} onClick={() => { remove(); setInspectorOpen(false); }}>Delete step</button></div>
          <div className={styles.execution}><strong>Execution</strong><button disabled={browserDraft} onClick={() => void refreshRuns()}>Refresh execution</button>{runs.length ? <><label>Run<select value={run?.id ?? ""} onChange={event => { const next = runs.find(item => item.id === event.target.value); setRunId(next?.id ?? null); setTraceUser(next?.traces[0]?.userId ?? null); }}>{runs.map(item => <option key={item.id} value={item.id}>{formatDate(locale, item.createdAt, { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><small>{formatNumber(locale, run?.entered ?? 0)} entered · {formatNumber(locale, run?.completed ?? 0)} completed · {formatNumber(locale, run?.messages ?? 0)} messages</small>{run?.nextDueAt && <button disabled={working} onClick={() => void advanceDemo()}>Advance demo by one day</button>}{trace?.steps.map((step, index) => <small key={`${step.nodeId}-${index}`}>✓ {step.label}</small>)}</> : <small>{browserDraft ? "Browser-only drafts have no execution history." : "Launch to inspect the local path."}</small>}</div>
        </div>
      </aside>}
    </div>
    {messageEditorNode?.config?.channel === "whatsapp" ? <CanvasWhatsAppEditor key={messageEditorNode.id} node={messageEditorNode} canvasId={canvasId} testAvailable={!browserDraft} onOtherChannel={(channel, config) => { changeConfig(messageEditorNode.id, { ...config, channel, subscriptionGroupId: undefined }); }} connected={graph.edges.some(([, to]) => to === messageEditorNode.id)} onDone={config => { changeConfig(messageEditorNode.id, config); setMessageEditorId(null); }}/> : messageEditorNode && <CanvasSmsEditor key={messageEditorNode.id} node={messageEditorNode} canvasId={canvasId} groups={subscriptionGroups} testAvailable={!browserDraft} connected={graph.edges.some(([, to]) => to === messageEditorNode.id)} onDone={config => { changeConfig(messageEditorNode.id, config); setMessageEditorId(null); }} onOtherChannel={channel => { changeConfig(messageEditorNode.id, { channel, subscriptionGroupId: undefined }); if (channel !== "whatsapp") { setMessageEditorId(null); setInspectorOpen(true); } }}/> }
    {adding && <div className={styles.addBar}><button onClick={() => { setAdding(false); setLinkFrom(null); }}>Cancel Add Step</button><span>or Press <kbd>Esc</kbd></span></div>}
  </section>;
}
