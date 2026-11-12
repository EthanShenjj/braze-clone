import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {migrateSubscriptionGroupNames} from '../lib/subscription-group-migration.ts';

registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return nextResolve(candidate.href+'.ts',context);}
 return nextResolve(specifier,context);
}});

const {subscriptionSettings,defaultSubscriptionKeywords}=await import('../lib/audience-management-model.ts');
const path=join(mkdtempSync(join(tmpdir(),'subscription-group-migration-')),'old.sqlite');
const timestamp='2026-09-01T00:00:00.000Z';
const metadata={groupId:'legacy_group',settings:subscriptionSettings(undefined),providerValue:'preserved',legacyValue:'must remain'};
const legacy=new DatabaseSync(path);
legacy.exec(`
 CREATE TABLE subscription_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, channel TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
 );
 CREATE TABLE subscription_group_memberships (
  group_id TEXT NOT NULL REFERENCES subscription_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
  state TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(group_id,user_id)
 );
 CREATE TABLE resources (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
  description TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}'
 );
 CREATE TABLE group_name_audit (group_id TEXT NOT NULL, name TEXT NOT NULL);
 CREATE INDEX group_channel_index ON subscription_groups(channel);
 CREATE TRIGGER group_name_audit_trigger AFTER UPDATE OF name ON subscription_groups
  BEGIN INSERT INTO group_name_audit VALUES (NEW.id,NEW.name); END;
 CREATE VIEW legacy_subscription_names AS SELECT id,name FROM subscription_groups;
`);
legacy.prepare('INSERT INTO subscription_groups VALUES (?,?,?,?,?,?,?)').run('legacy_group','Shared preferences','Existing description','Email','Active',timestamp,timestamp);
legacy.prepare('INSERT INTO subscription_group_memberships VALUES (?,?,?,?)').run('legacy_group','user_1','subscribed',timestamp);
legacy.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run('legacy_metadata','subscription-group-metadata','legacy_group','Active','Original metadata',timestamp,JSON.stringify(metadata));
legacy.close();
process.env.BRAZE_DATABASE_PATH=path;
const store=await import('../lib/braze-store.ts');
const management=await import('../lib/audience-management-store.ts');

test('opening an old database removes only global name uniqueness and preserves foreign keys, rows and metadata',()=>{
 assert.equal(management.scopedSubscriptionGroup('legacy_group').name,'Shared preferences');
 const migrated=new DatabaseSync(path);
 assert.equal(migrated.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(migrated.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(migrated.prepare('PRAGMA table_info(subscription_groups)').all().length,7);
 assert.deepEqual({...migrated.prepare('SELECT * FROM subscription_groups WHERE id=?').get('legacy_group')},{id:'legacy_group',name:'Shared preferences',description:'Existing description',channel:'Email',status:'Active',created_at:timestamp,updated_at:timestamp});
 assert.deepEqual({...migrated.prepare('SELECT * FROM subscription_group_memberships WHERE group_id=?').get('legacy_group')},{group_id:'legacy_group',user_id:'user_1',state:'subscribed',updated_at:timestamp});
 assert.deepEqual(JSON.parse(migrated.prepare('SELECT data_json FROM resources WHERE id=?').get('legacy_metadata').data_json),metadata);
 assert.equal(migrated.prepare('PRAGMA foreign_key_list(subscription_group_memberships)').get().table,'subscription_groups');
 assert.ok(migrated.prepare("SELECT name FROM sqlite_schema WHERE name='group_channel_index'").get());
 assert.equal(migrated.prepare('SELECT name FROM legacy_subscription_names WHERE id=?').get('legacy_group').name,'Shared preferences');
 migrated.prepare('UPDATE subscription_groups SET name=? WHERE id=?').run('Shared preferences','legacy_group');
 assert.equal(migrated.prepare('SELECT name FROM group_name_audit WHERE group_id=?').get('legacy_group').name,'Shared preferences');
 assert.throws(()=>migrated.prepare('INSERT INTO subscription_group_memberships VALUES (?,?,?,?)').run('missing_group','user_1','subscribed',timestamp),/FOREIGN KEY/);
 assert.equal(migrateSubscriptionGroupNames(migrated),false);
 migrated.close();
});

test('same names persist independently across workspaces while default-local create/update reject local duplicates',async()=>{
 const api=await import('../app/api/subscription-groups/route.ts');
 const detail=await import('../app/api/subscription-groups/[id]/route.ts');
 const post=workspaceId=>api.POST(new Request('http://localhost/api/subscription-groups',{method:'POST',body:JSON.stringify({name:'Shared preferences',channel:'Email',workspaceId})}));
 const remoteResponse=await post('subscription_remote');assert.equal(remoteResponse.status,201);
 const remote=await remoteResponse.json();
 const otherResponse=await post('subscription_other');assert.equal(otherResponse.status,201);
 const other=await otherResponse.json();
 assert.equal((await post('subscription_remote')).status,400);
 assert.equal((await post(undefined)).status,400);
 assert.throws(()=>store.createSubscriptionGroup({name:'Shared preferences',channel:'SMS'}),/already exists.*workspace/);
 const local=management.createManagedSubscriptionGroup({name:'Local unique preferences',channel:'Email'});
 const patch=await detail.PATCH(new Request(`http://localhost/api/subscription-groups/${local.id}`,{method:'PATCH',body:JSON.stringify({name:'shared preferences',description:'must roll back'})}),{params:Promise.resolve({id:local.id})});
 assert.equal(patch.status,400);assert.equal(store.getSubscriptionGroup(local.id).name,'Local unique preferences');assert.equal(store.getSubscriptionGroup(local.id).description,'');
 const settings=management.scopedSubscriptionGroup(remote.id,'subscription_remote').settings;settings.languages.push('French');settings.keywords.French=structuredClone(defaultSubscriptionKeywords);
 management.updateManagedSubscriptionGroup(remote.id,{name:'Shared preferences',description:'Remote only',settings},'subscription_remote');
 const remoteUnique=management.createManagedSubscriptionGroup({name:'Remote unique preferences',channel:'Email'},'subscription_remote');
 assert.throws(()=>management.updateManagedSubscriptionGroup(remoteUnique.id,{name:'Shared preferences'},'subscription_remote'),/already exists.*workspace/);
 assert.throws(()=>store.updateSubscriptionGroup(remote.id,{description:'Wrong default scope'}),/workspace/);
 store.applyProfileRows([{external_id:'subscription_remote_member',attributes:{workspaceId:'subscription_remote'}},{external_id:'subscription_other_member',attributes:{workspaceId:'subscription_other'}}]);
 store.setSubscriptionMember(remote.id,'subscription_remote_member','subscribed');
 store.setSubscriptionMember(other.id,'subscription_other_member','unsubscribed');
 const persisted=new DatabaseSync(path);
 const rows=persisted.prepare(`SELECT g.id,g.name,g.description,json_extract(r.data_json,'$.workspaceId') AS workspace
  FROM subscription_groups g LEFT JOIN resources r ON r.type='subscription-group-metadata' AND json_extract(r.data_json,'$.groupId')=g.id
  WHERE g.name='Shared preferences' ORDER BY g.id`).all();
 assert.equal(rows.length,3);assert.deepEqual(new Set(rows.map(row=>row.workspace??'local')),new Set(['local','subscription_remote','subscription_other']));
 assert.equal(rows.find(row=>row.id===remote.id).description,'Remote only');
 assert.equal(rows.find(row=>row.id==='legacy_group').description,'Existing description');
 assert.deepEqual(management.scopedSubscriptionGroup(remote.id,'subscription_remote').settings.languages,['English','French']);
 assert.deepEqual(management.scopedSubscriptionGroup(other.id,'subscription_other').settings.languages,['English']);
 assert.equal(persisted.prepare('SELECT state FROM subscription_group_memberships WHERE group_id=? AND user_id=?').get(remote.id,'subscription_remote_member').state,'subscribed');
 assert.equal(persisted.prepare('SELECT state FROM subscription_group_memberships WHERE group_id=? AND user_id=?').get(other.id,'subscription_other_member').state,'unsubscribed');
 assert.deepEqual(persisted.prepare('PRAGMA foreign_key_check').all(),[]);
 persisted.close();
});

test('migration rolls back on invalid child references and restores connection pragma settings',()=>{
 const broken=new DatabaseSync(':memory:');
 broken.exec(`PRAGMA foreign_keys=OFF;
  CREATE TABLE subscription_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,description TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE children(group_id TEXT REFERENCES subscription_groups(id));
  INSERT INTO subscription_groups VALUES ('original','Original','','Email','Active','before','before');
  INSERT INTO children VALUES ('missing');
  PRAGMA foreign_keys=ON;
 `);
 assert.throws(()=>migrateSubscriptionGroupNames(broken),/foreign key integrity/);
 assert.equal(broken.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 assert.equal(broken.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table,0);
 assert.equal(broken.prepare('SELECT id FROM subscription_groups').get().id,'original');
 assert.throws(()=>broken.exec("INSERT INTO subscription_groups VALUES ('duplicate','Original','','Email','Active','before','before')"),/UNIQUE/);
 assert.equal(broken.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name='subscription_groups_workspace_migration'").get().count,0);
 broken.close();
});
