export type CatalogFieldType = "string" | "number" | "boolean" | "time" | "geo" | "object" | "array";
export type CatalogField = { name: string; type: CatalogFieldType };
export type CatalogItemInput = { id: string; name?: string; fields?: Record<string, unknown> };
export type CatalogFilterOperator =
  | "equals" | "not_equals" | "greater_than" | "less_than" | "is" | "before" | "after"
  | "includes_value" | "not_includes_value" | "geo_within" | "geo_outside"
  // Older workspace records retain these values until they are next edited.
  | "contains" | "not_contains" | "exists" | "not_exists";
export type CatalogFilter = { field: string; operator: CatalogFilterOperator; value: string };
export type CatalogSelectionInput = {
  name: string; description?: string; filters: CatalogFilter[]; randomSort?: boolean;
  sortField?: string; sortDirection?: "ascending" | "descending"; resultLimit: number;
};

export class CatalogValidationError extends Error {
  constructor(message: string, readonly code = "invalid_catalog") { super(message); }
}

export const BROWSER_FIELD_TYPES: CatalogFieldType[] = ["string", "number", "boolean", "time", "geo"];
const identifier = /^[A-Za-z0-9_-]{1,250}$/;

export function catalogFields(data: Record<string, unknown>): CatalogField[] {
  const names = Array.isArray(data.fields) ? data.fields.filter((name): name is string => typeof name === "string") : [];
  const types = data.fieldTypes && typeof data.fieldTypes === "object" ? data.fieldTypes as Record<string, CatalogFieldType> : {};
  return names.map(name => ({ name, type: types[name] ?? "string" }));
}

export function validateCatalogName(name: unknown) {
  if (typeof name !== "string" || !identifier.test(name)) throw new CatalogValidationError("Catalog names must use 1–250 letters, numbers, hyphens, or underscores.", "invalid_catalog_name");
  return name;
}

export function validateFields(fields: CatalogField[], source: "browser" | "csv" | "api" = "api") {
  if (fields.length > 999) throw new CatalogValidationError("A catalog can contain up to 1,000 columns including id.", "too_many_fields");
  const names = new Set<string>();
  for (const field of fields) {
    if (!identifier.test(field.name)) throw new CatalogValidationError(`Invalid field name: ${field.name || "(empty)"}.`, "invalid_field_name");
    const normalized = field.name.toLowerCase();
    if (normalized === "id" || names.has(normalized)) throw new CatalogValidationError(`Field names must be unique and cannot be id: ${field.name}.`, "duplicate_field");
    if (!(["string", "number", "boolean", "time", "geo", "object", "array"] as string[]).includes(field.type)) throw new CatalogValidationError(`Unsupported type for ${field.name}.`, "invalid_field_type");
    if (source !== "api" && !BROWSER_FIELD_TYPES.includes(field.type)) throw new CatalogValidationError(`${field.type} fields can only be created through the API.`, "api_only_field_type");
    names.add(normalized);
  }
}

function validTime(value: unknown) { return typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function validGeo(value: unknown) { return Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === "number" && Number.isFinite(coordinate)) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90; }

export function validateCatalogItem(item: CatalogItemInput, fields: CatalogField[]) {
  if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 5_000) throw new CatalogValidationError("Each catalog item requires an id up to 5,000 characters.", "invalid_item_id");
  const values = item.fields ?? {};
  const known = new Set(fields.map(field => field.name));
  for (const name of Object.keys(values)) if (!known.has(name)) throw new CatalogValidationError(`Unknown catalog field: ${name}.`, "unknown_field");
  for (const field of fields) {
    const value = values[field.name];
    if (value == null || value === "") continue;
    if (typeof value === "string" && value.length > 5_000) throw new CatalogValidationError(`${field.name} exceeds the 5,000 character limit.`, "value_too_long");
    const valid = field.type === "string" ? typeof value === "string" : field.type === "number" ? typeof value === "number" && Number.isFinite(value) : field.type === "boolean" ? typeof value === "boolean" : field.type === "time" ? validTime(value) : field.type === "geo" ? validGeo(value) : field.type === "object" ? typeof value === "object" && !Array.isArray(value) : Array.isArray(value) && value.length <= 100 && value.every(entry => typeof entry === "string");
    if (!valid) throw new CatalogValidationError(`Invalid ${field.type} value for ${field.name}.`, "invalid_field_value");
  }
}

export function operatorsFor(type: CatalogFieldType): CatalogFilterOperator[] {
  if (type === "number") return ["equals", "not_equals", "greater_than", "less_than"];
  if (type === "boolean") return ["is"];
  if (type === "time") return ["before", "after"];
  if (type === "array") return ["includes_value", "not_includes_value"];
  if (type === "geo") return ["geo_within", "geo_outside"];
  return ["equals", "not_equals"];
}

export function validateSelection(input: CatalogSelectionInput, fields: CatalogField[], currentCount: number, isUpdate = false) {
  if (!identifier.test(input.name)) throw new CatalogValidationError("Selection names must use 1–250 letters, numbers, hyphens, or underscores.", "invalid_selection_name");
  if (!Array.isArray(input.filters) || input.filters.length > 10) throw new CatalogValidationError("A selection can contain up to 10 filters.", "too_many_filters");
  if (!isUpdate && currentCount >= 30) throw new CatalogValidationError("A catalog can contain up to 30 selections.", "selection_limit_reached");
  if (!Number.isInteger(input.resultLimit) || input.resultLimit < 1 || input.resultLimit > 50) throw new CatalogValidationError("Results limit must be between 1 and 50.", "invalid_results_limit");
  const allFields = [{ name: "id", type: "string" as CatalogFieldType }, ...fields];
  const arrayFields = new Set<string>();
  for (const filter of input.filters) {
    const field = allFields.find(candidate => candidate.name === filter.field);
    if (!field || !operatorsFor(field.type).includes(filter.operator)) throw new CatalogValidationError(`Invalid filter for ${filter.field || "selected field"}.`, "invalid_selection_filter");
    if (typeof filter.value !== "string" || !filter.value.trim()) throw new CatalogValidationError(`Enter a value for ${filter.field}.`, "invalid_selection_filter");
    if (field.type === "array") arrayFields.add(field.name);
  }
  if (arrayFields.size > 1) throw new CatalogValidationError("A selection can filter on only one array field.", "too_many_arrays");
  if (!input.randomSort) {
    if (!input.sortField || !allFields.some(field => field.name === input.sortField) || !["ascending", "descending"].includes(input.sortDirection ?? "")) throw new CatalogValidationError("Choose a valid field and order for sorting.", "invalid_sorting");
  }
}

function profileValue(value: string, profile: Record<string, unknown> = {}) { return value.replace(/\{\{\s*(?:custom_attribute\.)?\$\{([^}]+)\}\s*\}\}/g, (_match, key: string) => String(profile[key] ?? "")); }
function asTime(value: unknown) { return typeof value === "number" ? value : Date.parse(String(value)); }
function geoFilterValue(value: string, profile: Record<string, unknown>) { try { const parsed = JSON.parse(profileValue(value, profile)) as { center?: unknown; radiusKm?: unknown }; return Array.isArray(parsed.center) && typeof parsed.radiusKm === "number" ? parsed : null; } catch { return null; } }
export function selectionMatches(item: { id: string; fields: Record<string, unknown> }, filters: CatalogFilter[], profile: Record<string, unknown> = {}) {
  return filters.every(filter => {
    const raw = filter.field === "id" ? item.id : item.fields[filter.field]; const right = profileValue(filter.value, profile);
    if (filter.operator === "greater_than") return Number(raw) > Number(right);
    if (filter.operator === "less_than") return Number(raw) < Number(right);
    if (filter.operator === "before") return asTime(raw) < asTime(right);
    if (filter.operator === "after") return asTime(raw) > asTime(right);
    if (filter.operator === "is") return String(raw) === right;
    if (filter.operator === "includes_value") return Array.isArray(raw) && raw.includes(right);
    if (filter.operator === "not_includes_value") return Array.isArray(raw) && !raw.includes(right);
    if (filter.operator === "geo_within" || filter.operator === "geo_outside") { const target = geoFilterValue(filter.value, profile); if (!target || typeof target.radiusKm !== "number" || !validGeo(raw) || !validGeo(target.center)) return false; const [lon1, lat1] = raw as number[]; const [lon2, lat2] = target.center as number[]; const radiusKm = target.radiusKm; const rad = Math.PI / 180; const distance = 6371 * 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2)); return filter.operator === "geo_within" ? distance <= radiusKm : distance > radiusKm; }
    const left = String(raw ?? "").toLowerCase(); const normalized = right.toLowerCase();
    if (filter.operator === "not_equals") return left !== normalized;
    if (filter.operator === "contains") return left.includes(normalized);
    if (filter.operator === "not_contains") return !left.includes(normalized);
    if (filter.operator === "exists") return raw != null && raw !== "";
    if (filter.operator === "not_exists") return raw == null || raw === "";
    return left === normalized;
  });
}

/** The same selection evaluator is used by catalog previews and Liquid rendering. */
export function selectCatalogRows<T extends { id: string; name?: string; fields: Record<string, unknown> }>(rows: T[], selection: { filters: CatalogFilter[]; randomSort: boolean; sortField: string; sortDirection: string; resultLimit: number }, profile: Record<string, unknown> = {}, seed = "") {
  const hash = (text: string) => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; };
  const value = (row: T) => selection.sortField === "id" ? row.id : row.fields[selection.sortField] ?? (selection.sortField === "name" ? row.name : "");
  const result = rows.filter(row => selectionMatches(row, selection.filters, profile));
  if (selection.randomSort) result.sort((a,b) => hash(`${seed}:${profile.user_id ?? ""}:${a.id}`) - hash(`${seed}:${profile.user_id ?? ""}:${b.id}`) || a.id.localeCompare(b.id));
  else if (selection.sortField) result.sort((a,b) => { const left=value(a),right=value(b); const comparison = typeof left === "number" && typeof right === "number" ? left-right : typeof left === "boolean" && typeof right === "boolean" ? Number(left)-Number(right) : String(left ?? "").localeCompare(String(right ?? "")); return comparison * (selection.sortDirection === "descending" ? -1 : 1) || a.id.localeCompare(b.id); });
  return result.slice(0, selection.resultLimit);
}
