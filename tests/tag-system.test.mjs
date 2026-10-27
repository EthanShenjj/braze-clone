import { test } from "node:test";
import { deepEqual, equal, throws } from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { campaignBulkTags, resolveTagAliases, tagNames } from "../lib/tag-model.ts";
import { assignTags, changeTag, createTag, initializeTags, listTagAliases, listTags, tagCampaigns } from "../lib/tag-store.ts";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE resources (id TEXT PRIMARY KEY, type TEXT, name TEXT, status TEXT, description TEXT, updated_at TEXT, data_json TEXT);
    CREATE TABLE campaigns (id TEXT PRIMARY KEY, name TEXT, status TEXT, config_json TEXT, edited_at TEXT, archived_at TEXT);
    CREATE TABLE audit_log (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, created_at TEXT, detail_json TEXT);`);
  const resource = (id, type, value, status = "Draft") => db.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, '', '2026-01-01T00:00:00.000Z', ?)").run(id, type, id, status, JSON.stringify(value));
  const campaign = (id, tags) => db.prepare("INSERT INTO campaigns VALUES (?, ?, 'Draft', ?, '2026-01-01T00:00:00.000Z', NULL)").run(id, id, JSON.stringify({ tags, message: "Preserve me" }));
  return { db, resource, campaign };
}

test("tag assignment deduplicates and enforces the 175-tag boundary", () => {
  equal(tagNames(Array.from({ length: 175 }, (_, i) => `t${i}`), true).length, 175);
  throws(() => tagNames(Array.from({ length: 176 }, (_, i) => `t${i}`), true), /175/);
  deepEqual(tagNames([" A ", "A", "a"], true), ["A", "a"]);
  for (const invalid of [null, "A", [""], [" "], [123]]) throws(() => tagNames(invalid), /array/);
  deepEqual(campaignBulkTags([["Promo"], ["Transactional"]], ["Launch"]), ["Promo", "Transactional", "Launch"]);
});

test("migration imports legacy task and exclusion names once with stable registry IDs", t => {
  const { db, resource, campaign } = fixture(t);
  campaign("one", ["Legacy"]); resource("canvas", "canvas", { tags: ["Journey"] }); resource("gcg", "global-control-group", { exclusionTags: ["Critical"] });
  initializeTags(db);
  const before = listTags(db).map(tag => [tag.id, tag.name]);
  initializeTags(db);
  deepEqual(listTags(db).map(tag => [tag.id, tag.name]), before);
  equal(before.length, 3);
  equal(listTags(db).find(tag => tag.name === "Critical").usages[0].type, "global-control-group");
});

test("rename updates Campaign, Canvas, Segment and control exclusions atomically and preserves unrelated fields", t => {
  const { db, resource, campaign } = fixture(t);
  campaign("one", ["Critical"]); resource("canvas", "canvas", { tags: ["Critical"], graph: { preserve: true } }); resource("segment", "segments", { tags: ["Critical"], filters: ["keep"] }); resource("gcg", "global-control-group", { enabled: true, seed: "same-seed", exclusionTags: ["Critical"] });
  initializeTags(db); const tag = listTags(db)[0];
  const renamed = changeTag(db, tag.id, { name: "Essential", expectedUpdatedAt: tag.updatedAt });
  equal(renamed.id, tag.id); equal(renamed.usages.length, 4);
  const config = JSON.parse(db.prepare("SELECT config_json FROM campaigns").get().config_json);
  deepEqual(config, { tags: ["Essential"], message: "Preserve me" });
  const gcg = db.prepare("SELECT data_json, updated_at FROM resources WHERE id = 'gcg'").get();
  deepEqual(JSON.parse(gcg.data_json), { enabled: true, seed: "same-seed", exclusionTags: ["Essential"] });
  equal(gcg.updated_at > "2026-01-01T00:00:00.000Z", true);
  deepEqual(JSON.parse(db.prepare("SELECT data_json FROM resources WHERE id = 'canvas'").get().data_json).graph, { preserve: true });
  deepEqual(assignTags(db, ["Critical", "Essential"], "campaign"), ["Essential"]);
  deepEqual(resolveTagAliases(["Critical", "Essential"], listTagAliases(db)), ["Essential"]);
  equal(listTags(db).length, 1);
  throws(() => changeTag(db, tag.id, { name: "Stale", expectedUpdatedAt: tag.updatedAt }), /another tab/);
});

test("nesting rejects self, descendant and missing parent without changing direct associations", t => {
  const { db, campaign } = fixture(t); initializeTags(db);
  const parent = createTag(db, { name: "Lifecycle" }); const child = createTag(db, { name: "Welcome", parentId: parent.id });
  campaign("one", ["Welcome"]);
  equal(listTags(db).find(tag => tag.id === child.id).path, "Lifecycle / Welcome");
  equal(listTags(db).find(tag => tag.id === parent.id).usages.length, 0);
  for (const parentId of [parent.id, child.id, "missing"]) throws(() => changeTag(db, parent.id, { parentId, expectedUpdatedAt: parent.updatedAt }), /nested/);
  equal(listTags(db).find(tag => tag.id === parent.id).parentId, null);
});

test("name conflicts do not merge tags or mutate existing task references", t => {
  const { db, campaign } = fixture(t); initializeTags(db);
  const one = createTag(db, { name: "One" }); createTag(db, { name: "Two" }); campaign("one", ["One"]);
  throws(() => createTag(db, { name: " One " }), /already exists/);
  throws(() => changeTag(db, one.id, { name: "Two", expectedUpdatedAt: one.updatedAt }), /already exists/);
  deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns").get().config_json).tags, ["One"]);
});

test("deletion guards resources, rules and child tags; deleted names cannot be silently resurrected", t => {
  const { db, resource } = fixture(t); initializeTags(db);
  const rule = createTag(db, { name: "Critical" }); resource("gcg", "global-control-group", { exclusionTags: [rule.name] });
  throws(() => changeTag(db, rule.id, { expectedUpdatedAt: rule.updatedAt }, true), /resources/);
  const parent = createTag(db, { name: "Parent" }); const child = createTag(db, { name: "Child", parentId: parent.id });
  throws(() => changeTag(db, parent.id, { expectedUpdatedAt: parent.updatedAt }, true), /child/);
  changeTag(db, child.id, { expectedUpdatedAt: child.updatedAt }, true);
  throws(() => assignTags(db, ["Child"], "canvas"), /deleted/);
  throws(() => resolveTagAliases(["Child"], listTagAliases(db)), /deleted/);
  equal(listTags(db).some(tag => tag.id === child.id), false);
});

test("Campaign Tag As shares the complete union and updates all selected Campaigns", t => {
  const { db, campaign } = fixture(t); campaign("one", ["Promo"]); campaign("two", ["Transactional"]); initializeTags(db);
  const result = tagCampaigns(db, ["one", "two", "one"], ["Launch"]);
  deepEqual(result.tags, ["Promo", "Transactional", "Launch"]);
  for (const row of db.prepare("SELECT config_json FROM campaigns").all()) deepEqual(JSON.parse(row.config_json).tags, result.tags);
});

test("bulk overflow or a missing Campaign rolls back every task and registry change", t => {
  const { db, campaign } = fixture(t); campaign("one", Array.from({ length: 175 }, (_, i) => `t${i}`)); campaign("two", []); initializeTags(db);
  const before = db.prepare("SELECT config_json FROM campaigns ORDER BY id").all(); const tagCount = listTags(db).length;
  throws(() => tagCampaigns(db, ["one", "two"], ["Overflow"]), /175/);
  throws(() => tagCampaigns(db, ["two", "missing"], ["New"]), /no longer available/);
  deepEqual(db.prepare("SELECT config_json FROM campaigns ORDER BY id").all(), before);
  equal(listTags(db).length, tagCount);
});

test("template and Content Block assignments require existing tags and never partially create unknown names", t => {
  const { db } = fixture(t); initializeTags(db);
  createTag(db, { name: "Existing" });
  for (const type of ["email-templates", "content-blocks"]) {
    deepEqual(assignTags(db, ["Existing"], type), ["Existing"]);
    throws(() => assignTags(db, ["Existing", "Unknown"], type), /already exist/);
  }
  equal(listTags(db).length, 1);
  throws(() => tagCampaigns(db, ["missing"], []), /at least one tag/);
});

test("legacy malformed JSON does not prevent loading or migrating other tags", t => {
  const { db, resource, campaign } = fixture(t);
  resource("null", "misc", null); resource("list", "misc", []); campaign("one", ["Preserved"]);
  db.prepare("INSERT INTO resources VALUES ('invalid', 'misc', 'invalid', 'Draft', '', '', '{')").run();
  initializeTags(db);
  equal(listTags(db)[0].name, "Preserved");
});
