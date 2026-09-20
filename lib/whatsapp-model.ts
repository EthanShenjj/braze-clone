export type WhatsAppMessageMode = "template" | "response";
export type WhatsAppResponseLayout = "quick_reply" | "text" | "media" | "cta" | "list";
export type WhatsAppHeaderType = "none" | "image";

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
  responseMediaType: "image" | "video" | "document";
  responseMediaUrl: string;
  responseButtonText: string;
  responseButtonUrl: string;
  quickReplies: string[];
  listOptions: string[];
  conversationWindowOpen: boolean;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  category: "Marketing" | "Utility" | "Authentication";
  status: "Approved" | "Pending" | "Rejected";
  headerType: WhatsAppHeaderType;
  body: string;
  footer: string;
  variables: Array<{ key: string; label: string; example: string; fallback: string }>;
  button: { type: "website" | "phone" | "quick_reply" | "marketing_opt_out" | "copy_code"; label: string; url?: string };
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
];

export function getWhatsAppTemplate(id: string) {
  return whatsappTemplates.find(template => template.id === id) ?? whatsappTemplates[0];
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
    responseBody: "Thanks for messaging Thinkingai. How can we help?",
    responseMediaType: "image",
    responseMediaUrl: "",
    responseButtonText: "View order",
    responseButtonUrl: "https://example.com/orders",
    quickReplies: ["Track an order", "Talk to support"],
    listOptions: ["Order status", "Returns", "Product help"],
    conversationWindowOpen: false,
  };
}

type WhatsAppCampaignLike = { body?: string; config?: Record<string, unknown> };

export function normalizeWhatsAppVariants(campaign: WhatsAppCampaignLike): WhatsAppVariant[] {
  const stored = campaign.config?.whatsappVariants;
  if (Array.isArray(stored) && stored.length) return stored as WhatsAppVariant[];
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

export function renderWhatsAppVariant(variant: WhatsAppVariant) {
  if (variant.mode === "response") return variant.responseBody;
  const template = getWhatsAppTemplate(variant.templateId);
  return template.body.replace(/\{\{(\d+)\}\}/g, (_match, key: string) => {
    const variable = variant.variables.find(item => item.key === key);
    return variable?.value.trim() || variable?.fallback.trim() || `{{${key}}}`;
  });
}

function isHttpsUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validateWhatsAppCampaign(campaign: WhatsAppCampaignLike): string[] {
  const issues: string[] = [];
  for (const variant of normalizeWhatsAppVariants(campaign)) {
    const prefix = `${variant.name}:`;
    if (!variant.businessAccount) issues.push(`${prefix} Select a WhatsApp Business Account.`);
    if (!variant.subscriptionGroup) issues.push(`${prefix} Select a WhatsApp subscription group.`);
    if (variant.mode === "template") {
      const template = getWhatsAppTemplate(variant.templateId);
      if (!variant.templateId) issues.push(`${prefix} Select an approved template.`);
      if (template.status !== "Approved") issues.push(`${prefix} The selected template is not approved.`);
      for (const variable of variant.variables) {
        if (!variable.value.trim() && !variable.fallback.trim()) issues.push(`${prefix} Add a value or fallback for ${variable.label}.`);
      }
      if (variant.headerType === "image" && !isHttpsUrl(variant.headerUrl)) issues.push(`${prefix} Add a valid HTTPS header image URL.`);
      if (template.button.type === "website" && !isHttpsUrl(variant.buttonUrl)) issues.push(`${prefix} Add a valid HTTPS button URL.`);
    } else {
      if (!variant.conversationWindowOpen) issues.push(`${prefix} Response messages require a simulated open 24-hour conversation window.`);
      if (!variant.responseBody.trim()) issues.push(`${prefix} Add response message content.`);
      if (variant.responseLayout === "media" && !isHttpsUrl(variant.responseMediaUrl)) issues.push(`${prefix} Add a valid HTTPS media URL.`);
      if (variant.responseLayout === "cta" && (!variant.responseButtonText.trim() || !isHttpsUrl(variant.responseButtonUrl))) issues.push(`${prefix} Add button text and a valid HTTPS CTA URL.`);
      if (variant.responseLayout === "quick_reply" && (!variant.quickReplies.length || variant.quickReplies.length > 3)) issues.push(`${prefix} Add between 1 and 3 quick replies.`);
      if (variant.responseLayout === "list" && (!variant.listOptions.length || variant.listOptions.length > 10)) issues.push(`${prefix} Add between 1 and 10 list options.`);
    }
  }
  return [...new Set(issues)];
}
