export const inAppTriggerTypes = ["Perform Custom Event", "Start Session", "Interact With Campaign", "View Product", "Update Cart", "Start Checkout", "Place Order", "Cancel Order", "Refund Order"] as const;
export type TriggerType = typeof inAppTriggerTypes[number] | "Make Purchase";
export type PropertyCondition = { id: string; property: string; operator: string; value: string; valueType: "string" | "number" | "boolean" | "date" };
export type PropertyGroup = { id: string; match: "any" | "all"; conditions: PropertyCondition[] };
export type InAppTrigger = { id: string; type: TriggerType; eventName?: string; specificApp?: boolean; appId?: string; campaignId?: string; specificCampaign?: boolean; interaction?: string; filtersEnabled?: boolean; filterGroups?: PropertyGroup[] };
export type DeliveryMetadata = { events: Array<{ name: string; properties: Record<string, string> }>; apps: Array<{ id: string; name: string }>; campaigns: Array<{ id: string; name: string; status: string; channel: string; priority: string }> };

export function scheduleTriggers(delivery: Record<string, unknown>): InAppTrigger[] {
  if (Array.isArray(delivery.iamTriggers)) return delivery.iamTriggers.map((row, index) => ({ ...row, id: row.id || `trigger-${index}`, ...(row.type === "Start Session" ? { specificApp: row.specificApp ?? delivery.specificApp ?? false, appId: row.appId ?? delivery.appId ?? "" } : {}) }));
  return [{ id: "session", type: "Start Session", specificApp: Boolean(delivery.specificApp), appId: String(delivery.appId ?? "") }];
}

export function scheduleDelay(delivery: Record<string, unknown>) {
  const minutes = Number(delivery.delayMinutes ?? 0);
  return { mode: String(delivery.delayMode ?? (minutes > 0 ? "delay" : "immediately")), value: Number(delivery.delayValue ?? minutes), unit: String(delivery.delayUnit ?? "minutes") };
}

export function delayInMinutes(value: number, unit: string) { return unit === "seconds" ? value / 60 : unit === "hours" ? value * 60 : value; }

export function scheduleValidationIssues(delivery: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const triggers = scheduleTriggers(delivery);
  if (!triggers.length) issues.push("Add at least one trigger.");
  for (const trigger of triggers) {
    if (![...inAppTriggerTypes, "Make Purchase"].includes(trigger.type)) issues.push("Select a supported trigger.");
    if (trigger.type === "Perform Custom Event" && !trigger.eventName?.trim()) issues.push("Choose a custom event.");
    if (trigger.type === "Start Session" && trigger.specificApp && !trigger.appId) issues.push("Choose an app for the session trigger.");
    if (trigger.type === "Interact With Campaign" && trigger.specificCampaign && !trigger.campaignId) issues.push("Choose a campaign for the interaction trigger.");
    if (trigger.filtersEnabled) {
      if (!trigger.filterGroups?.length) issues.push("Add a property filter.");
      for (const group of trigger.filterGroups ?? []) {
        if (!group.conditions.length) issues.push("Add a property filter to each filter group.");
        for (const condition of group.conditions) {
          if (!condition.property.trim()) issues.push("Choose an event property.");
          if (!["exists", "does_not_exist"].includes(condition.operator) && !condition.value.trim()) issues.push("Enter a property filter value.");
          if (condition.valueType === "number" && !["exists", "does_not_exist"].includes(condition.operator) && (!condition.value.trim() || !Number.isFinite(Number(condition.value)))) issues.push("Enter a valid number for the property filter.");
        }
      }
    }
  }
  const delay = scheduleDelay(delivery);
  if (delay.mode === "delay" && (!Number.isFinite(delay.value) || delay.value <= 0 || !["seconds", "minutes", "hours"].includes(delay.unit))) issues.push("Enter a delay greater than zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(delivery.startDate ?? "")) || !/^\d{2}:\d{2}$/.test(String(delivery.sendTime ?? ""))) issues.push("Set the campaign start date and time.");
  if (delivery.endEnabled) {
    const start = new Date(`${delivery.startDate}T${delivery.sendTime}`), end = new Date(String(delivery.endTime ?? ""));
    if (!Number.isFinite(end.getTime()) || end <= start) issues.push("Set an end time after the campaign start.");
  }
  if (delivery.reeligible && (!Number.isFinite(Number(delivery.reentryValue ?? delivery.reentryDays)) || Number(delivery.reentryValue ?? delivery.reentryDays) <= 0)) issues.push("Enter a re-eligibility interval greater than zero.");
  return [...new Set(issues)];
}
