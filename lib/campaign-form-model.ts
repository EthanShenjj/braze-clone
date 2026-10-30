import type { MessageDraft } from "./campaign-shared.ts";

export type CampaignTiming = "now" | "designated" | "intelligent";
export function resolveCampaignTiming(draft: MessageDraft): CampaignTiming {
  const timing = (draft.config?.delivery as Record<string, unknown> | undefined)?.timing;
  return timing === "designated" || timing === "intelligent" ? timing : "now";
}
export type CampaignConversion = { type: string; app: string; deadline: number; unit: string; eventName?: string; campaignId?: string; properties?: Array<{key:string;value:string}> };
export const conversionCatalog = [
  { group: "General Activity", type: "Performs Custom Event", event: "", description: "A user performs a custom event tracked in this workspace." },
  { group: "General Activity", type: "Starts Session", event: "session_start", description: "A user opens an app or website and starts a session." },
  { group: "General Activity", type: "Upgrades App", event: "app_upgrade", description: "A user upgrades to a new app version." },
  { group: "eCommerce", type: "Views Product", event: "ecommerce.product_viewed", description: "A user views a product." },
  { group: "eCommerce", type: "Updates Cart", event: "ecommerce.cart_updated", description: "A user updates their shopping cart." },
  { group: "eCommerce", type: "Starts Checkout", event: "ecommerce.checkout_started", description: "A user starts checkout." },
  { group: "eCommerce", type: "Places Order", event: "ecommerce.order_placed", description: "A user places an order." },
  { group: "eCommerce", type: "Cancels Order", event: "ecommerce.order_cancelled", description: "A user cancels an order." },
  { group: "eCommerce", type: "Refunds Order", event: "ecommerce.order_refunded", description: "An order is refunded." },
] as const;
const conversionAliases: Record<string,string> = { "Make Purchase":"Makes Purchase", "Made Purchase":"Makes Purchase", "Start Session":"Starts Session", "Started Session":"Starts Session", "Perform Custom Event":"Performs Custom Event" };
export function resolveConversionEvents(draft: MessageDraft & { conversion?: string }): CampaignConversion[] {
  if (Array.isArray(draft.config?.conversionEvents)) return draft.config.conversionEvents.map(event => ({ ...event, type: conversionAliases[String(event.type)] ?? String(event.type), app: event.app === "Users from all apps" ? "" : String(event.app ?? ""), deadline: Number(event.deadline ?? 3), unit: String(event.unit ?? "Days") }));
  if(draft.channel==="api"&&!draft.conversion)return [];
  return [{ type: conversionAliases[draft.conversion ?? ""] ?? (draft.conversion || "Starts Session"), app: "", deadline: 3, unit: "Days" }];
}
export function conversionConfigurationIssues(draft: MessageDraft & { conversion?: string }) {
  const events = resolveConversionEvents(draft), issues: string[] = [];
  if ((!events.length && draft.channel!=="api") || events.length > 4) issues.push("Choose between 1 and 4 conversion events.");
  for (const event of events) {
    if (!conversionCatalog.some(c => c.type === event.type) && !["Makes Purchase","Opens Email","Clicks Email"].includes(event.type)) issues.push("Choose a supported conversion event.");
    if (event.type === "Performs Custom Event" && !event.eventName?.trim()) issues.push("Choose a custom conversion event.");
    if (!Number.isFinite(event.deadline) || event.deadline <= 0 || !["Days","Hours","Minutes"].includes(event.unit)) issues.push("Enter a positive conversion deadline and valid unit.");
    if (event.properties?.some(p => !p.key.trim() || !p.value.trim())) issues.push("Complete the conversion property filters.");
  }
  return [...new Set(issues)];
}
export const campaignTriggerCatalog = [
  {group:"GENERAL ACTIVITY",type:"Perform Custom Event",event:""},
  {group:"GENERAL ACTIVITY",type:"Start Session",event:"session_start"},
  {group:"GENERAL ACTIVITY",type:"Interact With Campaign",event:""},
  {group:"GENERAL ACTIVITY",type:"Interact With Step",event:"canvas_step_interaction"},
  {group:"GENERAL ACTIVITY",type:"Interact with Landing Page",event:"landing_page_interaction"},
  {group:"GENERAL ACTIVITY",type:"Perform Conversion Event",event:"campaign_conversion"},
  {group:"GENERAL ACTIVITY",type:"Perform Exception Event For Campaign",event:"campaign_exception"},
  {group:"PROFILE UPDATES",type:"Change Custom Attribute Value",event:"custom_attribute_changed"},
  {group:"PROFILE UPDATES",type:"Update Subscription Status",event:"subscription_status_changed"},
  {group:"PROFILE UPDATES",type:"Update Subscription Group Status",event:"subscription_group_status_changed"},
  {group:"PROFILE UPDATES",type:"Add an Email Address",event:"email_address_added"},
  {group:"ECOMMERCE",type:"View product",event:"ecommerce.product_viewed"},
  {group:"ECOMMERCE",type:"Update cart",event:"ecommerce.cart_updated"},
  {group:"ECOMMERCE",type:"Start checkout",event:"ecommerce.checkout_started"},
  {group:"ECOMMERCE",type:"Place order",event:"ecommerce.order_placed"},
  {group:"ECOMMERCE",type:"Cancel order",event:"ecommerce.order_cancelled"},
  {group:"ECOMMERCE",type:"Refund order",event:"ecommerce.order_refunded"},
  {group:"INBOUND MESSAGING",type:"Send an SMS inbound message",event:"inbound_sms"},
  {group:"INBOUND MESSAGING",type:"Send a WhatsApp inbound message",event:"inbound_whatsapp"},
  {group:"INBOUND MESSAGING",type:"Send a LINE inbound message",event:"inbound_line"},
  {group:"LOCATION",type:"Enter a Location",event:"location_entered"},
  {group:"LOCATION",type:"Trigger a Geofence",event:"geofence_triggered"},
] as const;
const legacyCampaignTriggerEvents:Record<string,string>={"Make Purchase":"purchase","Upgrade App":"app_upgrade","Update User Profile":"user_profile_updated","Change Subscription Status":"subscription_status_changed","Subscribe to Subscription Group":"subscription_group_subscribed","Exit Location":"location_exited","Enter Location":"location_entered","View Product":"ecommerce.product_viewed","Update Cart":"ecommerce.cart_updated","Start Checkout":"ecommerce.checkout_started","Place Order":"ecommerce.order_placed","Cancel Order":"ecommerce.order_cancelled","Refund Order":"ecommerce.order_refunded","Send Inbound SMS":"inbound_sms","Send Inbound WhatsApp Message":"inbound_whatsapp","Send Inbound LINE Message":"inbound_line"};
export function triggerEventName(type:string){return campaignTriggerCatalog.find(entry=>entry.type===type)?.event??legacyCampaignTriggerEvents[type]??type;}
export { audienceFilterCatalog,otherAudienceFilters } from "./campaign-filter-catalog.ts";
export function reentryDays(value:number, unit:string) { return value * ({Minutes:1/1440,Hours:1/24,Days:1,Weeks:7} as Record<string,number>)[unit]; }
export function delayMinutes(value:number,unit:string) { return value * ({seconds:1/60,minutes:1,hours:60,days:1440} as Record<string,number>)[unit]; }
export function campaignScheduleSummary(draft: MessageDraft) {
  const delivery = (draft.config?.delivery ?? {}) as Record<string,unknown>;
  if (draft.schedule === "API-triggered") return "Users enter via a Campaign trigger API request.";
  if (draft.schedule === "Action-based") return `Send ${Number(delivery.delayMinutes ?? 0) > 0 ? `${delivery.delayMinutes} minutes` : "immediately"} after trigger criteria are met. Campaign starts ${delivery.startDate ?? "today"} at ${delivery.sendTime ?? "10:00"} (${delivery.timezone ?? "UTC"}).`;
  if (resolveCampaignTiming(draft) === "now") return "Send as soon as Campaign is launched.";
  return `${resolveCampaignTiming(draft) === "intelligent" ? "Intelligent Timing" : "Send at a designated time"} · ${delivery.frequency ?? "One time"} · ${delivery.startDate ?? "Choose start date"} at ${delivery.sendTime ?? "10:00"} (${delivery.localTime ? "user's local time zone" : delivery.timezone ?? "UTC"}).`;
}
