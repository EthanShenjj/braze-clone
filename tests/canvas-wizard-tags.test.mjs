import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { canvasTagFilterIssues, canvasWizardIssues, defaultCanvasWizard, isCanvasTagFilter, normalizeCanvasWizard } from "../lib/canvas-wizard-model.ts";
import { initialCanvasGraph } from "../lib/canvas-model.ts";
import { taggedInteractions } from "../lib/tag-interactions.ts";

const count = (overrides = {}) => ({ id: "count", field: "receipt_tag_count:delivered:tag-id", operator: "greater_than", value: "0", ...overrides });
const last = (overrides = {}) => ({ id: "last", field: "receipt_tag_last:delivered:tag-id", operator: "less_than_ago", value: "2", timeUnit: "weeks", ...overrides });

test("Canvas normalization retains mixed profile and tagged rules in entry, exclusion and exit groups", () => {
  const config = structuredClone(defaultCanvasWizard);
  config.audience.filters = [{ id: "country", field: "country", operator: "is_not", value: "US" }, count()];
  config.audience.exclusionFilters = [last()];
  config.audience.exitFilters = [count({ id: "engaged", field: "receipt_tag_count:engaged:tag-id", tagInteraction: "clicked_email", operator: "equals" })];
  const normalized = normalizeCanvasWizard(JSON.parse(JSON.stringify(config)));
  deepEqual(normalized, config);
  equal(isCanvasTagFilter(normalized.audience.filters[0]), false);
  equal(isCanvasTagFilter(normalized.audience.filters[1]), true);
  deepEqual(canvasWizardIssues(normalized, initialCanvasGraph).filter(issue => issue.step === "audience"), []);
});

test("incomplete tagged drafts survive normalization and produce actionable Canvas validation", () => {
  const config = normalizeCanvasWizard({ audience: {
    filters: [count({ field: "receipt_tag_count:engaged:", tagInteraction: "unrecognized" })],
    exclusionFilters: [last({ value: "", timeUnit: "invalid" })],
    exitFilters: [last({ operator: "greater_than", value: "2026-02-31", timeUnit: undefined })],
  } });
  equal(config.audience.filters.length, 1);
  equal(config.audience.exclusionFilters[0].timeUnit, "invalid");
  equal(config.audience.exitFilters.length, 1);
  const messages = canvasWizardIssues(config, initialCanvasGraph).filter(issue => issue.step === "audience").map(issue => issue.detail);
  for (const expected of ["Choose a tag", "Choose an Interaction", "Enter a time period", "Choose hours, days or weeks", "Enter a valid date"]) ok(messages.some(message => message.includes(expected)), expected);
});

test("all source interaction choices are valid and missing interactions remain invalid for existence comparisons", () => {
  equal(taggedInteractions.length, 21);
  for (const interaction of taggedInteractions) deepEqual(canvasTagFilterIssues(count({ field: "receipt_tag_count:engaged:tag-id", tagInteraction: interaction.id })), []);
  ok(canvasTagFilterIssues(count({ field: "receipt_tag_count:engaged:tag-id", operator: "exists", value: "" })).some(issue => issue.includes("Interaction")));
  deepEqual(canvasTagFilterIssues(last({ operator: "exists", value: "", timeUnit: undefined })), []);
});

test("Canvas tagged filters reject unsupported events, operators, invalid counts and relative time configurations", () => {
  for (const filter of [count({ field: "receipt_tag_count:unknown:tag-id" }), count({ operator: "contains" }), count({ value: "-1" }), count({ value: "NaN" }), last({ field: "receipt_tag_last:engaged:tag-id" }), last({ value: "-2" }), last({ timeUnit: "months" }), count({ operator: "more_than_ago", timeUnit: "days" })]) ok(canvasTagFilterIssues(filter).length > 0, JSON.stringify(filter));
  deepEqual(canvasTagFilterIssues(last({ value: "0", timeUnit: "hours" })), []);
  deepEqual(canvasTagFilterIssues(last({ operator: "greater_than", value: "2026-11-11", timeUnit: undefined })), []);
});
