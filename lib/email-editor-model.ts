// Row-based email editor data model mirroring the Braze drag-and-drop builder:
// a message is a stack of rows, each row holds one or more columns (cells),
// and every cell holds a stack of content blocks.

export type EmailBlockKind =
  | "Title" | "Paragraph" | "List" | "Button" | "Divider" | "Spacer"
  | "Image" | "Video" | "Social" | "HTML" | "Menu";

export type SocialNetwork = "Facebook" | "X" | "Instagram" | "LinkedIn" | "YouTube" | "TikTok";
export type SocialItem = { network: SocialNetwork; href: string };
export type MenuItem = { label: string; href: string };

export type EmailBlockStyle = {
  fontSize?: number;
  align?: "left" | "center" | "right";
  color?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontFamily?: string;
  lineHeight?: number;
  radius?: number;
  padding?: number;
  thickness?: number;
  height?: number;
  target?: boolean;
};

export type EmailBlock = {
  id: string;
  kind: EmailBlockKind;
  text: string;
  href?: string;
  src?: string;
  alt?: string;
  width?: number;
  ordered?: boolean;
  items?: (SocialItem | MenuItem)[];
  style?: EmailBlockStyle;
  translations?: Record<string, string>;
};

export type EmailCell = { id: string; width: number; blocks: EmailBlock[] };
export type EmailRow = { id: string; cells: EmailCell[]; bg?: string; padding?: number };

export type EmailStyle = {
  canvasBg: string;
  contentBg: string;
  contentWidth: number;
  fontFamily: string;
  linkColor: string;
  textColor: string;
};

export type EmailEditorLocale = "en" | "zh-CN" | "ko" | "ja";
export const emailLocales: { code: EmailEditorLocale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "中文（简体）" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
];

export const emailFontFamilies = ["Helvetica, Arial, sans-serif", "Georgia, 'Times New Roman', serif", "'Courier New', monospace", "Tahoma, Verdana, sans-serif", "'Trebuchet MS', sans-serif"];

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultStyle(): EmailStyle {
  return { canvasBg: "#f4f2f7", contentBg: "#ffffff", contentWidth: 600, fontFamily: emailFontFamilies[0], linkColor: "#6736d8", textColor: "#4c5058" };
}

export function normalizeStyle(value: unknown): EmailStyle {
  const base = defaultStyle();
  if (!value || typeof value !== "object") return base;
  const style = value as Partial<EmailStyle>;
  return {
    canvasBg: typeof style.canvasBg === "string" ? style.canvasBg : base.canvasBg,
    contentBg: typeof style.contentBg === "string" ? style.contentBg : base.contentBg,
    contentWidth: typeof style.contentWidth === "number" ? Math.min(800, Math.max(320, style.contentWidth)) : base.contentWidth,
    fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : base.fontFamily,
    linkColor: typeof style.linkColor === "string" ? style.linkColor : base.linkColor,
    textColor: typeof style.textColor === "string" ? style.textColor : base.textColor,
  };
}

export function defaultBlock(kind: EmailBlockKind): EmailBlock {
  const base: EmailBlock = { id: newId("block"), kind, text: "" };
  switch (kind) {
    case "Title": return { ...base, text: "I'm a new title block", style: { fontSize: 34, align: "center", color: "#2e3c47" } };
    case "Paragraph": return { ...base, text: "Add your message here.", style: { fontSize: 15, align: "left", color: "#4c5058", lineHeight: 1.5 } };
    case "List": return { ...base, text: "First item\nSecond item\nThird item", ordered: false, style: { fontSize: 15, align: "left", color: "#4c5058" } };
    case "Button": return { ...base, text: "Call to action", href: "https://example.com", style: { bgColor: "#6136cc", color: "#ffffff", radius: 4, padding: 12, align: "center", fontSize: 14 } };
    case "Divider": return { ...base, style: { thickness: 1, padding: 20, color: "#dcd9e0" } };
    case "Spacer": return { ...base, style: { height: 44 } };
    case "Image": return { ...base, src: "https://placehold.co/600x320/e9e4f4/5632a6?text=Braze+image", alt: "", href: "", width: 100 };
    case "Video": return { ...base, src: "https://placehold.co/600x320/2b2536/ffffff?text=%E2%96%B6+Video", href: "https://example.com/video", alt: "Video preview" };
    case "Social": return { ...base, items: [{ network: "Facebook", href: "https://facebook.com" }, { network: "X", href: "https://x.com" }, { network: "Instagram", href: "https://instagram.com" }] };
    case "Menu": return { ...base, items: [{ label: "Home", href: "https://example.com" }, { label: "Shop", href: "https://example.com/shop" }, { label: "Support", href: "https://example.com/support" }] };
    case "HTML": return { ...base, text: "<p>Custom HTML</p>" };
  }
}

// --- Row helpers -----------------------------------------------------------

export function makeCell(width: number, blocks: EmailBlock[] = []): EmailCell {
  return { id: newId("cell"), width, blocks };
}

export function makeRow(columns: number, blocks: EmailBlock[] = []): EmailRow {
  const width = Math.floor(100 / columns);
  const cells = Array.from({ length: columns }, (_, index) => makeCell(index === 0 ? 100 - width * (columns - 1) : width, columns === 1 ? [...blocks] : []));
  return { id: newId("row"), cells, padding: 10 };
}

export function rowsFromLegacy(value: unknown): EmailRow[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const rows: EmailRow[] = [];
  for (const block of value as EmailBlock[]) {
    if (!block || typeof block !== "object" || !block.kind) continue;
    const restored: EmailBlock = { ...defaultBlock(block.kind), ...block };
    rows.push({ id: newId("row"), padding: 10, cells: [makeCell(100, [restored])] });
  }
  return rows;
}

// Accepts a campaign config slice and returns rows regardless of storage shape.
export function normalizeRows(rows: unknown, legacyBlocks: unknown): EmailRow[] {
  if (Array.isArray(rows) && rows.length) {
    return (rows as EmailRow[]).map(row => ({
      id: row.id ?? newId("row"),
      bg: row.bg,
      padding: typeof row.padding === "number" ? row.padding : 10,
      cells: (row.cells ?? []).map(cell => ({ id: cell.id ?? newId("cell"), width: typeof cell.width === "number" ? cell.width : 100, blocks: cell.blocks ?? [] })),
    }));
  }
  return rowsFromLegacy(legacyBlocks) ?? [];
}

// --- Block text helpers ----------------------------------------------------

export function blockText(block: EmailBlock, locale: EmailEditorLocale) {
  if (locale !== "en" && block.translations?.[locale]) return block.translations[locale];
  return block.text;
}

export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderListItems(block: EmailBlock, locale: EmailEditorLocale) {
  return blockText(block, locale).split("\n").filter(Boolean).map(item => escapeHtml(item));
}

// Plain-text projection used for downloads, review summaries and validation.
export function rowsToPlainText(rows: EmailRow[], locale: EmailEditorLocale = "en") {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = row.cells.map(cell => cell.blocks.map(block => {
      const text = blockText(block, locale).replaceAll(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
      switch (block.kind) {
        case "Title": return text.toUpperCase();
        case "Button": return `${text} → ${block.href ?? ""}`;
        case "Divider": case "Spacer": return "";
        case "Image": return `[image: ${block.alt || block.src || ""}]`;
        case "Video": return `[video: ${block.href ?? ""}]`;
        case "Social": return (block.items ?? []).map(item => `${(item as SocialItem).network}: ${item.href}`).join(", ");
        case "Menu": return (block.items ?? []).map(item => `${(item as MenuItem).label} (${item.href})`).join(" · ");
        default: return text;
      }
    }).filter(Boolean));
    const merged = cells.length > 1 ? cells.map(cell => cell.join(" ")).join(" | ") : cells.flat().join("\n");
    if (merged.trim()) lines.push(merged);
  }
  return lines.join("\n\n");
}

// --- Links -----------------------------------------------------------------

export type EmailLink = { key: string; label: string; href: string; kind: string };

export function extractLinks(rows: EmailRow[]): EmailLink[] {
  const links: EmailLink[] = [];
  for (const row of rows) for (const cell of row.cells) for (const block of cell.blocks) {
    if (block.href) links.push({ key: block.id, label: blockText(block, "en").replace(/<[^>]+>/g, "").split("\n")[0] || block.kind, href: block.href, kind: block.kind });
    if (block.kind === "Social" || block.kind === "Menu") {
      (block.items ?? []).forEach((item, index) => {
        const label = "label" in item ? item.label : (item as SocialItem).network;
        links.push({ key: `${block.id}:${index}`, label, href: item.href, kind: block.kind });
      });
    }
    const anchors = blockText(block, "en").matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of anchors) links.push({ key: `${block.id}:a:${match[1]}`, label: match[2].replace(/<[^>]+>/g, "").slice(0, 40), href: match[1], kind: block.kind });
  }
  return links;
}

// --- Liquid ----------------------------------------------------------------

export type LiquidToken = { category: string; label: string; value: string; help?: string };

export const liquidTokens: LiquidToken[] = [
  { category: "User profile", label: "First name", value: "{{${first_name} | default: 'there'}}", help: "Falls back to “there”" },
  { category: "User profile", label: "Last name", value: "{{${last_name}}}" },
  { category: "User profile", label: "Email address", value: "{{${email}}}" },
  { category: "User profile", label: "Country", value: "{{${country}}}" },
  { category: "User profile", label: "City", value: "{{${city}}}" },
  { category: "User profile", label: "Language", value: "{{${language}}}" },
  { category: "User profile", label: "Time zone", value: "{{${time_zone}}}" },
  { category: "User profile", label: "External user ID", value: "{{${user_id}}}" },
  { category: "Custom attributes", label: "loyalty_tier", value: "{{custom_attribute.${loyalty_tier}}}" },
  { category: "Custom attributes", label: "signup_date", value: "{{custom_attribute.${signup_date}}}" },
  { category: "Custom attributes", label: "points_balance", value: "{{custom_attribute.${points_balance}}}" },
  { category: "Campaign", label: "Campaign name", value: "{{campaign.${name}}}" },
  { category: "Campaign", label: "Campaign ID", value: "{{campaign.${api_id}}}" },
  { category: "Catalog", label: "Product name", value: "{% render_catalog 'products' %}", help: "Catalog: products" },
  { category: "Catalog", label: "Selected item field", value: "{{ products.[first].name }}" },
  { category: "Content blocks", label: "Footer content block", value: "{% renderblock 'email_footer' %}" },
  { category: "Content blocks", label: "Header banner block", value: "{% renderblock 'email_header' %}" },
  { category: "Promotion codes", label: "September promo code", value: "{% promotion_code 'september20' %}" },
  { category: "Connected Content", label: "GET example API", value: "{% connected_content https://example.com/api/offers :offers %}", help: "Response stored in :offers" },
  { category: "Liquid helpers", label: "If / else on language", value: "{% if ${language} == 'zh' %}你好{% else %}Hello{% endif %}" },
  { category: "Liquid helpers", label: "Uppercase filter", value: "{{${first_name} | default: 'there' | upcase}}" },
  { category: "Liquid helpers", label: "Date filter", value: "{{ 'now' | date: '%B %d, %Y' }}" },
];

export type PreviewUser = { first_name?: string; last_name?: string; email?: string; country?: string; city?: string; language?: string; time_zone?: string; user_id?: string; [key: string]: unknown };

const defaultUser: PreviewUser = { first_name: "Sofia", last_name: "Chen", email: "sofia@example.com", country: "US", city: "San Francisco", language: "en", time_zone: "America/Los_Angeles", user_id: "user_1024" };

// Resolves the Liquid subset used by the local editor so previews feel real.
export function resolveLiquidPreview(source: string, user: PreviewUser = defaultUser, locale: EmailEditorLocale = "en") {
  let text = source;
  const profile = { ...defaultUser, ...user, language: user.language ?? locale } as Record<string, unknown>;
  text = text.replace(/\{\%\s*if\s+\$\{language\}\s*==\s*'([^']*)'\s*\%\}([\s\S]*?)\{\%\s*else\s*\%\}([\s\S]*?)\{\%\s*endif\s*\%\}/g, (_match, code, when, otherwise) => String(profile.language) === code ? when : otherwise);
  text = text.replace(/\{\{[^}]*\$\{(\w+)\}[^}]*default:\s*'([^']*)'[^}]*\}\}/g, (_match, key: string, fallback: string) => String(profile[key] ?? "").trim() || fallback);
  text = text.replace(/\{\{\s*\$\{(\w+)\}\s*\}\}/g, (_match, key: string) => String(profile[key] ?? ""));
  text = text.replace(/\{\{custom_attribute\.\$\{?(\w+)\}?\}\}/g, (_match, key: string) => String(profile[key] ?? ""));
  text = text.replace(/\{\{\s*'now'\s*\|\s*date:\s*'([^']*)'\s*\}\}/g, (_match, format: string) => {
    const now = new Date();
    return format.replace("%B", now.toLocaleString("en-US", { month: "long" })).replace("%d", String(now.getDate()).padStart(2, "0")).replace("%Y", String(now.getFullYear()));
  });
  text = text.replace(/\{\{\$\{(\w+)\}\}/g, (_match, key: string) => String(profile[key] ?? ""));
  text = text.replace(/\{\%\s*(renderblock|promotion_code|render_catalog|connected_content)[^%]*\%\}/g, (_match, tag: string) => tag === "promotion_code" ? "SEPTEMBER20" : tag === "render_catalog" ? "Aurora Knit Sweater" : tag === "renderblock" ? "[content block]" : "[connected content]");
  text = text.replace(/\{\%[^%]*\%\}/g, "");
  return text;
}

// Minimal Liquid lint: tag balance + delimiter pairs.
export function liquidIssues(source: string): string[] {
  const issues: string[] = [];
  const stack: string[] = [];
  const tags = source.matchAll(/\{%\s*(\w+)/g);
  for (const match of tags) {
    const tag = match[1];
    if (tag === "if" || tag === "for" || tag === "case") stack.push(tag);
    if ((tag === "endif" || tag === "endfor" || tag === "endcase") && stack.pop() !== tag.replace("end", "")) issues.push(`Mismatched {% ${tag} %} tag.`);
  }
  if (stack.length) issues.push(`Unclosed {% ${stack.join(", ")} %} tag.`);
  if ((source.match(/\{\{/g) ?? []).length !== (source.match(/\}\}/g) ?? []).length) issues.push("Unbalanced {{ }} delimiters.");
  if ((source.match(/\{%/g) ?? []).length !== (source.match(/%\}/g) ?? []).length) issues.push("Unbalanced {% %} delimiters.");
  return issues;
}

// --- Templates -------------------------------------------------------------

export type EmailTemplate = {
  id: string;
  name: string;
  editor: "Drag-and-Drop Editor" | "HTML Editor" | "Plain-text Editor";
  category: string;
  subject: string;
  preheader: string;
  description: string;
  rows?: EmailRow[];
  html?: string;
  plain?: string;
};

function sampleRows(kind: "welcome" | "offer" | "newsletter" | "reengagement" | "transactional" | "event"): EmailRow[] {
  const rows: EmailRow[] = [];
  const push = (blocks: EmailBlock[], columns = 1) => rows.push(makeRow(columns, blocks));
  if (kind === "welcome") {
    push([defaultBlock("Image")]);
    push([{ ...defaultBlock("Title"), text: "Welcome to Braze, {{${first_name} | default: 'there'}}!" }]);
    push([{ ...defaultBlock("Paragraph"), text: "We’re glad you’re here. Explore the latest ways to make every customer interaction count." }]);
    push([{ ...defaultBlock("Button"), text: "Get started", href: "https://example.com/start" }]);
  } else if (kind === "offer") {
    push([{ ...defaultBlock("Title"), text: "Your September offer is here" }]);
    push([{ ...defaultBlock("Paragraph"), text: "Thanks for being with us. Use the code below for 20% off this month’s featured collection." }]);
    push([{ ...defaultBlock("Button"), text: "Claim your offer", href: "https://example.com/offers", style: { bgColor: "#b0438a", color: "#ffffff", radius: 6, padding: 14, align: "center", fontSize: 15 } }]);
    push([{ ...defaultBlock("Divider") }]);
  } else if (kind === "newsletter") {
    push([{ ...defaultBlock("Title"), text: "This month at Braze" }]);
    push([defaultBlock("Image"), { ...defaultBlock("Title"), text: "Product updates", style: { fontSize: 22, align: "left", color: "#2e3c47" } }], 2);
    push([defaultBlock("Image"), { ...defaultBlock("Title"), text: "Customer stories", style: { fontSize: 22, align: "left", color: "#2e3c47" } }], 2);
  } else if (kind === "reengagement") {
    push([{ ...defaultBlock("Title"), text: "We miss you, {{${first_name} | default: 'friend'}}" }]);
    push([{ ...defaultBlock("Paragraph"), text: "It’s been a while. Here’s 15% off to welcome you back." }]);
    push([{ ...defaultBlock("Button"), text: "Come back in", href: "https://example.com/return" }]);
  } else if (kind === "transactional") {
    push([{ ...defaultBlock("Title"), text: "Your order confirmation", style: { fontSize: 26, align: "left", color: "#2e3c47" } }]);
    push([{ ...defaultBlock("Paragraph"), text: "Order #48291 has shipped and will arrive by {{ 'now' | date: '%B %d, %Y' }}." }]);
    push([{ ...defaultBlock("Button"), text: "Track shipment", href: "https://example.com/track" }]);
  } else {
    push([{ ...defaultBlock("Title"), text: "You're invited" }]);
    push([defaultBlock("Image")]);
    push([{ ...defaultBlock("Paragraph"), text: "Join us for a live session on building better customer engagement." }]);
    push([{ ...defaultBlock("Button"), text: "RSVP now", href: "https://example.com/event" }]);
  }
  return rows;
}

export const emailTemplates: EmailTemplate[] = [
  { id: "tpl_welcome", name: "Welcome email", editor: "Drag-and-Drop Editor", category: "Onboarding", subject: "Welcome to Braze", preheader: "Your latest offers are waiting.", description: "Hero image plus a friendly welcome note.", rows: sampleRows("welcome") },
  { id: "tpl_offer", name: "September Offer", editor: "Drag-and-Drop Editor", category: "Promotional", subject: "Your September Offer | 20% Off", preheader: "Use code SEPTEMBER20 before September 30.", description: "Bold single-column promotion with CTA.", rows: sampleRows("offer") },
  { id: "tpl_newsletter", name: "Monthly newsletter", editor: "Drag-and-Drop Editor", category: "Newsletter", subject: "This month at Braze", preheader: "Product updates, stories and events.", description: "Two-column digest layout.", rows: sampleRows("newsletter") },
  { id: "tpl_reengagement", name: "We miss you", editor: "Drag-and-Drop Editor", category: "Promotional", subject: "Come back for 15% off", preheader: "A welcome-back treat inside.", description: "Re-engagement offer with personalization.", rows: sampleRows("reengagement") },
  { id: "tpl_transactional", name: "Order confirmation", editor: "Drag-and-Drop Editor", category: "Transactional", subject: "Your order has shipped", preheader: "Tracking details inside.", description: "Clean transactional receipt layout.", rows: sampleRows("transactional") },
  { id: "tpl_event", name: "Event invitation", editor: "Drag-and-Drop Editor", category: "Onboarding", subject: "You're invited", preheader: "Reserve your seat today.", description: "Image-led invitation with RSVP button.", rows: sampleRows("event") },
  {
    id: "tpl_html_starter", name: "HTML starter", editor: "HTML Editor", category: "HTML", subject: "Your September offer is here", preheader: "Use code SEPTEMBER20 before September 30.",
    description: "Minimal responsive HTML shell for full-code teams.",
    html: `<!doctype html>\n<html>\n  <body style="margin:0;background:#f4f2f7">\n    <div style="max-width:600px;margin:0 auto;padding:32px;font-family:Arial,sans-serif;background:#ffffff">\n      <h1>September Exclusive</h1>\n      <p>Hi {{\${first_name} | default: 'there'}},</p>\n      <p>Use code <b>SEPTEMBER20</b> for 20% off this month's featured collection.</p>\n      <a href="https://example.com/offers" style="display:inline-block;padding:12px 20px;background:#6136cc;color:#ffffff;text-decoration:none">Claim your offer</a>\n    </div>\n  </body>\n</html>`,
  },
  {
    id: "tpl_html_liquid", name: "Liquid language split", editor: "HTML Editor", category: "HTML", subject: "Your localized offer", preheader: "Available in your language.",
    description: "HTML shell with a Liquid language condition.",
    html: `<!doctype html>\n<html>\n  <body style="margin:0;font-family:Arial,sans-serif">\n    {% if ${"${language}"} == 'zh' %}\n      <h1>九月专属礼遇已上线</h1>\n      <p>你好，{{\${first_name} | default: '朋友'}}！使用优惠码 SEPTEMBER20 享受 20% 优惠。</p>\n    {% else %}\n      <h1>Your September offer is here</h1>\n      <p>Hi {{\${first_name} | default: 'there'}}, use code SEPTEMBER20 for 20% off.</p>\n    {% endif %}\n  </body>\n</html>`,
  },
  { id: "tpl_plain_receipt", name: "Plain-text receipt", editor: "Plain-text Editor", category: "Transactional", subject: "Receipt for order #48291", preheader: "", description: "Text-only transactional receipt.", plain: "Hi {{${first_name} | default: 'there'}},\n\nThanks for your order #48291. Your items will arrive within 3-5 business days.\n\nTrack your order: https://example.com/track\n\nQuestions? Reply to this email." },
  { id: "tpl_plain_newsletter", name: "Plain-text newsletter", editor: "Plain-text Editor", category: "Newsletter", subject: "This month at Braze", preheader: "", description: "Text-only digest for maximum deliverability.", plain: "This month at Braze\n====================\n\n1. Product updates\nRead about the latest releases: https://example.com/updates\n\n2. Customer stories\nHow teams ship engagement faster: https://example.com/stories" },
];

// --- Validation / export ---------------------------------------------------

export function hasRenderableContent(rows: EmailRow[]) {
  return rows.some(row => row.cells.some(cell => cell.blocks.length));
}

export function downloadHtmlFile(filename: string, html: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
