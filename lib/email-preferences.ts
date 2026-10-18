import { validateLiquidHttps } from "./email-liquid.ts";
export const emailPreferenceTabs = [
  ["sending_configuration", "Sending Configuration"],
  ["subscription_pages_and_footers", "Subscription Pages and Footers"],
  ["drag_and_drop_email", "Drag-And-Drop Email Editor Settings"],
  ["link_aliasing", "Link Aliasing"],
  ["bot_filtering", "Bot Filtering"],
  ["ip_warming", "Automated IP Warming"],
] as const;
export type EmailPreferenceTab = typeof emailPreferenceTabs[number][0];
export type SenderAddress = { id: string; displayName: string; localPart: string; domain: string; ipPool: string };
export type EmailAddress = { id: string; address: string };
export type HtmlPreference = { enabled: boolean; html: string; plainText?: string };
export type TextTheme = { fontSize: number; color: string; align: string; direction: string; weight: string; lineHeight: string; letterSpacing: number; spacing: number; paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number };
export type ThemePadding = { top: number; right: number; bottom: number; left: number };
export type EmailPreferences = {
  sending: { senders: SenderAddress[]; replyTo: EmailAddress[]; bcc: EmailAddress[]; defaultReplyToId: string; defaultBccId: string; requireListedAddresses: boolean; requireBcc: boolean; movePixelToTop: boolean; unsubscribeHeader: boolean; unsubscribeMode: "global" | "custom"; unsubscribeUrl: string; unsubscribeMailto: string; prefixTestSubject: boolean; inlineCss: boolean; resubscribe: boolean };
  pages: { footer: HtmlPreference; unsubscribe: HtmlPreference; optIn: HtmlPreference };
  editor: { canvasBg: string; contentBg: string; linkColor: string; fontFamily: string; fallbackFont: string; genericFont: string; contentWidth: number; blockWidthMode: string; blockWidth: number; headers: TextTheme[]; paragraph: TextTheme; list: TextTheme & { indent: number; listType: string; marker: string; start: number }; button: TextTheme & { background: string; borderColor: string; borderWidth: number; radius: number; innerPadding: ThemePadding }; icon: TextTheme & { itemSpacing: number; height: number; iconPadding: number; padding: ThemePadding; mobileFontSize: number; mobileAlign: string; mobilePadding: ThemePadding } };
  removeBotClicks: boolean;
};

export const defaultFooterHtml = '<div style="text-align:center;color:#777;font-size:12px">This email was sent by {{${first_name} | default: \'your team\'}}. <a href="{{${unsubscribe_url}}}">Unsubscribe</a><br>63 Madison Avenue, 13th Floor, New York, NY 10016</div>';
export const defaultUnsubscribeHtml = '<h1>You have been unsubscribed</h1><p>You will no longer receive marketing emails from us.</p>';
export const defaultOptInHtml = '<h1>Thanks for subscribing!</h1><p>Your email preferences have been updated.</p>';

const textTheme = (fontSize = 14, color = "#101b24", align = "left"): TextTheme => ({ fontSize, color, align, direction: "ltr", weight: "normal", lineHeight: "normal", letterSpacing: 0, spacing: 0, paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeft: 10 });
export function defaultEmailPreferences(): EmailPreferences {
  return {
    sending: { senders: [{ id: "sender_default", displayName: "Powered by Braze", localPart: "braze", domain: "mta-a348.bftmail.com", ipPool: "PLG_IP_Pool" }], replyTo: [], bcc: [], defaultReplyToId: "", defaultBccId: "", requireListedAddresses: false, requireBcc: false, movePixelToTop: false, unsubscribeHeader: true, unsubscribeMode: "global", unsubscribeUrl: "", unsubscribeMailto: "", prefixTestSubject: false, inlineCss: true, resubscribe: false },
    pages: { footer: { enabled: false, html: defaultFooterHtml }, unsubscribe: { enabled: false, html: defaultUnsubscribeHtml }, optIn: { enabled: false, html: defaultOptInHtml } },
    editor: { canvasBg: "#ffffff", contentBg: "#ffffff", linkColor: "#1871d8", fontFamily: "Open Sans", fallbackFont: "Arial", genericFont: "sans-serif", contentWidth: 600, blockWidthMode: "full", blockWidth: 600, headers: [34, 24, 20, 18, 16, 14].map(size => textTheme(size, "#2e3c47", "center")), paragraph: textTheme(), list: { ...textTheme(), indent: 40, listType: "ul", marker: "default", start: 1 }, button: { ...textTheme(14, "#ffffff", "center"), background: "#1871d8", borderColor: "#1871d8", borderWidth: 1, radius: 2, innerPadding: { top: 5, right: 10, bottom: 5, left: 10 } }, icon: { ...textTheme(14, "#101b24", "center"), itemSpacing: 10, height: 16, iconPadding: 5, padding: { top: 5, right: 5, bottom: 5, left: 5 }, mobileFontSize: 14, mobileAlign: "right", mobilePadding: { top: 10, right: 10, bottom: 10, left: 10 } } },
    removeBotClicks: true,
  };
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

// Merge older, partial workspace records without overwriting explicit false values.
export function normalizeEmailPreferences(value: unknown): EmailPreferences {
  const defaults = defaultEmailPreferences();
  const raw = object(value);
  const sending = object(raw.sending);
  const editor = object(raw.editor);
  const pages = object(raw.pages);
  const legacyAddress = typeof raw.defaultFromAddress === "string" ? raw.defaultFromAddress : "";
  if (!raw.sending && (legacyAddress || raw.defaultFromName)) {
    const at = legacyAddress.lastIndexOf("@");
    sending.senders = [{ ...defaults.sending.senders[0], displayName: String(raw.defaultFromName || defaults.sending.senders[0].displayName), ...(at > 0 ? { localPart: legacyAddress.slice(0, at), domain: legacyAddress.slice(at + 1) } : {}) }];
  }
  return {
    sending: { ...defaults.sending, ...sending },
    pages: { footer: { ...defaults.pages.footer, ...object(pages.footer) }, unsubscribe: { ...defaults.pages.unsubscribe, ...object(pages.unsubscribe) }, optIn: { ...defaults.pages.optIn, ...object(pages.optIn) } },
    editor: { ...defaults.editor, ...editor, headers: defaults.editor.headers.map((header, index) => ({ ...header, ...object(Array.isArray(editor.headers) ? editor.headers[index] : undefined) })), paragraph: { ...defaults.editor.paragraph, ...object(editor.paragraph) }, list: { ...defaults.editor.list, ...object(editor.list) }, button: { ...defaults.editor.button, ...object(editor.button), innerPadding: { ...defaults.editor.button.innerPadding, ...object(object(editor.button).innerPadding) } }, icon: { ...defaults.editor.icon, ...object(editor.icon), padding: { ...defaults.editor.icon.padding, ...object(object(editor.icon).padding) }, mobilePadding: { ...defaults.editor.icon.mobilePadding, ...object(object(editor.icon).mobilePadding) } } },
    removeBotClicks: typeof raw.removeBotClicks === "boolean" ? raw.removeBotClicks : defaults.removeBotClicks,
  } as EmailPreferences;
}

export function validateEmailPreferences(input: unknown): string[] {
  const errors: string[] = [];
  const defaults = defaultEmailPreferences();
  function checkShape(value: unknown, template: unknown, path: string) {
    if (Array.isArray(template)) {
      if (!Array.isArray(value)) { errors.push(`${path}: expected a list.`); return; }
      if (value.length > 100) errors.push(`${path}: too many entries.`);
      const itemTemplate = path.endsWith("replyTo") || path.endsWith("bcc") ? { id: "", address: "" } : template[0];
      value.forEach((entry, index) => checkShape(entry, itemTemplate, `${path}[${index}]`));
    } else if (template && typeof template === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}: expected an object.`); return; }
      Object.entries(template).forEach(([key, entry]) => checkShape((value as Record<string, unknown>)[key], entry, path ? `${path}.${key}` : key));
    } else if (typeof value !== typeof template || (typeof value === "number" && !Number.isFinite(value))) errors.push(`${path}: invalid value.`);
  }
  checkShape(input, defaults, "");
  if (errors.length) return errors;
  const value = input as EmailPreferences;
  const email = (address: string) => /\{[{%]/.test(address) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
  if (!value.sending.senders.length) errors.push("Add at least one From display name address.");
  for (const [kind, entries] of Object.entries({ senders: value.sending.senders, replyTo: value.sending.replyTo, bcc: value.sending.bcc })) {
    if (entries.some(entry => !entry.id.trim()) || new Set(entries.map(entry => entry.id)).size !== entries.length) errors.push(`${kind}: each address needs a unique ID.`);
  }
  for (const sender of value.sending.senders) {
    if (!sender.displayName.trim() || !sender.localPart.trim() || !sender.domain.trim() || !sender.ipPool.trim()) errors.push("From display name, local part, domain and IP pool are required.");
    if (!email(`${sender.localPart}@${sender.domain}`)) errors.push("Enter a valid From address or Liquid expression.");
  }
  for (const kind of ["replyTo", "bcc"] as const) {
    const addresses = value.sending[kind];
    if (addresses.some(entry => !email(entry.address))) errors.push(`${kind === "bcc" ? "BCC" : "Reply-To"}: enter a valid email address or Liquid expression.`);
    if (new Set(addresses.map(entry => entry.address.toLowerCase())).size !== addresses.length) errors.push(`${kind}: duplicate email addresses.`);
    const defaultId = kind === "bcc" ? value.sending.defaultBccId : value.sending.defaultReplyToId;
    if (defaultId && !addresses.some(entry => entry.id === defaultId)) errors.push(`${kind}: choose an existing default address.`);
  }
  if (value.sending.requireBcc && !value.sending.defaultBccId) errors.push("Select a default BCC address before requiring BCC.");
  if (!["global", "custom"].includes(value.sending.unsubscribeMode)) errors.push("Select a valid list-unsubscribe mode.");
  if (value.sending.unsubscribeHeader && value.sending.unsubscribeMode === "custom" && !validateLiquidHttps(value.sending.unsubscribeUrl)) errors.push("Custom one-click unsubscribe URL must start with https://.");
  if (value.sending.unsubscribeMailto && !email(value.sending.unsubscribeMailto.replace(/^mailto:/, ""))) errors.push("Enter a valid list-unsubscribe mailto address.");
  for (const [key, page] of Object.entries(value.pages)) {
    if (page.plainText !== undefined && (typeof page.plainText !== "string" || new TextEncoder().encode(page.plainText).length >= 100 * 1024)) errors.push(`${key}: invalid plain text footer (maximum 100 KB).`);
    const max = key === "footer" ? 100 * 1024 : 750 * 1024;
    if (new TextEncoder().encode(page.html).length >= max) errors.push(`${key}: HTML must be less than ${key === "footer" ? 100 : 750} KB.`);
    if (page.enabled && !page.html.trim()) errors.push(`${key}: HTML is required when enabled.`);
    if (key === "footer" && page.enabled && !/unsubscribe_url|unsubscribe_link|\bhref\s*=\s*["'][^"']*unsubscribe/i.test(page.html)) errors.push("Custom footer must include an unsubscribe URL.");
  }
  function checkTheme(obj: unknown, path: string) {
    if (!obj || typeof obj !== "object") return;
    for (const [key, entry] of Object.entries(obj)) {
      if (typeof entry === "number" && (entry < (key === "letterSpacing" ? -20 : 0) || entry > 2000)) errors.push(`${path}.${key}: value is outside the allowed range.`);
      if (/color|Bg|background/i.test(key) && typeof entry === "string" && !/^#[0-9a-f]{6}$/i.test(entry)) errors.push(`${path}.${key}: use a six-digit hex color.`);
      if (key === "align" && !["left", "center", "right"].includes(String(entry))) errors.push(`${path}.align: choose left, center or right.`);
      if (key === "direction" && !["ltr", "rtl"].includes(String(entry))) errors.push(`${path}.direction: choose a valid text direction.`);
      if (key === "mobileAlign" && !["left", "center", "right"].includes(String(entry))) errors.push(`${path}.mobileAlign: choose left, center or right.`);
      if (key === "weight" && !["normal", "bold"].includes(String(entry))) errors.push(`${path}.weight: choose normal or bold.`);
      if (key === "lineHeight" && !["normal", "1", "1.2", "1.5", "1.8", "2"].includes(String(entry))) errors.push(`${path}.lineHeight: choose a supported line height.`);
      if (typeof entry === "object") checkTheme(entry, `${path}.${key}`);
    }
  }
  checkTheme(value.editor, "editor");
  if (value.editor.contentWidth < 320 || value.editor.contentWidth > 800) errors.push("Email template width must be between 320 and 800 px.");
  if (value.editor.headers.length !== 6) errors.push("Configure exactly six header styles.");
  if (!["full", "custom"].includes(value.editor.blockWidthMode)) errors.push("Choose a valid Content Block width type.");
  if (!["sans-serif", "serif"].includes(value.editor.genericFont)) errors.push("Choose a valid fallback font family.");
  if (!["ul", "ol"].includes(value.editor.list.listType) || !["default", "disc", "circle", "square", "decimal"].includes(value.editor.list.marker)) errors.push("Choose a valid list type and marker.");
  if (!Number.isInteger(value.editor.list.start) || value.editor.list.start < 1) errors.push("Numbered lists must start at a positive integer.");
  return [...new Set(errors)];
}

export function emailPreferenceCampaignDefaults(preferences: EmailPreferences) {
  const { sending, editor } = preferences;
  const sender = sending.senders[0];
  return {
    emailStyle: { canvasBg: editor.canvasBg, contentBg: editor.contentBg, contentWidth: editor.contentWidth, fontFamily: `${editor.fontFamily}, ${editor.fallbackFont}, ${editor.genericFont}`, linkColor: editor.linkColor, textColor: editor.paragraph.color },
    emailSending: { fromName: sender.displayName, fromAddress: `${sender.localPart}@${sender.domain}`, ipPool: sender.ipPool, replyTo: sending.replyTo.find(entry => entry.id === sending.defaultReplyToId)?.address, bcc: sending.bcc.find(entry => entry.id === sending.defaultBccId)?.address, unsubscribe: "Use workspace default" },
    emailCssInlining: sending.inlineCss,
    emailBlockTheme: editor,
  };
}
