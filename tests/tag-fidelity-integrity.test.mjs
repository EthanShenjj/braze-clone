import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { assignTags, changeTag, createTag, initializeTags, listTags, tagCampaigns, tagResources } from '../lib/tag-store.ts';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE resources (id TEXT PRIMARY KEY, type TEXT, name TEXT, status TEXT, description TEXT, updated_at TEXT, data_json TEXT);
    CREATE TABLE campaigns (id TEXT PRIMARY KEY, name TEXT, status TEXT, config_json TEXT, edited_at TEXT, archived_at TEXT);
    CREATE TABLE audit_log (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, created_at TEXT, detail_json TEXT);`);
  initializeTags(db);
  const campaign = (id, tags, editedAt = '2026-01-01T00:00:00.000Z') => db.prepare("INSERT INTO campaigns VALUES (?, ?, 'Draft', ?, ?, NULL)").run(id, id, JSON.stringify({ tags }), editedAt);
  const rejectAudit = () => db.exec("CREATE TRIGGER reject_tag_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
  return { db, campaign, rejectAudit };
}

test('tag creation and assignment roll back definitions when their audit cannot be saved', t => {
  const { db, rejectAudit } = fixture(t);
  rejectAudit();
  assert.throws(() => createTag(db, { name: 'Never committed' }), /audit unavailable/);
  assert.deepEqual(listTags(db), []);
  assert.throws(() => assignTags(db, ['First', 'Second'], 'canvas'), /audit unavailable/);
  assert.deepEqual(listTags(db), []);
});

test('rename and bulk tagging compose with a surrounding resource transaction', t => {
  const { db, campaign } = fixture(t);
  const tag = createTag(db, { name: 'Before' });
  campaign('one', ['Before']);
  db.exec('BEGIN IMMEDIATE');
  const renamed = changeTag(db, tag.id, { name: 'After', expectedUpdatedAt: tag.updatedAt });
  assert.equal(renamed.id, tag.id);
  assert.deepEqual(tagCampaigns(db, ['one'], ['Addition']).tags, ['After', 'Addition']);
  db.exec('ROLLBACK');
  assert.deepEqual(listTags(db).map(tag => tag.name), ['Before']);
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'one'").get().config_json).tags, ['Before']);
});

test('a failed tag operation rolls back only its savepoint and leaves the parent transaction usable', t => {
  const { db, campaign } = fixture(t);
  campaign('one', []);
  db.exec('BEGIN IMMEDIATE');
  createTag(db, { name: 'Parent transaction' });
  assert.throws(() => tagCampaigns(db, ['one', 'missing'], ['Uncommitted']), /no longer available/);
  assert.deepEqual(listTags(db).map(tag => tag.name), ['Parent transaction']);
  db.exec('COMMIT');
  assert.deepEqual(listTags(db).map(tag => tag.name), ['Parent transaction']);
});

test('bulk tag limits count canonical identities after a rename', t => {
  const { db, campaign } = fixture(t);
  const old = createTag(db, { name: 'Old name' });
  const current = changeTag(db, old.id, { name: 'Current name', expectedUpdatedAt: old.updatedAt });
  const names = assignTags(db, [current.name, ...Array.from({ length: 174 }, (_, i) => `tag ${i}`)], 'campaign');
  campaign('one', names);
  const result = tagCampaigns(db, ['one'], ['Old name']);
  assert.equal(result.tags.length, 175);
  assert.deepEqual(result.tags, names);
});

test('bulk updates advance resource versions even when the previous clock is ahead', t => {
  const { db, campaign } = fixture(t);
  campaign('future', [], '2099-01-01T00:00:00.000Z');
  tagCampaigns(db, ['future'], ['Updated']);
  assert.ok(db.prepare("SELECT edited_at FROM campaigns WHERE id = 'future'").get().edited_at > '2099-01-01T00:00:00.000Z');
});

test('workspace dictionaries, aliases, references and bulk writes remain isolated', t => {
  const { db, campaign } = fixture(t);
  const local = createTag(db, { name: 'Shared name' });
  const other = createTag(db, { name: 'Shared name' }, 'other');
  campaign('local-campaign', ['Shared name']);
  campaign('other-campaign', ['Shared name']);
  db.prepare("UPDATE campaigns SET config_json = ? WHERE id = 'other-campaign'").run(JSON.stringify({ workspaceId: 'other', tags: ['Shared name'] }));
  const renamed = changeTag(db, other.id, { name: 'Other renamed', expectedUpdatedAt: other.updatedAt }, false, 'other');
  assert.equal(renamed.usages.length, 1);
  assert.deepEqual(listTags(db).map(tag => [tag.id, tag.name, tag.usages.length]), [[local.id, 'Shared name', 1]]);
  assert.deepEqual(assignTags(db, ['Shared name'], 'campaign', 'other'), ['Other renamed']);
  assert.deepEqual(assignTags(db, ['Shared name'], 'campaign'), ['Shared name']);
  assert.throws(() => changeTag(db, other.id, { name: 'Leak', expectedUpdatedAt: renamed.updatedAt }), /not found/);
  assert.throws(() => createTag(db, { name: 'Invalid child', parentId: other.id }), /Parent tag not found/);
  assert.throws(() => tagCampaigns(db, ['local-campaign', 'other-campaign'], ['Leak']), /no longer available/);
  assert.equal(listTags(db).some(tag => tag.name === 'Leak'), false);
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'local-campaign'").get().config_json).tags, ['Shared name']);
});

test('stable audience rule IDs survive rename and count as usage without becoming direct assignments', t => {
  const { db, campaign } = fixture(t);
  const tag = createTag(db, { name: 'Receipt rule' });
  const filter = { field: `receipt_tag_count:delivered:${tag.id}`, operator: 'greater_than', value: '0' };
  campaign('rule-campaign', []);
  db.prepare("UPDATE campaigns SET config_json = ? WHERE id = 'rule-campaign'").run(JSON.stringify({ audienceGroups: [{ filters: [filter] }], tags: [] }));
  const before = listTags(db)[0];
  assert.equal(before.usages.length, 1);
  assert.equal(before.usages[0].direct, false);
  const renamed = changeTag(db, tag.id, { name: 'Renamed receipt rule', expectedUpdatedAt: tag.updatedAt });
  assert.equal(renamed.usages.length, 1);
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'rule-campaign'").get().config_json).audienceGroups[0].filters[0], filter);
  changeTag(db, tag.id, { expectedUpdatedAt: renamed.updatedAt }, true);
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'rule-campaign'").get().config_json).audienceGroups[0].filters[0], filter);
  assert.equal(db.prepare('SELECT tag_id FROM tag_aliases WHERE name = ? AND workspace_id = ?').get(renamed.name, 'local').tag_id, null);
});

test('legacy alias migration scopes names to local and initialization does not resurrect stale aliases', t => {
  const { db, campaign } = fixture(t);
  db.exec("DROP TABLE tag_aliases; CREATE TABLE tag_aliases (name TEXT PRIMARY KEY, tag_id TEXT); INSERT INTO tag_aliases VALUES ('Deleted legacy', NULL)");
  campaign('stale', ['Deleted legacy']);
  campaign('other', ['Deleted legacy']);
  db.prepare("UPDATE campaigns SET config_json = ? WHERE id = 'other'").run(JSON.stringify({ workspaceId: 'other', tags: ['Deleted legacy'] }));
  initializeTags(db);
  assert.deepEqual(listTags(db), []);
  assert.deepEqual(listTags(db, 'other').map(tag => tag.name), ['Deleted legacy']);
  assert.throws(() => assignTags(db, ['Deleted legacy'], 'campaign'), /deleted/);
  assert.deepEqual(assignTags(db, ['Deleted legacy'], 'campaign', 'other'), ['Deleted legacy']);
  const before = listTags(db, 'other')[0].id;
  initializeTags(db);
  assert.equal(listTags(db, 'other')[0].id, before);
});

test('migration imports names independently per workspace and repairs duplicate parent IDs', t => {
  const { db, campaign } = fixture(t);
  db.exec('DROP INDEX workspace_tag_scoped_unique_name');
  const insert = db.prepare("INSERT INTO resources VALUES (?, 'tag-management', ?, 'Active', '', '2026-01-01', ?)");
  insert.run('parent1', 'Parent', '{}');
  insert.run('parent2', 'Parent', '{}');
  insert.run('child', 'Child', JSON.stringify({ parentId: 'parent2' }));
  campaign('local', ['Both workspaces']);
  campaign('other', ['Both workspaces']);
  db.prepare("UPDATE campaigns SET config_json = ? WHERE id = 'other'").run(JSON.stringify({ workspaceId: 'other', tags: ['Both workspaces'] }));
  initializeTags(db);
  assert.equal(listTags(db).find(tag => tag.id === 'child').parentId, 'parent1');
  assert.equal(listTags(db).filter(tag => tag.name === 'Parent').length, 1);
  assert.notEqual(listTags(db).find(tag => tag.name === 'Both workspaces').id, listTags(db, 'other')[0].id);
});

test('multi-tag assignment and cross-resource rename roll back every prior write on a late audit failure', t => {
  const { db, campaign } = fixture(t);
  db.exec("CREATE TRIGGER reject_second_tag BEFORE INSERT ON audit_log WHEN json_extract(NEW.detail_json, '$.name') = 'Second' BEGIN SELECT RAISE(ABORT, 'second audit unavailable'); END");
  assert.throws(() => assignTags(db, ['First', 'Second'], 'canvas'), /second audit unavailable/);
  assert.deepEqual(listTags(db), []);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_log').get().n, 0);
  db.exec('DROP TRIGGER reject_second_tag');
  const tag = createTag(db, { name: 'Before' });
  campaign('campaign', ['Before']);
  db.prepare("INSERT INTO resources VALUES ('canvas', 'canvas', 'Canvas', 'Draft', '', '2026-01-01', ?)").run(JSON.stringify({ tags: ['Before'] }));
  db.exec("CREATE TRIGGER reject_rename BEFORE INSERT ON audit_log WHEN NEW.action = 'updated' BEGIN SELECT RAISE(ABORT, 'rename audit unavailable'); END");
  assert.throws(() => changeTag(db, tag.id, { name: 'After', expectedUpdatedAt: tag.updatedAt }), /rename audit unavailable/);
  assert.equal(listTags(db)[0].name, 'Before');
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'campaign'").get().config_json).tags, ['Before']);
  assert.deepEqual(JSON.parse(db.prepare("SELECT data_json FROM resources WHERE id = 'canvas'").get().data_json).tags, ['Before']);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tag_aliases').get().n, 0);
});

test('source-confirmed global deletion cascades direct assignments and GCG exclusions only within its workspace', t => {
  const { db, campaign } = fixture(t);
  const tag = createTag(db, { name: 'Original' });
  const renamed = changeTag(db, tag.id, { name: 'Delete globally', expectedUpdatedAt: tag.updatedAt });
  const other = createTag(db, { name: renamed.name }, 'other');
  campaign('local', [renamed.name, 'Keep']);
  campaign('other', [renamed.name]);
  db.prepare("UPDATE campaigns SET config_json = ? WHERE id = 'other'").run(JSON.stringify({ workspaceId: 'other', tags: [renamed.name] }));
  const insert = db.prepare("INSERT INTO resources VALUES (?, ?, ?, 'Active', '', '2099-01-01T00:00:00.000Z', ?)");
  const filter = { field: `receipt_tag_count:delivered:${tag.id}`, operator: 'equals', value: '0' };
  for (const type of ['canvas', 'segments', 'email-templates', 'content-blocks']) insert.run(type, type, type, JSON.stringify({ tags: [renamed.name, 'Keep'], preserve: { enabled: true }, filters: [filter] }));
  insert.run('gcg', 'global-control-group', 'GCG', JSON.stringify({ exclusionTags: [renamed.name, 'Keep'], enabled: true, seed: 'unchanged', percentage: 10 }));
  insert.run('other-canvas', 'canvas', 'Other', JSON.stringify({ workspaceId: 'other', tags: [renamed.name] }));
  assert.throws(() => changeTag(db, tag.id, { expectedUpdatedAt: tag.updatedAt }, true), /another tab/);
  assert.equal(listTags(db).some(row => row.id === tag.id), true);
  const deleted = changeTag(db, tag.id, { expectedUpdatedAt: renamed.updatedAt }, true);
  assert.equal(deleted.usages.length, 6);
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'local'").get().config_json).tags, ['Keep']);
  for (const id of ['canvas', 'segments', 'email-templates', 'content-blocks']) {
    const row = db.prepare('SELECT data_json, updated_at FROM resources WHERE id = ?').get(id), value = JSON.parse(row.data_json);
    assert.deepEqual(value.tags, ['Keep']);
    assert.deepEqual(value.preserve, { enabled: true });
    assert.deepEqual(value.filters, [filter]);
    assert.ok(row.updated_at > '2099-01-01T00:00:00.000Z');
  }
  assert.deepEqual(JSON.parse(db.prepare("SELECT data_json FROM resources WHERE id = 'gcg'").get().data_json), { exclusionTags: ['Keep'], enabled: true, seed: 'unchanged', percentage: 10 });
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM campaigns WHERE id = 'other'").get().config_json).tags, [renamed.name]);
  assert.deepEqual(JSON.parse(db.prepare("SELECT data_json FROM resources WHERE id = 'other-canvas'").get().data_json).tags, [renamed.name]);
  assert.equal(listTags(db, 'other')[0].id, other.id);
  for (const name of [tag.name, renamed.name]) assert.throws(() => assignTags(db, [name], 'canvas'), /deleted/);
  const audit = JSON.parse(db.prepare("SELECT detail_json FROM audit_log WHERE action = 'deleted'").get().detail_json);
  assert.equal(audit.usages.length, 6);
});

test('failed deletion audit rolls back every direct unassignment, version and tombstone', t => {
  const { db, campaign } = fixture(t);
  const tag = createTag(db, { name: 'Delete atomically' });
  campaign('campaign', [tag.name]);
  db.prepare("INSERT INTO resources VALUES ('canvas', 'canvas', 'Canvas', 'Draft', '', '2026-01-01', ?)").run(JSON.stringify({ tags: [tag.name] }));
  const beforeResources = db.prepare('SELECT * FROM resources ORDER BY id').all(), beforeCampaigns = db.prepare('SELECT * FROM campaigns ORDER BY id').all();
  db.exec("CREATE TRIGGER reject_delete BEFORE INSERT ON audit_log WHEN NEW.action = 'deleted' BEGIN SELECT RAISE(ABORT, 'delete audit unavailable'); END");
  assert.throws(() => changeTag(db, tag.id, { expectedUpdatedAt: tag.updatedAt }, true), /delete audit unavailable/);
  assert.deepEqual(db.prepare('SELECT * FROM resources ORDER BY id').all(), beforeResources);
  assert.deepEqual(db.prepare('SELECT * FROM campaigns ORDER BY id').all(), beforeCampaigns);
  assert.equal(db.prepare('SELECT count(*) AS n FROM tag_aliases').get().n, 0);
});


test('Campaign Tag As explicit replace supports removing tags and clearing the complete selected set', t => {
  const { db, campaign } = fixture(t);
  campaign('one', ['Remove', 'Keep']); campaign('two', ['Other']);
  initializeTags(db);
  assert.deepEqual(tagCampaigns(db, ['one', 'two'], ['Keep'], 'local', 'replace').tags, ['Keep']);
  for (const row of db.prepare('SELECT config_json FROM campaigns').all()) assert.deepEqual(JSON.parse(row.config_json).tags, ['Keep']);
  assert.deepEqual(tagCampaigns(db, ['one', 'two'], [], 'local', 'replace').tags, []);
  for (const row of db.prepare('SELECT config_json FROM campaigns').all()) assert.deepEqual(JSON.parse(row.config_json).tags, []);
  assert.throws(() => tagCampaigns(db, ['one'], undefined, 'local', 'replace'), /array/);
  assert.throws(() => tagCampaigns(db, ['one'], [], 'local', 'invalid'), /mode/);
  assert.equal(listTags(db).some(tag => tag.name === 'Remove'), true);
});

for (const type of ['canvas', 'segments']) {
  test(`${type} Tag As replaces only the selected resources and preserves unrelated content`, t => {
    const { db } = fixture(t);
    const tag = createTag(db, { name: 'Old' });
    changeTag(db, tag.id, { name: 'Current', expectedUpdatedAt: tag.updatedAt });
    const insert = db.prepare("INSERT INTO resources VALUES (?, ?, ?, 'Draft', '', '2099-01-01T00:00:00.000Z', ?)");
    for (const [id, tags] of [['one', ['Remove']], ['two', ['Other']], ['unselected', ['Untouched']]]) insert.run(id, type, id, JSON.stringify({ tags, filters: [{ field: 'country', value: 'US' }], preserve: true }));
    const result = tagResources(db, type, ['one', 'two', 'one'], ['Old', 'Current']);
    assert.deepEqual(result, { ids: ['one', 'two'], tags: ['Current'] });
    for (const id of result.ids) {
      const row = db.prepare('SELECT data_json, updated_at FROM resources WHERE id = ?').get(id), value = JSON.parse(row.data_json);
      assert.deepEqual(value.tags, ['Current']); assert.equal(value.preserve, true);
      assert.deepEqual(value.filters, [{ field: 'country', value: 'US' }]);
      assert.ok(row.updated_at > '2099-01-01T00:00:00.000Z');
    }
    assert.deepEqual(JSON.parse(db.prepare("SELECT data_json FROM resources WHERE id = 'unselected'").get().data_json).tags, ['Untouched']);
    assert.deepEqual(tagResources(db, type, ['one', 'two'], []).tags, []);
  });

  test(`${type} Tag As rejects stale selections, cross-workspace IDs, wrong types and overflow atomically`, t => {
    const { db } = fixture(t);
    const insert = db.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, '', '2026-01-01', ?)");
    insert.run('one', type, 'One', 'Draft', JSON.stringify({ tags: ['Preserve'] }));
    insert.run('other', type, 'Other', 'Draft', JSON.stringify({ workspaceId: 'other', tags: ['Other'] }));
    insert.run('archived', type, 'Archived', 'Archived', '{}');
    insert.run('wrong', type === 'canvas' ? 'segments' : 'canvas', 'Wrong', 'Draft', '{}');
    const before = db.prepare('SELECT * FROM resources ORDER BY id').all();
    for (const id of ['missing', 'other', 'archived', 'wrong']) assert.throws(() => tagResources(db, type, ['one', id], ['Never created']), /no longer available/);
    assert.throws(() => tagResources(db, type, ['one'], Array.from({ length: 176 }, (_, i) => `Tag ${i}`)), /175/);
    assert.throws(() => tagResources(db, type, ['one'], undefined), /array/);
    assert.deepEqual(db.prepare('SELECT * FROM resources ORDER BY id').all(), before);
    assert.deepEqual(listTags(db), []);
  });
}

test('resource Tag As and new definitions roll back on audit failure inside a surrounding transaction', t => {
  const { db } = fixture(t);
  db.prepare("INSERT INTO resources VALUES ('canvas', 'canvas', 'Canvas', 'Draft', '', '2026-01-01', ?)").run(JSON.stringify({ tags: ['Before'] }));
  db.exec("CREATE TRIGGER reject_bulk BEFORE INSERT ON audit_log WHEN NEW.action = 'resources-tagged' BEGIN SELECT RAISE(ABORT, 'bulk audit unavailable'); END");
  db.exec('BEGIN IMMEDIATE');
  createTag(db, { name: 'Parent transaction' });
  assert.throws(() => tagResources(db, 'canvas', ['canvas'], ['Never committed']), /bulk audit unavailable/);
  assert.deepEqual(JSON.parse(db.prepare("SELECT data_json FROM resources WHERE id = 'canvas'").get().data_json).tags, ['Before']);
  assert.deepEqual(listTags(db).map(tag => tag.name), ['Parent transaction']);
  db.exec('COMMIT');
});
