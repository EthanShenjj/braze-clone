import { validateTraditional, validateInAppAction, type TraditionalConfig } from "./in-app-traditional.ts";
export type BlockKind = "Title" | "Paragraph" | "Button" | "Image" | "Link" | "Spacer" | "Custom Code" | "Phone Capture" | "Email Capture" | "Radio Button" | "Short Text" | "Dropdown" | "Checkbox" | "Checkbox Group";

export type ExtraBlock = { id: string; kind: BlockKind; text: string; src?: string; mapTo?: string; style?: { color?: string; fontSize?: number; align?: "left" | "center" | "right" } };
export type InAppButton = { id: string; text: string; behavior: "dismiss" | "deep_link" | "web_url" | "page" | "log_event" | "set_attribute" | "request_push"; href: string; style: "primary" | "secondary"; openInApp?: boolean; eventName?: string; attributeName?: string; attributeValue?: string };
export type InAppPage = {
  id: string;
  name: string;
  title: string;
  body: string;
  buttonText: string;
  imageUrl: string;
  columns: number;
  extraBlocks: ExtraBlock[];
  buttons?: InAppButton[];
  styleOverrides?: Partial<InAppGlobalStyle>;
  contentStyle?: { titleSize?: number; titleLineHeight?: number; bodySize?: number; topPadding?: number; copyInset?: number };
};
export type InAppGlobalStyle = {
  displayType: "Modal" | "Slideup" | "Full screen";
  maxWidth: number;
  backgroundColor: string;
  backgroundImageEnabled: boolean;
  backgroundImageUrl: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  fontFamily: string;
  contentAlignment: "left" | "center" | "right";
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  closeAccessibleName: string;
  closePosition: "Inside modal" | "Outside modal";
  closeSize: number;
  closeColor: string;
  closeBackgroundColor: string;
  closeBorderColor: string;
  closeBorderWidth: number;
  closeRadius: number;
  overlayColor: string;
  overlayOpacity: number;
  accentColor?: string;
  maxWidthUnit?: "px" | "%";
  backgroundOpacity?: number;
  textOpacity?: number;
  buttonOpacity?: number;
  buttonTextOpacity?: number;
  accentOpacity?: number;
  closeOpacity?: number;
  closeBackgroundOpacity?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
  customFonts?: string[];
  slideupPosition: "top" | "bottom";
};
export type InAppDelivery = {
  triggerType: "Session start" | "Custom event" | "Specific time";
  triggerEventName: string;
  triggerEventProperty: string;
  triggerTime: string;
  durationStart: string;
  durationEnd: string;
  frequencyCapEnabled: boolean;
  frequencyCapLimit: number;
  frequencyCapDays: number;
};

export const defaultDelivery: InAppDelivery = {
  triggerType: "Session start", triggerEventName: "", triggerEventProperty: "", triggerTime: "",
  durationStart: "", durationEnd: "", frequencyCapEnabled: false, frequencyCapLimit: 1, frequencyCapDays: 7,
};

export type InAppVariant = {
  id: string;
  name: string;
  sendTo: "Both Mobile Apps & Web Browsers" | "Mobile Apps" | "Web Browsers";
  pages: InAppPage[];
  accessibilityLanguage: string;
  accessibilityLanguageLiquid?: string;
  global: InAppGlobalStyle;
  keyValuePairs?: { id: string; key: string; value: string }[];
  editorMode?: "drag-and-drop" | "traditional";
  traditional?: TraditionalConfig;
  customCode?: boolean;
  customHtml?: string;
};


export type InAppCampaign = { id?: string; name?: string; subject?: string; body?: string; config?: Record<string, unknown> };
export function defaultPage(index = 0, campaign?: InAppCampaign): InAppPage {
  return {
    id: `iam_page_${index + 1}`,
    name: index ? `Page ${index + 1}` : "Basic Modal",
    title: index ? `PAGE ${index + 1}` : campaign?.subject || "WELCOME",
    body: index ? "Add your message here." : campaign?.body || "Thanks for signing up! Use this offer code for 10% off your next order. WELCOME10",
    buttonText: "Shop Now",
    imageUrl: "",
    columns: 1,
    extraBlocks: [],
  };
}

export const defaultGlobal: InAppGlobalStyle = {
  displayType: "Modal",
  maxWidth: 450,
  backgroundColor: "#ffffff",
  backgroundImageEnabled: false,
  backgroundImageUrl: "",
  borderWidth: 5,
  borderColor: "#ffffff",
  borderRadius: 8,
  fontFamily: "Arial",
  contentAlignment: "center",
  textColor: "#000000",
  buttonColor: "#008294",
  buttonTextColor: "#ffffff",
  closeAccessibleName: "Close Message",
  closePosition: "Inside modal",
  closeSize: 15,
  closeColor: "#c4c4c4",
  closeBackgroundColor: "#ffffff",
  closeBorderColor: "#ffffff",
  closeBorderWidth: 0,
  closeRadius: 0,
  overlayColor: "#333333",
  slideupPosition: "bottom",
  overlayOpacity: 75,
};

// Preserve an explicitly empty button list; migrate only legacy pages.
export function pageButtons(page: InAppPage): InAppButton[] {
  if (Array.isArray(page.buttons)) return page.buttons;
  return [{ id: "iam_btn_primary", text: page.buttonText || "Shop Now", behavior: "dismiss", href: "", style: "primary" }];
}

export function variantsFor(campaign: InAppCampaign): InAppVariant[] {
  const stored = campaign.config?.iamVariants;
  if (Array.isArray(stored) && stored.length) return (stored as InAppVariant[]).map(variant => ({ ...variant, keyValuePairs: variant.keyValuePairs ?? [], pages: variant.pages.map(page => ({ ...page, extraBlocks: page.extraBlocks ?? [] })), global: { ...defaultGlobal, ...variant.global } }));
  const channelValues = (campaign.config?.channelValues ?? {}) as Record<string, unknown>;
  return [{
    id: "iam_variant_1",
    name: "Variant 1",
    sendTo: (channelValues.sendTo as InAppVariant["sendTo"]) ?? "Both Mobile Apps & Web Browsers",
    pages: [defaultPage(0, campaign)],
    accessibilityLanguage: String(channelValues.accessibilityLanguage ?? ""),
    accessibilityLanguageLiquid: channelValues.accessibilityLanguageLiquid ? String(channelValues.accessibilityLanguageLiquid) : undefined,
    global: { ...defaultGlobal, displayType: (channelValues.layout as InAppGlobalStyle["displayType"]) ?? "Modal" },
  }];
}

export const inAppPageLimit = 10;

export function validateInAppVariant(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Invalid in-app message variant."];
  const variant = value as InAppVariant;
  if (!Array.isArray(variant.pages) || !variant.pages.length || variant.pages.length > inAppPageLimit) return ["A message must contain between 1 and 10 pages."];
  if (!variant.global || typeof variant.global !== "object") return ["Missing message styles."];
  const issues: string[] = [];
  if (typeof variant.accessibilityLanguage !== "string" || (variant.accessibilityLanguageLiquid !== undefined && typeof variant.accessibilityLanguageLiquid !== "string")) return ["Invalid accessibility language."];
  if (variant.accessibilityLanguageLiquid !== undefined && !variant.accessibilityLanguageLiquid.trim()) issues.push("Enter a Liquid language expression or remove Liquid.");
  for (const key of ["maxWidth", "borderWidth", "borderRadius", "closeSize", "closeBorderWidth", "closeRadius", "overlayOpacity"] as const) if (typeof variant.global[key] !== "number" || !Number.isFinite(variant.global[key]) || variant.global[key] < 0 || variant.global[key] > 2000) issues.push(`Invalid ${key} style.`);
  for (const key of ["overlayOpacity", "backgroundOpacity", "textOpacity", "buttonOpacity", "buttonTextOpacity", "accentOpacity", "closeOpacity", "closeBackgroundOpacity"] as const) if (variant.global[key] !== undefined && (typeof variant.global[key] !== "number" || !Number.isFinite(variant.global[key]) || variant.global[key]! < 0 || variant.global[key]! > 100)) issues.push(`Invalid ${key} style.`);
  for (const key of ["backgroundColor", "backgroundImageUrl", "borderColor", "fontFamily", "textColor", "buttonColor", "buttonTextColor", "closeAccessibleName", "closeColor", "closeBackgroundColor", "closeBorderColor", "overlayColor"] as const) if (typeof variant.global[key] !== "string") issues.push(`Invalid ${key} style.`);
  const ids = variant.pages.map(page => page?.id);
  if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) issues.push("Page IDs must be unique.");
  for (const page of variant.pages) {
    if (!page || typeof page !== "object" || typeof page.title !== "string" || typeof page.body !== "string" || typeof page.imageUrl !== "string" || !Array.isArray(page.extraBlocks)) { issues.push("Invalid page content."); continue; }
    if (page.styleOverrides) for (const key of ["maxWidth", "borderWidth", "borderRadius", "closeSize", "closeBorderWidth", "closeRadius", "overlayOpacity", "backgroundOpacity", "textOpacity", "buttonOpacity", "buttonTextOpacity", "accentOpacity", "closeOpacity", "closeBackgroundOpacity"] as const) {
      const value = page.styleOverrides[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > (key.endsWith("Opacity") ? 100 : 2000))) issues.push(`Invalid page ${key} style.`);
    }
    if (page.extraBlocks.length > 100) issues.push("A page can contain at most 100 content blocks.");
    for (const block of page.extraBlocks) if (!block || typeof block.text !== "string" || typeof block.kind !== "string") issues.push("Invalid content block.");
    for (const button of [...(Array.isArray(page.buttons) ? page.buttons : []), ...(variant.editorMode === "traditional" && variant.traditional?.bodyAction ? [variant.traditional.bodyAction] : [])]) {
      if (!button || typeof button.text !== "string" || !button.text.trim()) { issues.push("Enter button text."); continue; }
      issues.push(...validateInAppAction(button));
      if (button.behavior === "page" && !ids.includes(button.href)) issues.push(`Choose a destination page for ${button.text}.`);
      if (button.behavior === "web_url" && !/[{][{%]/.test(button.href) && !/^https?:\/\//i.test(button.href)) issues.push(`Enter an HTTP or HTTPS URL for ${button.text}.`);
      if (button.behavior === "deep_link" && !/[{][{%]/.test(button.href) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(button.href)) issues.push(`Enter a deep link for ${button.text}.`);
    }
  }
  issues.push(...validateTraditional(variant));
  const pairs = variant.keyValuePairs ?? [];
  if (!Array.isArray(pairs) || pairs.length > 100) issues.push("A message can contain at most 100 key-value pairs.");
  else {
    const keys = new Set<string>();
    for (const pair of pairs) {
      if (!pair || typeof pair.key !== "string" || typeof pair.value !== "string" || !pair.key.trim()) { issues.push("Enter a key for every key-value pair."); continue; }
      if (keys.has(pair.key.trim())) issues.push(`Duplicate key: ${pair.key.trim()}.`);
      keys.add(pair.key.trim());
    }
  }
  if (variant.customCode && (typeof variant.customHtml !== "string" || !variant.customHtml.trim())) issues.push("Enter your custom HTML.");
  if (JSON.stringify(value).length > 1000000) issues.push("The in-app message is too large.");
  return [...new Set(issues)];
}

// Remap the complete page graph when copying templates or variants.
export function appendTemplatePages(existing: InAppPage[], incoming: InAppPage[], prefix: string): InAppPage[] {
  if (!incoming.length || existing.length + incoming.length > inAppPageLimit) throw new Error("A maximum of 10 pages are allowed.");
  const mapping = new Map(incoming.map((page, index) => [page.id, `${prefix}_${index + 1}`]));
  const pages = incoming.map(page => ({ ...structuredClone(page), id: mapping.get(page.id)!, buttons: pageButtons(page).map(button => ({ ...button, id: `${prefix}_${button.id}`, href: button.behavior === "page" ? mapping.get(button.href) ?? button.href : button.href })) }));
  if (pages.some(page => existing.some(item => item.id === page.id))) throw new Error("Page IDs must be unique.");
  return [...existing, ...pages];
}

export function deleteInAppPage(pages: InAppPage[], id: string): InAppPage[] {
  if (pages.length <= 1) throw new Error("A message must contain at least one page.");
  return pages.filter(page => page.id !== id).map(page => ({ ...page, buttons: pageButtons(page).map(button => button.behavior === "page" && button.href === id ? { ...button, behavior: "dismiss" as const, href: "" } : button) }));
}

export function compileInAppHtml(variant: InAppVariant): string {
  const issues = validateInAppVariant(variant); if (issues.length) throw new Error(issues.join(" "));
  const escapeLiteral = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  const escape = (text: string) => text.split(/({{[\s\S]*?}}|{%[\s\S]*?%})/g).map(part => /^(?:{{|{%)/.test(part) ? part : escapeLiteral(part)).join("");
  const pages = variant.pages.map((page, index) => {
    const style = { ...variant.global, ...page.styleOverrides };
    const buttons = pageButtons(page).map(button => `<a class="action" href="${escape(button.behavior === "page" ? `#page-${variant.pages.findIndex(item => item.id === button.href)}` : button.behavior === "dismiss" ? "appboy://close" : button.href)}" style="background:${escape(style.buttonColor)};color:${escape(style.buttonTextColor)}">${escape(button.text)}</a>`).join("");
    return `<section class="page" id="page-${index}" style="background:${escape(style.backgroundColor)};color:${escape(style.textColor)};font-family:${escape(style.fontFamily)};border-radius:${style.borderRadius}px"><a class="close" aria-label="${escape(style.closeAccessibleName)}" href="appboy://close">Close</a>${page.imageUrl ? `<img src="${escape(page.imageUrl)}" alt="">` : ""}<h2>${escape(page.title)}</h2><p>${escape(page.body)}</p>${page.extraBlocks.map(block => block.kind === "Custom Code" ? block.text : block.kind === "Image" ? `<img src="${escape(block.src ?? "")}" alt="${escape(block.text)}">` : block.kind === "Spacer" ? '<div style="height:18px"></div>' : ["Email Capture", "Phone Capture", "Short Text"].includes(block.kind) ? `<label>${escape(block.text)}<input type="${block.kind === "Email Capture" ? "email" : block.kind === "Phone Capture" ? "tel" : "text"}" name="${escape(block.mapTo || block.id)}" placeholder="${escape(block.text)}"></label>` : block.kind === "Dropdown" ? `<select aria-label="${escape(block.text)}">${block.text.split("|").map(option => `<option>${escape(option.trim())}</option>`).join("")}</select>` : ["Checkbox", "Checkbox Group", "Radio Button"].includes(block.kind) ? `<label><input type="${block.kind === "Radio Button" ? "radio" : "checkbox"}" name="${escape(block.mapTo || block.id)}">${escape(block.text)}</label>` : `<p>${escape(block.text)}</p>`).join("")}<nav>${buttons}</nav></section>`;
  }).join("");
  return `<!doctype html><html lang="${escape(variant.accessibilityLanguageLiquid || variant.accessibilityLanguage || "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;min-height:100vh;box-sizing:border-box;display:grid;place-items:center;background:#333b;font-family:Arial}.page{position:relative;box-sizing:border-box;display:none;padding:30px;width:min(450px,100%);text-align:center}.page:first-child{display:block}body:has(.page:target) .page{display:none}body .page:target{display:block}.page img{max-width:100%}.close{position:absolute;right:10px;top:8px;color:inherit;font-size:12px}nav{display:flex;gap:10px;justify-content:center}.action{display:inline-block;padding:12px 20px;text-decoration:none;border-radius:6px}p{white-space:pre-line;line-height:1.5}</style></head><body>${pages}</body></html>`;
}
