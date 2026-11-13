"use client";
import FrequencyCappingControls from "./frequency-capping-controls";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Plus, X } from "lucide-react";
import type { CanvasRecord } from "@/lib/braze-store";
import { browserCanvasMode, getBrowserCanvas, patchBrowserCanvas, reconcileBrowserCanvasTags, resolveBrowserCanvasTagRenames } from "@/lib/canvas-browser-store";
import { initialCanvasGraph, type CanvasGraph } from "@/lib/canvas-model";
import { canvasStepLabels, canvasSteps, canvasWizardIssues, defaultCanvasWizard, normalizeCanvasWizard, isCanvasProfileFilter, type CanvasFilter, type CanvasStep, type CanvasWizardConfig } from "@/lib/canvas-wizard-model";
import type { AudienceRule } from "@/lib/campaign-shared";
import type { CampaignFormCapabilities } from "@/lib/campaign-audience-model";
import { createAudienceRule } from "@/lib/audience-rule-schema";
import { withLocale, type Locale } from "@/lib/i18n";
import { registerUnsavedNavigation } from "@/lib/unsaved-navigation";
import LiveCanvas,{canvasMissingVariantRoutes} from "./live-canvas";
import TagPicker from "./tag-picker";
import { resolveBrowserTags, subscribeTagChanges } from "@/lib/tag-client";
import { resolveTagAliases } from "@/lib/tag-model";
import { FilterCatalog } from "./campaign-audience";
import AudienceRuleEditor from "./audience-rule-editor";
import styles from "./canvas-wizard.module.css";
import TagSingleSelect from "./tag-single-select";
import AudienceDatePicker from "./audience-date-picker";
import CanvasBrief from "./canvas-brief";
import CanvasQuietHours from "./canvas-quiet-hours";
import CanvasRatePicker from "./canvas-rate-picker";
import CanvasConversions from "./canvas-conversions";
import {CanvasSegmentPicker} from "./canvas-segment-picker";
import CanvasEntryTriggerDetails from './canvas-entry-trigger-details';
import CanvasChangeSummary from './canvas-change-summary';
import {canvasRecommendedEvents} from '@/lib/canvas-action-model';

type Segment = { id: string; name: string };
const conversionTypes = ["Performs Custom Event", "Starts Session", "Upgrade App", "View product", "Update cart", "Start checkout", "Places order", "Cancel order", "Refund order"];
const triggerTypes = ["Perform Custom Event", "Start Session", "Interact With Campaign", "Interact with Landing Page", "Perform Exception Event For Campaign", "Change Custom Attribute Value", "Update Subscription Status", "Update Subscription Group Status", "Add an Email Address", "View product", "Update cart", "Start checkout", "Place order", "Cancel order", "Refund order", "Perform Back in Stock Event", "Perform Price Drop Event", "Send an SMS inbound message", "Send a WhatsApp inbound message", "Send a LINE inbound message", "Enter a Location", "Trigger a Geofence"];

type CanvasDetails={name:string;description:string;tags:string[];wizard:CanvasWizardConfig};
export async function persistCanvasWizardDetails({canvasId,workspaceId,current,baseline,updatedAt,browserDraft=false}:{canvasId:string;workspaceId:string;current:CanvasDetails;baseline:string;updatedAt:string|null;browserDraft?:boolean}):Promise<{changed:boolean;record:CanvasRecord|null}>{
 if(JSON.stringify(current)===baseline)return{changed:false,record:null};
 if(!current.name.trim())throw Error('Canvas Name is required.');
 if(browserDraft){if(!getBrowserCanvas(canvasId,workspaceId))throw Error('Canvas not found in this workspace.');return{changed:true,record:patchBrowserCanvas(canvasId,{...current,tags:await resolveBrowserTags(current.tags,workspaceId)},workspaceId)};}
 const response=await fetch(`/api/canvases/${encodeURIComponent(canvasId)}?workspaceId=${encodeURIComponent(workspaceId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...current,workspaceId,updatedAt})}),result=await response.json();
 if(!response.ok)throw Error(result.error??'Canvas save failed.');return{changed:true,record:result as CanvasRecord};
}
export function CanvasWizardFooter({step,saving,dirty,go,save,stepper}:{step:CanvasStep;saving:boolean;dirty:boolean;go:(step:CanvasStep)=>void;save:()=>void;stepper:React.ReactNode}){
 const arrow={border:0,background:'transparent',color:'#68616f',padding:'8px',minWidth:30};
 return <div className={styles.footer}><button className={styles.outline} style={arrow} aria-label="Back" disabled={step==='basics'||saving} onClick={()=>go(canvasSteps[canvasSteps.indexOf(step)-1])}><ChevronLeft size={18}/></button><div>{stepper}<div className={styles.footerButtons}><button className={styles.outline} style={arrow} aria-label="Forward" disabled={step==='summary'||saving} onClick={()=>go(canvasSteps[canvasSteps.indexOf(step)+1])}><ChevronRight size={18}/></button><button className={styles.outline} disabled={!dirty||saving} onClick={save}>{saving?'Saving…':'Save'}</button></div></div></div>;
}

export default function CanvasWizard({ canvasId, locale, notify, onBack, onUpdated }: { canvasId: string; locale: Locale; notify: (message: string) => void; onBack: () => void; onUpdated: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspace") || searchParams.get("workspaceId") || "local";
  const requestedStep = searchParams.get("step");
  const step: CanvasStep = canvasSteps.includes(requestedStep as CanvasStep) ? requestedStep as CanvasStep : "basics";
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [wizard, setWizard] = useState<CanvasWizardConfig>(structuredClone(defaultCanvasWizard));
  const [graph, setGraph] = useState<CanvasGraph>(structuredClone(initialCanvasGraph));
  const [segments, setSegments] = useState<Segment[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const updatedAtRef = useRef<string | null>(null);
  const graphSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [browserDraft, setBrowserDraft] = useState(false);
  const [graphDirty,setGraphDirty]=useState(false);
  const [workspaceLimits,setWorkspaceLimits]=useState<{enforce:boolean;maxPerMinute?:number;maxPerDay?:number}|null>(null);
  const [limitsError,setLimitsError]=useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);setError('');setCanvas(null);setBaseline('');setGraphDirty(false);graphSaveRef.current=null;
    const local = browserCanvasMode ? getBrowserCanvas(canvasId, workspaceId) : null;
    void Promise.all([
      local ? Promise.resolve({ canvas: local.canvas, graph: local.graph, updatedAt: local.canvas.updatedAt }) : fetch(`/api/canvases/${encodeURIComponent(canvasId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Canvas not found."); return response.json(); }),
      fetch(`/api/resources/segments?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal }).then(response => response.json()),
    ]).then(([result, segmentResult]) => {
      if (controller.signal.aborted) return;
      const record = result.canvas as CanvasRecord;
      if ((record.workspaceId ?? "local") !== workspaceId) throw new Error("Canvas not found in this workspace.");
      const config = normalizeCanvasWizard(record.wizard);
      setBrowserDraft(Boolean(local));
      setCanvas(record); setName(record.name); setDescription(record.description); setTags(record.tags);
      setWizard(config); setGraph(result.graph ?? structuredClone(initialCanvasGraph));
      setUpdatedAt(result.updatedAt); updatedAtRef.current = result.updatedAt;
      setBaseline(JSON.stringify({ name: record.name, description: record.description, tags: record.tags, wizard: config }));
      setSegments(Array.isArray(segmentResult.data) ? segmentResult.data.filter((segment:{data?:Record<string,unknown>})=>String(segment.data?.workspaceId??"local")===workspaceId) : []);
      setLoading(false);
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not load Canvas."); setLoading(false); } });
    return () => controller.abort();
  }, [canvasId, workspaceId]);

  useEffect(()=>{const controller=new AbortController();setWorkspaceLimits(null);setLimitsError('');void fetch(`/api/resources/messaging-rate-limits?workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error??'Could not load workspace messaging rate limits.');const resource=(result.data??[]).find((item:{data?:Record<string,unknown>;status?:string})=>item.status==='Active'&&String(item.data?.workspaceId??'local')===workspaceId);setWorkspaceLimits({enforce:resource?.data?.enforce===true,maxPerMinute:Number(resource?.data?.maxPerMinute)||undefined,maxPerDay:Number(resource?.data?.maxPerDay)||undefined});}).catch(cause=>{if(!controller.signal.aborted)setLimitsError(cause instanceof Error?cause.message:'Could not load workspace messaging rate limits.');});return()=>controller.abort();},[workspaceId]);

  useEffect(() => {
    if (!browserDraft) return;
    const controller = new AbortController();
    const unsubscribe = subscribeTagChanges(detail => {
      if (detail.workspaceId !== workspaceId) return;
      void (async () => {
        try {
          let aliases = detail.aliases;
          if (!aliases) {
            const response = await fetch(`/api/tags?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: controller.signal });
            const registry = await response.json();
            if (!response.ok) throw new Error(registry.error ?? "Could not refresh Canvas tags.");
            aliases = registry.aliases ?? {};
          }
          if (controller.signal.aborted) return;
          const changes = aliases ?? {};
          reconcileBrowserCanvasTags(changes, workspaceId);
          const next = resolveBrowserCanvasTagRenames(tags, changes);
          setTags(next);
          setCanvas(current => current ? { ...current, tags: resolveBrowserCanvasTagRenames(current.tags, changes) } : current);
          setBaseline(current => {
            if (!current) return current;
            const previous = JSON.parse(current);
            return JSON.stringify({ ...previous, tags: resolveBrowserCanvasTagRenames(previous.tags, changes) });
          });
          // Deleted references stay visible and require an explicit removal.
          resolveTagAliases(next, changes);
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not refresh Canvas tags.");
        }
      })();
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [browserDraft, tags, workspaceId]);

  const dirty = Boolean(baseline) && baseline !== JSON.stringify({ name, description, tags, wizard });
  useEffect(() => {
    if (!dirty || step === "build") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    const unregister = registerUnsavedNavigation(action => { if (window.confirm("Discard unsaved Canvas changes?")) action(); });
    return () => { window.removeEventListener("beforeunload", warn); unregister(); };
  }, [dirty, step]);
  const patchWizard = (patch: Partial<CanvasWizardConfig>) => setWizard(current => ({ ...current, ...patch }));
  const patchEntry = (patch: Partial<CanvasWizardConfig["entry"]>) => setWizard(current => ({ ...current, entry: { ...current.entry, ...patch } }));
  const patchAudience = (patch: Partial<CanvasWizardConfig["audience"]>) => setWizard(current => ({ ...current, audience: { ...current.audience, ...patch } }));
  const patchSend = (patch: Partial<CanvasWizardConfig["send"]>) => setWizard(current => ({ ...current, send: { ...current.send, ...patch } }));
  const issues = useMemo(() => [...canvasWizardIssues(wizard,graph),...canvasMissingVariantRoutes(graph).map(name=>({step:'build' as const,title:'Unconnected Canvas variant',detail:`Connect an entry step for “${name}” before activation.`}))], [wizard, graph]);
  const save = useCallback(async (saveGraph = false) => {
    if(!dirty&&!saveGraph)return true;
    if (!name.trim()) { setError("Canvas Name is required."); return false; }
    if(dirty||graphDirty)setSaving(true); setError("");
    try {
      if (saveGraph && graphSaveRef.current && !await graphSaveRef.current()) return false;
      const result=await persistCanvasWizardDetails({canvasId,workspaceId,current:{name,description,tags,wizard},baseline,updatedAt:updatedAtRef.current,browserDraft});
      if(!result.changed||!result.record)return true;
      const record=result.record,normalized=normalizeCanvasWizard(record.wizard);
      setCanvas(record);setName(current=>current===name?record.name:current);setDescription(current=>current===description?record.description:current);setWizard(current=>JSON.stringify(current)===JSON.stringify(wizard)?normalized:current);setTags(current=>JSON.stringify(current)===JSON.stringify(tags)?record.tags:current);setUpdatedAt(record.updatedAt);updatedAtRef.current=record.updatedAt;
      setBaseline(JSON.stringify({name:record.name,description:record.description,tags:record.tags,wizard:normalized}));
      onUpdated(); notify("Canvas draft saved."); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas save failed."); return false; }
    finally { setSaving(false); }
  }, [canvasId, name, description, tags, wizard, browserDraft, notify, onUpdated, workspaceId,baseline,dirty,graphDirty]);
  const graphChanged=useCallback((next:CanvasGraph,changed:boolean)=>{setGraph(next);setGraphDirty(changed);},[]);
  const go = async (next: CanvasStep) => {
    if(next===step)return;
    if ((dirty||step==='build') && !await save(step==='build')) return;
    const params = new URLSearchParams(searchParams.toString()); params.set("step", next); params.set("locale", locale);
    router.replace(`${pathname}?${params.toString()}`);
    setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const launch = async () => {
    if (browserDraft) { setError("Save this Canvas to a workspace with a persistent database before launching."); return; }
    if (issues.length) { setErrorsOpen(true); setError("Please resolve all errors before launching."); return; }
    if (!await save()) return;
    setLaunching(true);
    try {
      const response = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/launch?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Canvas launch failed.");
      const refreshed = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}?workspaceId=${encodeURIComponent(workspaceId)}`).then(response => response.json());
      if (refreshed.canvas){setCanvas(refreshed.canvas);setUpdatedAt(refreshed.updatedAt);updatedAtRef.current=refreshed.updatedAt;}
      notify(`Canvas activated${Number.isFinite(result.entered)?`: ${result.entered} users entered.`:'.'}`); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Canvas launch failed."); }
    finally { setLaunching(false); }
  };
  const copyId = async () => { await navigator.clipboard.writeText(canvasId); notify("Canvas ID copied."); };
  const stepper = <nav className={styles.stepper} aria-label="Canvas creation steps">{canvasSteps.map((item, index) => <button key={item} className={`${styles.step} ${item === step ? styles.current : ""}`} onClick={() => void go(item)} aria-current={item === step ? "step" : undefined}><span>{index + 1}</span>{canvasStepLabels[item]}</button>)}</nav>;

  if (loading) return <div className={styles.message}>Loading Canvas…</div>;
  if (!canvas) return <div className={styles.message} role="alert">{error || "Canvas not found."} <button onClick={onBack}>Back to all Canvases</button></div>;
  return <section className={styles.page} data-step={step}>
    <div className={styles.topline}><button onClick={onBack}>Canvas</button><span>›</span><strong>Edit &apos;{canvas.name}&apos;</strong><button className={styles.close} aria-label="Close Canvas" onClick={onBack}><X size={17}/></button></div>
    <div className={styles.access}>Limited access</div>
    {browserDraft && <p className={styles.browserNotice}>This Canvas draft is saved in this browser only. A persistent workspace database is required for activation and shared execution history.</p>}
    {step !== "build" && stepper}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {step === "basics" && <div className={styles.card}><h2>Set Up Canvas Details</h2><label className={styles.field}>Canvas Name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} aria-label="Canvas Name"/></label>{description || tagOpen ? <label className={styles.field}>Description<textarea value={description} onChange={event => setDescription(event.target.value)}/></label> : <button className={styles.addLink} onClick={() => setTagOpen(true)}><Plus size={18}/> Add description</button>}<TagPicker value={tags} onChange={setTags} locale={locale} context="assignment" resourceType="canvas" workspaceId={workspaceId}/><CanvasBrief workspaceId={workspaceId} value={wizard.brief} change={brief=>patchWizard({brief})}/><hr/><label className={styles.field}>Canvas ID<div className={styles.copyField}><input readOnly value={canvasId}/><button onClick={() => void copyId()}><Copy size={17}/> Copy</button></div></label><p className={styles.hint}>This is the unique key for this Canvas. Use it to identify which Canvas to send in a request to the Canvas Trigger API.</p><hr/><CanvasConversions events={wizard.conversionEvents} change={conversionEvents=>patchWizard({conversionEvents})} locked={canvas.status==='Active'} workspaceId={workspaceId} graph={graph}/></div>}
    {step === "entrySchedule" && <EntryScheduleStep canvasId={canvasId} workspaceId={workspaceId} config={wizard.entry} onChange={patchEntry} onCopy={() => void copyId()}/>}
    {step === "audience" && <AudienceStep config={wizard.audience} onChange={patchAudience} segments={segments} workspaceId={workspaceId}/>}
    {step === "sendSettings" && <SendSettingsStep workspaceId={workspaceId} config={wizard.send} onChange={patchSend}/>}
    {step === "build" && <div className={styles.build}><div className={styles.buildHead} hidden={searchParams.get("initialConditionsCollapsed")!=="false"}><div><button onClick={()=>void go("basics")}>Edit</button><h2>{canvas.name}</h2><p>{canvas.description || "No description"}</p><TagPicker value={tags} onChange={setTags} locale={locale} context="assignment" resourceType="canvas" workspaceId={workspaceId}/>{searchParams.get("initialConditionsCollapsed")==="false"&&<CanvasChangeSummary workspaceId={workspaceId} canvasId={canvasId} current={{name,description,tags,graph,wizard}}/>}</div><div><strong>Send Settings</strong><ul style={{paddingLeft:17,marginTop:10,fontSize:12,lineHeight:1.7}}><li>{wizard.send.rateEnabled?wizard.send.rateMode==='shared'?`Messages are limited to ${wizard.send.ratePerMinute.toLocaleString()} per minute.`:`Channel rate limits: ${wizard.send.channelLimits.map(limit=>`${limit.channel} ${limit.perMinute.toLocaleString()}/minute`).join(', ')}`:'No limitations on the rate at which users will receive messages.'}</li><li>{limitsError?'Workspace Messaging Rate Limits unavailable':workspaceLimits?`Workspace Messaging Rate Limits ${workspaceLimits.enforce?'ON':'OFF'}${workspaceLimits.enforce&&workspaceLimits.maxPerMinute?`: ${workspaceLimits.maxPerMinute.toLocaleString()} per minute`:''}`:'Loading Workspace Messaging Rate Limits…'}</li><li>Quiet hours {wizard.send.quietEnabled?'ON':'OFF'}</li></ul><button onClick={() => void go("sendSettings")}>Edit</button></div><div><strong>Conversion Events</strong><span>{wizard.conversionEvents.length ? wizard.conversionEvents.map(item => item.type).join(", ") : "No conversion events"}</span><button onClick={() => void go("basics")}>Edit</button></div></div><LiveCanvas key={`${workspaceId}:${canvasId}`} workspaceId={workspaceId} canvasId={canvasId} canvasName={canvas.name} onBack={onBack} locale={locale} notify={notify} wizard={wizard} embedded metadataDirty={dirty} onBeforeTest={()=>save(true)} onGraphChange={graphChanged} parentSaving={saving} detailsExpanded={searchParams.get("initialConditionsCollapsed")==="false"} onToggleDetails={()=>{const params=new URLSearchParams(searchParams.toString());params.set("initialConditionsCollapsed",searchParams.get("initialConditionsCollapsed")==="false"?"true":"false");router.replace(`${pathname}?${params}`);}} onSave={()=>void save(true)} onContinue={()=>void go("summary")} changeBrief={brief=>patchWizard({brief})} revision={updatedAt} saveRef={graphSaveRef} onSaved={(nextGraph, timestamp) => { setGraph(nextGraph);setGraphDirty(false);setCanvas(current=>current?{...current,updatedAt:timestamp}:current); setUpdatedAt(timestamp); updatedAtRef.current = timestamp; }}/></div>}
    {step === "summary" && <div className={styles.card}><h2>Review Canvas Summary</h2><p>Review your configuration before launching this Canvas.</p>{issues.length ? <div className={styles.reviewError}><strong>Please resolve all errors.</strong><button onClick={() => setErrorsOpen(value => !value)}>{errorsOpen ? "Hide Error Details" : "View Error Details"}</button>{errorsOpen && issues.map((issue, index) => <div key={`${issue.step}-${index}`}><b>{issue.title}</b><span>{issue.detail}</span><button onClick={() => void go(issue.step)}>Edit {canvasStepLabels[issue.step]}</button></div>)}</div> : <div className={styles.reviewOkay}><Check size={17}/> All configuration checks passed.</div>}{(["basics", "entrySchedule", "audience", "sendSettings", "build"] as CanvasStep[]).map(item => <div className={styles.summarySection} key={item}><h3>{item === "basics" ? "Conversion Events" : item === "audience" ? "Target Audience" : canvasStepLabels[item]}</h3><button onClick={() => void go(item)}>{item === "build" ? "Edit Build Canvas" : "View Details"}</button><p>{item === "basics" ? wizard.conversionEvents.length ? wizard.conversionEvents.map(event => `${event.type} within ${event.deadline} ${event.unit.toLowerCase()}`).join(" · ") : "No conversion events selected" : item === "entrySchedule" ? wizard.entry.type === "scheduled" ? `Scheduled · ${wizard.entry.timing === "immediate" ? "as soon as launched" : wizard.entry.frequency || "frequency not selected"}` : wizard.entry.type === "action" ? `Action-Based · ${wizard.entry.triggers.length} trigger(s)` : "API-Triggered" : item === "audience" ? `${wizard.audience.segmentIds.length} segment(s), ${wizard.audience.filters.length} filter(s) · ${wizard.audience.reentryEnabled ? "Re-entry enabled" : "No re-entry"}` : item === "sendSettings" ? `${wizard.send.subscriptionMode === "all" ? "All users" : wizard.send.subscriptionMode === "opted_in_only" ? "Opted-in only" : "Subscribed or opted in"} · ${wizard.send.quietEnabled ? "Quiet hours enabled" : "No quiet hours"}` : `${graph.nodes.filter(node => node.kind !== "entry").length} step(s) configured`}</p></div>)}<div className={styles.launchBar}><button className={styles.primary} disabled={browserDraft || issues.length > 0 || saving || launching} onClick={() => void launch()}>{launching ? "Launching…" : "Launch Canvas"}</button><small>{browserDraft ? "Unavailable for browser-only drafts." : "Activation enrolls eligible users and runs configured steps. Sending follows workspace delivery settings."}</small></div></div>}
    {step !== "build" && <CanvasWizardFooter step={step} saving={saving} dirty={dirty} go={next=>void go(next)} save={()=>void save()} stepper={stepper}/>}
  </section>;
}

export function EntryScheduleStep({ canvasId, workspaceId, config, onChange, onCopy }: { canvasId: string; workspaceId:string; config: CanvasWizardConfig["entry"]; onChange: (patch: Partial<CanvasWizardConfig["entry"]>) => void; onCopy: () => void }) {
  const [trigger, setTrigger] = useState("");
  return <div className={styles.card}><h2>Entry Schedule</h2><p>Decide when users should enter the Canvas.</p><h3>Choose a Type</h3><div className={styles.tiles}>{(["scheduled", "action", "api"] as const).map((value, index) => <label key={value} className={config.type === value ? styles.tileSelected : ""}><input type="radio" name="entryType" checked={config.type === value} onChange={() => onChange({ type: value })}/><strong>{["Scheduled", "Action-Based", "API-Triggered"][index]}</strong><small>{["Enter users at designated times", "Enter user when they perform actions", "Enter users via API request"][index]}</small></label>)}</div>{config.type === "scheduled" ? <><h3>Time-Based Options</h3><label className={styles.radio}><input type="radio" checked={config.timing === "immediate"} onChange={() => onChange({ timing: "immediate" })}/> Enter users as soon as Canvas is launched</label><label className={styles.radio}><input type="radio" checked={config.timing === "designated"} onChange={() => onChange({ timing: "designated" })}/> Enter users at a designated time</label>{config.timing === "designated" && <div className={styles.indent}><p>Choose an optimal time for users to be entered into this Canvas.</p><label className={styles.field}>Entry Frequency<TagSingleSelect label="Entry Frequency" value={config.frequency} change={value=>onChange({frequency:value as typeof config.frequency})} options={["Once","Daily","Weekly","Monthly"].map(value=>({id:value,label:value}))}/></label>{config.frequency && <div className={styles.inline}><label className={styles.field}>Start Time<input type="time" value={config.startTime} onChange={event => onChange({ startTime: event.target.value })}/></label><label className={styles.field}>On date<AudienceDatePicker label="Start date" value={config.startDate} change={startDate=>onChange({startDate})}/></label></div>}<label className={styles.check}><input type="checkbox" checked={config.localTimeZone} onChange={event => onChange({ localTimeZone: event.target.checked })}/> Enter users into this Canvas in their local time zone</label></div>}<p className={styles.hint}>Next Send Time: {config.timing === "immediate" ? "As soon as launched" : config.startDate ? `${config.startDate} ${config.startTime}` : "No upcoming messages scheduled."}</p></> : config.type === "action" ? <><h3>Action Based Options</h3><p>Enter Users into Canvas who perform any of the following actions</p><p>Evaluate if user takes specified actions</p><div className={styles.inline}><select aria-label="Select Trigger" value={trigger} onChange={event => setTrigger(event.target.value)}><option value="">Select Trigger</option>{triggerTypes.map(value => <option key={value}>{value}</option>)}</select><button className={styles.outline} disabled={!trigger} onClick={() => { if (trigger && !config.triggers.includes(trigger)) onChange({triggers:[...config.triggers,trigger],triggerDetails:[...(config.triggerDetails??[]),{id:crypto.randomUUID(),type:trigger,...(canvasRecommendedEvents[trigger]?{eventName:canvasRecommendedEvents[trigger]}:{})}]}); setTrigger(""); }}>Add Trigger</button></div>{config.triggers.map(value => <div className={styles.selectedRow} key={value}>{value}<button onClick={() => onChange({triggers:config.triggers.filter(item=>item!==value),triggerDetails:(config.triggerDetails??[]).filter(item=>item.type!==value)})}><X size={15}/></button></div>)}<CanvasEntryTriggerDetails workspaceId={workspaceId} types={config.triggers} details={config.triggerDetails??[]} onChange={triggerDetails=>onChange({triggerDetails})}/><h3>Entry Window</h3><p>This sets the window during which users can enter the Canvas. They may continue to receive messages after this time window ends.</p><div className={styles.inline}><label className={styles.field}>Start Time (Required)<AudienceDatePicker label="Start date" value={config.startDate} change={startDate=>onChange({startDate})}/></label><label className={styles.field}>Time<input type="time" value={config.startTime} onChange={event => onChange({ startTime: event.target.value })}/></label></div><label className={styles.field}>Time zone<select value={config.timeZone} onChange={event => onChange({ timeZone: event.target.value })}><option>Company time - Eastern Time (US &amp; Canada)</option><option>UTC</option><option>Asia/Shanghai</option></select></label><label className={styles.check}><input type="checkbox" checked={config.endEnabled} onChange={event => onChange({ endEnabled: event.target.checked })}/> End Time (Optional)</label>{config.endEnabled && <div className={styles.inline}><AudienceDatePicker label="End date" value={config.endDate} change={endDate=>onChange({endDate})}/><input type="time" value={config.endTime} onChange={event => onChange({ endTime: event.target.value })}/></div>}</> : <><h3>API Trigger Options</h3><h4>Canvas ID</h4><p>This is the unique key for this Canvas. Use it to identify which Canvas to send in a request to the Canvas Trigger API.</p><div className={styles.copyField}><input readOnly value={canvasId}/><button onClick={onCopy}><Copy size={16}/> Copy</button></div><h4>Sending Canvases via cURL</h4><p>Call this workspace endpoint with user IDs and optional Canvas entry properties to enter users into an active API-triggered Canvas.</p><pre>{`POST /api/canvases/${canvasId}/trigger\n{ "workspaceId": "${workspaceId}", "userIds": ["user_1"], "properties": {} }`}</pre></>}</div>;
}

function FilterRows({ title, filters, onChange, capabilities, segments, workspaceId }: { title: string; filters: CanvasFilter[]; onChange: (next: CanvasFilter[]) => void; capabilities: CampaignFormCapabilities | null; segments: Segment[]; workspaceId: string }) {
  return <section className={styles.filterGroup} aria-label={title}><h4>{title}</h4>{filters.map(item => {
    const rule: AudienceRule = isCanvasProfileFilter(item) ? { ...item, operator: item.operator === "is_not" ? "not_equals" : "equals" } : item;
    return <div className={styles.audienceRule} key={item.id}><AudienceRuleEditor rule={rule} capabilities={capabilities} workspaceId={workspaceId} change={patch => onChange(filters.map(filter => filter.id === item.id ? { ...rule, ...patch } : filter))}/><button className={styles.addLink} aria-label={`Remove ${title} filter`} onClick={() => onChange(filters.filter(filter => filter.id !== item.id))}>Remove filter</button></div>;
  })}<FilterCatalog segments={segments.map(segment => segment.name)} events={capabilities?.events ?? []} attributes={capabilities?.attributes ?? []} capabilities={capabilities} select={field => onChange([...filters, createAudienceRule(field)])}/></section>;
}


function AudienceStep({ config, onChange, segments, workspaceId }: { config: CanvasWizardConfig["audience"]; onChange: (patch: Partial<CanvasWizardConfig["audience"]>) => void; segments: Segment[]; workspaceId: string }) {
  const [lookup, setLookup] = useState("");
  const [lookupResult, setLookupResult] = useState("");
  const currentLookup = useRef(lookup); currentLookup.current = lookup;
  const [capabilities, setCapabilities] = useState<CampaignFormCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [preview, setPreview] = useState<{total:number;matching:number;reachable:number} | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    let latest = 0;
    const load = async () => {
      const request = ++latest;
      try {
        const response = await fetch(`/api/campaigns/form-capabilities?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Could not load audience filter choices.");
        const result = await response.json();
        if (request === latest && !controller.signal.aborted) { setCapabilities(result); setCapabilityError(""); }
      } catch (cause) { if (request === latest && !controller.signal.aborted) setCapabilityError(cause instanceof Error ? cause.message : "Could not load audience filter choices."); }
    };
    setCapabilities(null); void load();
    const unsubscribe = subscribeTagChanges(detail => { if (detail.workspaceId === workspaceId) void load(); });
    return () => { controller.abort(); unsubscribe(); };
  }, [workspaceId]);
  useEffect(() => { previewRevision.current++; setPreview(null); setLookupResult(""); setPreviewError(""); setPreviewBusy(false); }, [config, workspaceId]);
  const calculate = async (withLookup = false) => {
    if (withLookup && !lookup.trim()) return;
    const requestedLookup = lookup.trim();
    const revision = ++previewRevision.current;
    setPreviewBusy(true); setPreviewError("");
    try {
      const response = await fetch("/api/canvases/audience-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience: config, workspaceId, ...(withLookup ? { lookup: lookup.trim() } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not calculate the Canvas audience.");
      if (revision !== previewRevision.current) return;
      setPreview({ total: result.total, matching: result.matching, reachable: result.reachable });
      if (withLookup && currentLookup.current.trim() === requestedLookup) setLookupResult(result.lookup?.userId ? `${result.lookup.userId} ${result.lookup.matchesFilters ? "matches" : "does not match"} the current entry audience.` : "No user found.");
    } catch (cause) { if (revision === previewRevision.current) setPreviewError(cause instanceof Error ? cause.message : "Could not calculate the Canvas audience."); }
    finally { if (revision === previewRevision.current) setPreviewBusy(false); }
  };
  return <div className={styles.card}><h2>Entry Audience</h2><p>Determine who will enter this Canvas. Conditions will not be re-evaluated at each step. Target users by choosing multiple segments they must fall into. Further refine your audience by adding additional filters.</p><CanvasSegmentPicker label="Target Users By Segment" selected={config.segmentIds} segments={segments} onChange={segmentIds => onChange({ segmentIds })}/><h3>Additional Filters</h3>{capabilityError && <p className={styles.error} role="alert">{capabilityError}</p>}<label className={styles.field}>Match filters<select value={config.filterOperator} onChange={event => onChange({ filterOperator: event.target.value as "AND" | "OR" })}><option>OR</option><option>AND</option></select></label><FilterRows capabilities={capabilities} segments={segments} workspaceId={workspaceId} title="Filter group" filters={config.filters} onChange={next => onChange({ filters: next })}/><FilterRows capabilities={capabilities} segments={segments} workspaceId={workspaceId} title="Exclusion group" filters={config.exclusionFilters} onChange={next => onChange({ exclusionFilters: next })}/><h4>Audience Summary</h4><p>{config.segmentIds.length || config.filters.length ? `${config.segmentIds.length} segment(s) and ${config.filters.length} filter(s) selected` : "No segments or filters selected"}</p><h4>User Lookup</h4><p>Check if a user matches the segment, filter, and app criteria</p><div className={styles.inline}><input aria-label="Look up user" placeholder="User ID or email" value={lookup} onChange={event => { setLookup(event.target.value); setLookupResult(""); }}/><button className={styles.outline} disabled={previewBusy || !lookup.trim()} onClick={() => void calculate(true)}>Lookup User</button></div>{lookupResult && <p role="status">{lookupResult}</p>}<h4>Entry Controls</h4><label className={styles.check}><input type="checkbox" checked={config.reentryEnabled} onChange={event => onChange({ reentryEnabled: event.target.checked })}/> Allow users to re-enter this Canvas</label>{config.reentryEnabled && <div className={styles.indent}><p>Re-eligibility timeframe</p><label className={styles.radio}><input type="radio" checked={config.reentryMode === "duration"} onChange={() => onChange({ reentryMode: "duration" })}/> Maximum Duration of Canvas</label><label className={styles.radio}><input type="radio" checked={config.reentryMode === "window"} onChange={() => onChange({ reentryMode: "window" })}/> Specified Window</label>{config.reentryMode === "window" && <div className={styles.inline}><input type="number" min="1" value={config.reentryValue} onChange={event => onChange({ reentryValue: Number(event.target.value) })}/><select value={config.reentryUnit} onChange={event => onChange({ reentryUnit: event.target.value as typeof config.reentryUnit })}><option>Hours</option><option>Days</option></select></div>}</div>}<label className={styles.check}><input type="checkbox" checked={config.volumeEnabled} onChange={event => onChange({ volumeEnabled: event.target.checked })}/> Limit entrance volume</label>{config.volumeEnabled && <div className={styles.indent}><label className={styles.field}>Maximum entries (Required)<input type="number" min="1" value={config.maxEntries || ""} onChange={event => onChange({ maxEntries: Number(event.target.value) })}/></label><p>Limit Cadence</p>{(["Hourly", "Daily", "Lifetime of Canvas"] as const).map(value => <label className={styles.radio} key={value}><input type="radio" checked={config.cadence === value} onChange={() => onChange({ cadence: value })}/>{value}</label>)}</div>}<hr/><h2>Exit Criteria</h2><p>Users will exit the Canvas if they perform an exception event or if they match the segments and filters. These users won&apos;t receive any further messages.</p><h4>Exceptions</h4><select aria-label="Add Exception" value="" onChange={event => { if (event.target.value) onChange({ exceptions: [...config.exceptions, event.target.value] }); }}><option value="">Select Trigger</option>{triggerTypes.map(value => <option key={value}>{value}</option>)}</select>{config.exceptions.map((value, index) => <div className={styles.selectedRow} key={`${value}-${index}`}>{value}<button onClick={() => onChange({ exceptions: config.exceptions.filter((_, itemIndex) => itemIndex !== index) })}><X size={15}/></button></div>)}<CanvasEntryTriggerDetails scope="exit" workspaceId={workspaceId} types={config.exceptions} details={config.exceptionDetails??[]} onChange={exceptionDetails=>onChange({exceptionDetails})}/><CanvasSegmentPicker label="Exit Segments" selected={config.exitSegmentIds} segments={segments} onChange={exitSegmentIds => onChange({ exitSegmentIds })}/><FilterRows capabilities={capabilities} segments={segments} workspaceId={workspaceId} title="Filters" filters={config.exitFilters} onChange={next => onChange({ exitFilters: next })}/><hr/><h2>Suppression Lists</h2><p>There are no suppression lists applied. Manage them in the workspace suppression-list settings.</p><h2>Total Population</h2><button className={styles.outline} disabled={previewBusy} onClick={() => void calculate()}>{previewBusy ? "Calculating…" : "Calculate audience"}</button>{preview && <p role="status">{preview.matching} matching users · {preview.reachable} reachable · {preview.total} total users</p>}{previewError && <p className={styles.error} role="alert">{previewError}</p>}</div>;
}

function SendSettingsStep({ config, onChange,workspaceId }: { workspaceId:string;config: CanvasWizardConfig["send"]; onChange: (patch: Partial<CanvasWizardConfig["send"]>) => void }) {
  const [workspaceQuietOpen,setWorkspaceQuietOpen]=useState(false);
  const rate=(value:number,change:(value:number)=>void)=><CanvasRatePicker value={value} change={change}/>;
  return <div className={styles.card}><h2>Send Settings</h2><p>Set message sending options for all steps within the Canvas.</p>
  <h3>Subscription Settings</h3><div className={styles.field}>Send to these users:<TagSingleSelect label="Send to these users:" value={config.subscriptionMode} change={value=>onChange({subscriptionMode:value as typeof config.subscriptionMode})} options={[{id:'subscribed_or_opted_in',label:'users who are subscribed or opted in'},{id:'opted_in_only',label:'users who are opted in'},{id:'all',label:'all users, including unsubscribed users'}]}/></div>
  <h3>Rate Limit</h3><label className={styles.check}><input type="checkbox" checked={config.rateEnabled} onChange={event=>onChange({rateEnabled:event.target.checked})}/>Limit the rate at which users will receive messages in this Canvas</label>
  {config.rateEnabled&&<div className={styles.indent}><label className={styles.radio}><input type="radio" name="canvas-rate-mode" checked={config.rateMode==='shared'} onChange={()=>onChange({rateMode:'shared'})}/>Set shared rate limit for all messages sent from this Canvas</label><label className={styles.radio}><input type="radio" name="canvas-rate-mode" checked={config.rateMode==='channel'} onChange={()=>onChange({rateMode:'channel'})}/>Set separate rate limit for each channel</label>{config.rateMode==='shared'?<div className={styles.field}>Maximum messages per minute{rate(config.ratePerMinute,ratePerMinute=>onChange({ratePerMinute}))}</div>:<>{config.channelLimits.map((item,index)=><div className={styles.filterRow} key={index}><TagSingleSelect label="Channel" value={item.channel} change={channel=>onChange({channelLimits:config.channelLimits.map((row,i)=>i===index?{...row,channel}:row)})} options={['Email','Push','SMS','In-app message','Content Card','Webhook','WhatsApp','LINE'].map(channel=>({id:channel,label:channel}))}/>{rate(item.perMinute,perMinute=>onChange({channelLimits:config.channelLimits.map((row,i)=>i===index?{...row,perMinute}:row)}))}<button aria-label="Remove channel rate limit" onClick={()=>onChange({channelLimits:config.channelLimits.filter((_,i)=>i!==index)})}><X size={15}/></button></div>)}<button className={styles.outline} onClick={()=>onChange({channelLimits:[...config.channelLimits,{channel:'',perMinute:500000}]})}>Add limit</button></>}</div>}
  <FrequencyCappingControls entity="Canvas" workspaceId={workspaceId} value={{...config}} onChange={patch=>onChange(patch)}/>
  <h3>Quiet Hours</h3><p>Messages are not sent during quiet hours. All times are in the recipient&apos;s local time zone. Quiet hours cannot exceed 20 hours.</p><label className={styles.check}><input type="checkbox" checked={config.quietEnabled} onChange={event=>onChange({quietEnabled:event.target.checked})}/>Enforce quiet hours for this Canvas</label>
  {config.quietEnabled&&<div className={styles.indent}><label className={styles.radio}><input type="radio" name="canvas-quiet-mode" checked={config.quietMode==='workspace'} onChange={()=>onChange({quietMode:'workspace'})}/>Use workspace quiet hours</label>{config.quietMode==='workspace'&&<div className={styles.hint}>Set quiet hours once for your whole workspace. <button type="button" className={styles.addLink} onClick={()=>setWorkspaceQuietOpen(true)}>Set up workspace quiet hours</button>. Any campaign or Canvas that uses them stays up to date when they change.</div>}<label className={styles.radio}><input type="radio" name="canvas-quiet-mode" checked={config.quietMode==='custom'} onChange={()=>onChange({quietMode:'custom'})}/>Use custom quiet hours</label>{config.quietMode==='custom'&&<div className={styles.inline}><label className={styles.field}>Start time<input type="time" value={config.quietStart} onChange={event=>onChange({quietStart:event.target.value})}/></label><label className={styles.field}>End time<input type="time" value={config.quietEnd} onChange={event=>onChange({quietEnd:event.target.value})}/></label></div>}<h4>Fallback behavior</h4><p>Do this if a message triggers during quiet hours</p><label className={styles.radio}><input type="radio" name="canvas-quiet-fallback" checked={config.quietFallback==='abort'} onChange={()=>onChange({quietFallback:'abort'})}/>Abort message</label><label className={styles.radio}><input type="radio" name="canvas-quiet-fallback" checked={config.quietFallback==='next_available'} onChange={()=>onChange({quietFallback:'next_available'})}/>Send at next available time</label></div>}
  {workspaceQuietOpen&&<CanvasQuietHours workspaceId={workspaceId} close={()=>setWorkspaceQuietOpen(false)}/>}
  </div>;
}
