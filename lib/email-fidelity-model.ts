/** Shared, serializable email composer settings; used by editors and delivery. */
export type EmailKeyValue = { key: string; value: string };
export type GmailPromotion = {
  companyLogo: string; subject: string; image: string;
  discountEnabled: boolean; offer: string; code: string; starts: string; ends: string;
  dealEnabled: boolean; dealUrl: string; dealPrice: string; dealCurrency: string;
  cardsEnabled: boolean; cards: Array<{ image: string; url: string; headline: string; price: string; currency: string }>;
};
export function normalizeGmailPromotion(value: unknown): GmailPromotion {
  const v = value && typeof value === 'object' ? value as Partial<GmailPromotion> : {};
  return { companyLogo: '', subject: '', image: '', discountEnabled: true, offer: '', code: '', starts: '', ends: '', dealEnabled: false, dealUrl: '', dealPrice: '', dealCurrency: 'USD', cardsEnabled: false, ...v, cards: Array.isArray(v.cards) ? v.cards.map(card => ({ ...card, image: String(card.image ?? ''), url: String(card.url ?? ''), headline: String(card.headline ?? ''), price: String(card.price ?? ''), currency: String(card.currency ?? 'USD') })) : [] };
}
const context = 'https://schema.org';
/** Escape '<' so a user-entered string cannot terminate the JSON-LD script. */
export function gmailPromotionHead(value: unknown, render: (value: string) => string = v => v): string {
  const raw = normalizeGmailPromotion(value);
  const v = Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,typeof value === "string" ? render(value) : value])) as GmailPromotion;
  v.cards = raw.cards.map(card=>Object.fromEntries(Object.entries(card).map(([key,value])=>[key,render(value)])) as GmailPromotion["cards"][number]);
  const annotations: Record<string, unknown>[] = [];
  if (v.companyLogo) annotations.push({ '@context': context, '@type': 'Organization', logo: v.companyLogo });
  if (v.subject) annotations.push({ '@context': context, '@type': 'EmailMessage', subjectLine: v.subject });
  if (v.image) annotations.push({ '@context': context, '@type': 'PromotionCard', image: v.image });
  if (v.discountEnabled && (v.offer || v.code)) annotations.push({ '@context': context, '@type': 'DiscountOffer', ...(v.offer ? { description: v.offer } : {}), ...(v.code ? { discountCode: v.code } : {}), ...(v.starts ? { availabilityStarts: v.starts } : {}), ...(v.ends ? { availabilityEnds: v.ends } : {}) });
  if (v.dealEnabled && v.dealUrl) annotations.push({ '@context': context, '@type': 'PromotionCard', url: v.dealUrl, ...(v.image ? { image: v.image } : {}), ...(v.dealPrice ? { price: v.dealPrice, priceCurrency: v.dealCurrency } : {}) });
  if (v.cardsEnabled) for (const [index, card] of v.cards.entries()) if (card.image || card.url) annotations.push({ '@context': context, '@type': 'PromotionCard', image: card.image, url: card.url, headline: card.headline, position: index + 1, ...(card.price ? { price: card.price, priceCurrency: card.currency } : {}) });
  return annotations.length ? `<script type="application/ld+json" data-braze-gmail-promotion="true">\n${JSON.stringify(annotations, null, 2).replaceAll('<', '\\u003c')}\n</script>` : '';
}
export function applyGmailPromotion(html: string, promotion: unknown, render: (value: string) => string = v => v): string {
  const clean = html.replace(/<script\b[^>]*data-braze-gmail-promotion=["']true["'][^>]*>[\s\S]*?<\/script>\n?/gi, '');
  const annotation = gmailPromotionHead(promotion, render);
  if (!annotation) return clean;
  if (/<\/head>/i.test(clean)) return clean.replace(/<\/head>/i, `${annotation}\n</head>`);
  if (/<html\b[^>]*>/i.test(clean)) return clean.replace(/(<html\b[^>]*>)/i, `$1<head>${annotation}</head>`);
  return `<!doctype html><html><head>${annotation}</head><body>${clean}</body></html>`;
}
const protectedHeaders = /^(?:from|to|bcc|cc|subject|reply-to|content-type|content-transfer-encoding|mime-version|list-unsubscribe(?:-post)?)$/i;
export function emailCustomHeaders(rows: unknown, render: (value: string) => string = v => v): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of Array.isArray(rows) ? rows as EmailKeyValue[] : []) {
    if (!row.key?.trim() && !row.value?.trim()) continue;
    const key = String(row.key).trim(), value = render(String(row.value ?? ''));
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key) || protectedHeaders.test(key)) throw new Error('Enter a valid custom header name. Standard delivery headers are managed in Sending Info.');
    if (/[\r\n]/.test(value)) throw new Error('Email header values cannot contain line breaks.');
    if (Object.keys(result).some(existing => existing.toLowerCase() === key.toLowerCase())) throw new Error(`Duplicate email header: ${key}`);
    Object.defineProperty(result,key,{value,enumerable:true,configurable:true});
  }
  return result;
}
export function emailExtras(rows: unknown, render: (value: string) => string = v => v): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of Array.isArray(rows) ? rows as EmailKeyValue[] : []) {
    if (!row.key?.trim() && !row.value?.trim()) continue;
    const key = String(row.key ?? '').trim();
    if (!key || Object.hasOwn(result, key)) throw new Error('Email extras require unique, nonempty keys.');
    Object.defineProperty(result, key, { value: render(String(row.value ?? '')), enumerable: true, configurable: true });
  }
  return result;
}
export function emailAttachmentIssue(file: { name: string; size?: number; content?: string; url?: string }): string {
  if (!file.name.trim()) return 'Enter a file name.';
  const decodedSize = file.content ? Math.floor(file.content.replace(/\s/g, '').length * 3 / 4) - (file.content.endsWith('==') ? 2 : file.content.endsWith('=') ? 1 : 0) : 0;
  if ((file.size ?? decodedSize) > 2 * 1024 * 1024 || decodedSize > 2 * 1024 * 1024) return 'Attachments must be 2 MB or smaller.';
  if (!file.content && !/^https:\/\//i.test(file.url ?? '') && !/^\/api\/message-assets\//.test(file.url ?? '')) return 'Use an HTTPS attachment URL or upload a file.';
  return '';
}
