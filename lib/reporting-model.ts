export type ReportEvent = { id: string; campaign_id: string; campaign_name?: string; user_id: string; channel: string; event_type: string; created_at: string; data_json?: string };
export type ProfileEvent = { id: string; name: string; data: { userId?: string; createdAt?: string; productId?: string; price?: number; quantity?: number; currency?: string; properties?: Record<string, unknown> } };
export type ReportFilters = { from: string; to: string; channel: string; campaign: string };
export function filteredEvents(events: ReportEvent[], filters: ReportFilters) {
  return events.filter(e => e.created_at.slice(0, 10) >= filters.from && e.created_at.slice(0, 10) <= filters.to && (filters.channel === "All" || e.channel === filters.channel) && (!filters.campaign || e.campaign_id === filters.campaign));
}
export function messageSummary(events: ReportEvent[]) {
  const count = (type: string) => events.filter(e => e.event_type === type).length;
  const users = (type: string) => new Set(events.filter(e => e.event_type === type).map(e => e.user_id)).size;
  const delivered = count("delivered"), clicked = count("clicked"), opened = count("opened"), conversions = count("conversion");
  return { sent: count("sent") || delivered + count("failed"), delivered, opened, clicked, conversions, failed: count("failed"), suppressed: count("suppressed"), deferred: count("deferred"), uniqueOpens: users("opened"), uniqueClicks: users("clicked"), uniqueConversions: users("conversion"), deliveryRate: delivered + count("failed") ? delivered / (delivered + count("failed")) * 100 : 0, openRate: delivered ? opened / delivered * 100 : 0, clickRate: delivered ? clicked / delivered * 100 : 0, conversionRate: users("delivered") ? users("conversion") / users("delivered") * 100 : 0 };
}
export function groupMessages(events: ReportEvent[], dimension: "channel" | "campaign" | "day") {
  const groups = new Map<string, ReportEvent[]>();
  for (const e of events) { const key = dimension === "day" ? e.created_at.slice(0, 10) : dimension === "campaign" ? e.campaign_id : e.channel; groups.set(key, [...(groups.get(key) ?? []), e]); }
  return [...groups].map(([key, rows]) => ({ key, name: dimension === "campaign" ? rows[0].campaign_name || key : key, ...messageSummary(rows) })).sort((a, b) => dimension === "day" ? a.key.localeCompare(b.key) : b.delivered - a.delivered);
}
export function customEventSummary(events: ProfileEvent[], from: string, to: string, name = "") {
  const filtered = events.filter(e => !e.data.productId && (!name || e.name === name) && String(e.data.createdAt).slice(0, 10) >= from && String(e.data.createdAt).slice(0, 10) <= to);
  const groups = new Map<string, ProfileEvent[]>();
  for (const e of filtered) groups.set(e.name, [...(groups.get(e.name) ?? []), e]);
  return [...groups].map(([name, rows]) => ({ name, count: rows.length, uniqueUsers: new Set(rows.map(r => r.data.userId)).size, lastSeen: rows.map(r => String(r.data.createdAt)).sort().at(-1) ?? "" })).sort((a, b) => b.count - a.count);
}
export function revenueSummary(events: ProfileEvent[], from: string, to: string, currency: string) {
  const purchases = events.filter(e => e.data.productId && e.data.currency === currency && String(e.data.createdAt).slice(0, 10) >= from && String(e.data.createdAt).slice(0, 10) <= to);
  const amount = (e: ProfileEvent) => Number(e.data.price ?? 0) * Number(e.data.quantity ?? 1);
  const revenue = purchases.reduce((n, e) => n + amount(e), 0); const purchasers = new Set(purchases.map(e => e.data.userId)).size;
  const products = [...new Set(purchases.map(e => e.data.productId))].map(id => { const rows = purchases.filter(e => e.data.productId === id); return { product: String(id), purchases: rows.length, units: rows.reduce((n, r) => n + Number(r.data.quantity ?? 1), 0), revenue: rows.reduce((n, r) => n + amount(r), 0) }; }).sort((a, b) => b.revenue - a.revenue);
  return { revenue, purchases: purchases.length, purchasers, averagePurchase: purchases.length ? revenue / purchases.length : 0, products };
}
