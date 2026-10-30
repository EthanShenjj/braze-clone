import { traditionalAppearance, platformInAppButton } from "./in-app-traditional.ts";
import { Liquid } from "liquidjs";
import sanitizeHtml from "sanitize-html";
import { brazeLiquidSource, renderBrazeLiquid,registerBrazeRuntimeTags } from "./email-liquid.ts";
import { validateInAppVariant, type InAppVariant } from "./in-app-model.ts";

export function validateInAppSnapshot(value: unknown): asserts value is InAppVariant {
  const issues = validateInAppVariant(value);
  if (issues.length) throw new Error(issues.join(" "));
  const variant = value as InAppVariant;
  const engine = registerBrazeRuntimeTags(new Liquid({ strictFilters: true }));
  const strings = [variant.accessibilityLanguageLiquid ?? variant.accessibilityLanguage, variant.global.closeAccessibleName, variant.global.backgroundImageUrl, variant.customHtml ?? "", ...(variant.keyValuePairs ?? []).flatMap(pair => [pair.key, pair.value]), ...variant.pages.flatMap(page => [page.title, page.body, page.imageUrl, page.styleOverrides?.closeAccessibleName ?? "", page.styleOverrides?.backgroundImageUrl ?? "", ...(page.buttons ?? []).flatMap(button => [button.text, button.href, button.eventName ?? "", button.attributeName ?? "", button.attributeValue ?? ""]), ...page.extraBlocks.flatMap(block => [block.text, block.src ?? ""])])];
  if (variant.traditional) strings.push(variant.traditional.emailPlaceholder, variant.traditional.termsText, variant.traditional.termsUrl, ...[variant.traditional.bodyAction, ...variant.pages.flatMap(page => page.buttons ?? [])].flatMap(button => [button.text, button.href, button.eventName ?? "", button.attributeName ?? "", button.attributeValue ?? ""]));
  for(const button of [...variant.pages.flatMap(page=>page.buttons??[]),...(variant.traditional?[variant.traditional.bodyAction]:[])]) for(const action of Object.values(button.platformActions??{}))if(action)strings.push(action.href,action.eventName??"",action.attributeName??"",action.attributeValue??"");
  for (const text of strings) engine.parse(brazeLiquidSource(text));
}

export function prepareInAppPreview(value: unknown, profile: Record<string, unknown> = {}) {
  validateInAppSnapshot(value);
  const variant = structuredClone(traditionalAppearance(value,String(profile.colorScheme??profile.theme??"light")));
  const platform=String(profile.platform??"iOS");
  variant.pages=variant.pages.map(page=>({...page,buttons:page.buttons?.map(button=>platformInAppButton(button,platform))}));
  if(variant.traditional)variant.traditional.bodyAction=platformInAppButton(variant.traditional.bodyAction,platform);
  const render = (text: string) => renderBrazeLiquid(text, profile);
  const cleanHtml = (html: string) => sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "html", "head", "body", "style", "img", "button", "input", "select", "option", "label", "form", "meta"],
    allowedAttributes: { "*": ["class", "id", "style", "lang", "role", "aria-label"], a: ["href", "target"], img: ["src", "alt", "width", "height"], input: ["type", "name", "placeholder", "value"], button: ["type"], meta: ["name", "content", "charset"] },
    allowedSchemes: ["https", "http", "mailto", "tel", "appboy"], allowVulnerableTags: true,
  });
  // Render every page before returning: one invalid Liquid expression invalidates the message.
  variant.pages = variant.pages.map(page => ({
    ...page, title: render(page.title), body: render(page.body), imageUrl: render(page.imageUrl),
    buttons: page.buttons?.map(button => ({ ...button, text: render(button.text), href: render(button.href), eventName: button.eventName === undefined ? undefined : render(button.eventName), attributeName: button.attributeName === undefined ? undefined : render(button.attributeName), attributeValue: button.attributeValue === undefined ? undefined : render(button.attributeValue) })),
    extraBlocks: page.extraBlocks.map(block => ({ ...block, text: block.kind === "Custom Code" ? cleanHtml(render(block.text)) : render(block.text), src: block.src ? render(block.src) : undefined })),
  }));
  variant.accessibilityLanguage = render(variant.accessibilityLanguageLiquid || variant.accessibilityLanguage);
  variant.global.closeAccessibleName = render(variant.global.closeAccessibleName);
  variant.global.backgroundImageUrl = render(variant.global.backgroundImageUrl);
  variant.pages = variant.pages.map(page => ({ ...page, styleOverrides: page.styleOverrides ? { ...page.styleOverrides, ...(page.styleOverrides.closeAccessibleName !== undefined ? { closeAccessibleName: render(page.styleOverrides.closeAccessibleName) } : {}), ...(page.styleOverrides.backgroundImageUrl !== undefined ? { backgroundImageUrl: render(page.styleOverrides.backgroundImageUrl) } : {}) } : undefined }));
  variant.keyValuePairs = variant.keyValuePairs?.map(pair => ({ ...pair, key: render(pair.key), value: render(pair.value) }));
  const renderedKeys = variant.keyValuePairs?.map(pair => pair.key) ?? [];
  if (renderedKeys.some(key => !key.trim()) || new Set(renderedKeys).size !== renderedKeys.length) throw new Error("Rendered key-value pair keys must be nonempty and unique.");
  if (variant.traditional) {
    const config = variant.traditional, action = config.bodyAction;
    variant.traditional = { ...config, emailPlaceholder: render(config.emailPlaceholder), termsText: render(config.termsText), termsUrl: render(config.termsUrl), bodyAction: { ...action, text: render(action.text), href: render(action.href), eventName: action.eventName === undefined ? undefined : render(action.eventName), attributeName: action.attributeName === undefined ? undefined : render(action.attributeName), attributeValue: action.attributeValue === undefined ? undefined : render(action.attributeValue) } };
  }
  if (variant.customHtml) variant.customHtml = cleanHtml(render(variant.customHtml));
  const renderedIssues = validateInAppVariant(variant);
  if (renderedIssues.length) throw new Error(renderedIssues.join(" "));
  return variant;
}
