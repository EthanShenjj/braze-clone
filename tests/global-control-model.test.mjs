import { test } from "node:test";
import { equal, throws } from "node:assert/strict";
import { globalControlCohort, hasGlobalControlExemption, normalizeGlobalControl, validateGlobalControlCommand } from "../lib/global-control-model.ts";

test("control and treatment sample are disjoint and equally sized bucket intervals", () => {
  const settings = normalizeGlobalControl({ enabled: true, percentage: 5, seed: "workspace" });
  equal(globalControlCohort(settings, 0.04999), "control");
  equal(globalControlCohort(settings, 0.05), "sample");
  equal(globalControlCohort(settings, 0.10), "treatment");
  equal(globalControlCohort({ ...settings, enabled: false }, 0), "treatment");
});
test("any matching task tag grants an exemption, while an unrelated tag does not", () => {
  const settings = normalizeGlobalControl({ exclusionTags: ["transactional", "critical"] });
  equal(hasGlobalControlExemption(settings, ["promo", "critical"], "email"), true);
  equal(hasGlobalControlExemption(settings, ["promo"], "whatsapp"), false);
  equal(hasGlobalControlExemption(settings, [], "api"), true);
  equal(hasGlobalControlExemption(settings, [], "content"), false);
  equal(hasGlobalControlExemption(settings, ["critical"], "feature"), false);
});
test("percentage requires a whole number from 1 through 15, including on direct API calls", () => {
  for (const percentage of [0, 16, 5.5, "5", null, NaN]) throws(() => validateGlobalControlCommand({ action: "enable", percentage }));
  validateGlobalControlCommand({ action: "enable", percentage: 1 });
  validateGlobalControlCommand({ action: "enable", percentage: 15 });
  for (const command of [null, [], {}, { action: "update-exclusions", exclusionTags: [null] }]) throws(() => validateGlobalControlCommand(command));
});
