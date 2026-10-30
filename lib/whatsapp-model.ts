import { renderBrazeLiquid } from "./email-liquid.ts";

export type WhatsAppMessageMode = "template" | "response";
export type WhatsAppResponseLayout = "quick_reply" | "text" | "media" | "cta" | "list" | "carousel" | "flow" | "product";
export type WhatsAppHeaderType = "none" | "image" | "text";

export type WhatsAppVariable = {
  key: string;
  label: string;
  value: string;
  fallback: string;
};

export type WhatsAppVariant = {
  id: string;
  name: string;
  mode: WhatsAppMessageMode;
  businessAccount: string;
  subscriptionGroup: string;
  templateId: string;
  language: string;
  headerType: WhatsAppHeaderType;
  headerUrl: string;
  variables: WhatsAppVariable[];
  buttonUrl: string;
  responseLayout: WhatsAppResponseLayout;
  responseBody: string;
  responseMediaType: "image" | "video" | "document" | "audio";
  responseMediaUrl: string;
  responseButtonText: string;
  responseButtonUrl: string;
  quickReplies: string[];
  listOptions: string[];
  /** Legacy preview preference; never evidence of recipient eligibility. */
  conversationWindowOpen: boolean;
  messageTypeChosen?: boolean;
  responseHeaderType: "none" | "text" | "media";
  responseHeaderText: string;
  responseFooter: string;
  clickTracking: boolean;
  urlPreview?:boolean;
  responseTranslations?:Record<string,string>;
  responseLanguages?:string[];
  responseLayoutChosen?:boolean;
  carouselMediaType: "image" | "video";
  carouselButtonType: "website" | "quick_reply";
  carouselCards: Array<{ id: string; body: string; mediaUrl: string; buttons: Array<{ label: string; url: string }> }>;
  listSections: Array<{ id: string; title: string; rows: string[] }>;
  productLayout: "catalog" | "multi" | "single";
  flowId?: string;
  flowToken?: string;
  flowCta?: string;
  flowScreen?: string;
  catalogId?: string;
  productIds?: string[];
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  category: "Marketing" | "Utility" | "Authentication";
  status: "Approved" | "Pending" | "Rejected" | "Draft";
  headerType: WhatsAppHeaderType;
  body: string;
  headerText?: string;
  footer: string;
  variables: Array<{ key: string; label: string; example: string; fallback: string }>;
  button: { type: "website" | "phone" | "quick_reply" | "marketing_opt_out" | "copy_code"; label: string; url?: string };
  buttons?: Array<{ type: "website" | "phone" | "quick_reply"; label: string; url?: string }>;
};

export const whatsappAccounts = [
  { id: "demo_waba", name: "Thinkingai Demo", phone: "+1 415 555 0108", quality: "High" },
] as const;

export const whatsappTemplates: WhatsAppTemplate[] = [
  {
    id: "september_offer_en",
    name: "September offer",
    language: "English (US)",
    category: "Marketing",
    status: "Approved",
    headerType: "image",
    body: "Hi {{1}}, your September offer is here. Use code {{2}} to save 20% on this month’s featured collection.",
    footer: "Reply STOP to opt out",
    variables: [
      { key: "1", label: "First name", example: "Carla", fallback: "there" },
      { key: "2", label: "Offer code", example: "SEPTEMBER20", fallback: "SEPTEMBER20" },
    ],
    button: { type: "website", label: "Claim offer", url: "https://example.com/offers/{{1}}" },
  },
  {
    id: "september_offer_zh",
    name: "September offer",
    language: "Chinese (Simplified)",
    category: "Marketing",
    status: "Approved",
    headerType: "image",
    body: "你好 {{1}}，九月专属礼遇已上线。使用优惠码 {{2}}，本月精选商品立减 20%。",
    footer: "回复 STOP 即可退订",
    variables: [
      { key: "1", label: "First name", example: "小林", fallback: "朋友" },
      { key: "2", label: "Offer code", example: "SEPTEMBER20", fallback: "SEPTEMBER20" },
    ],
    button: { type: "website", label: "立即领取", url: "https://example.com/offers/{{1}}" },
  },
  {
    id: "order_update_en",
    name: "Order update",
    language: "English (US)",
    category: "Utility",
    status: "Approved",
    headerType: "none",
    body: "Your order {{1}} is now {{2}}. We’ll send another update when it is ready for delivery.",
    footer: "Thinkingai Orders",
    variables: [
      { key: "1", label: "Order number", example: "#10428", fallback: "your order" },
      { key: "2", label: "Order status", example: "packed", fallback: "being processed" },
    ],
    button: { type: "website", label: "Track order", url: "https://example.com/orders/{{1}}" },
  },
  {
    id: "login_code_en",
    name: "Login verification",
    language: "English (US)",
    category: "Authentication",
    status: "Approved",
    headerType: "none",
    body: "{{1}} is your verification code. This code expires in 10 minutes.",
    footer: "Do not share this code.",
    variables: [{ key: "1", label: "One-time code", example: "827491", fallback: "000000" }],
    button: { type: "copy_code", label: "Copy code" },
  },
  {
    id: "abandoned_onboarding", name: "abandoned_onboarding", language: "English", category: "Marketing", status: "Approved", headerType: "image",
    body: "Hi {{1}}. You only have {{2}} steps left to complete your Upon Voyage profile.", footer: "",
    variables: [{ key: "1", label: "Variable 1", example: "", fallback: "" }, { key: "2", label: "Variable 2", example: "", fallback: "" }],
    button: { type: "quick_reply", label: "Finish now" }, buttons: [{ type: "quick_reply", label: "Finish now" }, { type: "quick_reply", label: "Remind me later" }],
  },
  {
    id: "e2e_draft_template", name: "e2e_draft_template", language: "English", category: "Marketing", status: "Draft", headerType: "none",
    body: "Hi {{1}}, your order {{2}} is ready.", footer: "", variables: [{ key: "1", label: "Name", example: "", fallback: "" }, { key: "2", label: "Order", example: "", fallback: "" }], button: { type: "quick_reply", label: "OK" },
  },
];

export type WhatsAppCampaignLike = { body?: string; config?: Record<string, unknown> };

export function getWhatsAppTemplate(id: string, extras?: WhatsAppTemplate[]) {
  return extras?.find(template => template.id === id) ?? whatsappTemplates.find(template => template.id === id) ?? whatsappTemplates[0];
}

// Custom templates submitted from the editor live in campaign config with a
// simulated Meta approval lifecycle (Pending → Approved/Rejected).
export function customWhatsAppTemplates(campaign: WhatsAppCampaignLike): WhatsAppTemplate[] {
  const stored = campaign.config?.whatsappCustomTemplates;
  return Array.isArray(stored) ? stored.filter((item): item is WhatsAppTemplate => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.body === "string" && Array.isArray(item.variables) && item.variables.every((v: { key?: unknown; label?: unknown; example?: unknown; fallback?: unknown }) => v && [v.key, v.label, v.example, v.fallback].every(value => typeof value === "string")) && item.button && typeof item.button.label === "string")) : [];
}

export function upsertCustomWhatsAppTemplate(campaign: WhatsAppCampaignLike, template: WhatsAppTemplate): WhatsAppTemplate[] {
  const existing = customWhatsAppTemplates(campaign).filter(item => item.id !== template.id);
  return [...existing, template];
}


export function createWhatsAppVariant(index = 0): WhatsAppVariant {
  const template = whatsappTemplates[0];
  return {
    id: `wa_variant_${index + 1}`,
    name: `Variant ${index + 1}`,
    mode: "template",
    businessAccount: whatsappAccounts[0].id,
    subscriptionGroup: "WhatsApp updates",
    templateId: template.id,
    language: template.language,
    headerType: template.headerType,
    headerUrl: "https://placehold.co/960x540/e8f5ec/167746?text=September+Offer",
    variables: template.variables.map(variable => ({ ...variable, value: variable.example })),
    buttonUrl: template.button.url ?? "",
    responseLayout: "text",
    messageTypeChosen:false,responseLayoutChosen:false,urlPreview:true,responseLanguages:["en"],responseTranslations:{},
    responseBody: "Thanks for messaging Thinkingai. How can we help?",
    responseMediaType: "image",
    responseMediaUrl: "",
    responseButtonText: "View order",
    responseButtonUrl: "https://example.com/orders",
    quickReplies: ["Track an order", "Talk to support"],
    listOptions: ["Order status", "Returns", "Product help"],
    conversationWindowOpen: false,
    responseHeaderType: "none", responseHeaderText: "", responseFooter: "", clickTracking: true,
    carouselMediaType: "image", carouselButtonType: "quick_reply",
    carouselCards: [1, 2].map(index => ({ id: `card_${index}`, body: "", mediaUrl: "", buttons: [{ label: "", url: "" }] })),
    listSections: [], productLayout: "catalog", flowId:"",flowToken:"",flowCta:"Open",flowScreen:"",catalogId:"",productIds:[],
  };
}

export function normalizeWhatsAppVariants(campaign: WhatsAppCampaignLike): WhatsAppVariant[] {
  const stored = campaign.config?.whatsappVariants;
  if (Array.isArray(stored) && stored.length) return stored.map((value, index) => {
    const base = createWhatsAppVariant(index);
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const next = { ...base } as WhatsAppVariant;
    for (const key of Object.keys(base) as Array<keyof WhatsAppVariant>) {
      if (typeof base[key] === "string" && typeof item[key] === "string") (next as unknown as Record<string, unknown>)[key] = item[key];
    }
    next.conversationWindowOpen = item.conversationWindowOpen === true;
    next.messageTypeChosen = item.messageTypeChosen === true || (item.messageTypeChosen === undefined && typeof item.mode === "string");
    next.clickTracking = item.clickTracking !== false;
    next.urlPreview=item.urlPreview===true;
    next.responseLayoutChosen=item.responseLayoutChosen===true||(item.responseLayoutChosen===undefined&&typeof item.responseLayout==="string");
    next.responseLanguages=Array.isArray(item.responseLanguages)?item.responseLanguages.filter((v):v is string=>typeof v==="string"):["en"];
    next.responseTranslations=item.responseTranslations&&typeof item.responseTranslations==="object"?Object.fromEntries(Object.entries(item.responseTranslations).filter(([,v])=>typeof v==="string")) as Record<string,string>:{};
    next.productIds=Array.isArray(item.productIds)?item.productIds.filter((v):v is string=>typeof v==="string"):[];
    next.carouselCards = Array.isArray(item.carouselCards) ? item.carouselCards.filter(v => v && typeof v === "object").map((v, i) => ({ id: String(v.id ?? `card_${i}`), body: String(v.body ?? ""), mediaUrl: String(v.mediaUrl ?? ""), buttons: Array.isArray(v.buttons) ? v.buttons.filter((b: unknown) => b && typeof b === "object").map((b: {label?: unknown; url?: unknown}) => ({label: String(b.label ?? ""), url: String(b.url ?? "")})) : [] })) : base.carouselCards;
    next.listSections = Array.isArray(item.listSections) ? item.listSections.filter(v => v && typeof v === "object").map((v, i) => ({ id: String(v.id ?? `section_${i}`), title: String(v.title ?? ""), rows: Array.isArray(v.rows) ? v.rows.filter((row: unknown): row is string => typeof row === "string") : [] })) : [];
    next.variables = Array.isArray(item.variables) ? item.variables.filter(v => v && typeof v === "object").map(v => ({ key: String(v.key ?? ""), label: String(v.label ?? "Variable"), value: typeof v.value === "string" ? v.value : "", fallback: typeof v.fallback === "string" ? v.fallback : "" })) : [];
    next.quickReplies = Array.isArray(item.quickReplies) ? item.quickReplies.filter((v): v is string => typeof v === "string") : [];
    next.listOptions = Array.isArray(item.listOptions) ? item.listOptions.filter((v): v is string => typeof v === "string") : [];
    return next;
  });
  const legacy = (campaign.config?.channelValues ?? {}) as Record<string, unknown>;
  const base = createWhatsAppVariant();
  const legacyTemplate = String(legacy.template ?? "").toLowerCase().includes("order") ? whatsappTemplates[2] : whatsappTemplates[0];
  return [{
    ...base,
    templateId: legacyTemplate.id,
    language: String(legacy.language ?? legacyTemplate.language),
    headerType: String(legacy.headerMedia ?? "").toLowerCase() === "image" ? "image" : legacyTemplate.headerType,
    headerUrl: String(legacy.imageUrl ?? base.headerUrl),
    buttonUrl: String(legacy.buttonUrl ?? legacyTemplate.button.url ?? ""),
    variables: legacyTemplate.variables.map((variable, index) => ({ ...variable, value: index === 0 && campaign.body ? campaign.body : variable.example })),
  }];
}

export function renderWhatsAppVariant(variant: WhatsAppVariant, extras?: WhatsAppTemplate[]) {
  if (variant.mode === "response") return variant.responseBody;
  const template = getWhatsAppTemplate(variant.templateId, extras);
  return template.body.replace(/\{\{(\d+)\}\}/g, (_match, key: string) => {
    const variable = variant.variables.find(item => item.key === key);
    return variable?.value.trim() || variable?.fallback.trim() || `{{${key}}}`;
  });
}

function isMediaUrl(value: string) {
  return /^\/api\/whatsapp\/media\/[a-zA-Z0-9_-]+$/.test(value) || isHttpsUrl(value);
}

function isHttpsUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validateWhatsAppCampaign(campaign: WhatsAppCampaignLike): string[] {
  const issues: string[] = [];
  if (campaign.config?.whatsappSetupStage === "type") issues.push("Select a WhatsApp message type and template or response layout.");
  if (campaign.config?.whatsappSetupStage === "layout") issues.push("Select a WhatsApp response layout.");
  for (const variant of normalizeWhatsAppVariants(campaign)) {
    const prefix = `${variant.name}:`;
    if (!variant.businessAccount.trim()) issues.push(`${prefix} Select a WhatsApp Business Account.`);
    if (!variant.subscriptionGroup) issues.push(`${prefix} Select a WhatsApp subscription group.`);
    if (variant.mode === "template") {
      const template = [...whatsappTemplates, ...customWhatsAppTemplates(campaign)].find(item => item.id === variant.templateId);
      if (!template) { issues.push(`${prefix} Select an approved template.`); continue; }
      if (variant.language !== template.language) issues.push(`${prefix} Template language does not match the selected template.`);
      if (template.status !== "Approved") issues.push(`${prefix} The selected template is not approved.`);
      for (const required of template.variables) {
        const variable = variant.variables.find(item => item.key === required.key);
        if (!variable || !variable.value.trim() && !variable.fallback.trim()) issues.push(`${prefix} Add a value or fallback for ${required.label}.`);
      }
      if (!template.body.trim()) issues.push(`${prefix} Add template body content.`);
      if (variant.headerType !== template.headerType) issues.push(`${prefix} Header type does not match the selected template.`);
      if (template.headerType === "image" && !isMediaUrl(variant.headerUrl)) issues.push(`${prefix} Add a valid HTTPS header image URL.`);
      if (template.button.type === "website" && !isHttpsUrl(variant.buttonUrl)) issues.push(`${prefix} Add a valid HTTPS button URL.`);
    } else if (variant.mode === "response") {
      if (!["none", "text", "media"].includes(variant.responseHeaderType)) issues.push(`${prefix} Select a valid header type.`);
      if (!["image", "video", "document", "audio"].includes(variant.responseMediaType)) issues.push(`${prefix} Select a valid media type.`);
      if (!["text", "quick_reply", "media", "cta", "list", "carousel", "flow", "product"].includes(variant.responseLayout)) issues.push(`${prefix} Select a valid response layout.`);
      if (!variant.responseBody.trim() && !(variant.responseLayout === "media" && variant.responseMediaUrl)) issues.push(`${prefix} Add response message content.`);
      const bodyLimit = variant.responseLayout === "text" ? 4096 : 1024;
      if (variant.responseBody.length > bodyLimit) issues.push(`${prefix} Response body exceeds ${bodyLimit.toLocaleString("en-US")} characters.`);
      if (variant.responseFooter.length > 60 || variant.responseHeaderText.length > 60) issues.push(`${prefix} Headers and footers must not exceed 60 characters.`);
      if (variant.responseLayout === "quick_reply" && variant.responseHeaderType === "text" && !variant.responseHeaderText.trim()) issues.push(`${prefix} Add header text.`);
      if (variant.responseLayout === "quick_reply" && variant.responseHeaderType === "media" && !isMediaUrl(variant.responseMediaUrl)) issues.push(`${prefix} Add a valid HTTPS header media URL.`);
      if (variant.responseLayout === "media" && !isMediaUrl(variant.responseMediaUrl)) issues.push(`${prefix} Add a valid HTTPS media URL.`);
      if (variant.responseLayout === "cta" && (!variant.responseButtonText.trim() || !isHttpsUrl(variant.responseButtonUrl))) issues.push(`${prefix} Add button text and a valid HTTPS CTA URL.`);
      if (variant.responseLayout === "quick_reply" && (!variant.quickReplies.length || variant.quickReplies.length > 3)) issues.push(`${prefix} Add between 1 and 3 quick replies.`);
      if (variant.responseLayout === "list" && (!variant.listOptions.length || variant.listOptions.length > 10)) issues.push(`${prefix} Add between 1 and 10 list options.`);
      const options = variant.responseLayout === "quick_reply" ? variant.quickReplies : variant.responseLayout === "list" ? variant.listOptions : [];
      const max = variant.responseLayout === "quick_reply" ? 20 : 24;
      if (options.some(option => !option.trim() || option.length > max)) issues.push(`${prefix} Option labels must contain 1–${max} characters.`);
      if (new Set(options.map(option => option.trim().toLowerCase())).size !== options.length) issues.push(`${prefix} Option labels must be unique.`);
      if (variant.responseLayout === "list" && !variant.responseButtonText.trim()) issues.push(`${prefix} Add a list button label.`);
      if (variant.responseLayout === "list" && variant.listSections.some(section => section.title.length > 24 || !section.rows.length)) issues.push(`${prefix} List sections require rows and titles of up to 24 characters.`);
      if (variant.responseLayout === "carousel") {
        if (variant.carouselCards.length < 2 || variant.carouselCards.length > 10) issues.push(`${prefix} Add between 2 and 10 carousel cards.`);
        variant.carouselCards.forEach((card, index) => {
          if (!isMediaUrl(card.mediaUrl)) issues.push(`${prefix} Card ${index + 1} requires a valid HTTPS media URL.`);
          if (card.body.length > 160) issues.push(`${prefix} Card ${index + 1} exceeds 160 characters.`);
          const max = variant.carouselButtonType === "website" ? 1 : 2;
          if (!card.buttons.length || card.buttons.length > max || card.buttons.some(button => !button.label.trim() || button.label.length > 20 || variant.carouselButtonType === "website" && !isHttpsUrl(button.url))) issues.push(`${prefix} Card ${index + 1} requires valid button text and URLs.`);
        });
      }
      if (variant.responseLayout === "flow" && (!variant.flowId?.trim() || !variant.flowCta?.trim())) issues.push(`${prefix} No Flows available for this WhatsApp Business Account. Enter a published Flow ID and button label.`);
      if (variant.responseLayout === "product" && (!variant.catalogId?.trim() || variant.productLayout!=="catalog"&&!variant.productIds?.length)) issues.push(`${prefix} Connect a Meta catalog before sending product messages and choose products.`);
    } else issues.push(`${prefix} Select a valid message type.`);
  }
  return [...new Set(issues)];
}


export function whatsAppTemplateVariables(body: string) {
  return [...new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g), match => match[1]))].sort((a, b) => Number(a) - Number(b));
}

export function validateWhatsAppTemplate(template: WhatsAppTemplate) {
  const issues: string[] = [];
  if (!/^[a-z0-9_]+$/.test(template.name)) issues.push("Template names can only contain lowercase letters, numbers, and underscores.");
  if (!template.body.trim()) issues.push("Add template body content.");
  const numberedBody = template.body.replace(/\{\{[^}]*?\}\}/g, "{{1}}");
  if (numberedBody.length > 1024) issues.push("Template body exceeds 1,024 characters.");
  if (template.headerType === "text" && (!template.headerText?.trim() || template.headerText.length > 60)) issues.push("Text headers must contain 1–60 characters.");
  const keys = whatsAppTemplateVariables(template.body);
  if (keys.some((key, index) => Number(key) !== index + 1)) issues.push("Template variables must be sequential, starting at {{1}}.");
  return issues;
}

export function prepareWhatsAppMessage(variant: WhatsAppVariant, extras: WhatsAppTemplate[] = [], profile: Record<string, unknown> = {}) {
  const render = (source: string) => renderBrazeLiquid(source, profile);
  const template = [...whatsappTemplates, ...extras].find(item => item.id === variant.templateId);
  const resolved = { ...variant, variables: variant.variables.map(variable => ({ ...variable, value: render(variable.value).trim() || render(variable.fallback).trim() })) };
  if (variant.mode === "template" && !template) throw new Error("Select an approved template.");
  if (variant.mode === "template" && template?.variables.some(required => !resolved.variables.find(variable => variable.key === required.key)?.value)) throw new Error("A required template variable is empty for this recipient.");
  const message = render(variant.mode==="response"?variant.responseTranslations?.[String(profile.language??variant.language)]??renderWhatsAppVariant(resolved,extras):renderWhatsAppVariant(resolved, extras));
  if (!message.trim() && !(variant.mode === "response" && variant.responseLayout === "media" && variant.responseMediaUrl)) throw new Error("The rendered WhatsApp message is empty.");
  const buttons = variant.mode === "template" && template ? (template.buttons ?? [template.button]).map(button => ({ label: render(button.label), type: button.type, url: button.type === "website" ? render((button === template.button ? variant.buttonUrl : button.url ?? variant.buttonUrl).replace(/\{\{(\d+)\}\}/g, (_match, key) => encodeURIComponent(resolved.variables.find(variable => variable.key === key)?.value ?? ""))) : undefined }))
    : variant.responseLayout === "cta" ? [{ label: render(variant.responseButtonText), type: "website", url: render(variant.responseButtonUrl) }]
    : variant.responseLayout === "quick_reply" ? variant.quickReplies.map(label => ({ label: render(label), type: "quick_reply", url: undefined })) : [];
  if (buttons.some(button => button.url !== undefined && !isHttpsUrl(button.url))) throw new Error("The rendered button URL must use HTTPS.");
  if (variant.mode === "response" && buttons.some(button => !button.label.trim() || button.label.length > 20)) throw new Error("Rendered button labels must contain 1–20 characters.");
  const listOptions = variant.mode === "response" && variant.responseLayout === "list" ? variant.listOptions.map(render) : [];
  if (listOptions.some(option => !option.trim() || option.length > 24) || new Set(listOptions.map(option => option.toLowerCase().trim())).size !== listOptions.length) throw new Error("Rendered list rows must be unique and contain 1–24 characters.");
  const mediaUrl = variant.mode === "template" ? variant.headerType === "image" ? render(variant.headerUrl) : undefined : variant.responseLayout === "media" || variant.responseLayout === "quick_reply" && variant.responseHeaderType === "media" ? render(variant.responseMediaUrl) : undefined;
  if (mediaUrl !== undefined && !isMediaUrl(mediaUrl)) throw new Error("The rendered media URL must use HTTPS.");
  return { message, urlPreview:variant.urlPreview===true,clickTracking:variant.clickTracking,mode: variant.mode, layout: variant.mode === "template" ? "template" : variant.responseLayout, templateId: variant.mode === "template" ? variant.templateId : undefined, language: variant.language,
    headerText: variant.mode === "template" ? template?.headerType === "text" ? render(template.headerText ?? "") : undefined : ["list", "cta", "flow"].includes(variant.responseLayout) || variant.responseLayout === "quick_reply" && variant.responseHeaderType === "text" ? render(variant.responseHeaderText) : undefined,
    mediaUrl,
    mediaType: variant.mode === "template" ? "image" : variant.responseMediaType,
    footer: variant.mode === "template" ? render(template?.footer ?? "") : ["quick_reply", "cta", "list", "flow", "product"].includes(variant.responseLayout) ? render(variant.responseFooter) : undefined, buttons,
    listOptions,
    listSections: variant.mode === "response" && variant.responseLayout === "list" ? variant.listSections.map(section => ({title: render(section.title), rows: section.rows.map(render)})) : [],
    listButton: variant.responseLayout === "list" ? render(variant.responseButtonText) : undefined,
    flow:variant.mode==="response"&&variant.responseLayout==="flow"?{id:variant.flowId,token:variant.flowToken,cta:render(variant.flowCta??"Open"),screen:variant.flowScreen}:undefined,
    product:variant.mode==="response"&&variant.responseLayout==="product"?{catalogId:variant.catalogId,layout:variant.productLayout,ids:variant.productIds??[]}:undefined,
    carouselCards: variant.mode === "response" && variant.responseLayout === "carousel" ? variant.carouselCards.map(card => {
      const mediaUrl = render(card.mediaUrl);
      const buttons = card.buttons.map(button => ({ label: render(button.label), url: variant.carouselButtonType === "website" ? render(button.url) : undefined }));
      if (!isMediaUrl(mediaUrl) || buttons.some(button => button.url !== undefined && !isHttpsUrl(button.url))) throw new Error("Carousel media and button URLs must use HTTPS.");
      if (buttons.some(button => !button.label.trim() || button.label.length > 20)) throw new Error("Rendered carousel button labels must contain 1–20 characters.");
      return { body: render(card.body), mediaUrl, buttons };
    }) : [] };
}

/** Setup state is independent of provider credentials and delivery eligibility. */
export function whatsAppComposeStage(campaign: WhatsAppCampaignLike, variant = normalizeWhatsAppVariants(campaign)[0]): "subscription" | "type" | "layout" | "editor" {
  if (!campaign.config?.subscriptionGroupId) return "subscription";
  if (campaign.config?.whatsappSetupStage === "type" || variant.messageTypeChosen === false) return "type";
  if (variant.mode === "response" && !variant.responseLayoutChosen) return "layout";
  return "editor";
}

export function whatsAppResponseEligibility(mode: WhatsAppMessageMode, inboundAt: unknown, now: string | number = Date.now()) {
  if (mode === "template") return { eligible: true, reason: "template" };
  const timestamp = typeof inboundAt === "string" && inboundAt.trim() ? Date.parse(inboundAt) : NaN;
  const clock = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(clock) || timestamp > clock) return { eligible: false, reason: "No verified inbound WhatsApp message timestamp is available." };
  const expiresAt = new Date(timestamp + 86400000).toISOString();
  return clock < timestamp + 86400000
    ? { eligible: true, reason: "inbound_window", inboundAt: new Date(timestamp).toISOString(), expiresAt }
    : { eligible: false, reason: "The recipient’s 24-hour WhatsApp response window has expired.", inboundAt: new Date(timestamp).toISOString(), expiresAt };
}

/** Read persisted profile activity only, never preview/test overrides or legacy flags. */
export function latestWhatsAppInbound(attributes: Record<string, unknown> = {}, events: Array<{ name: string; data: Record<string, unknown> }> = [], now: string | number = Date.now()) {
  const clock = typeof now === "number" ? now : Date.parse(now);
  const candidates = [attributes.whatsapp_last_inbound_at, attributes.last_whatsapp_inbound_at,
    ...events.filter(event => ["inbound_whatsapp", "Send Inbound WhatsApp Message"].includes(event.name)).map(event => event.data.createdAt)];
  return candidates.filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= clock)
    .sort((a,b) => Date.parse(b)-Date.parse(a))[0];
}
