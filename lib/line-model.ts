import { resolveLiquidPreview } from "./email-editor-model.ts";
import { normalizeLocale } from "./i18n.ts";
type LineCampaign = { body?: string; config?: Record<string, unknown> };
export type LineMessage = { type: string; text?: string; imageUrl?: string; altText?: string; flexJson?: string; cards?: Array<{ title: string; description?: string; imageUrl?: string; url: string }> };
export function lineMessagesFor(campaign: LineCampaign): LineMessage[] { const values = (campaign.config?.channelValues ?? {}) as Record<string, unknown>; return Array.isArray(values.lineMessages) ? values.lineMessages as LineMessage[] : [{ type: "Text", text: campaign.body ?? "" }]; }
export function validateLineCampaign(campaign: LineCampaign) {
  const issues: string[] = []; const messages = lineMessagesFor(campaign); const https = (v?: string) => /^https:\/\/[^\s]+$/.test(v ?? "");
  if (!messages.length || messages.length > 5) issues.push("LINE supports 1–5 messages in a stack.");
  for (const [i, m] of messages.entries()) {
    const prefix = `LINE message ${i + 1}: `;
    if (m.type === "Text" && (!m.text?.trim() || m.text.length > 5000)) issues.push(`${prefix}enter 1–5,000 text characters.`);
    else if (m.type === "Image" && !https(m.imageUrl)) issues.push(`${prefix}enter an HTTPS image URL.`);
    else if (m.type === "Flex message") { try { const value = JSON.parse(m.flexJson ?? ""); if (!["bubble", "carousel"].includes(value.type)) issues.push(`${prefix}Flex contents must be a bubble or carousel.`); } catch { issues.push(`${prefix}Flex JSON is invalid.`); } }
    else if (m.type === "Carousel" && (!m.cards?.length || m.cards.length > 10 || m.cards.some(c => !c.title?.trim() || !c.description?.trim() || !https(c.url)))) issues.push(`${prefix}add 1–10 columns with a title, description and HTTPS action URL.`);
    else if (!["Text", "Image", "Flex message", "Carousel"].includes(m.type)) issues.push(`${prefix}unsupported message type.`);
  }
  return issues;
}
export function compileLineMessages(campaign: LineCampaign, user: Record<string, unknown> = {}) {
  const issues = validateLineCampaign(campaign); if (issues.length) throw new Error(issues.join(" "));
  const render = (text: string) => resolveLiquidPreview(text, user, normalizeLocale(String(user.language ?? "en")), undefined, true);
  const renderObject = (value: unknown): unknown => typeof value === "string" ? render(value) : Array.isArray(value) ? value.map(renderObject) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderObject(v)])) : value;
  return lineMessagesFor(campaign).map(m => {
    if (m.type === "Text") return { type: "text", text: render(m.text!) };
    if (m.type === "Image") return { type: "image", originalContentUrl: render(m.imageUrl!), previewImageUrl: render(m.imageUrl!) };
    if (m.type === "Flex message") { const parsed = JSON.parse(m.flexJson!); const { altText, ...contents } = parsed; return { type: "flex", altText: render(m.altText || altText || "Message"), contents: renderObject(contents) }; }
    return { type: "template", altText: render(m.altText || "Message carousel"), template: { type: "carousel", columns: m.cards!.map(c => ({ title: render(c.title), text: render(c.description!), ...(c.imageUrl ? { thumbnailImageUrl: render(c.imageUrl) } : {}), actions: [{ type: "uri", label: "Open", uri: render(c.url) }] })) } };
  });
}
