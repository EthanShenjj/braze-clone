import { resolveLiquidPreview } from "./email-editor-model.ts";
import { normalizeLocale } from "./i18n.ts";
type LineCampaign = { body?: string; config?: Record<string, unknown> };
export type LineAction = { type: "uri" | "message" | "postback"; label: string; uri?: string; text?: string; data?: string };
export type LineArea = { x:number; y:number; width:number; height:number; action:LineAction };
export type LineMessage = { id?:string; type: string; text?: string; imageUrl?: string; altText?: string; flexJson?: string; width?:number;height?:number;areas?:LineArea[];cards?: Array<{ title: string; description?: string; imageUrl?: string; url: string; actions?: LineAction[] }> };
export function lineMessagesFor(campaign: LineCampaign): LineMessage[] { const values = (campaign.config?.channelValues ?? {}) as Record<string, unknown>; return Array.isArray(values.lineMessages) ? values.lineMessages as LineMessage[] : [{ type: "Text", text: campaign.body ?? "" }]; }
export function validateLineCampaign(campaign: LineCampaign) {
  const issues: string[] = []; const messages = lineMessagesFor(campaign); const https = (v?: string) => /^https:\/\/[^\s]+$/.test(v ?? "") || String(v).startsWith("/api/message-assets/") || /\{[{%]/.test(v??"");
  if (!messages.length || messages.length > 5) issues.push("LINE supports 1–5 messages in a stack.");
  for (const [i, m] of messages.entries()) {
    const prefix = `LINE message ${i + 1}: `;
    if (m.type === "Text" && (!m.text?.trim() || m.text.length > 5000)) issues.push(`${prefix}enter 1–5,000 text characters.`);
    else if (m.type === "Image" && !https(m.imageUrl)) issues.push(`${prefix}enter an HTTPS image URL.`);
    else if (m.type === "Flex message") { try { const value = JSON.parse(m.flexJson ?? ""); if (!["bubble", "carousel"].includes(value.type)) issues.push(`${prefix}Flex contents must be a bubble or carousel.`); } catch { issues.push(`${prefix}Flex JSON is invalid.`); } }
    else if (m.type === "Rich message") {
      if(!https(m.imageUrl))issues.push(`${prefix}enter an HTTPS rich message image URL.`);
      if(!m.areas?.length||m.areas.length>50)issues.push(`${prefix}add 1–50 clickable areas.`);
      for(const area of m.areas??[]) if([area.x,area.y,area.width,area.height].some(n=>!Number.isFinite(n)||n<0)||area.width<=0||area.height<=0||area.x+area.width>(m.width??1040)||area.y+area.height>(m.height??1040)||!validAction(area.action))issues.push(`${prefix}complete a valid clickable area and action.`);
    }
    else if (m.type === "Carousel" && (!m.cards?.length || m.cards.length > 10 || m.cards.some(c => !c.title?.trim() || !c.description?.trim() || (c.actions ? c.actions.length<1||c.actions.length>3||c.actions.some(a=>!validAction(a)) : !https(c.url))))) issues.push(`${prefix}add 1–10 columns with a title, description and 1–3 valid actions.`);
    else if (!["Text", "Image", "Flex message", "Carousel", "Rich message"].includes(m.type)) issues.push(`${prefix}unsupported message type.`);
  }
  return issues;
}
function validAction(a:LineAction){return Boolean(a&&a.label?.trim()&&a.label.length<=20&&(a.type==="uri"?/^https:\/\/[^\s]+$/.test(a.uri??""):a.type==="message"?a.text?.trim():a.type==="postback"?a.data?.trim():false));}
export function compileLineMessages(campaign: LineCampaign, user: Record<string, unknown> = {}) {
  const issues = validateLineCampaign(campaign); if (issues.length) throw new Error(issues.join(" "));
  const render = (text: string) => resolveLiquidPreview(text, user, normalizeLocale(String(user.language ?? "en")), undefined, true);
  const renderObject = (value: unknown): unknown => typeof value === "string" ? render(value) : Array.isArray(value) ? value.map(renderObject) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderObject(v)])) : value;
  return lineMessagesFor(campaign).map(m => {
    if (m.type === "Text") return { type: "text", text: render(m.text!) };
    if (m.type === "Image") return { type: "image", originalContentUrl: render(m.imageUrl!), previewImageUrl: render(m.imageUrl!) };
    if(m.type==="Rich message")return {type:"imagemap",baseUrl:render(m.imageUrl!),altText:render(m.altText||"Rich message"),baseSize:{width:m.width??1040,height:m.height??1040},actions:(m.areas??[]).map(a=>({type:a.action.type==="uri"?"uri":"message",...(a.action.type==="uri"?{linkUri:render(a.action.uri!)}:{text:render(a.action.text??a.action.data??"")}),area:{x:a.x,y:a.y,width:a.width,height:a.height}}))};
    if (m.type === "Flex message") { const parsed = JSON.parse(m.flexJson!); const { altText, ...contents } = parsed; return { type: "flex", altText: render(m.altText || altText || "Message"), contents: renderObject(contents) }; }
    return { type: "template", altText: render(m.altText || "Message carousel"), template: { type: "carousel", columns: m.cards!.map(c => ({ title: render(c.title), text: render(c.description!), ...(c.imageUrl ? { thumbnailImageUrl: render(c.imageUrl) } : {}), actions: (c.actions??[{type:"uri" as const,label:"Open",uri:c.url}]).map(a=>renderObject(a)) })) } };
  });
}
