import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { canvasWizardIssues, defaultCanvasWizard, isCanvasProfileFilter, normalizeCanvasWizard } from "../lib/canvas-wizard-model.ts";
import { initialCanvasGraph } from "../lib/canvas-model.ts";
import { audienceFilterCatalog, otherAudienceFilters } from "../lib/campaign-filter-catalog.ts";
import { audienceRuleIssues } from "../lib/campaign-shared.ts";
import { createBrowserCanvas, duplicateBrowserCanvas, getBrowserCanvas, patchBrowserCanvas } from "../lib/canvas-browser-store.ts";

const rule = (field, overrides = {}) => ({ id: field, field, operator: "equals", value: "example", ...overrides });
const audienceIssues = config => canvasWizardIssues(config, initialCanvasGraph).filter(issue => issue.step === "audience");
const catalogFields = choices => choices.flatMap(choice => choice.children ? catalogFields(choice.children) : choice.field ? [choice.field] : []);

test("every category and Other Filters leaf survives Canvas entry, exclusion and exit save snapshots", () => {
  equal(audienceFilterCatalog.length, 16);
  equal(otherAudienceFilters.length, 6);
  const fields = [...audienceFilterCatalog.flatMap(category => catalogFields(category.fields)), ...catalogFields(otherAudienceFilters), "attr:custom_tier", "event_count:checkout"];
  ok(fields.length > 100);
  const config = structuredClone(defaultCanvasWizard);
  const rules = fields.map((field, index) => rule(field, { id: `rule-${index}`, value2: "second value", timeUnit: "months", params: { campaignId: "campaign-id", appId: "app-id", count: 2, includeAnonymous: false } }));
  config.audience.filters = rules;
  config.audience.exclusionFilters = structuredClone(rules);
  config.audience.exitFilters = structuredClone(rules);
  config.audience.segmentIds = ["segment-a", "segment-b"];
  config.audience.exitSegmentIds = ["segment-c", "segment-d"];
  const saved = JSON.parse(JSON.stringify(config));
  deepEqual(normalizeCanvasWizard(saved), config);
  deepEqual(normalizeCanvasWizard(JSON.parse(JSON.stringify(normalizeCanvasWizard(saved)))), config);
});

test("expanded operators, second bounds, multi values, relative dates and family parameters remain intact", () => {
  const rules = [
    rule("age", { operator: "between", value: "18", value2: "65" }),
    rule("random_bucket", { operator: "not_between", value: "10", value2: "20" }),
    rule("ecommerce_revenue", { operator: "greater_or_equal", value: "100" }),
    rule("session_count", { operator: "less_or_equal", value: "5" }),
    rule("country", { operator: "is_any_of", value: '["US","CN"]' }),
    rule("attr:language", { operator: "is_none_of", value: '["fr","de"]' }),
    rule("email", { operator: "ends_with", value: "@example.test" }),
    rule("id", { operator: "starts_with", value: "customer_" }),
    rule("attr:company", { operator: "matches_regex", value: "^Acme.*" }),
    rule("created_at", { operator: "less_than_ago", value: "3", timeUnit: "weeks" }),
    rule("receipt_tag_count:delivered:tag", { operator: "between", value: "1", value2: "5" }),
    rule("receipt_tag_count:engaged:tag", { operator: "greater_or_equal", value: "2", tagInteraction: "clicked_email" }),
    rule("receipt_tag_last:delivered:tag", { operator: "not_between", value: "2026-10-01", value2: "2026-10-31" }),
    rule("receipt_count:delivered:campaign", { operator: "greater_than", value: "0", params: { campaignId: "campaign", variantId: "variant", channel: "email", interaction: "clicked_email" } }),
    rule("session_app_count:app", { operator: "greater_or_equal", value: "2", params: { appId: "app", period: 7, unit: "days" } }),
    rule("subscription_group:group", { value: "subscribed", params: { channel: "email", groupId: "group" } }),
    rule("canvas_receipt_count:delivered", { operator: "equals", value: "1", params: { canvasId: "canvas", stepId: "step", variantId: "variant" } }),
  ];
  const config = normalizeCanvasWizard({ audience: { filters: rules, exclusionFilters: rules, exitFilters: rules, filterOperator: "AND" } });
  deepEqual(config.audience.filters, rules);
  deepEqual(config.audience.exclusionFilters, rules);
  deepEqual(config.audience.exitFilters, rules);
  deepEqual(audienceIssues(config), []);
});

test("incomplete generic drafts are retained and use the same validation in all Canvas groups", () => {
  const invalid = [
    rule("age", { operator: "between", value: "18", value2: "" }),
    rule("country", { operator: "is_any_of", value: "US,CN" }),
    rule("created_at", { operator: "more_than_ago", value: "2", timeUnit: "invalid" }),
    rule("attr:company", { operator: "matches_regex", value: "[" }),
    rule("event_count:", { operator: "greater_than", value: "", params: { eventName: "", appId: "", useWindow: false, days: 0 } }),
  ];
  for (const group of ["filters", "exclusionFilters", "exitFilters"]) {
    const config = normalizeCanvasWizard({ audience: { segmentIds: ["selected-segment"], [group]: invalid } });
    deepEqual(config.audience[group], invalid);
    deepEqual(audienceIssues(config).map(issue => issue.detail), invalid.flatMap(audienceRuleIssues));
  }
});

test("legacy profile drafts remain compatible while generic profile operators are preserved", () => {
  const filters = [rule("country", { operator: "is_not", value: "US" }), rule("lifecycle", { operator: "is", value: "New Users" }), rule("emailSubscriptionStatus", { operator: "is", value: "subscribed" }), rule("country", { operator: "is_any_of", value: '["US","GB"]' })];
  const config = normalizeCanvasWizard({ audience: { filters } });
  deepEqual(config.audience.filters, filters);
  deepEqual(config.audience.filters.map(isCanvasProfileFilter), [true, true, true, false]);
  deepEqual(audienceIssues(config), []);
});

test("normalization creates independent parameter objects and ignores non-rule input", () => {
  const input = { audience: { filters: [null, "not a rule", { field: "country" }, rule("receipt_count:engaged:", { value: "0", params: { campaignId: "", interaction: "clicked_email", count: 0, includeControl: false } })] } };
  const config = normalizeCanvasWizard(input);
  equal(config.audience.filters.length, 1);
  deepEqual(config.audience.filters[0], input.audience.filters[3]);
  config.audience.filters[0].params.count = 3;
  equal(input.audience.filters[3].params.count, 0);
});

test("browser draft save, reload and duplicate retain complete generic audience snapshots", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const wizard = normalizeCanvasWizard({ audience: {
    segmentIds: ["segment-1", "segment-2"], exitSegmentIds: ["exit-1", "exit-2"],
    filters: [rule("age", { operator: "between", value: "18", value2: "65" })],
    exclusionFilters: [rule("country", { operator: "is_none_of", value: '["US","GB"]' })],
    exitFilters: [rule("canvas_receipt_count:engaged", { operator: "greater_or_equal", value: "2", params: { canvasId: "journey", stepId: "message-step", variantId: "variation", interaction: "clicked_email", exact: true } })],
  } });
  const created = createBrowserCanvas({ name: "Full audience draft", workspaceId: "test-workspace" });
  patchBrowserCanvas(created.id, { wizard }, "test-workspace");
  const saved = getBrowserCanvas(created.id, "test-workspace");
  deepEqual(normalizeCanvasWizard(saved.canvas.wizard), wizard);
  const copy = duplicateBrowserCanvas(created.id, "test-workspace");
  deepEqual(copy.wizard, wizard);
  deepEqual(getBrowserCanvas(copy.id, "test-workspace").graph, saved.graph);
});
