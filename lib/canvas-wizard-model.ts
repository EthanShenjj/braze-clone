import {frequencyPolicy} from "./frequency-capping-model.ts";
import { type CanvasGraph, validateCanvasGraph } from "./canvas-model.ts";
import { audienceRuleIssues, type AudienceRule } from "./campaign-shared.ts";
import { findTagInteraction } from "./tag-interactions.ts";

export const canvasSteps = ["basics", "entrySchedule", "audience", "sendSettings", "build", "summary"] as const;
export type CanvasStep = typeof canvasSteps[number];
export const canvasStepLabels: Record<CanvasStep, string> = {
  basics: "Basics", entrySchedule: "Entry Schedule", audience: "Target Audience",
  sendSettings: "Send Settings", build: "Build Canvas", summary: "Summary",
};

export type {CanvasConversionFields as ConversionEvent} from './canvas-conversion-model.ts';
import {canvasConversionIssues,normalizeCanvasConversions,type CanvasConversionFields as ConversionEvent} from './canvas-conversion-model.ts';
export type CanvasProfileFilter = { id: string; field: "country" | "lifecycle" | "emailSubscriptionStatus"; operator: "is" | "is_not"; value: string };
export type CanvasTagFilter = Omit<AudienceRule, "field"> & { field: `receipt_tag_count:${string}` | `receipt_tag_last:${string}` };
export type CanvasFilter = CanvasProfileFilter | AudienceRule;
export function isCanvasProfileFilter(filter: CanvasFilter): filter is CanvasProfileFilter {
  return ["country", "lifecycle", "emailSubscriptionStatus"].includes(filter.field) && ["is", "is_not"].includes(filter.operator);
}
export function isCanvasTagFilter(filter: CanvasFilter): filter is CanvasTagFilter {
  return filter.field.startsWith("receipt_tag_count:") || filter.field.startsWith("receipt_tag_last:");
}
export type CanvasWizardConfig = {
  brief?:{id:string;name:string;size:number;type:string;url:string}|null;
  conversionEvents: ConversionEvent[];
  entry: {
    type: "scheduled" | "action" | "api";
    timing: "immediate" | "designated";
    frequency: "" | "Once" | "Daily" | "Weekly" | "Monthly";
    startDate: string; startTime: string; localTimeZone: boolean;
    triggers: string[]; timeZone: string; endEnabled: boolean; endDate: string; endTime: string;
  };
  audience: {
    segmentIds: string[]; filters: CanvasFilter[]; filterOperator: "AND" | "OR";
    exclusionFilters: CanvasFilter[]; exitSegmentIds: string[]; exitFilters: CanvasFilter[]; exceptions: string[];
    reentryEnabled: boolean; reentryMode: "duration" | "window"; reentryValue: number; reentryUnit: "Hours" | "Days";
    volumeEnabled: boolean; maxEntries: number; cadence: "Hourly" | "Daily" | "Lifetime of Canvas";
  };
  send: {
    frequencyCapping: boolean; excludeFromFrequencyCount: boolean; frequencyCategoryId: string;
    subscriptionMode: "subscribed_or_opted_in" | "opted_in_only" | "all";
    rateEnabled: boolean; rateMode: "shared" | "channel"; ratePerMinute: number;
    channelLimits: Array<{ channel: string; perMinute: number }>;
    quietEnabled: boolean; quietMode:"workspace"|"custom"; quietStart: string; quietEnd: string; quietFallback: "abort" | "next_available";
  };
};

export const defaultCanvasWizard: CanvasWizardConfig = {
  conversionEvents: [],
  entry: { type: "scheduled", timing: "designated", frequency: "", startDate: "", startTime: "10:00", localTimeZone: false, triggers: [], timeZone: "Company time - Eastern Time (US & Canada)", endEnabled: false, endDate: "", endTime: "10:00" },
  audience: { segmentIds: [], filters: [], filterOperator: "OR", exclusionFilters: [], exitSegmentIds: [], exitFilters: [], exceptions: [], reentryEnabled: false, reentryMode: "duration", reentryValue: 3, reentryUnit: "Days", volumeEnabled: false, maxEntries: 0, cadence: "Hourly" },
  send: {frequencyCapping:true,excludeFromFrequencyCount:false,frequencyCategoryId:"", subscriptionMode: "subscribed_or_opted_in", rateEnabled: false, rateMode: "shared", ratePerMinute: 500000, channelLimits: [], quietEnabled: false, quietMode:"workspace", quietStart: "00:00", quietEnd: "08:00", quietFallback: "next_available" },
};

function normalizeFilters(value: unknown): CanvasFilter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<CanvasFilter>(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.field !== "string" || typeof item.operator !== "string" || typeof item.value !== "string") return [];
    // Incomplete drafts must survive a save so the editor can explain missing choices.
    // Keep every shared rule parameter rather than narrowing Canvas to profile/tag rules.
    const params = item.params && typeof item.params === "object" && !Array.isArray(item.params)
      ? Object.fromEntries(Object.entries(item.params).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))) : undefined;
    return [{ id: item.id, field: item.field, operator: item.operator, value: item.value,
      ...(typeof item.value2 === "string" ? { value2: item.value2 } : {}),
      ...(typeof item.timeUnit === "string" ? { timeUnit: item.timeUnit } : {}),
      ...(typeof item.tagInteraction === "string" ? { tagInteraction: item.tagInteraction } : {}),
      ...(params ? { params } : {}) } as CanvasFilter];
  });
}

export function canvasTagFilterIssues(filter: CanvasTagFilter): string[] {
  const [kind, event, ...parts] = filter.field.split(":"), issues: string[] = [];
  if (!parts.join(":").trim()) issues.push("Choose a tag for the audience filter.");
  const last = kind === "receipt_tag_last";
  if (last ? event !== "delivered" : !["delivered", "engaged"].includes(event)) issues.push("Choose a supported tagged message filter.");
  if (event === "engaged" && !findTagInteraction(filter.tagInteraction)) issues.push("Choose an Interaction for the tagged message filter.");
  const operators = ["equals", "not_equals", "greater_than", "less_than", "greater_or_equal", "less_or_equal", "between", "not_between", "exists", "not_exists", ...(last ? ["less_than_ago", "more_than_ago"] : [])];
  if (!operators.includes(filter.operator)) issues.push("Choose a supported tagged message comparison.");
  issues.push(...audienceRuleIssues(filter));
  const relative = ["less_than_ago", "more_than_ago"].includes(filter.operator);
  if (!last && relative) issues.push("Relative time comparisons require a tagged last-message receipt filter.");
  if (relative) {
    if (!filter.value.trim() || !Number.isFinite(Number(filter.value)) || Number(filter.value) < 0) issues.push("Enter a time period of zero or more.");
    if (!["hours", "days", "weeks"].includes(filter.timeUnit ?? "")) issues.push("Choose hours, days or weeks for the audience filter.");
  }
  if (!last && !["exists", "not_exists"].includes(filter.operator)) {
    const values = ["between", "not_between"].includes(filter.operator) ? [filter.value, filter.value2 ?? ""] : [filter.value];
    if (values.some(value => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0)) issues.push("Enter a message count of zero or more.");
  }
  return issues;
}

export function normalizeCanvasWizard(value: unknown): CanvasWizardConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultCanvasWizard);
  const input = value as Partial<CanvasWizardConfig>;
  const entry = input.entry && typeof input.entry === "object" ? input.entry : defaultCanvasWizard.entry;
  const audience = input.audience && typeof input.audience === "object" ? input.audience : defaultCanvasWizard.audience;
  const send = input.send && typeof input.send === "object" ? input.send : defaultCanvasWizard.send;
  return {
    ...(input.brief===null?{brief:null}:input.brief&&typeof input.brief==='object'&&typeof input.brief.id==='string'&&typeof input.brief.name==='string'?{brief:{id:input.brief.id,name:input.brief.name,size:Number(input.brief.size)||0,type:String(input.brief.type??''),url:`/api/campaign-briefs/${encodeURIComponent(input.brief.id)}`}}:{}),
    conversionEvents: normalizeCanvasConversions(input.conversionEvents),
    entry: { ...defaultCanvasWizard.entry, ...entry, triggers: Array.isArray(entry.triggers) ? entry.triggers.filter(value => typeof value === "string") : [] },
    audience: { ...defaultCanvasWizard.audience, ...audience,
      segmentIds: Array.isArray(audience.segmentIds) ? audience.segmentIds.filter(value => typeof value === "string") : [],
      filters: normalizeFilters(audience.filters),
      exclusionFilters: normalizeFilters(audience.exclusionFilters),
      exitSegmentIds: Array.isArray(audience.exitSegmentIds) ? audience.exitSegmentIds.filter(value => typeof value === "string") : [],
      exitFilters: normalizeFilters(audience.exitFilters),
      exceptions: Array.isArray(audience.exceptions) ? audience.exceptions.filter(value => typeof value === "string") : [] },
    send: { ...defaultCanvasWizard.send, ...send,...frequencyPolicy(send as unknown as Record<string,unknown>), quietMode:send.quietMode==='workspace'||send.quietMode==='custom'?send.quietMode:send.quietEnabled?'custom':'workspace',channelLimits: Array.isArray(send.channelLimits) ? send.channelLimits.filter(item => item && typeof item.channel === "string" && typeof item.perMinute === "number") : [] },
  };
}

export function canvasWizardIssues(config: CanvasWizardConfig, graph: CanvasGraph): Array<{ step: CanvasStep; title: string; detail: string }> {
  const issues: Array<{ step: CanvasStep; title: string; detail: string }> = [];
  if (config.conversionEvents.length > 4) issues.push({ step: "basics", title: "Too many conversion events", detail: "A Canvas supports up to four conversion events." });
  for (const event of config.conversionEvents) if (!event.type || !Number.isFinite(event.deadline) || event.deadline <= 0) issues.push({ step: "basics", title: "Incomplete conversion event", detail: "Choose an event and a positive conversion deadline." });
  for(const event of config.conversionEvents)for(const detail of canvasConversionIssues(event))issues.push({step:'basics',title:'Incomplete conversion event',detail});
  if (config.entry.type === "scheduled" && config.entry.timing === "designated" && !config.entry.frequency) issues.push({ step: "entrySchedule", title: "Entry frequency required", detail: "Choose Once, Daily, Weekly, or Monthly." });
  if (config.entry.type === "scheduled" && config.entry.timing === "designated" && config.entry.frequency && !config.entry.startDate) issues.push({ step: "entrySchedule", title: "Start date required", detail: "Choose a date for scheduled entry." });
  if (config.entry.type === "scheduled" && config.entry.timing === "designated") issues.push({ step: "entrySchedule", title: "Local simulation unavailable", detail: "Designated-time entry needs the scheduler; choose immediate entry for the local simulation." });
  if (config.entry.type === "action" && config.entry.triggers.length === 0) issues.push({ step: "entrySchedule", title: "No entry trigger", detail: "Add at least one action-based trigger." });
  if (config.entry.type === "action" && !config.entry.startDate) issues.push({ step: "entrySchedule", title: "Entry window required", detail: "Choose a start date for the entry window." });
  if (config.entry.type !== "scheduled") issues.push({ step: "entrySchedule", title: "Local simulation unavailable", detail: "Action-Based and API-Triggered entry require an event or API request; manual simulation cannot launch them." });
  if (config.audience.segmentIds.length === 0 && config.audience.filters.length === 0) issues.push({ step: "audience", title: "Empty entry audience", detail: "You must select at least one segment or at least one filter for Canvas entry." });
  for (const filter of [...config.audience.filters, ...config.audience.exclusionFilters, ...config.audience.exitFilters]) {
    const details = isCanvasProfileFilter(filter)
      ? !filter.value.trim() ? ["Choose a value for every audience filter."] : []
      : isCanvasTagFilter(filter) ? canvasTagFilterIssues(filter) : audienceRuleIssues(filter);
    for (const detail of details) issues.push({ step: "audience", title: "Incomplete audience filter", detail });
  }
  if (config.audience.volumeEnabled && (!Number.isInteger(config.audience.maxEntries) || config.audience.maxEntries <= 0)) issues.push({ step: "audience", title: "Maximum entries required", detail: "Enter a positive entrance limit." });
  if (config.audience.reentryEnabled && config.audience.reentryMode === "window" && config.audience.reentryValue <= 0) issues.push({ step: "audience", title: "Re-eligibility window required", detail: "Enter a positive re-entry window." });
  if (config.send.rateEnabled && config.send.rateMode === "shared" && (!Number.isInteger(config.send.ratePerMinute) || config.send.ratePerMinute < 10||config.send.ratePerMinute>1000000)) issues.push({ step: "sendSettings", title: "Rate limit required", detail: "Choose a rate from 10 to 1,000,000 messages per minute." });
  if (config.send.rateEnabled && config.send.rateMode === "channel" && config.send.channelLimits.length === 0) issues.push({ step: "sendSettings", title: "Channel rate limit required", detail: "Add at least one channel limit." });
  if (config.send.rateEnabled && config.send.rateMode === "channel" && config.send.channelLimits.some(item => !item.channel || !Number.isInteger(item.perMinute) || item.perMinute < 10||item.perMinute>1000000)) issues.push({ step: "sendSettings", title: "Invalid channel rate limit", detail: "Choose a channel and a rate from 10 to 1,000,000 messages per minute." });
  if (config.send.quietEnabled && config.send.quietMode==='custom') {
    const minutes=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
    const duration=(minutes(config.send.quietEnd)-minutes(config.send.quietStart)+1440)%1440;
    if(!Number.isFinite(duration)||duration===0||duration>1200)issues.push({step:'sendSettings',title:'Invalid quiet hours',detail:'Choose valid start and end times with a quiet period of no more than 20 hours.'});
  }
  for (const detail of validateCanvasGraph(graph)) issues.push({ step: "build", title: "Canvas step error", detail });
  return issues;
}
