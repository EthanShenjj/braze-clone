import assert from "node:assert/strict";
import test from "node:test";
import { applyLiquidSuggestion, filterLiquidSuggestions, liquidCompletionContext, selectionLiquidSuggestions } from "../lib/liquid-autocomplete.ts";

test("typing double braces opens and filters Braze Liquid suggestions", () => {
  const suggestions = selectionLiquidSuggestions(["plan", "language", "plan"]);
  assert.equal(liquidCompletionContext("{{", 2)?.query, "");
  assert.deepEqual(filterLiquidSuggestions(suggestions, "first").map(item => item.value), ["{{${first_name}}}"]);
  assert.deepEqual(filterLiquidSuggestions(suggestions, "plan").map(item => item.value), ["{{custom_attribute.${plan}}}"]);
});

test("selecting a suggestion replaces the active Liquid fragment and preserves surrounding text", () => {
  assert.deepEqual(
    applyLiquidSuggestion("prefix {{fir suffix", 12, "{{${first_name}}}"),
    { value: "prefix {{${first_name}}} suffix", caret: 24 },
  );
  assert.equal(liquidCompletionContext("{{${first_name}}}", 17), null);
});
