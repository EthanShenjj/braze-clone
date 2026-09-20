import assert from "node:assert/strict";
import test from "node:test";

import {
  createWhatsAppVariant,
  renderWhatsAppVariant,
  validateWhatsAppCampaign,
} from "../lib/whatsapp-model.ts";

test("the default WhatsApp template variant is launch-ready", () => {
  const campaign = { config: { whatsappVariants: [createWhatsAppVariant()] } };
  assert.deepEqual(validateWhatsAppCampaign(campaign), []);
});

test("template variables require either a value or a fallback", () => {
  const variant = createWhatsAppVariant();
  variant.variables[0] = { ...variant.variables[0], value: "", fallback: "" };
  const issues = validateWhatsAppCampaign({ config: { whatsappVariants: [variant] } });
  assert.ok(issues.some(issue => issue.includes("First name")));
});

test("response messages require an open simulated conversation window", () => {
  const variant = { ...createWhatsAppVariant(), mode: "response", conversationWindowOpen: false };
  const issues = validateWhatsAppCampaign({ config: { whatsappVariants: [variant] } });
  assert.ok(issues.some(issue => issue.includes("24-hour conversation window")));
});

test("template preview resolves mapped values and fallbacks", () => {
  const variant = createWhatsAppVariant();
  variant.variables = variant.variables.map(variable => variable.key === "1"
    ? { ...variable, value: "Ari" }
    : { ...variable, value: "", fallback: "FALLBACK20" });
  assert.match(renderWhatsAppVariant(variant), /Hi Ari/);
  assert.match(renderWhatsAppVariant(variant), /FALLBACK20/);
});
