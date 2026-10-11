export type LiquidSuggestion = {
  category: "User profile" | "Custom attribute";
  label: string;
  value: string;
};

const profileSuggestions: LiquidSuggestion[] = [
  { category: "User profile", label: "First name", value: "{{${first_name}}}" },
  { category: "User profile", label: "Last name", value: "{{${last_name}}}" },
  { category: "User profile", label: "Email address", value: "{{${email_address}}}" },
  { category: "User profile", label: "Country", value: "{{${country}}}" },
  { category: "User profile", label: "City", value: "{{${city}}}" },
  { category: "User profile", label: "Language", value: "{{${language}}}" },
  { category: "User profile", label: "Time zone", value: "{{${time_zone}}}" },
  { category: "User profile", label: "External user ID", value: "{{${user_id}}}" },
  { category: "User profile", label: "Most recent location", value: "{{${most_recent_location}}}" },
];

export function selectionLiquidSuggestions(customAttributes: string[]) {
  const custom = [...new Set(customAttributes.map(value => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map<LiquidSuggestion>(name => ({
      category: "Custom attribute",
      label: name,
      value: `{{custom_attribute.\${${name}}}}`,
    }));
  return [...profileSuggestions, ...custom];
}

export function liquidCompletionContext(value: string, caret: number) {
  const safeCaret = Math.max(0, Math.min(caret, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const start = beforeCaret.lastIndexOf("{{");
  if (start < 0 || beforeCaret.slice(start + 2).includes("}}")) return null;
  return { start, caret: safeCaret, query: beforeCaret.slice(start + 2).trim().toLowerCase() };
}

export function filterLiquidSuggestions(suggestions: LiquidSuggestion[], query: string) {
  const normalized = query.replace(/[{}$]/g, "").toLowerCase();
  if (!normalized) return suggestions;
  return suggestions.filter(suggestion => `${suggestion.label} ${suggestion.category} ${suggestion.value}`.toLowerCase().includes(normalized));
}

export function applyLiquidSuggestion(value: string, caret: number, suggestion: string) {
  const context = liquidCompletionContext(value, caret);
  if (!context) return { value, caret };
  const next = `${value.slice(0, context.start)}${suggestion}${value.slice(context.caret)}`;
  return { value: next, caret: context.start + suggestion.length };
}
