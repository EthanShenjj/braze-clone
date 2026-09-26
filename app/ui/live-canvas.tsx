"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, ExternalLink, Mail, MousePointerClick, Plus, Users } from "lucide-react";
import { type CanvasGraph, type CanvasNode, type CanvasNodeKind, type CanvasRun, initialCanvasGraph, isCanvasGraph, validateCanvasGraph } from "@/lib/canvas-model";
import { formatDate, formatNumber, normalizeLocale, translate, type Locale } from "@/lib/i18n";

type Drag = { id: string; startX: number; startY: number; x: number; y: number; moved: boolean };

export default function LiveCanvas({ locale: localeValue = "en", notify }: { locale?: Locale; notify: (message: string) => void }) {
  const locale = normalizeLocale(localeValue);
  const [history, setHistory] = useState<CanvasGraph[]>([initialCanvasGraph]);
  const [cursor, setCursor] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState("email");
  const [zoom, setZoom] = useState(1);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [traceUser, setTraceUser] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const graph = history[cursor];
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/canvas", { signal: controller.signal }).then(response => response.json()).then(result => {
      if (controller.signal.aborted) return;
      if (isCanvasGraph(result.graph)) {
        setHistory([result.graph]); setCursor(0);
        setSelected(result.graph.nodes[0]?.id ?? "");
      }
      setUpdatedAt(result.updatedAt ?? null);
      setRuns(Array.isArray(result.runs) ? result.runs : []);
      setRunId(result.runs?.[0]?.id ?? null);
      setTraceUser(result.runs?.[0]?.traces?.[0]?.userId ?? null);
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load the saved Canvas draft."); });
    return () => controller.abort();
  }, []);

  const commit = (next: CanvasGraph) => { setHistory(previous => [...previous.slice(0, cursor + 1), next]); setCursor(cursor + 1); setError(""); };
  const changeNode = (id: string, patch: Partial<CanvasNode>) => commit({ ...graph, nodes: graph.nodes.map(node => node.id === id ? { ...node, ...patch } : node) });
  const changeConfig = (id: string, patch: NonNullable<CanvasNode["config"]>) => {
    const node = graph.nodes.find(item => item.id === id);
    if (node) changeNode(id, { config: { ...node.config, ...patch } });
  };
  const add = (kind: CanvasNodeKind) => {
    const names: Record<CanvasNodeKind, string> = { entry: "Audience entry", delay: "Delay · 1 day", message: "Email message", branch: "Action path", update: "Update user" };
    const configs: Partial<Record<CanvasNodeKind, CanvasNode["config"]>> = { delay: { durationHours: 24 }, message: { channel: "email", message: "Write a message for this step." }, branch: { attribute: "country", value: "US" } };
    const id = `${kind}_${crypto.randomUUID().slice(0, 8)}`;
    commit({ ...graph, nodes: [...graph.nodes, { id, label: names[kind], kind, x: 160 + graph.nodes.length * 45, y: 320, config: configs[kind] }] });
    setSelected(id);
  };
  const copy = () => { const node = graph.nodes.find(item => item.id === selected); if (!node) return; const id = `${node.kind}_${crypto.randomUUID().slice(0, 8)}`; commit({ ...graph, nodes: [...graph.nodes, { ...node, id, label: `${node.label} copy`, x: node.x + 40, y: node.y + 45 }] }); setSelected(id); };
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

  const save = async () => {
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/canvas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graph, updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Canvas save failed.");
      setUpdatedAt(result.updatedAt); notify("Canvas draft saved to local SQLite.");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas save failed."); return false; }
    finally { setWorking(false); }
  };
  const launch = async () => {
    const issues = validateCanvasGraph(graph);
    if (issues.length) { setError(issues.join(" ")); return; }
    if (!await save()) return;
    setWorking(true);
    try {
      const response = await fetch("/api/canvas", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Canvas run failed.");
      const run = result as CanvasRun;
      setRuns(previous => [run, ...previous].slice(0, 8)); setRunId(run.id); setTraceUser(run.traces[0]?.userId ?? null);
      notify(`Canvas run recorded: ${run.entered} users entered, ${run.messages} messages simulated.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas run failed."); }
    finally { setWorking(false); }
  };

  const openFullEditor = async (node: CanvasNode) => {
    const campaignId = node.config?.linkedCampaignId ?? `cmp_canvas_${node.id.replace(/[^a-z0-9]/gi, "").slice(-6)}`;
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      id: campaignId,
      name: `Canvas · ${node.label}`,
      channel: node.config?.channel === "push" ? "push" : node.config?.channel === "sms" ? "sms" : node.config?.channel === "iam" ? "iam" : "email",
      status: "Draft", schedule: "One time", audience: "All Users", conversion: "Start Session",
      subject: node.config?.subject ?? node.label, body: node.config?.message ?? "",
    }) });
    if (!response.ok) { setError("Could not create the linked campaign draft."); return; }
    if (campaignId !== node.config?.linkedCampaignId) changeNode(node.id, { config: { ...node.config, linkedCampaignId: campaignId } });
    router.push(`/engagement/campaigns/${campaignId}?step=compose&locale=${locale}`);
  };

  const visible: CanvasGraph = drag?.moved ? { ...graph, nodes: graph.nodes.map(node => node.id === drag.id ? { ...node, x: drag.x, y: drag.y } : node) } : graph;
  const selectedNode = graph.nodes.find(node => node.id === selected);
  const run = runs.find(item => item.id === runId);
  const trace = run?.traces.find(item => item.userId === traceUser) ?? run?.traces[0];
  const icon = (kind: CanvasNodeKind) => kind === "entry" ? <Users size={18}/> : kind === "delay" ? <CalendarDays size={18}/> : kind === "branch" ? <MousePointerClick size={18}/> : kind === "update" ? <Activity size={18}/> : <Mail size={18}/>;

  return <section className="canvas-page"><div className="page-heading"><div><h1>{translate(locale, "Canvas")}</h1><p>{translate(locale, "Build, validate, save, and simulate a local customer journey.")}</p></div><div className="heading-actions"><button className="secondary" disabled={cursor === 0 || working} onClick={() => setCursor(cursor - 1)}>{translate(locale, "Undo")}</button><button className="secondary" disabled={cursor === history.length - 1 || working} onClick={() => setCursor(cursor + 1)}>{translate(locale, "Redo")}</button><button className="secondary" disabled={working} onClick={() => void save()}>{translate(locale, "Save Draft")}</button><button className="primary" disabled={working} onClick={() => void launch()}>{translate(locale, "Launch Canvas")}</button></div></div>
    {error && <div className="canvas-error" role="alert">{error}</div>}
    <div className="canvas-shell live-canvas-shell"><aside><h3>{translate(locale, "Steps")}</h3>{(["entry", "message", "delay", "branch", "update"] as CanvasNodeKind[]).map(kind => <button key={kind} onClick={() => add(kind)}><Plus size={14}/>{translate(locale, kind === "entry" ? "Audience Paths" : kind === "message" ? "Message" : kind === "delay" ? "Delay" : kind === "branch" ? "Action Paths" : "Update User")}</button>)}
      <hr/><h3>{translate(locale, "Inspector")}</h3>{selectedNode ? <><label>{translate(locale, "Step name")}<input value={selectedNode.label} onChange={event => changeNode(selected, { label: event.target.value })}/></label>
        {selectedNode.kind === "delay" && <label>{translate(locale, "Delay (hours)")}<input type="number" min="1" value={selectedNode.config?.durationHours ?? 24} onChange={event => changeConfig(selected, { durationHours: Number(event.target.value) })}/></label>}
        {selectedNode.kind === "entry" && <><label>Re-entry<select value={selectedNode.config?.reEntry ?? "none"} onChange={event => changeConfig(selected, { reEntry: event.target.value as "none" | "after1d" | "after7d" | "always" })}><option value="none">Users can only enter once</option><option value="after1d">Re-enter after 1 day</option><option value="after7d">Re-enter after 7 days</option><option value="always">Re-enter every time</option></select></label><label>Conversion event<select value={selectedNode.config?.conversionEvent ?? "Start Session"} onChange={event => changeConfig(selected, { conversionEvent: event.target.value })}><option>Start Session</option><option>Makes Purchase</option><option>Performs Custom Event</option><option>Opens Email</option></select></label><label>Conversion deadline (days)<input type="number" min="1" value={selectedNode.config?.conversionDeadlineDays ?? 3} onChange={event => changeConfig(selected, { conversionDeadlineDays: Number(event.target.value) || 3 })}/></label></>}
        {selectedNode.kind === "message" && <><label>{translate(locale, "Channel")}<select value={selectedNode.config?.channel ?? "email"} onChange={event => changeConfig(selected, { channel: event.target.value })}><option value="email">{translate(locale, "Email")}</option><option value="push">{translate(locale, "Push notification")}</option><option value="sms">SMS</option><option value="iam">{translate(locale, "In-app message")}</option></select></label><label>Subject<input value={selectedNode.config?.subject ?? ""} onChange={event => changeConfig(selected, { subject: event.target.value })}/></label><label>{translate(locale, "Message")}<textarea value={selectedNode.config?.message ?? ""} onChange={event => changeConfig(selected, { message: event.target.value })}/></label><button className="secondary small" onClick={() => void openFullEditor(selectedNode!)}><ExternalLink size={13}/> Open in full editor</button>{selectedNode.config?.linkedCampaignId && <small>Linked campaign: {selectedNode.config.linkedCampaignId}</small>}</>}
        {selectedNode.kind === "branch" && <><label>{translate(locale, "Attribute")}<select value={selectedNode.config?.attribute ?? "country"} onChange={event => changeConfig(selected, { attribute: event.target.value })}><option value="country">{translate(locale, "Country")}</option><option value="lifecycle">{translate(locale, "Lifecycle")}</option><option value="subscribed">{translate(locale, "Subscribed")}</option></select></label><label>{translate(locale, "Equals")}<input value={selectedNode.config?.value ?? ""} onChange={event => changeConfig(selected, { value: event.target.value })}/></label><small>{translate(locale, "First outgoing route is Yes; second is No.")}</small></>}
        <button className="secondary small" onClick={() => setLinkFrom(selected)}>{translate(locale, "Connect from this step")}</button><button className="secondary small" onClick={copy}>{translate(locale, "Copy step")}</button><button className="text-button danger" onClick={remove}>{translate(locale, "Delete step")}</button></> : <p>{translate(locale, "Select a node")}</p>}
      <hr/><h3>{translate(locale, "Execution")}</h3>{runs.length ? <><label>{translate(locale, "Run")}<select value={run?.id ?? ""} onChange={event => { const next = runs.find(item => item.id === event.target.value); setRunId(next?.id ?? null); setTraceUser(next?.traces[0]?.userId ?? null); }}>{runs.map(item => <option key={item.id} value={item.id}>{formatDate(locale, item.createdAt, { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><small>{formatNumber(locale, run?.entered ?? 0)} {translate(locale, "entered")} · {formatNumber(locale, run?.completed ?? 0)} {translate(locale, "completed")} · {formatNumber(locale, run?.messages ?? 0)} {translate(locale, "messages")}</small><label>{translate(locale, "User path")}<select value={trace?.userId ?? ""} onChange={event => setTraceUser(event.target.value)}>{run?.traces.map(item => <option key={item.userId}>{item.userId}</option>)}</select></label>{trace?.steps.map((step, index) => <small className="execution-item" key={`${step.nodeId}-${index}`}>✓ {step.label}</small>)}</> : <small>{translate(locale, "Launch to inspect the local path.")}</small>}</aside>
      <div className="journey-canvas live-journey-canvas"><div className="zoom-control"><button onClick={() => setZoom(value => Math.max(.6, value - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => Math.min(1.5, value + .1))}>+</button></div><div className="canvas-world" style={{ transform: `scale(${zoom})` }}>{visible.edges.map(([from, to]) => { const start = visible.nodes.find(node => node.id === from); const end = visible.nodes.find(node => node.id === to); return start && end ? <svg className="canvas-edge" key={`${from}-${to}`}><line x1={start.x + 160} y1={start.y + 36} x2={end.x} y2={end.y + 36}/></svg> : null; })}{visible.nodes.map(node => <button key={node.id} className={["journey-node", selected === node.id ? "selected" : "", linkFrom === node.id ? "link-source" : ""].filter(Boolean).join(" ")} style={{ left: node.x, top: node.y }} onPointerDown={event => pointerDown(node.id, event)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => selectNode(node.id)}>{icon(node.kind)}<span>{node.label}</span></button>)}</div>{linkFrom && <div className="connect-hint">{translate(locale, "Select a destination step to create a connection.")}</div>}</div></div></section>;
}
