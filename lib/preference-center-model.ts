export type PreferenceBlockType = "title" | "paragraph" | "preference" | "button" | "divider" | "spacer" | "image";

export type PreferenceBlockStyle = {
  align?: "left" | "center" | "right";
  fontSize?: number;
  color?: string;
  background?: string;
  paddingY?: number;
};

export type PreferenceBlockConfig = {
  id: string;
  type: PreferenceBlockType;
  content: string;
  style?: PreferenceBlockStyle;
};

export type PreferenceCenterCopy = {
  preferenceTitle: string;
  preferenceHelp: string;
  subscribeAllLabel: string;
  unsubscribeAllLabel: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  errorTitle: string;
  errorBody: string;
};

export type PreferenceCenterDesign = {
  pageBackground: string;
  surfaceBackground: string;
  accentColor: string;
  textColor: string;
  contentWidth: number;
  fontFamily: "Arial" | "Helvetica" | "Georgia";
};

export type PreferenceCenterConfig = {
  blocks: PreferenceBlockConfig[];
  showDescriptions: boolean;
  showGlobalControls: boolean;
  copy: PreferenceCenterCopy;
  design: PreferenceCenterDesign;
  locales: Record<string, Partial<PreferenceCenterCopy>>;
};

export const preferenceCenterDefaultCopy: PreferenceCenterCopy = {
  preferenceTitle: "Email preferences",
  preferenceHelp: "Select the messages you want to receive.",
  subscribeAllLabel: "Subscribe to all email",
  unsubscribeAllLabel: "Unsubscribe from all email",
  submitLabel: "Save my preferences",
  successTitle: "Your preferences have been saved",
  successBody: "Your email subscription choices are up to date.",
  errorTitle: "We couldn't save your preferences",
  errorBody: "Please try again, or return to the email and use its preference link.",
};

export const preferenceCenterDefaultConfig: PreferenceCenterConfig = {
  blocks: [
    { id: "logo", type: "image", content: "Thinkingai", style: { align: "center" } },
    { id: "title", type: "title", content: "Update your email preferences", style: { align: "center", fontSize: 28 } },
    { id: "copy", type: "paragraph", content: "Choose the email updates that are most useful to you.", style: { align: "center", fontSize: 14 } },
    { id: "preferences", type: "preference", content: "" },
    { id: "save", type: "button", content: "Save my preferences", style: { align: "center" } },
  ],
  showDescriptions: true,
  showGlobalControls: true,
  copy: preferenceCenterDefaultCopy,
  design: {
    pageBackground: "#f6f6f8",
    surfaceBackground: "#ffffff",
    accentColor: "#5b2bbd",
    textColor: "#24212b",
    contentWidth: 600,
    fontFamily: "Arial",
  },
  locales: {
    "zh-CN": {
      preferenceTitle: "邮件订阅偏好",
      preferenceHelp: "选择您希望接收的邮件内容。",
      subscribeAllLabel: "订阅全部邮件",
      unsubscribeAllLabel: "退订全部邮件",
      submitLabel: "保存我的偏好",
      successTitle: "您的偏好已保存",
      successBody: "您的邮件订阅选择已经更新。",
    },
  },
};

function validBlock(value: unknown): value is PreferenceBlockConfig {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<PreferenceBlockConfig>;
  return typeof block.id === "string" && typeof block.content === "string" && ["title", "paragraph", "preference", "button", "divider", "spacer", "image"].includes(String(block.type));
}

export function normalizePreferenceCenterConfig(value: unknown): PreferenceCenterConfig {
  const source = value && typeof value === "object" ? value as Partial<PreferenceCenterConfig> : {};
  const designSource: Partial<PreferenceCenterDesign> = source.design && typeof source.design === "object" ? source.design : {};
  const copySource: Partial<PreferenceCenterCopy> = source.copy && typeof source.copy === "object" ? source.copy : {};
  const blocks = Array.isArray(source.blocks) && source.blocks.filter(validBlock).length ? source.blocks.filter(validBlock) : preferenceCenterDefaultConfig.blocks;
  const localeSource = source.locales && typeof source.locales === "object" ? source.locales : {};
  return {
    blocks: blocks.map(block => ({ ...block, style: block.style ? { ...block.style } : undefined })),
    showDescriptions: source.showDescriptions ?? preferenceCenterDefaultConfig.showDescriptions,
    showGlobalControls: source.showGlobalControls ?? preferenceCenterDefaultConfig.showGlobalControls,
    copy: { ...preferenceCenterDefaultCopy, ...copySource },
    design: {
      ...preferenceCenterDefaultConfig.design,
      ...designSource,
      contentWidth: [560, 600, 640, 700].includes(Number(designSource.contentWidth)) ? Number(designSource.contentWidth) : preferenceCenterDefaultConfig.design.contentWidth,
      fontFamily: ["Arial", "Helvetica", "Georgia"].includes(String(designSource.fontFamily)) ? String(designSource.fontFamily) as PreferenceCenterDesign["fontFamily"] : preferenceCenterDefaultConfig.design.fontFamily,
    },
    locales: Object.fromEntries(Object.entries(localeSource).filter(([, translation]) => translation && typeof translation === "object").map(([locale, translation]) => [locale, translation as Partial<PreferenceCenterCopy>])),
  };
}

export function localizedPreferenceCenterCopy(config: PreferenceCenterConfig, locale?: string | null): PreferenceCenterCopy {
  const translation = locale ? config.locales[locale] : undefined;
  return { ...config.copy, ...translation };
}
