import catalog from "./in-app-template-catalog.json";
import sourcePages from "./in-app-source-pages.json";
import { defaultGlobal, type InAppPage, type InAppGlobalStyle, type InAppVariant } from "./in-app-model";

export type InAppTemplate = { id: string; name: string; description: string; pages?: InAppPage[]; global?: InAppGlobalStyle; variant?: InAppVariant; tags?: string[]; updatedAt?: string };
const capturedPages = sourcePages as InAppPage[];
export const inAppTemplates: InAppTemplate[] = catalog.map(template => ({
  ...template,
  pages: template.name === "Onboarding flow" ? capturedPages.slice(0, 5) : template.name === "Basic" ? [capturedPages[5]] : template.name === "Email sign-up with background image" ? [capturedPages[6]] : template.name === "Email sign-up with confirmation page" ? capturedPages.slice(7, 9) : template.name === "Blank" ? [{ ...capturedPages[5], id: "blank", name: "Blank", title: "", body: "", buttons: [], extraBlocks: [], imageUrl: "" }] : undefined,
  global: { ...defaultGlobal },
}));
