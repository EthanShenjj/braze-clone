export type MessageDraft = { id?: string; name?: string; channel: string; subject?: string; body?: string; schedule?: string; status?: string; audience?: string; config?: Record<string, unknown> };
export type MessageVariant = { id: string; name: string; subject?: string; body?: string; config?: Record<string, unknown>; [key: string]: unknown };
export const variantLimit = 8;
export const multichannelChannels = { Email: "email", "Push notification": "push", "Content Card": "content", "SMS/MMS/RCS": "sms", Webhook: "webhook", WhatsApp: "whatsapp", LINE: "line" } as const;
export const variantKey = (channel: string) => ({ email: "variants", iam: "iamVariants", sms: "smsVariants", webhook: "webhookVariants", whatsapp: "whatsappVariants" }[channel] ?? "messageVariants");
export function campaignVariants(campaign: MessageDraft): MessageVariant[] {
  const stored = campaign.channel==="webhook" ? (campaign.config?.channelValues as Record<string,unknown>|undefined)?.webhookVariants??campaign.config?.webhookVariants : campaign.config?.[variantKey(campaign.channel)];
  return Array.isArray(stored) && stored.length ? stored as MessageVariant[] : [{ id: `${campaign.channel}_variant_1`, name: "Variant 1", subject: campaign.subject, body: campaign.body }];
}
export function variantDraft<T extends MessageDraft>(campaign: T, index = 0): T {
  const variant = campaignVariants(campaign)[index] ?? campaignVariants(campaign)[0];
  const baseConfig = { ...campaign.config };
  if (campaign.channel === "email" && index > 0) for (const key of Object.keys(baseConfig)) if (key.startsWith("email")) delete baseConfig[key];
  const config = { ...baseConfig, ...variant.config };
  config.previewVariantId = variant.id;
  if (["iam", "whatsapp", "webhook"].includes(campaign.channel)) config[variantKey(campaign.channel)] = [variant];
  if(campaign.channel==="webhook")config.channelValues={...(campaign.config?.channelValues as object??{}),webhookVariants:[variant]};
  if (variant.values) config.channelValues = variant.values;
  if (campaign.channel === "email") {
    const fields: Record<string, string> = { rows: "emailRows", sending: "emailSending", style: "emailStyle", editorMode: "emailEditorMode", editorEngine: "emailEditorEngine", grapesProject: "emailGrapesProject", mjml: "emailMjml", plainText: "emailPlainText", plainTextCustomized: "emailPlainTextCustomized", amp: "emailAmp" };
    for (const [key, field] of Object.entries(fields)) if (variant[key] !== undefined) config[field] = variant[key];
  }
  return { ...campaign, subject: variant.subject ?? (campaign.channel === "email" && index > 0 ? undefined : campaign.subject), body: variant.body ?? (campaign.channel === "email" && index > 0 ? undefined : campaign.body), config };
}
export function allocation(campaign: MessageDraft) {
  const count = campaignVariants(campaign).length;
  const control = Number(campaign.config?.controlGroup ?? 20);
  const stored = campaign.config?.variantSplits;
  return { control, weights: Array.isArray(stored) && stored.length === count ? stored.map(Number) : Array.from({ length: count }, () => (100 - control) / count) };
}
export function allocationIssues(campaign: MessageDraft): string[] {
  if (["multichannel", "operator", "feature", "api"].includes(campaign.channel)) return [];
  const variants = campaignVariants(campaign), { control, weights } = allocation(campaign);
  const issues: string[] = [];
  if (variants.length > variantLimit) issues.push("A Campaign supports at most 8 message variants.");
  if (new Set(variants.map(v => v.id)).size !== variants.length) issues.push("Message variant IDs must be unique.");
  if (!Number.isFinite(control) || control < 0 || control > 100 || weights.some(v => !Number.isFinite(v) || v < 0 || v > 100)) issues.push("Variant and control percentages must be between 0 and 100.");
  if (Array.isArray(campaign.config?.variantSplits) && campaign.config.variantSplits.length !== variants.length) issues.push("Assign a percentage to every message variant.");
  if (Math.abs(control + weights.reduce((a, b) => a + b, 0) - 100) > 0.01) issues.push("Variant percentages and control group must total 100%.");
  return issues;
}
// unit is a deterministic bucket within the treatment population, in [0, 1).
export function pickVariant(campaign: MessageDraft, unit: number) {
  const { weights } = allocation(campaign), total = weights.reduce((a, b) => a + b, 0);
  if (allocationIssues(campaign).length || total <= 0) throw new Error("Invalid variant allocation.");
  let cursor = Math.min(1 - Number.EPSILON, Math.max(0, unit)) * total;
  for (let i = 0; i < weights.length; i++) { cursor -= weights[i]; if (cursor < 0) return i; }
  return weights.length - 1;
}
export function hasLiquid(value: unknown) { return /\{[{%]/.test(String(value ?? "")); }
export function validDestination(value: unknown, httpsOnly = false) {
  if (hasLiquid(value)) return true;
  try { const url = new URL(String(value)); return httpsOnly ? url.protocol === "https:" : /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol) && !["javascript:", "data:", "vbscript:"].includes(url.protocol); } catch { return false; }
}
export type AudienceRule = { id: string; field: string; operator: "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "exists" | "not_exists"; value: string };
export type AudienceGroup = { id: string; name?: string; operator: "AND" | "OR"; exclude: boolean; rules: AudienceRule[] };
export function matchesRule(user: Record<string, unknown>, rule: AudienceRule) {
  const attrs = user.attributes as Record<string, unknown> | undefined;
  const actual = rule.field.startsWith("attr:") ? attrs?.[rule.field.slice(5)] : user[rule.field];
  if (rule.operator === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (rule.operator === "not_exists") return actual === undefined || actual === null || actual === "";
  if (rule.operator === "greater_than") return Number(actual) > Number(rule.value);
  if (rule.operator === "less_than") return Number(actual) < Number(rule.value);
  const a = String(actual ?? "").toLowerCase(), b = rule.value.toLowerCase();
  return rule.operator === "equals" ? a === b : rule.operator === "not_equals" ? a !== b : rule.operator === "contains" ? a.includes(b) : !a.includes(b);
}
export function matchesAudienceGroups(user: Record<string, unknown>, groups: AudienceGroup[]) {
  return groups.every(group => { const result = !group.rules.length || (group.operator === "OR" ? group.rules.some(rule => matchesRule(user, rule)) : group.rules.every(rule => matchesRule(user, rule))); return group.exclude ? !result : result; });
}
export function audienceConfigurationIssues(campaign: MessageDraft) {
  const groups = campaign.config?.audienceGroups;
  if (groups === undefined) return [];
  if (!Array.isArray(groups) || groups.length > 30) return ["Invalid audience filter groups."];
  return groups.flatMap(group => !group || !["AND", "OR"].includes(group.operator) || !Array.isArray(group.rules) || !group.rules.length || group.rules.length > 30 ? ["Add at least one valid filter to each group."] : group.rules.flatMap((rule: AudienceRule) => !rule.field || !["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than", "exists", "not_exists"].includes(rule.operator) || !["exists", "not_exists"].includes(rule.operator) && !rule.value?.trim() ? ["Complete the audience filter field, operator and value."] : []));
}
