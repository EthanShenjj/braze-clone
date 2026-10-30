import juice from "juice";
import { applyGmailPromotion, emailCustomHeaders, emailExtras, emailAttachmentIssue } from "./email-fidelity-model.ts";
import { htmlToPlainText, renderBrazeLiquid } from "./email-liquid.ts";
import { emailPreferenceCampaignDefaults, type EmailPreferences } from "./email-preferences.ts";
import { campaignVariants, variantDraft } from "./campaign-shared.ts";

export type EmailMessage = { subject?: string; body?: string; config?: Record<string, unknown> };
export type RuntimeEmailAttachment={name:string;url?:string;mime?:string;content?:string;size?:number};
export function resolvedEmailSending(message: EmailMessage, preferences: EmailPreferences): Record<string,unknown> {
  const provided=(message.config?.emailSending??{}) as Record<string,unknown>;
  const sender=preferences.sending.senders.find(row=>`${row.localPart}@${row.domain}`.toLowerCase()===String(provided.fromAddress??'').toLowerCase());
  return {...emailPreferenceCampaignDefaults(preferences).emailSending,...(sender?{fromName:sender.displayName,ipPool:sender.ipPool}:{}),...provided};
}
/** Isolated variants inherit workspace defaults, never the primary variant's policy settings. */
export function emailVariantSendingIssues(message: EmailMessage, preferences: EmailPreferences): string[] {
  const campaign={...message,channel:'email'},variants=campaignVariants(campaign);
  return variants.flatMap((variant,index)=>emailSendingIssues(variantDraft(campaign,index),preferences).map(issue=>variants.length>1?`${variant.name}: ${issue}`:issue));
}
export function localizedEmailField(fallback: string, translations: unknown, locale: unknown): string {
  const values=translations&&typeof translations==='object'&&!Array.isArray(translations)?translations as Record<string,unknown>:{};
  const normalized=String(locale??'en').trim().replaceAll('_','-').toLowerCase(),base=normalized.split('-')[0];
  const candidates=[normalized,base,...(base==='zh'?['zh-cn']:[])];
  for(const candidate of candidates){const key=Object.keys(values).find(key=>key.toLowerCase().replaceAll('_','-')===candidate);const value=key===undefined?undefined:values[key];if(typeof value==='string'&&value.trim())return value;}
  return fallback;
}
const decodeEmailHref=(value:string)=>value.replace(/&amp;|&#0*38;|&#x0*26;/gi,'&');
const escapeEmailHref=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function appendEmailAnalytics(html:string,sending:Record<string,unknown>,render:(value:string)=>string):string {
  if(sending.gaEnabled!==true)return html;
  const parameters=Object.entries({utm_source:sending.utmSource,utm_medium:sending.utmMedium,utm_campaign:sending.utmCampaign,utm_term:sending.utmTerm,utm_content:sending.utmContent}).map(([key,value])=>[key,render(String(value??''))] as const).filter(([,value])=>value.trim());
  if(!parameters.length)return html;
  return html.replace(/(<a\b[^>]*\bhref=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi,(match,before,url,after)=>{try{const destination=new URL(decodeEmailHref(url));for(const [key,value] of parameters)destination.searchParams.set(key,value);return before+escapeEmailHref(destination.toString())+after;}catch{return match;}});
}
export function emailSendingIssues(message: EmailMessage, preferences: EmailPreferences) {
  const sending = resolvedEmailSending(message, preferences);
  const issues: string[] = [];
  try { emailCustomHeaders(sending.headers); emailExtras(sending.extras); } catch(error) { issues.push(error instanceof Error ? error.message : "Invalid email settings."); }
  if (preferences.sending.requireListedAddresses) {
    if (!preferences.sending.senders.some(row => `${row.localPart}@${row.domain}`.toLowerCase() === String(sending.fromAddress ?? "").toLowerCase())) issues.push("From address must be one of the workspace's listed addresses.");
    const reply = String(sending.replyTo ?? "");
    if (reply && !reply.startsWith("Exclude reply-to") && !preferences.sending.replyTo.some(row => row.address.toLowerCase() === reply.toLowerCase())) issues.push("Reply-To must be one of the workspace's listed addresses.");
  }
  if (preferences.sending.requireBcc && !preferences.sending.bcc.some(row => row.address.toLowerCase() === String(sending.bcc === "workspace_default" ? preferences.sending.bcc.find(entry => entry.id === preferences.sending.defaultBccId)?.address ?? "" : sending.bcc ?? "").toLowerCase())) issues.push("Choose a listed BCC address. BCC is required by this workspace.");
  return issues;
}
export type EmailRuntimeContext = { profile: Record<string, unknown>; unsubscribeUrl: string; optInUrl: string; pixelUrl?: string; kind?: "test" | "seed" | "campaign"; render?: (source: string) => string; trackLink?: (url: string, alias: string) => string; attachments?:RuntimeEmailAttachment[] };
export function compileWorkspaceEmail(message: EmailMessage, preferences: EmailPreferences, context: EmailRuntimeContext) {
  const profile: Record<string, unknown> = { ...context.profile, unsubscribe_url: context.unsubscribeUrl, unsubscribe_link: context.unsubscribeUrl, optin_url: context.optInUrl, opt_in_url: context.optInUrl };
  const render = (source: string) => renderBrazeLiquid(context.render ? context.render(source) : source, profile);
  const footer = preferences.pages.footer.enabled ? render(preferences.pages.footer.html) : "";
  const source = String(message.body ?? "").replace(/\{\{\s*\$\{email_footer\}\s*\}\}/g, () => footer);
  let html = render(source);
  const style = message.config?.emailStyle as Record<string, unknown> | undefined;
  if (style && !/<html\b/i.test(html)) {
    const attribute = (value: unknown) => String(value ?? "").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    const content = /<[a-z][^>]*>/i.test(html) ? html : html.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>");
    html = `<html><head><style>a{color:${attribute(style.linkColor ?? preferences.editor.linkColor)}}</style></head><body style="margin:0;background:${attribute(style.canvasBg ?? preferences.editor.canvasBg)};font-family:${attribute(style.fontFamily ?? preferences.editor.fontFamily)};color:${attribute(style.textColor ?? preferences.editor.paragraph.color)}"><div style="max-width:${Number(style.contentWidth) || 600}px;margin:auto;background:${attribute(style.contentBg ?? preferences.editor.contentBg)}">${content}</div></body></html>`;
  }
  const sending = resolvedEmailSending(message, preferences);
  const headers: Record<string, string> = emailCustomHeaders(sending.headers, render);
  const extras = emailExtras(sending.extras, render);
  html = applyGmailPromotion(html, message.config?.emailGmailPromotion, render);
  const preheader = render(localizedEmailField(String(sending.preheader ?? ""),sending.preheaderTranslations,profile.language??profile.locale));
  if (preheader) {
    const escaped = preheader.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const preview = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" data-email-preheader="true">${escaped}${sending.whitespace ? "&nbsp;&zwnj;".repeat(60) : ""}</div>`;
    html = /<body\b/i.test(html) ? html.replace(/(<body\b[^>]*>)/i, `$1${preview}`) : preview + html;
  }
  const headerEnabled = ["Do not include", "Disabled"].includes(String(sending.unsubscribe)) ? false : ["Include", "Enabled"].includes(String(sending.unsubscribe)) ? true : preferences.sending.unsubscribeHeader;
  if (headerEnabled && profile.subscribed !== false) {
    const url = preferences.sending.unsubscribeMode === "custom" ? render(preferences.sending.unsubscribeUrl).trim() : context.unsubscribeUrl;
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) && !url.startsWith("/")) throw new Error("Resolved list-unsubscribe URL must use HTTPS.");
    if (/[\r\n<>]/.test(url)) throw new Error("Invalid unsubscribe URL.");
    const mailto = preferences.sending.unsubscribeMailto ? render(preferences.sending.unsubscribeMailto).replace(/^mailto:/, "") : "";
    if (/[\r\n<>]/.test(mailto)) throw new Error("Invalid unsubscribe mailto.");
    headers["List-Unsubscribe"] = `<${url}>${mailto ? `, <mailto:${mailto}>` : ""}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  html = appendEmailAnalytics(html,sending,render);
  const aliases = extractEmailLinks(html);
  if (context.trackLink && sending.clickTracking !== false) html = html.replace(/(<a\b[^>]*\bhref=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi, (match, before, url, after) => {
    const alias = /\b(?:data-link-alias|alias)=["']([^"']+)["']/i.exec(match)?.[1] ?? "";
    return alias && !/data-link-tracking=["']false["']/i.test(match) ? `${before}${escapeEmailHref(context.trackLink!(decodeEmailHref(url), alias))}${after}` : match;
  });
  if ((message.config?.emailCssInlining ?? preferences.sending.inlineCss) !== false) html = juice(html, { removeStyleTags: false });
  if (sending.openTracking !== false && context.pixelUrl) {
    const pixel = `<img src="${context.pixelUrl.replaceAll('"', '&quot;')}" width="1" height="1" alt="" style="display:block;border:0" data-open-tracking="true">`;
    html = preferences.sending.movePixelToTop ? html.includes("<body") ? html.replace(/(<body\b[^>]*>)/i, `$1${pixel}`) : pixel + html : html.includes("</body>") ? html.replace(/<\/body>/i, `${pixel}</body>`) : html + pixel;
  }
  const prefix = preferences.sending.prefixTestSubject && (context.kind === "test" || context.kind === "seed") ? context.kind === "seed" ? "[SEED] " : "[TEST] " : "";
  const result = { html, text: preferences.pages.footer.enabled && preferences.pages.footer.plainText !== undefined ? htmlToPlainText(html).replace(htmlToPlainText(footer), render(preferences.pages.footer.plainText)) : htmlToPlainText(html), subject: prefix + render(localizedEmailField(message.subject ?? "",sending.subjectTranslations,profile.language??profile.locale)), headers, extras, ipPool: String(sending.ipPool ?? ""), fromName: render(String(sending.fromName ?? "")), from: render(String(sending.fromAddress ?? `${preferences.sending.senders[0].localPart}@${preferences.sending.senders[0].domain}`)), replyTo: String(sending.replyTo ?? "").startsWith("Exclude reply-to") ? "" : render(String(sending.replyTo ?? "")), bcc: String(sending.bcc ?? "").startsWith("No BCC") ? "" : render(String(sending.bcc === "workspace_default" ? preferences.sending.bcc.find(entry => entry.id === preferences.sending.defaultBccId)?.address ?? "" : sending.bcc ?? "")), aliases };
  const text=message.config?.emailPlainTextCustomized===true?render(String(message.config.emailPlainText??"")):result.text;
  const amp=message.config?.emailAmp?render(String(message.config.emailAmp)):undefined,attachments=context.attachments??(message.config?.emailAttachments??[]) as RuntimeEmailAttachment[];
  for (const file of attachments) { const issue = emailAttachmentIssue(file); if (issue) throw new Error(issue); }
  return { ...result,text,amp,attachments,mime:attachments.every(a=>a.content)?buildEmailMime({...result,text,amp,attachments}):"",attachmentResolutionRequired:attachments.some(a=>!a.content) };
}
export function extractEmailLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].flatMap(([tag]) => {
    const alias = /\b(?:data-link-alias|alias)=["']([^"']+)["']/i.exec(tag)?.[1];
    const url = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    return alias && url && /^https?:\/\//i.test(url) ? [{ alias, url:decodeEmailHref(url), tracking: !/data-link-tracking=["']false["']/i.test(tag) }] : [];
  });
}
export function isBotClick(attributes: Record<string, unknown>) {
  return attributes.bot === true || attributes.isBot === true || /bot|crawler|spider|proofpoint|mimecast|barracuda|safelinks|security.?scan/i.test(String(attributes.userAgent ?? attributes.user_agent ?? ""));
}

export function buildEmailMime(message: { subject: string; html: string; text: string; from: string; replyTo: string; bcc: string; headers: Record<string, string>;fromName?:string;amp?:string;attachments?:RuntimeEmailAttachment[] }) {
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64");
  for (const value of [message.subject, message.from, message.fromName ?? "", message.replyTo, message.bcc, ...Object.keys(message.headers), ...Object.values(message.headers)]) if (/[\r\n]/.test(value)) throw new Error("Email headers cannot contain line breaks.");
  const boundary = `braze_${crypto.randomUUID().replaceAll("-", "")}`;
  const headers = [`From: ${message.fromName ? `=?UTF-8?B?${encode(message.fromName)}?= <${message.from}>` : message.from}`, `Subject: =?UTF-8?B?${encode(message.subject)}?=`, ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []), ...(message.bcc ? [`Bcc: ${message.bcc}`] : []), ...Object.entries(message.headers).map(([key,value]) => `${key}: ${value}`), "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`];
  const part = (kind: string, value: string) => `--${boundary}\r\nContent-Type: text/${kind}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encode(value).match(/.{1,76}/g)?.join("\r\n") ?? ""}\r\n`;
  const alternatives=part("plain", message.text) + part("html", message.html)+(message.amp?part("x-amp-html",message.amp):"")+`--${boundary}--\r\n`;
  if(!message.attachments?.length)return headers.join("\r\n")+"\r\n\r\n"+alternatives;
  const mixed=`mixed_${crypto.randomUUID().replaceAll("-","")}`;
  const files=message.attachments.map(file=>{if(!file.content||!/^[a-z0-9+/=\r\n]+$/i.test(file.content))throw new Error("Resolve attachment content before building MIME.");if(file.size&&file.size>2*1024*1024)throw new Error("Attachments must be 2 MB or smaller.");const name=file.name.replace(/[\r\n"\\]/g,"_");return `--${mixed}\r\nContent-Type: ${(file.mime??"application/octet-stream").replace(/[\r\n]/g,"")}\r\nContent-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(name)}\r\nContent-Transfer-Encoding: base64\r\n\r\n${file.content.replace(/\s/g,"").match(/.{1,76}/g)?.join("\r\n")}\r\n`;}).join("");
  return headers.slice(0,-1).concat(`Content-Type: multipart/mixed; boundary="${mixed}"`).join("\r\n")+`\r\n\r\n--${mixed}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`+alternatives+files+`--${mixed}--\r\n`;
}
