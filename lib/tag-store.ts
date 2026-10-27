import type { DatabaseSync } from "node:sqlite";
import { campaignBulkTags, tagNames, tagParentIsValid, type TagUsage, type WorkspaceTag } from "./tag-model.ts";

type Row = { id: string; type: string; name: string; status: string; updated_at: string; data_json: string };
function jsonData(value: string): Record<string, unknown> {
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}
const data = (row: Row) => jsonData(row.data_json);
const stamp = (previous?: string) => new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
const limited = (type: string) => ["campaign", "canvas", "segments"].includes(type);
const rows = (conn: DatabaseSync) => conn.prepare("SELECT * FROM resources").all() as Row[];
const registry = (conn: DatabaseSync) => conn.prepare("SELECT * FROM resources WHERE type = 'tag-management'").all() as Row[];

export function initializeTags(conn: DatabaseSync) {
  conn.exec("CREATE TABLE IF NOT EXISTS tag_aliases (name TEXT PRIMARY KEY, tag_id TEXT)");
  // Import existing names without changing task tags or control-group membership.
  const known = new Set<string>();
  for (const row of registry(conn)) {
    if (known.has(row.name)) conn.prepare("DELETE FROM resources WHERE id = ?").run(row.id);
    else known.add(row.name);
  }
  const values: unknown[] = (conn.prepare("SELECT config_json FROM campaigns").all() as { config_json: string }[]).map(row => jsonData(row.config_json).tags);
  for (const row of rows(conn)) values.push(data(row).tags, row.type === "global-control-group" ? data(row).exclusionTags : undefined);
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const name of value) if (typeof name === "string" && name.trim() && !known.has(name.trim())) {
      insertTag(conn, name.trim(), null); known.add(name.trim());
    }
  }
  conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS workspace_tag_unique_name ON resources(name) WHERE type = 'tag-management'");
}

function insertTag(conn: DatabaseSync, name: string, parentId: string | null) {
  const id = `tag_${crypto.randomUUID()}`;
  conn.prepare("INSERT INTO resources VALUES (?, 'tag-management', ?, 'Active', 'Workspace tag', ?, ?)").run(id, name, stamp(), JSON.stringify({ parentId }));
  return id;
}

function audit(conn: DatabaseSync, id: string, action: string, detail: unknown) {
  conn.prepare("INSERT INTO audit_log VALUES (?, 'tag', ?, ?, ?, ?)").run(crypto.randomUUID(), id, action, stamp(), JSON.stringify(detail));
}

export function assignTags(conn: DatabaseSync, value: unknown, type: string): string[] {
  const names = tagNames(value);
  const resolved = names.map(name => {
    if (registry(conn).some(row => row.name === name)) return name;
    const alias = conn.prepare("SELECT tag_id FROM tag_aliases WHERE name = ?").get(name) as { tag_id: string | null } | undefined;
    if (alias) {
      const target = registry(conn).find(row => row.id === alias.tag_id);
      if (!target) throw new Error(`Tag "${name}" was deleted. Remove it before saving.`);
      return target.name;
    }
    return name;
  });
  const result = tagNames(resolved, limited(type));
  if (["email-templates", "content-blocks"].includes(type) && result.some(name => !registry(conn).some(row => row.name === name))) throw new Error("Template and Content Block tags must already exist in Tag Management.");
  for (const name of result) if (!registry(conn).some(row => row.name === name)) { const id = insertTag(conn, name, null); audit(conn, id, "created", { name }); }
  return result;
}

function references(conn: DatabaseSync): Map<string, TagUsage[]> {
  const usages = new Map<string, TagUsage[]>();
  const add = (names: unknown, usage: TagUsage) => {
    if (!Array.isArray(names)) return;
    for (const name of new Set(names)) if (typeof name === "string") usages.set(name, [...usages.get(name) ?? [], usage]);
  };
  for (const row of conn.prepare("SELECT id, name, status, config_json FROM campaigns").all() as { id: string; name: string; status: string; config_json: string }[]) {
    add(jsonData(row.config_json).tags, { id: row.id, name: row.name, status: row.status, type: "campaign" });
  }
  for (const row of rows(conn)) {
    if (row.type === "tag-management") continue;
    const value = data(row);
    const names = [...Array.isArray(value.tags) ? value.tags : [], ...row.type === "global-control-group" && Array.isArray(value.exclusionTags) ? value.exclusionTags : []];
    add(names, { id: row.id, name: row.name, status: row.status, type: row.type });
  }
  return usages;
}

export function listTags(conn: DatabaseSync): WorkspaceTag[] {
  const tags = registry(conn);
  const usages = references(conn);
  const path = (row: Row, seen = new Set<string>()): string => {
    if (seen.has(row.id)) return row.name;
    seen.add(row.id);
    const parent = tags.find(tag => tag.id === data(row).parentId);
    return parent ? `${path(parent, seen)} / ${row.name}` : row.name;
  };
  return tags.map(row => ({ id: row.id, name: row.name, parentId: typeof data(row).parentId === "string" ? data(row).parentId as string : null, path: path(row), updatedAt: row.updated_at, usages: usages.get(row.name) ?? [] })).sort((a, b) => a.path.localeCompare(b.path));
}

export function listTagAliases(conn: DatabaseSync): Record<string, string | null> {
  const tags = registry(conn);
  return Object.fromEntries((conn.prepare("SELECT name, tag_id FROM tag_aliases").all() as { name: string; tag_id: string | null }[]).filter(alias => !tags.some(tag => tag.name === alias.name)).map(alias => [alias.name, tags.find(tag => tag.id === alias.tag_id)?.name ?? null]));
}

export function createTag(conn: DatabaseSync, input: { name: unknown; parentId?: unknown }) {
  const name = tagNames([input.name])[0];
  if (registry(conn).some(row => row.name === name) || conn.prepare("SELECT name FROM tag_aliases WHERE name = ?").get(name)) throw new Error("This tag name already exists or belongs to a renamed/deleted tag.");
  const parentId = input.parentId == null || input.parentId === "" ? null : String(input.parentId);
  if (parentId && !registry(conn).some(row => row.id === parentId)) throw new Error("Parent tag not found.");
  const id = insertTag(conn, name, parentId); audit(conn, id, "created", { name, parentId });
  return listTags(conn).find(tag => tag.id === id)!;
}

export function changeTag(conn: DatabaseSync, id: string, input: { name?: unknown; parentId?: unknown; expectedUpdatedAt?: unknown }, remove = false) {
  conn.exec("BEGIN IMMEDIATE");
  try {
    const tag = listTags(conn).find(tag => tag.id === id);
    if (!tag) throw new Error("Tag not found.");
    if (input.expectedUpdatedAt !== tag.updatedAt) throw new Error("Tag changed in another tab. Reload before saving.");
    if (remove) {
      if (tag.usages.length || listTags(conn).some(child => child.parentId === id)) throw new Error("Remove this tag from its resources and move its child tags before deleting it.");
      conn.prepare("INSERT INTO tag_aliases VALUES (?, NULL) ON CONFLICT(name) DO UPDATE SET tag_id = NULL").run(tag.name);
      conn.prepare("UPDATE tag_aliases SET tag_id = NULL WHERE tag_id = ?").run(id);
      conn.prepare("DELETE FROM resources WHERE id = ?").run(id);
      audit(conn, id, "deleted", { name: tag.name });
      conn.exec("COMMIT"); return tag;
    }
    const name = input.name === undefined ? tag.name : tagNames([input.name])[0];
    const parentId = input.parentId === undefined ? tag.parentId : input.parentId == null || input.parentId === "" ? null : String(input.parentId);
    if (!tagParentIsValid(id, parentId, listTags(conn))) throw new Error("A tag cannot be nested under itself or a descendant.");
    const alias = conn.prepare("SELECT tag_id FROM tag_aliases WHERE name = ?").get(name) as { tag_id: string | null } | undefined;
    if (registry(conn).some(row => row.id !== id && row.name === name) || (alias && alias.tag_id !== id)) throw new Error("This tag name already exists or is reserved.");
    if (name !== tag.name) {
      for (const row of conn.prepare("SELECT id, config_json, edited_at FROM campaigns").all() as { id: string; config_json: string; edited_at: string }[]) {
        const config = jsonData(row.config_json);
        if (Array.isArray(config.tags) && config.tags.includes(tag.name)) { config.tags = config.tags.map((value: string) => value === tag.name ? name : value); conn.prepare("UPDATE campaigns SET config_json = ?, edited_at = ? WHERE id = ?").run(JSON.stringify(config), stamp(row.edited_at), row.id); }
      }
      for (const row of rows(conn)) {
        if (row.type === "tag-management") continue;
        const value = data(row); let changed = false;
        for (const key of row.type === "global-control-group" ? ["tags", "exclusionTags"] : ["tags"]) {
          if (Array.isArray(value[key]) && value[key].includes(tag.name)) { value[key] = value[key].map((entry: unknown) => entry === tag.name ? name : entry); changed = true; }
        }
        if (changed) conn.prepare("UPDATE resources SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(value), stamp(row.updated_at), row.id);
      }
      conn.prepare("INSERT INTO tag_aliases VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET tag_id = excluded.tag_id").run(tag.name, id);
    }
    conn.prepare("UPDATE resources SET name = ?, data_json = ?, updated_at = ? WHERE id = ?").run(name, JSON.stringify({ ...data(registry(conn).find(row => row.id === id)!), parentId }), stamp(tag.updatedAt), id);
    audit(conn, id, "updated", { previousName: tag.name, name, parentId });
    conn.exec("COMMIT"); return listTags(conn).find(tag => tag.id === id)!;
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}

export function tagCampaigns(conn: DatabaseSync, ids: unknown, additions: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string")) throw new Error("Select at least one Campaign.");
  if (!tagNames(additions).length) throw new Error("Choose at least one tag to add.");
  conn.exec("BEGIN IMMEDIATE");
  try {
    const selected = [...new Set(ids)].map(id => {
      const row = conn.prepare("SELECT id, config_json FROM campaigns WHERE id = ? AND archived_at IS NULL").get(id) as { id: string; config_json: string } | undefined;
      if (!row) throw new Error("A selected Campaign is no longer available. Reload before tagging.");
      return { id: row.id, config: jsonData(row.config_json) };
    });
    const tags = assignTags(conn, campaignBulkTags(selected.map(row => row.config.tags), additions), "campaign");
    for (const row of selected) conn.prepare("UPDATE campaigns SET config_json = ?, edited_at = ? WHERE id = ?").run(JSON.stringify({ ...row.config, tags }), stamp(), row.id);
    audit(conn, selected.map(row => row.id).join(","), "campaigns-tagged", { tags });
    conn.exec("COMMIT"); return { ids: selected.map(row => row.id), tags };
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}
