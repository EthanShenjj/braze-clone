export const frequencyChannels = ["any", "push", "email", "sms", "webhook", "whatsapp", "line", "kakao"] as const;
export type FrequencyChannel = typeof frequencyChannels[number];
export const frequencyChannelLabels: Record<FrequencyChannel, string> = { any: "All channels", push: "Push", email: "Email", sms: "SMS/MMS/RCS", webhook: "Webhook", whatsapp: "WhatsApp", line: "LINE", kakao: "KakaoTalk" };
export type FrequencyRule = { id: string; type: FrequencyChannel; messages: number; seconds: number; tagId?: string; categoryId?: string };
export type FrequencyCategory = { id: string; name: string };
export type FrequencySettings = { enabled: boolean; rules: FrequencyRule[]; categories: FrequencyCategory[] };
export type FrequencyPolicy = { frequencyCapping: boolean; excludeFromFrequencyCount: boolean; frequencyCategoryId: string };
export type FrequencySnapshot = { workspaceId: string; settings: FrequencySettings; updatedAt: string | null; capabilities: { canEdit: boolean; maxRules: number }; availableTags: Array<{ id: string; name: string; parentId: string | null }> };
export function frequencyChannel(value: string): FrequencyChannel | null {
  const name = value.toLowerCase().replace(/[ _-]/g, "");
  if (["any", "allchannels"].includes(name)) return "any";
  if (["push", "ios", "android", "webpush", "pushnotifications"].includes(name)) return "push";
  if (["sms", "mms", "rcs", "sms/mms/rcs"].includes(name)) return "sms";
  if (["whatsapp", "whats_app"].includes(name)) return "whatsapp";
  if (["kakao", "kakaotalk"].includes(name)) return "kakao";
  return (frequencyChannels as readonly string[]).includes(name) ? name as FrequencyChannel : null;
}
export function frequencyPolicy(input: Record<string, unknown> = {}): FrequencyPolicy {
  const frequencyCapping = input.frequencyCapping !== false && input.ignore_global_frequency_capping !== true;
  return { frequencyCapping, excludeFromFrequencyCount: !frequencyCapping && (input.excludeFromFrequencyCount !== undefined ? input.excludeFromFrequencyCount === true : input.exclude_from_global_frequency_count !== undefined ? input.exclude_from_global_frequency_count === true : true), frequencyCategoryId: typeof input.frequencyCategoryId === "string" ? input.frequencyCategoryId : "" };
}
export function frequencySettings(value: unknown): FrequencySettings {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const categories = (Array.isArray(data.categories) ? data.categories : []) as FrequencyCategory[];
  const rules = (Array.isArray(data.rules) ? data.rules : []).flatMap((item, index): FrequencyRule[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>, type = frequencyChannel(String(row.type ?? row.kind ?? ""));
    if (!type) return [];
    return [{ id: String(row.id ?? `legacy-${index}`), type, messages: Number(row.messages ?? row.limit), seconds: Number(row.seconds ?? (row.window === "per week" ? 604800 : row.window === "per month" ? 2592000 : 86400)), ...(row.tagId ? { tagId: String(row.tagId) } : {}), ...(row.categoryId ? { categoryId: String(row.categoryId) } : {}) }];
  });
  return { enabled: data.enabled === true, rules, categories };
}
export function validateFrequencySettings(input: unknown, maxRules = 10): FrequencySettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid frequency capping settings.");
  const data = input as Record<string, unknown>;
  if (typeof data.enabled !== "boolean" || !Array.isArray(data.rules)) throw new Error("Choose an enabled state and a rules array.");
  if (data.rules.length > maxRules) throw new Error(`A workspace supports at most ${maxRules} frequency capping rules.`);
  for (const item of data.rules) {
    if (!item || typeof item !== "object" || !frequencyChannel(String(item.type ?? item.kind ?? ""))) throw new Error("Choose a supported frequency capping channel.");
    for (const field of ["tagId", "categoryId"]) if (item[field] !== undefined && (typeof item[field] !== "string" || !item[field].trim())) throw new Error("Choose valid rule filters.");
  }
  const settings = frequencySettings(data), ids = new Set<string>();
  for (const rule of settings.rules) {
    if (!rule.id.trim() || ids.has(rule.id)) throw new Error("Rule identifiers must be unique.");
    ids.add(rule.id);
    if (!Number.isSafeInteger(rule.messages) || rule.messages < 1) throw new Error("Maximum messages must be a positive whole number.");
    if (!Number.isSafeInteger(rule.seconds) || rule.seconds < 60 || rule.seconds % 60 || rule.seconds > 2592000) throw new Error("Choose a whole-minute window between 1 minute and 30 days.");
  }
  if (!Array.isArray(data.categories ?? [])) throw new Error("Categories must be an array.");
  const categoryIds = new Set<string>(), names = new Set<string>();
  for (const category of settings.categories) {
    if (!category || typeof category.id !== "string" || !category.id.trim() || typeof category.name !== "string" || !category.name.trim() || category.name.length > 100 || categoryIds.has(category.id) || names.has(category.name.trim().toLowerCase())) throw new Error("Categories need unique identifiers and names (up to 100 characters).");
    categoryIds.add(category.id); names.add(category.name.trim().toLowerCase());
  }
  for (const rule of settings.rules) if (rule.categoryId && !categoryIds.has(rule.categoryId)) throw new Error("Choose an available message category.");
  return settings;
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  if (!formatters.has(zone)) { try { formatters.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })); } catch { return formatter("UTC"); } }
  return formatters.get(zone)!;
}
function localDate(at: number, zone: string) {
  const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return [Number(parts.year), Number(parts.month), Number(parts.day)];
}
// Days/weeks are trailing local calendar dates, including the current date.
// Binary search finds the real midnight through DST and skipped local midnights.
export function frequencyWindowStart(timestamp: string, seconds: number, zone = "UTC") {
  const at = Date.parse(timestamp);
  if (!Number.isFinite(at)) throw new Error("Invalid frequency evaluation time.");
  if (seconds % 86400 !== 0) return new Date(at - seconds * 1000).toISOString();
  const [y, m, d] = localDate(at, zone), target = new Date(Date.UTC(y, m - 1, d - seconds / 86400 + 1));
  const key = target.getUTCFullYear() * 10000 + (target.getUTCMonth() + 1) * 100 + target.getUTCDate();
  let lo = target.getTime() - 36 * 3600000, hi = target.getTime() + 36 * 3600000;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2), [a, b, c] = localDate(mid, zone); if (a * 10000 + b * 100 + c < key) lo = mid; else hi = mid; }
  return new Date(hi).toISOString();
}
export function frequencyWindowLabel(seconds: number) { const unit = seconds % 604800 === 0 ? 604800 : seconds % 86400 === 0 ? 86400 : 60; return `${seconds / unit} ${unit === 604800 ? "week(s)" : unit === 86400 ? "day(s)" : "minute(s)"}`; }
