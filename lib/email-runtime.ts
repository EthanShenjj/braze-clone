import juice from "juice";
import { htmlToPlainText, renderBrazeLiquid } from "./email-liquid.ts";
import type { EmailPreferences } from "./email-preferences.ts";

export type EmailMessage = { subject?: string; body?: string; config?: Record<string, unknown> };
export function emailSendingIssues(message: EmailMessage, preferences: EmailPreferences) {
  const sending = (message.config?.emailSending ?? {}) as Record<string, unknown>;
  const issues: string[] = [];
  if (preferences.sending.requireListedAddresses) {
    if (!preferences.sending.senders.some(row => `${row.localPart}@${row.domain}`.toLowerCase() === String(sending.fromAddress ?? "").toLowerCase())) issues.push("From address must be one of the workspace's listed addresses.");
    const reply = String(sending.replyTo ?? "");
    if (reply && !reply.startsWith("Exclude reply-to") && !preferences.sending.replyTo.some(row => row.address.toLowerCase() === reply.toLowerCase())) issues.push("Reply-To must be one of the workspace's listed addresses.");
  }
  if (preferences.sending.requireBcc && !preferences.sending.bcc.some(row => row.address.toLowerCase() === String(sending.bcc === "workspace_default" ? preferences.sending.bcc.find(entry => entry.id === preferences.sending.defaultBccId)?.address ?? "" : sending.bcc ?? "").toLowerCase())) issues.push("Choose a listed BCC address. BCC is required by this workspace.");
  return issues;
}
export type EmailRuntimeContext = { profile: Record<string, unknown>; unsubscribeUrl: string; optInUrl: string; pixelUrl?: string; kind?: "test" | "seed" | "campaign"; render?: (source: string) => string; trackLink?: (url: string, alias: string) => string };
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
  const sending = (message.config?.emailSending ?? {}) as Record<string, unknown>;
  const headers: Record<string, string> = {};
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
  const aliases = extractEmailLinks(html);
  if (context.trackLink && sending.clickTracking !== false) html = html.replace(/(<a\b[^>]*\bhref=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi, (match, before, url, after) => {
    const alias = /\b(?:data-link-alias|alias)=["']([^"']+)["']/i.exec(match)?.[1] ?? "";
    return alias && !/data-link-tracking=["']false["']/i.test(match) ? `${before}${context.trackLink!(url, alias)}${after}` : match;
  });
  if ((message.config?.emailCssInlining ?? preferences.sending.inlineCss) !== false) html = juice(html, { removeStyleTags: false });
  if (sending.openTracking !== false && context.pixelUrl) {
    const pixel = `<img src="${context.pixelUrl.replaceAll('"', '&quot;')}" width="1" height="1" alt="" style="display:block;border:0" data-open-tracking="true">`;
    html = preferences.sending.movePixelToTop ? html.includes("<body") ? html.replace(/(<body\b[^>]*>)/i, `$1${pixel}`) : pixel + html : html.includes("</body>") ? html.replace(/<\/body>/i, `${pixel}</body>`) : html + pixel;
  }
  const prefix = preferences.sending.prefixTestSubject && (context.kind === "test" || context.kind === "seed") ? context.kind === "seed" ? "[SEED] " : "[TEST] " : "";
  const result = { html, text: preferences.pages.footer.enabled && preferences.pages.footer.plainText !== undefined ? htmlToPlainText(html).replace(htmlToPlainText(footer), render(preferences.pages.footer.plainText)) : htmlToPlainText(html), subject: prefix + render(message.subject ?? ""), headers, from: render(String(sending.fromAddress ?? `${preferences.sending.senders[0].localPart}@${preferences.sending.senders[0].domain}`)), replyTo: String(sending.replyTo ?? "").startsWith("Exclude reply-to") ? "" : render(String(sending.replyTo ?? "")), bcc: String(sending.bcc ?? "").startsWith("No BCC") ? "" : render(String(sending.bcc === "workspace_default" ? preferences.sending.bcc.find(entry => entry.id === preferences.sending.defaultBccId)?.address ?? "" : sending.bcc ?? "")), aliases };
  return { ...result, mime: buildEmailMime(result) };
}
export function extractEmailLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].flatMap(([tag]) => {
    const alias = /\b(?:data-link-alias|alias)=["']([^"']+)["']/i.exec(tag)?.[1];
    const url = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    return alias && url && /^https?:\/\//i.test(url) ? [{ alias, url, tracking: !/data-link-tracking=["']false["']/i.test(tag) }] : [];
  });
}
export function isBotClick(attributes: Record<string, unknown>) {
  return attributes.bot === true || attributes.isBot === true || /bot|crawler|spider|proofpoint|mimecast|barracuda|safelinks|security.?scan/i.test(String(attributes.userAgent ?? attributes.user_agent ?? ""));
}

export function buildEmailMime(message: { subject: string; html: string; text: string; from: string; replyTo: string; bcc: string; headers: Record<string, string> }) {
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64");
  for (const value of [message.subject, message.from, message.replyTo, message.bcc, ...Object.values(message.headers)]) if (/[\r\n]/.test(value)) throw new Error("Email headers cannot contain line breaks.");
  const boundary = `braze_${crypto.randomUUID().replaceAll("-", "")}`;
  const headers = [`From: ${message.from}`, `Subject: =?UTF-8?B?${encode(message.subject)}?=`, ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []), ...(message.bcc ? [`Bcc: ${message.bcc}`] : []), ...Object.entries(message.headers).map(([key,value]) => `${key}: ${value}`), "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`];
  const part = (kind: string, value: string) => `--${boundary}\r\nContent-Type: text/${kind}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encode(value).match(/.{1,76}/g)?.join("\r\n") ?? ""}\r\n`;
  return headers.join("\r\n") + "\r\n\r\n" + part("plain", message.text) + part("html", message.html) + `--${boundary}--\r\n`;
}
