import type { DatabaseSync } from "node:sqlite";
import { tagNames, tagParentIsValid, type TagUsage, type WorkspaceTag } from "./tag-model.ts";

type Row = { id: string; type: string; name: string; status: string; updated_at: string; data_json: string };
function jsonData(value: string): Record<string, unknown> {
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}
const data = (row: Row) => jsonData(row.data_json);
const workspace = (value: Record<string, unknown>) => typeof value.workspaceId === "string" && value.workspaceId ? value.workspaceId : "local";
const stamp = (previous?: string) => new Date(Math.max(Date.now(), previous && Number.isFinite(Date.parse(previous)) ? Date.parse(previous) + 1 : 0)).toISOString();
const limited = (type: string) => ["campaign", "canvas", "segments"].includes(type);
const rows = (conn: DatabaseSync, workspaceId?: string) => (conn.prepare("SELECT * FROM resources").all() as Row[]).filter(row => workspaceId === undefined || workspace(data(row)) === workspaceId);
const registry = (conn: DatabaseSync, workspaceId = "local") => rows(conn, workspaceId).filter(row => row.type === "tag-management");
let savepointNumber = 0;
// Savepoints compose with resource transactions, and roll back definitions plus audits together.
function atomic<T>(conn: DatabaseSync, action: () => T): T {
  const savepoint = `tag_action_${++savepointNumber}`;
  conn.exec(`SAVEPOINT ${savepoint}`);
  try { const result = action(); conn.exec(`RELEASE ${savepoint}`); return result; }
  catch (error) { conn.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); throw error; }
}

export function initializeTags(conn: DatabaseSync) {
  atomic(conn, () => {
    conn.exec("CREATE TABLE IF NOT EXISTS tag_aliases (workspace_id TEXT NOT NULL, name TEXT NOT NULL, tag_id TEXT, PRIMARY KEY (workspace_id, name))");
    const columns = conn.prepare("PRAGMA table_info(tag_aliases)").all() as { name: string }[];
    if (!columns.some(column => column.name === "workspace_id")) {
      conn.exec("ALTER TABLE tag_aliases RENAME TO tag_aliases_legacy; CREATE TABLE tag_aliases (workspace_id TEXT NOT NULL, name TEXT NOT NULL, tag_id TEXT, PRIMARY KEY (workspace_id, name)); INSERT INTO tag_aliases SELECT 'local', name, tag_id FROM tag_aliases_legacy; DROP TABLE tag_aliases_legacy;");
    }
    conn.exec("DROP INDEX IF EXISTS workspace_tag_unique_name");
    const known = new Map<string, string>();
    for (const row of rows(conn).filter(row => row.type === "tag-management")) {
      const key = JSON.stringify([workspace(data(row)), row.name]);
      const survivor = known.get(key);
      if (survivor) {
        for (const child of registry(conn, workspace(data(row)))) if (data(child).parentId === row.id) conn.prepare("UPDATE resources SET data_json = ? WHERE id = ?").run(JSON.stringify({ ...data(child), parentId: survivor }), child.id);
        conn.prepare("UPDATE tag_aliases SET tag_id = ? WHERE tag_id = ? AND workspace_id = ?").run(survivor, row.id, workspace(data(row)));
        conn.prepare("DELETE FROM resources WHERE id = ?").run(row.id);
      } else known.set(key, row.id);
    }
    const values: { value: unknown; workspaceId: string }[] = (conn.prepare("SELECT config_json FROM campaigns").all() as { config_json: string }[]).map(row => ({ value: jsonData(row.config_json).tags, workspaceId: workspace(jsonData(row.config_json)) }));
    for (const row of rows(conn)) {
      values.push({ value: data(row).tags, workspaceId: workspace(data(row)) });
      if (row.type === "global-control-group") values.push({ value: data(row).exclusionTags, workspaceId: workspace(data(row)) });
    }
    for (const { value, workspaceId } of values) {
      if (!Array.isArray(value)) continue;
      for (const name of value) if (typeof name === "string" && name.trim()) {
        const key = JSON.stringify([workspaceId, name.trim()]);
        // A stale saved draft must not resurrect a renamed/deleted definition on restart.
        if (!known.has(key) && !conn.prepare("SELECT name FROM tag_aliases WHERE workspace_id = ? AND name = ?").get(workspaceId, name.trim())) known.set(key, insertTag(conn, name.trim(), null, workspaceId));
      }
    }
    conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS workspace_tag_scoped_unique_name ON resources(COALESCE(NULLIF(json_extract(data_json, '$.workspaceId'), ''), 'local'), name) WHERE type = 'tag-management'");
  });
}

function insertTag(conn: DatabaseSync, name: string, parentId: string | null, workspaceId: string) {
  const id = `tag_${crypto.randomUUID()}`;
  conn.prepare("INSERT INTO resources VALUES (?, 'tag-management', ?, 'Active', 'Workspace tag', ?, ?)").run(id, name, stamp(), JSON.stringify({ parentId, workspaceId }));
  return id;
}
function audit(conn: DatabaseSync, id: string, action: string, detail: unknown) {
  conn.prepare("INSERT INTO audit_log VALUES (?, 'tag', ?, ?, ?, ?)").run(crypto.randomUUID(), id, action, stamp(), JSON.stringify(detail));
}

export function assignTags(conn: DatabaseSync, value: unknown, type: string, workspaceId = "local"): string[] {
  return atomic(conn, () => {
    const tags = registry(conn, workspaceId);
    const resolved = tagNames(value).map(name => {
      if (tags.some(row => row.name === name)) return name;
      const alias = conn.prepare("SELECT tag_id FROM tag_aliases WHERE workspace_id = ? AND name = ?").get(workspaceId, name) as { tag_id: string | null } | undefined;
      if (!alias) return name;
      const target = tags.find(row => row.id === alias.tag_id);
      if (!target) throw new Error(`Tag "${name}" was deleted. Remove it before saving.`);
      return target.name;
    });
    const result = tagNames(resolved, limited(type));
    if (["email-templates", "content-blocks"].includes(type) && result.some(name => !tags.some(row => row.name === name))) throw new Error("Template and Content Block tags must already exist in Tag Management.");
    for (const name of result) if (!tags.some(row => row.name === name)) { const id = insertTag(conn, name, null, workspaceId); audit(conn, id, "created", { name, workspaceId }); }
    return result;
  });
}

// Audience filters reference stable IDs, so changing a display name cannot alter a rule.
function ruleTagIds(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const entry of value) ruleTagIds(entry, result);
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.field === "string") { const match = /^receipt_tag_(?:count|last):(?:delivered|engaged):(.+)$/.exec(object.field); if (match) result.add(match[1]); }
    for (const nested of Object.values(object)) if (nested && typeof nested === "object") ruleTagIds(nested, result);
  }
  return result;
}
function references(conn: DatabaseSync, workspaceId: string): Map<string, TagUsage[]> {
  const usages = new Map<string, TagUsage[]>();
  const tags = registry(conn, workspaceId);
  const add = (names: unknown, rules: unknown, usage: TagUsage) => {
    const all = new Set(Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : []);
    for (const id of ruleTagIds(rules)) { const tag = tags.find(tag => tag.id === id); if (tag) all.add(tag.name); }
    for (const name of all) usages.set(name, [...usages.get(name) ?? [], { ...usage, direct: Array.isArray(names) && names.includes(name) }]);
  };
  for (const row of conn.prepare("SELECT id, name, status, config_json FROM campaigns").all() as { id: string; name: string; status: string; config_json: string }[]) {
    const config = jsonData(row.config_json);
    if (workspace(config) === workspaceId) add(config.tags, config, { id: row.id, name: row.name, status: row.status, type: "campaign" });
  }
  for (const row of rows(conn, workspaceId)) {
    if (row.type === "tag-management") continue;
    const value = data(row);
    const names = [...Array.isArray(value.tags) ? value.tags : [], ...row.type === "global-control-group" && Array.isArray(value.exclusionTags) ? value.exclusionTags : []];
    add(names, value, { id: row.id, name: row.name, status: row.status, type: row.type });
  }
  return usages;
}

export function listTags(conn: DatabaseSync, workspaceId = "local"): WorkspaceTag[] {
  const tags = registry(conn, workspaceId), usages = references(conn, workspaceId);
  const path = (row: Row, seen = new Set<string>()): string => {
    if (seen.has(row.id)) return row.name;
    seen.add(row.id);
    const parent = tags.find(tag => tag.id === data(row).parentId);
    return parent ? `${path(parent, seen)} / ${row.name}` : row.name;
  };
  return tags.map(row => ({ id: row.id, name: row.name, parentId: typeof data(row).parentId === "string" ? data(row).parentId as string : null, path: path(row), updatedAt: row.updated_at, usages: usages.get(row.name) ?? [] })).sort((a, b) => a.path.localeCompare(b.path));
}
export function listTagAliases(conn: DatabaseSync, workspaceId = "local"): Record<string, string | null> {
  const tags = registry(conn, workspaceId);
  return Object.fromEntries((conn.prepare("SELECT name, tag_id FROM tag_aliases WHERE workspace_id = ?").all(workspaceId) as { name: string; tag_id: string | null }[]).filter(alias => !tags.some(tag => tag.name === alias.name)).map(alias => [alias.name, tags.find(tag => tag.id === alias.tag_id)?.name ?? null]));
}
export function createTag(conn: DatabaseSync, input: { name: unknown; parentId?: unknown }, workspaceId = "local") {
  return atomic(conn, () => {
    const name = tagNames([input.name])[0];
    if (registry(conn, workspaceId).some(row => row.name === name) || conn.prepare("SELECT name FROM tag_aliases WHERE workspace_id = ? AND name = ?").get(workspaceId, name)) throw new Error("This tag name already exists or belongs to a renamed/deleted tag.");
    const parentId = input.parentId == null || input.parentId === "" ? null : String(input.parentId);
    if (parentId && !registry(conn, workspaceId).some(row => row.id === parentId)) throw new Error("Parent tag not found.");
    const id = insertTag(conn, name, parentId, workspaceId); audit(conn, id, "created", { name, parentId, workspaceId });
    return listTags(conn, workspaceId).find(tag => tag.id === id)!;
  });
}
export function changeTag(conn: DatabaseSync, id: string, input: { name?: unknown; parentId?: unknown; expectedUpdatedAt?: unknown }, remove = false, workspaceId = "local") {
  return atomic(conn, () => {
    const tag = listTags(conn, workspaceId).find(tag => tag.id === id);
    if (!tag) throw new Error("Tag not found.");
    if (input.expectedUpdatedAt !== tag.updatedAt) throw new Error("Tag changed in another tab. Reload before saving.");
    if (remove) {
      if (listTags(conn, workspaceId).some(child => child.parentId === id)) throw new Error("Move this tag's child tags before deleting it.");
      // Source confirms global deletion removes direct resource assignments. Stable-ID
      // audience rules remain explicit dangling references until the user edits them.
      for (const row of conn.prepare("SELECT id, config_json, edited_at FROM campaigns").all() as { id: string; config_json: string; edited_at: string }[]) {
        const config = jsonData(row.config_json);
        if (workspace(config) === workspaceId && Array.isArray(config.tags) && config.tags.includes(tag.name)) {
          config.tags = config.tags.filter((value: unknown) => value !== tag.name);
          conn.prepare("UPDATE campaigns SET config_json = ?, edited_at = ? WHERE id = ?").run(JSON.stringify(config), stamp(row.edited_at), row.id);
        }
      }
      for (const row of rows(conn, workspaceId)) {
        if (row.type === "tag-management") continue;
        const value = data(row); let changed = false;
        for (const key of row.type === "global-control-group" ? ["tags", "exclusionTags"] : ["tags"]) {
          if (Array.isArray(value[key]) && value[key].includes(tag.name)) { value[key] = value[key].filter((entry: unknown) => entry !== tag.name); changed = true; }
        }
        if (changed) conn.prepare("UPDATE resources SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(value), stamp(row.updated_at), row.id);
      }
      conn.prepare("INSERT INTO tag_aliases VALUES (?, ?, NULL) ON CONFLICT(workspace_id, name) DO UPDATE SET tag_id = NULL").run(workspaceId, tag.name);
      conn.prepare("UPDATE tag_aliases SET tag_id = NULL WHERE tag_id = ? AND workspace_id = ?").run(id, workspaceId);
      conn.prepare("DELETE FROM resources WHERE id = ?").run(id);
      audit(conn, id, "deleted", { name: tag.name, workspaceId, usages: tag.usages }); return tag;
    }
    const name = input.name === undefined ? tag.name : tagNames([input.name])[0];
    const parentId = input.parentId === undefined ? tag.parentId : input.parentId == null || input.parentId === "" ? null : String(input.parentId);
    if (!tagParentIsValid(id, parentId, listTags(conn, workspaceId))) throw new Error("A tag cannot be nested under itself or a descendant.");
    const alias = conn.prepare("SELECT tag_id FROM tag_aliases WHERE workspace_id = ? AND name = ?").get(workspaceId, name) as { tag_id: string | null } | undefined;
    if (registry(conn, workspaceId).some(row => row.id !== id && row.name === name) || (alias && alias.tag_id !== id)) throw new Error("This tag name already exists or is reserved.");
    if (name !== tag.name) {
      for (const row of conn.prepare("SELECT id, config_json, edited_at FROM campaigns").all() as { id: string; config_json: string; edited_at: string }[]) {
        const config = jsonData(row.config_json);
        if (workspace(config) === workspaceId && Array.isArray(config.tags) && config.tags.includes(tag.name)) { config.tags = [...new Set(config.tags.map((value: string) => value === tag.name ? name : value))]; conn.prepare("UPDATE campaigns SET config_json = ?, edited_at = ? WHERE id = ?").run(JSON.stringify(config), stamp(row.edited_at), row.id); }
      }
      for (const row of rows(conn, workspaceId)) {
        if (row.type === "tag-management") continue;
        const value = data(row); let changed = false;
        for (const key of row.type === "global-control-group" ? ["tags", "exclusionTags"] : ["tags"]) {
          if (Array.isArray(value[key]) && value[key].includes(tag.name)) { value[key] = [...new Set(value[key].map((entry: unknown) => entry === tag.name ? name : entry))]; changed = true; }
        }
        if (changed) conn.prepare("UPDATE resources SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(value), stamp(row.updated_at), row.id);
      }
      conn.prepare("INSERT INTO tag_aliases VALUES (?, ?, ?) ON CONFLICT(workspace_id, name) DO UPDATE SET tag_id = excluded.tag_id").run(workspaceId, tag.name, id);
    }
    conn.prepare("UPDATE resources SET name = ?, data_json = ?, updated_at = ? WHERE id = ?").run(name, JSON.stringify({ ...data(registry(conn, workspaceId).find(row => row.id === id)!), parentId }), stamp(tag.updatedAt), id);
    audit(conn, id, "updated", { previousName: tag.name, name, parentId, workspaceId }); return listTags(conn, workspaceId).find(tag => tag.id === id)!;
  });
}
export function tagCampaigns(conn: DatabaseSync, ids: unknown, additions: unknown, workspaceId = "local", mode: "merge" | "replace" = "merge") {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !id)) throw new Error("Select at least one Campaign.");
  if (!["merge", "replace"].includes(mode)) throw new Error("Choose a valid tag update mode.");
  if (mode === "replace" && !Array.isArray(additions)) throw new Error("Tags must be an array of non-empty names.");
  if (mode === "merge" && !tagNames(additions).length) throw new Error("Choose at least one tag to add.");
  return atomic(conn, () => {
    const selected = [...new Set(ids)].map(id => {
      const row = conn.prepare("SELECT id, config_json, edited_at FROM campaigns WHERE id = ? AND archived_at IS NULL").get(id) as { id: string; config_json: string; edited_at: string } | undefined;
      if (!row || workspace(jsonData(row.config_json)) !== workspaceId) throw new Error("A selected Campaign is no longer available. Reload before tagging.");
      return { id: row.id, editedAt: row.edited_at, config: jsonData(row.config_json) };
    });
    const tags = assignTags(conn, mode === "replace" ? additions : [...selected.flatMap(row => tagNames(row.config.tags)), ...tagNames(additions)], "campaign", workspaceId);
    for (const row of selected) conn.prepare("UPDATE campaigns SET config_json = ?, edited_at = ? WHERE id = ?").run(JSON.stringify({ ...row.config, tags }), stamp(row.editedAt), row.id);
    audit(conn, selected.map(row => row.id).join(","), "campaigns-tagged", { tags, workspaceId, mode }); return { ids: selected.map(row => row.id), tags };
  });
}


// Tag As supplies the explicit complete set selected in the popover for each resource.
export function tagResources(conn: DatabaseSync, type: "canvas" | "segments", ids: unknown, names: unknown, workspaceId = "local") {
  if (!["canvas", "segments"].includes(type)) throw new Error("Choose Canvas or Segment resources to tag.");
  if (!Array.isArray(names)) throw new Error("Tags must be an array of non-empty names.");
  const label = type === "canvas" ? "Canvas" : "Segment";
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !id)) throw new Error(`Select at least one ${label}.`);
  return atomic(conn, () => {
    const selected = [...new Set(ids)].map(id => {
      const row = conn.prepare("SELECT * FROM resources WHERE id = ? AND type = ? AND status != 'Archived'").get(id, type) as Row | undefined;
      if (!row || workspace(data(row)) !== workspaceId) throw new Error(`A selected ${label} is no longer available. Reload before tagging.`);
      return row;
    });
    const tags = assignTags(conn, names, type, workspaceId);
    for (const row of selected) conn.prepare("UPDATE resources SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...data(row), tags }), stamp(row.updated_at), row.id);
    audit(conn, selected.map(row => row.id).join(","), "resources-tagged", { type, tags, workspaceId, mode: "replace" });
    return { ids: selected.map(row => row.id), tags };
  });
}
