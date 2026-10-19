import { type CanvasGraph, validateCanvasGraph } from "./canvas-model";

export const canvasSteps = ["basics", "entrySchedule", "audience", "sendSettings", "build", "summary"] as const;
export type CanvasStep = typeof canvasSteps[number];
export const canvasStepLabels: Record<CanvasStep, string> = {
  basics: "Basics", entrySchedule: "Entry Schedule", audience: "Target Audience",
  sendSettings: "Send Settings", build: "Build Canvas", summary: "Summary",
};

export type ConversionEvent = { id: string; type: string; appScope: string; deadline: number; unit: "Minutes" | "Hours" | "Days" };
export type CanvasFilter = { id: string; field: "country" | "lifecycle" | "emailSubscriptionStatus"; operator: "is" | "is_not"; value: string };
export type CanvasWizardConfig = {
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
    subscriptionMode: "subscribed_or_opted_in" | "opted_in_only" | "all";
    rateEnabled: boolean; rateMode: "shared" | "channel"; ratePerMinute: number;
    channelLimits: Array<{ channel: string; perMinute: number }>;
    quietEnabled: boolean; quietStart: string; quietEnd: string; quietFallback: "abort" | "next_available";
  };
};

export const defaultCanvasWizard: CanvasWizardConfig = {
  conversionEvents: [],
  entry: { type: "scheduled", timing: "designated", frequency: "", startDate: "", startTime: "10:00", localTimeZone: false, triggers: [], timeZone: "Company time - Eastern Time (US & Canada)", endEnabled: false, endDate: "", endTime: "10:00" },
  audience: { segmentIds: [], filters: [], filterOperator: "OR", exclusionFilters: [], exitSegmentIds: [], exitFilters: [], exceptions: [], reentryEnabled: false, reentryMode: "duration", reentryValue: 3, reentryUnit: "Days", volumeEnabled: false, maxEntries: 0, cadence: "Hourly" },
  send: { subscriptionMode: "subscribed_or_opted_in", rateEnabled: false, rateMode: "shared", ratePerMinute: 500000, channelLimits: [], quietEnabled: false, quietStart: "00:00", quietEnd: "08:00", quietFallback: "abort" },
};

function normalizeFilters(value: unknown): CanvasFilter[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === "object" && typeof item.id === "string" && ["country", "lifecycle", "emailSubscriptionStatus"].includes(item.field) && ["is", "is_not"].includes(item.operator) && typeof item.value === "string");
}

export function normalizeCanvasWizard(value: unknown): CanvasWizardConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultCanvasWizard);
  const input = value as Partial<CanvasWizardConfig>;
  const entry = input.entry && typeof input.entry === "object" ? input.entry : defaultCanvasWizard.entry;
  const audience = input.audience && typeof input.audience === "object" ? input.audience : defaultCanvasWizard.audience;
  const send = input.send && typeof input.send === "object" ? input.send : defaultCanvasWizard.send;
  return {
    conversionEvents: Array.isArray(input.conversionEvents) ? input.conversionEvents.slice(0, 4).filter(event => event && typeof event.id === "string" && typeof event.type === "string") : [],
    entry: { ...defaultCanvasWizard.entry, ...entry, triggers: Array.isArray(entry.triggers) ? entry.triggers.filter(value => typeof value === "string") : [] },
    audience: { ...defaultCanvasWizard.audience, ...audience,
      segmentIds: Array.isArray(audience.segmentIds) ? audience.segmentIds.filter(value => typeof value === "string") : [],
      filters: normalizeFilters(audience.filters),
      exclusionFilters: normalizeFilters(audience.exclusionFilters),
      exitSegmentIds: Array.isArray(audience.exitSegmentIds) ? audience.exitSegmentIds.filter(value => typeof value === "string") : [],
      exitFilters: normalizeFilters(audience.exitFilters),
      exceptions: Array.isArray(audience.exceptions) ? audience.exceptions.filter(value => typeof value === "string") : [] },
    send: { ...defaultCanvasWizard.send, ...send, channelLimits: Array.isArray(send.channelLimits) ? send.channelLimits.filter(item => item && typeof item.channel === "string" && typeof item.perMinute === "number") : [] },
  };
}

export function canvasWizardIssues(config: CanvasWizardConfig, graph: CanvasGraph): Array<{ step: CanvasStep; title: string; detail: string }> {
  const issues: Array<{ step: CanvasStep; title: string; detail: string }> = [];
  if (config.conversionEvents.length > 4) issues.push({ step: "basics", title: "Too many conversion events", detail: "A Canvas supports up to four conversion events." });
  for (const event of config.conversionEvents) if (!event.type || !Number.isFinite(event.deadline) || event.deadline <= 0) issues.push({ step: "basics", title: "Incomplete conversion event", detail: "Choose an event and a positive conversion deadline." });
  if (config.entry.type === "scheduled" && config.entry.timing === "designated" && !config.entry.frequency) issues.push({ step: "entrySchedule", title: "Entry frequency required", detail: "Choose Once, Daily, Weekly, or Monthly." });
  if (config.entry.type === "scheduled" && config.entry.timing === "designated" && config.entry.frequency && !config.entry.startDate) issues.push({ step: "entrySchedule", title: "Start date required", detail: "Choose a date for scheduled entry." });
  if (config.entry.type === "scheduled" && config.entry.timing === "designated") issues.push({ step: "entrySchedule", title: "Local simulation unavailable", detail: "Designated-time entry needs the scheduler; choose immediate entry for the local simulation." });
  if (config.entry.type === "action" && config.entry.triggers.length === 0) issues.push({ step: "entrySchedule", title: "No entry trigger", detail: "Add at least one action-based trigger." });
  if (config.entry.type === "action" && !config.entry.startDate) issues.push({ step: "entrySchedule", title: "Entry window required", detail: "Choose a start date for the entry window." });
  if (config.entry.type !== "scheduled") issues.push({ step: "entrySchedule", title: "Local simulation unavailable", detail: "Action-Based and API-Triggered entry require an event or API request; manual simulation cannot launch them." });
  if (config.audience.segmentIds.length === 0 && config.audience.filters.length === 0) issues.push({ step: "audience", title: "Empty entry audience", detail: "You must select at least one segment or at least one filter for Canvas entry." });
  for (const filter of [...config.audience.filters, ...config.audience.exclusionFilters, ...config.audience.exitFilters]) if (!filter.value) issues.push({ step: "audience", title: "Incomplete audience filter", detail: "Choose a value for every audience filter." });
  if (config.audience.volumeEnabled && (!Number.isInteger(config.audience.maxEntries) || config.audience.maxEntries <= 0)) issues.push({ step: "audience", title: "Maximum entries required", detail: "Enter a positive entrance limit." });
  if (config.audience.reentryEnabled && config.audience.reentryMode === "window" && config.audience.reentryValue <= 0) issues.push({ step: "audience", title: "Re-eligibility window required", detail: "Enter a positive re-entry window." });
  if (config.send.rateEnabled && config.send.rateMode === "shared" && (!Number.isInteger(config.send.ratePerMinute) || config.send.ratePerMinute <= 0)) issues.push({ step: "sendSettings", title: "Rate limit required", detail: "Enter a positive messages-per-minute limit." });
  if (config.send.rateEnabled && config.send.rateMode === "channel" && config.send.channelLimits.length === 0) issues.push({ step: "sendSettings", title: "Channel rate limit required", detail: "Add at least one channel limit." });
  if (config.send.rateEnabled && config.send.rateMode === "channel" && config.send.channelLimits.some(item => !item.channel || !Number.isInteger(item.perMinute) || item.perMinute <= 0)) issues.push({ step: "sendSettings", title: "Invalid channel rate limit", detail: "Choose a channel and a positive messages-per-minute limit." });
  if (config.send.quietEnabled && config.send.quietStart === config.send.quietEnd) issues.push({ step: "sendSettings", title: "Invalid quiet hours", detail: "Start and end times must differ." });
  if (config.send.rateEnabled) issues.push({ step: "sendSettings", title: "Local simulation unavailable", detail: "Rate limits need the asynchronous scheduler and are not supported by the local launch simulation." });
  if (config.send.quietEnabled) issues.push({ step: "sendSettings", title: "Local simulation unavailable", detail: "Quiet hours need the asynchronous scheduler and are not supported by the local launch simulation." });
  for (const detail of validateCanvasGraph(graph)) issues.push({ step: "build", title: "Canvas step error", detail });
  return issues;
}
