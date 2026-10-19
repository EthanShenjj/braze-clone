"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, ExternalLink, Mail, MousePointerClick, Plus, Users } from "lucide-react";
import { type CanvasGraph, type CanvasNode, type CanvasNodeKind, type CanvasRun, initialCanvasGraph, isCanvasGraph, validateCanvasGraph } from "@/lib/canvas-model";
import { formatDate, formatNumber, normalizeLocale, translate, type Locale } from "@/lib/i18n";
import { registerUnsavedNavigation } from "@/lib/unsaved-navigation";

type Drag = { id: string; startX: number; startY: number; x: number; y: number; moved: boolean };

export default function LiveCanvas({ canvasId, canvasName, onBack, locale: localeValue = "en", notify, embedded = false, saveRef, onSaved }: { canvasId: string; canvasName: string; onBack: () => void; locale?: Locale; notify: (message: string) => void; embedded?: boolean; saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null>; onSaved?: (graph: CanvasGraph, updatedAt: string) => void }) {
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
  const suppressClick = useRef(false);
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [subscriptionGroups, setSubscriptionGroups] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [traceUser, setTraceUser] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
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
    void fetch(`/api/canvases/${encodeURIComponent(canvasId)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Canvas not found."); return response.json(); }).then(result => {
      if (controller.signal.aborted) return;
      if (isCanvasGraph(result.graph)) {
        setHistory([result.graph]); setCursor(0);
        setSavedGraph(JSON.stringify(result.graph));
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

  const refreshRuns = async () => {
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
  const add = (kind: CanvasNodeKind) => {
    const names: Record<CanvasNodeKind, string> = { entry: "Audience entry", delay: "Delay · 1 day", message: "Email message", branch: "Decision split", update: "Update user" };
    const configs: Partial<Record<CanvasNodeKind, CanvasNode["config"]>> = { delay: { durationHours: 24 }, message: { channel: "email", message: "Write a message for this step." }, branch: { attribute: "country", value: "US" }, update: { attribute: "plan", value: "pro" } };
    const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`;
    commit({ ...graph, nodes: [...graph.nodes, { id, label: names[kind], kind, x: 160 + graph.nodes.length * 45, y: 320, config: configs[kind] }] });
    setSelected(id);
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
    const campaignId = node.config?.linkedCampaignId ?? `cmp_canvas_${canvasId.replace(/[^a-z0-9]/gi, "").slice(-6)}_${node.id.replace(/[^a-z0-9]/gi, "").slice(-6)}`;
    if (!node.config?.linkedCampaignId) {
      const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: campaignId,
        name: `Canvas · ${node.label}`,
        channel: node.config?.channel === "push" ? "push" : node.config?.channel === "sms" ? "sms" : node.config?.channel === "iam" ? "iam" : "email",
        status: "Draft", schedule: "One time", audience: "All Users", conversion: "Start Session",
        subject: node.config?.subject ?? node.label, body: node.config?.message ?? "",
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
  const branchRoutes = selectedNode?.kind === "branch" ? graph.edges.filter(([from]) => from === selectedNode.id) : [];
  const run = runs.find(item => item.id === runId);
  const trace = run?.traces.find(item => item.userId === traceUser) ?? run?.traces[0];
  const icon = (kind: CanvasNodeKind) => kind === "entry" ? <Users size={18}/> : kind === "delay" ? <CalendarDays size={18}/> : kind === "branch" ? <MousePointerClick size={18}/> : kind === "update" ? <Activity size={18}/> : <Mail size={18}/>;

  return <section className="canvas-page"><div className="page-heading"><div>{!embedded && <button className="text-button" onClick={onBack}>← All Canvases</button>}<h1>{embedded ? "Build Canvas" : canvasName}</h1><p>{translate(locale, "Build, validate, save, and simulate a local customer journey.")}</p></div><div className="heading-actions"><button className="secondary" disabled={cursor === 0 || working} onClick={() => setCursor(cursor - 1)}>{translate(locale, "Undo")}</button><button className="secondary" disabled={cursor === history.length - 1 || working} onClick={() => setCursor(cursor + 1)}>{translate(locale, "Redo")}</button><button className="secondary" disabled={working} onClick={() => void save()}>{translate(locale, "Save Draft")}</button>{!embedded && <button className="primary" disabled={working} onClick={() => void launch()}>{translate(locale, "Launch Canvas")}</button>}</div></div>
    {error && <div className="canvas-error" role="alert">{error}</div>}
    <div className="canvas-shell live-canvas-shell"><aside><h3>{translate(locale, "Steps")}</h3>{(["entry", "message", "delay", "branch", "update"] as CanvasNodeKind[]).map(kind => <button key={kind} disabled={kind === "entry" && graph.nodes.some(node => node.kind === "entry")} onClick={() => add(kind)}><Plus size={14}/>{translate(locale, kind === "entry" ? "Audience entry" : kind === "message" ? "Message" : kind === "delay" ? "Delay" : kind === "branch" ? "Decision split" : "Update User")}</button>)}
      <hr/><h3>{translate(locale, "Inspector")}</h3>{selectedNode ? <><label>{translate(locale, "Step name")}<input value={selectedNode.label} onChange={event => changeNode(selected, { label: event.target.value })}/></label>
        {selectedNode.kind === "delay" && <label>{translate(locale, "Delay (hours)")}<input type="number" min="1" value={selectedNode.config?.durationHours ?? 24} onChange={event => changeConfig(selected, { durationHours: Number(event.target.value) })}/></label>}
        {selectedNode.kind === "entry" && !embedded && <><label>Re-entry<select value={selectedNode.config?.reEntry ?? "none"} onChange={event => changeConfig(selected, { reEntry: event.target.value as "none" | "after1d" | "after7d" | "always" })}><option value="none">Users can only enter once</option><option value="after1d">Re-enter after 1 day</option><option value="after7d">Re-enter after 7 days</option><option value="always">Re-enter every time</option></select></label><label>Conversion event<select value={selectedNode.config?.conversionEvent ?? "Start Session"} onChange={event => changeConfig(selected, { conversionEvent: event.target.value })}><option>Start Session</option><option>Makes Purchase</option><option>Performs Custom Event</option><option>Opens Email</option></select></label><label>Conversion deadline (days)<input type="number" min="1" value={selectedNode.config?.conversionDeadlineDays ?? 3} onChange={event => changeConfig(selected, { conversionDeadlineDays: Number(event.target.value) || 3 })}/></label></>}
        {selectedNode.kind === "message" && <><label>{translate(locale, "Channel")}<select disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={selectedNode.config?.channel ?? "email"} onChange={event => changeConfig(selected, { channel: event.target.value, subscriptionGroupId: undefined })}><option value="email">{translate(locale, "Email")}</option><option value="push">{translate(locale, "Push notification")}</option><option value="sms">SMS</option><option value="iam">{translate(locale, "In-app message")}</option></select></label>{["email", "sms"].includes(selectedNode.config?.channel ?? "email") && <label>Subscription group<select disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={String(selectedNode.config?.subscriptionGroupId ?? "")} onChange={event => changeConfig(selected, { subscriptionGroupId: event.target.value || undefined })}><option value="">{selectedNode.config?.channel === "sms" ? "Select a group" : "No group filter"}</option>{subscriptionGroups.filter(group => group.channel === (selectedNode.config?.channel === "sms" ? "SMS" : "Email")).map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>}<label>Subject<input disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={selectedNode.config?.subject ?? ""} onChange={event => changeConfig(selected, { subject: event.target.value })}/></label><label>{translate(locale, "Message")}<textarea disabled={Boolean(selectedNode.config?.linkedCampaignId)} value={selectedNode.config?.message ?? ""} onChange={event => changeConfig(selected, { message: event.target.value })}/></label><button className="secondary small" onClick={() => void openFullEditor(selectedNode!)}><ExternalLink size={13}/> Open in full editor</button>{selectedNode.config?.linkedCampaignId && <><small>Linked campaign: {selectedNode.config.linkedCampaignId}. Content is edited in the full editor.</small><button className="secondary small" onClick={() => changeConfig(selected, { linkedCampaignId: undefined })}>Unlink campaign</button></>}</>}
        {selectedNode.kind === "update" && <><label>Attribute<input value={selectedNode.config?.attribute ?? ""} onChange={event => changeConfig(selected, { attribute: event.target.value, value: event.target.value === "subscribed" ? "true" : selectedNode.config?.value ?? "" })}/></label><label>New value{selectedNode.config?.attribute === "subscribed" ? <select value={selectedNode.config?.value === "false" ? "false" : "true"} onChange={event => changeConfig(selected, { value: event.target.value })}><option value="true">Subscribed</option><option value="false">Unsubscribed</option></select> : <input value={selectedNode.config?.value ?? ""} onChange={event => changeConfig(selected, { value: event.target.value })}/>}</label><small>Global email status accepts only true or false.</small></>}
        {selectedNode.kind === "branch" && <><label>{translate(locale, "Attribute")}<select value={selectedNode.config?.attribute ?? "country"} onChange={event => changeConfig(selected, { attribute: event.target.value })}><option value="country">{translate(locale, "Country")}</option><option value="lifecycle">{translate(locale, "Lifecycle")}</option><option value="subscribed">{translate(locale, "Subscribed")}</option></select></label><label>{translate(locale, "Equals")}<input value={selectedNode.config?.value ?? ""} onChange={event => changeConfig(selected, { value: event.target.value })}/></label><small>Yes → {graph.nodes.find(node => node.id === branchRoutes[0]?.[1])?.label ?? "Connect a step"}</small><small>No → {graph.nodes.find(node => node.id === branchRoutes[1]?.[1])?.label ?? "Connect a step"}</small><button className="secondary small" disabled={branchRoutes.length !== 2} onClick={() => swapBranchRoutes(selectedNode.id)}>Swap Yes / No routes</button></>}
        <button className="secondary small" onClick={() => setLinkFrom(selected)}>{translate(locale, "Connect from this step")}</button><button className="secondary small" disabled={selectedNode.kind === "entry"} onClick={copy}>{translate(locale, "Copy step")}</button><button className="text-button danger" onClick={remove}>{translate(locale, "Delete step")}</button></> : <p>{translate(locale, "Select a node")}</p>}
      <hr/><h3>{translate(locale, "Execution")}</h3><button className="secondary small" onClick={() => void refreshRuns()}>Refresh execution</button>{runs.length ? <><label>{translate(locale, "Run")}<select value={run?.id ?? ""} onChange={event => { const next = runs.find(item => item.id === event.target.value); setRunId(next?.id ?? null); setTraceUser(next?.traces[0]?.userId ?? null); }}>{runs.map(item => <option key={item.id} value={item.id}>{formatDate(locale, item.createdAt, { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><small>{formatNumber(locale, run?.entered ?? 0)} {translate(locale, "entered")} · {formatNumber(locale, run?.completed ?? 0)} {translate(locale, "completed")} · {formatNumber(locale, run?.messages ?? 0)} {translate(locale, "messages")} · {formatNumber(locale, Math.max(0, (run?.entered ?? 0) - (run?.completed ?? 0)))} waiting</small>{run?.nextDueAt && <small>Next due: {formatDate(locale, run.nextDueAt, { dateStyle: "medium", timeStyle: "short" })}</small>}<button className="secondary small" disabled={working || !run?.nextDueAt} onClick={() => void advanceDemo()}>Advance demo by one day</button><label>{translate(locale, "User path")}<select value={trace?.userId ?? ""} onChange={event => setTraceUser(event.target.value)}>{run?.traces.map(item => <option key={item.userId}>{item.userId}</option>)}</select></label>{trace?.steps.map((step, index) => <small className="execution-item" key={`${step.nodeId}-${index}`}>✓ {step.label}</small>)}</> : <small>{translate(locale, "Launch to inspect the local path.")}</small>}</aside>
      <div className="journey-canvas live-journey-canvas"><div className="zoom-control"><button onClick={() => setZoom(value => Math.max(.6, value - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => Math.min(1.5, value + .1))}>+</button></div><div className="canvas-world" style={{ transform: `scale(${zoom})` }}>{visible.edges.map(([from, to]) => { const start = visible.nodes.find(node => node.id === from); const end = visible.nodes.find(node => node.id === to); const branchIndex = start?.kind === "branch" ? visible.edges.filter(edge => edge[0] === from).findIndex(edge => edge[1] === to) : -1; return start && end ? <svg className="canvas-edge" key={`${from}-${to}`}><line x1={start.x + 160} y1={start.y + 36} x2={end.x} y2={end.y + 36}/>{branchIndex >= 0 && <text x={(start.x + 160 + end.x) / 2} y={(start.y + end.y + 72) / 2 - 8}>{branchIndex === 0 ? "Yes" : "No"}</text>}</svg> : null; })}{visible.nodes.map(node => <button key={node.id} className={["journey-node", selected === node.id ? "selected" : "", linkFrom === node.id ? "link-source" : ""].filter(Boolean).join(" ")} style={{ left: node.x, top: node.y }} onPointerDown={event => pointerDown(node.id, event)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => selectNode(node.id)}>{icon(node.kind)}<span>{node.label}</span></button>)}</div>{linkFrom && <div className="connect-hint">{translate(locale, "Select a destination step to create a connection.")}</div>}</div></div></section>;
}
