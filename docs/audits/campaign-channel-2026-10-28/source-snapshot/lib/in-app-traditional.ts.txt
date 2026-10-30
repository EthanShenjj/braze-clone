import { defaultGlobal, defaultPage, pageButtons, type InAppVariant, type InAppButton } from "./in-app-model.ts";

export const traditionalMessageTypes = ["Modal", "Full Screen", "Slideup", "Custom HTML", "Email Capture Form"] as const;
export type TraditionalMessageType = typeof traditionalMessageTypes[number];
export type TraditionalAction = "dismiss" | "web_url" | "deep_link" | "log_event" | "set_attribute" | "request_push";
export type TraditionalButtonDesign = { background: string; color: string; borderColor: string; opacity: number };
export type TraditionalConfig = {
  messageType: TraditionalMessageType;
  layout: "Image & text" | "Image only";
  orientation: "Any" | "Portrait" | "Landscape";
  iosDevices: "All iOS devices" | "iPad only" | "iPhone and iPod touch only";
  closeBehavior: "Wait for user" | "Automatically dismiss";
  closeAfterSeconds: number;
  bodyAction: InAppButton;
  emailPlaceholder: string;
  termsText: string;
  termsUrl: string;
  headerColor: string;
  headerOpacity: number;
  headerAlignment: "left" | "center" | "right";
  bodyAlignment: "left" | "center" | "right";
  buttonDesigns: TraditionalButtonDesign[];
};
export function traditionalDefaults(): TraditionalConfig {
  return {
    messageType: "Modal", layout: "Image & text", orientation: "Any", iosDevices: "All iOS devices",
    closeBehavior: "Wait for user", closeAfterSeconds: 5,
    bodyAction: { id: "body", text: "Message", behavior: "dismiss", href: "", style: "primary" },
    emailPlaceholder: "Enter your email address", termsText: "", termsUrl: "", headerColor: "#000000", headerOpacity: 100,
    headerAlignment: "center", bodyAlignment: "center", buttonDesigns: [
      { background: "#ffffff", color: "#008294", borderColor: "#008294", opacity: 100 },
      { background: "#008294", color: "#ffffff", borderColor: "#008294", opacity: 100 },
    ],
  };
}
// A separate variant preserves the complete existing drag-and-drop page graph.
export function createTraditionalVariant(source: InAppVariant, id: string, name: string): InAppVariant {
  const page = source.pages[0] ?? defaultPage();
  const effective = { ...defaultGlobal, ...source.global, ...page.styleOverrides };
  const designs = pageButtons(page).slice(0, 2).map(button => ({ background: button.style === "secondary" ? effective.backgroundColor : effective.buttonColor, color: button.style === "secondary" ? effective.buttonColor : effective.buttonTextColor, borderColor: effective.buttonColor, opacity: effective.buttonOpacity ?? 100 }));
  while (designs.length < 2) designs.push({ background: effective.buttonColor, color: effective.buttonTextColor, borderColor: effective.buttonColor, opacity: effective.buttonOpacity ?? 100 });
  return {
    id, name, editorMode: "traditional", sendTo: source.sendTo,
    pages: [{ ...structuredClone(page), id: `${id}_page`, name: "Modal", styleOverrides: undefined, extraBlocks: [], buttons: pageButtons(page).slice(0, 2).map(button => ({ ...button, behavior: button.behavior === "page" ? "dismiss" : button.behavior, href: button.behavior === "page" ? "" : button.href })) }],
    global: { ...effective, displayType: "Modal", borderWidth: 0 },
    accessibilityLanguage: source.accessibilityLanguage, accessibilityLanguageLiquid: source.accessibilityLanguageLiquid,
    keyValuePairs: structuredClone(source.keyValuePairs ?? []), traditional: { ...traditionalDefaults(), headerColor: effective.textColor, headerOpacity: effective.textOpacity ?? 100, headerAlignment: effective.contentAlignment, bodyAlignment: effective.contentAlignment, buttonDesigns: designs },
  };
}
export function changeTraditionalType(variant: InAppVariant, messageType: TraditionalMessageType): InAppVariant {
  const config = { ...traditionalDefaults(), ...variant.traditional, messageType };
  if (["Slideup", "Email Capture Form"].includes(messageType)) config.layout = "Image & text";
  const page = { ...variant.pages[0], name: messageType, ...(messageType === "Email Capture Form" ? { buttons: [{ id: `${variant.id}_submit`, text: "Subscribe", behavior: "dismiss" as const, href: "", style: "primary" as const }] } : {}) };
  return { ...variant, editorMode: "traditional", traditional: config, pages: [page],
    customCode: messageType === "Custom HTML", customHtml: variant.customHtml || '<!doctype html><html><head><meta charset="utf-8"></head><body><a href="appboy://close" aria-label="Close message">Close</a></body></html>',
    global: { ...variant.global, displayType: messageType === "Slideup" ? "Slideup" : messageType === "Full Screen" ? "Full screen" : "Modal", overlayOpacity: messageType === "Slideup" ? 0 : 75 },
  };
}
export function validateTraditional(variant: InAppVariant): string[] {
  if (variant.editorMode !== "traditional") return [];
  const config = variant.traditional;
  if (!config || typeof config !== "object") return ["Missing traditional editor settings."];
  const issues: string[] = [];
  if (!traditionalMessageTypes.includes(config.messageType)) issues.push("Choose a traditional message type.");
  if (variant.pages.length !== 1) issues.push("Traditional messages must contain exactly one page.");
  if (!config.bodyAction || typeof config.bodyAction.text !== "string") issues.push("Choose the message on-click behavior.");
  if (config.messageType === "Email Capture Form" && pageButtons(variant.pages[0]).length !== 1) issues.push("Email capture forms require one submit button.");
  if (pageButtons(variant.pages[0]).length > 2) issues.push("Traditional messages support at most two buttons.");
  if (!["Any", "Portrait", "Landscape"].includes(config.orientation)) issues.push("Invalid message orientation.");
  if (!["Image & text", "Image only"].includes(config.layout)) issues.push("Choose a message layout.");
  if (!["All iOS devices", "iPad only", "iPhone and iPod touch only"].includes(config.iosDevices)) issues.push("Invalid iOS device targeting.");
  if (!["Wait for user", "Automatically dismiss"].includes(config.closeBehavior)) issues.push("Choose a message close behavior.");
  if (!Number.isFinite(config.closeAfterSeconds) || config.closeAfterSeconds < 1 || config.closeAfterSeconds > 60) issues.push("Automatic dismissal must be between 1 and 60 seconds.");
  for (const key of ["emailPlaceholder", "termsText", "termsUrl", "headerColor"] as const) if (typeof config[key] !== "string") issues.push(`Invalid traditional ${key}.`);
  if (config.termsUrl && !/[{][{%]/.test(config.termsUrl) && !/^https?:\/\//i.test(config.termsUrl)) issues.push("Enter an HTTP or HTTPS terms URL.");
  if (!["left", "center", "right"].includes(config.headerAlignment) || !["left", "center", "right"].includes(config.bodyAlignment)) issues.push("Invalid text alignment.");
  if (!Number.isFinite(config.headerOpacity) || config.headerOpacity < 0 || config.headerOpacity > 100) issues.push("Invalid header opacity.");
  if (!Array.isArray(config.buttonDesigns) || config.buttonDesigns.length !== 2 || config.buttonDesigns.some(design => !design || [design.background, design.color, design.borderColor].some(color => typeof color !== "string") || !Number.isFinite(design.opacity) || design.opacity < 0 || design.opacity > 100)) issues.push("Invalid button design.");
  if ((config.messageType === "Full Screen" || config.layout === "Image only" && config.messageType === "Modal") && !variant.pages[0].imageUrl.trim()) issues.push("Add an image for the image-only layout or fullscreen message.");
  if (config.messageType === "Custom HTML" && !variant.customCode) issues.push("Custom HTML requires the HTML editor.");
  if (config.messageType === "Custom HTML" && !/appboy:\/\/close|brazeBridge\.(?:closeMessage|dismissMessage)/.test(variant.customHtml ?? "")) issues.push("Custom HTML must include a close or dismiss control.");
  if (config.messageType === "Email Capture Form" && !config.emailPlaceholder?.trim()) issues.push("Enter an email capture placeholder.");
  return issues;
}

export function validateInAppAction(button: InAppButton): string[] {
  if (!["dismiss", "web_url", "deep_link", "page", "log_event", "set_attribute", "request_push"].includes(button.behavior)) return ["Choose a valid on-click behavior."];
  if (typeof button.href !== "string") return ["Invalid on-click destination."];
  if (button.behavior === "log_event" && !button.eventName?.trim()) return ["Enter a custom event name."];
  if (button.behavior === "set_attribute" && (!button.attributeName?.trim() || typeof button.attributeValue !== "string")) return ["Enter a custom attribute name and value."];
  return [];
}
export function describeInAppAction(button: InAppButton): string {
  if (button.behavior === "log_event") return `Local preview: log custom event “${button.eventName}”.`;
  if (button.behavior === "set_attribute") return `Local preview: set ${button.attributeName} = ${button.attributeValue}.`;
  if (button.behavior === "request_push") return "Local preview: request push permission. No browser permission prompt is sent.";
  return button.href;
}
