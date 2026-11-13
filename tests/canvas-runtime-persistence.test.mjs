import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CanvasRuntimePersistence} from '../lib/canvas-runtime-persistence.ts';

function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'canvas-runtime-persistence-')),path=join(directory,'runtime.sqlite'),one=new DatabaseSync(path);
 one.exec("CREATE TABLE resources(id TEXT PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,description TEXT NOT NULL,updated_at TEXT NOT NULL,data_json TEXT NOT NULL DEFAULT '{}'); PRAGMA journal_mode=WAL");
 const two=new DatabaseSync(path),connections=[one,two];
 t.after(()=>{for(const connection of connections)connection.close();rmSync(directory,{recursive:true,force:true});});
 return{one,two,path,connections};
}
test('runtime state identity keeps special key tuples and foreign workspace or Canvas scopes separate',t=>{
 const {one}=fixture(t),state=new CanvasRuntimePersistence(one);
 const a=state.put('job','workspace:1','canvas1',['a:b','c'],{workspaceId:'forged',canvasId:'forged',kind:'forged',value:'first'});
 const b=state.put('job','workspace:1','canvas1',['a','b:c'],{value:'second'});
 assert.notEqual(a.id,b.id);
 assert.deepEqual(a.data,{workspaceId:'workspace:1',canvasId:'canvas1',kind:'job',value:'first'});
 assert.equal(state.get('job','workspace:1','canvas1',['a:b','c'])?.data.value,'first');
 assert.equal(state.get('job','foreign','canvas1',['a:b','c']),null);
 assert.equal(state.get('job','workspace:1','foreign',['a:b','c']),null);
 assert.equal(state.get('event','workspace:1','canvas1',['a:b','c']),null);
});

test('two SQLite connections preserve untouched metadata, explicit nulls and statuses across atomic updates and reopening',t=>{
 const {one,two,path,connections}=fixture(t),first=new CanvasRuntimePersistence(one),second=new CanvasRuntimePersistence(two);
 const original=first.put('enrollment','w1','c1',['u1'],{userId:'u1',runId:'r1',metadata:{keep:'yes'},flags:[true,false,null],attempts:1},'Waiting');
 const updated=second.put('enrollment','w1','c1',['u1'],{attempts:2,lastError:null,active:false},'Completed');
 assert.deepEqual(updated.data,{userId:'u1',runId:'r1',metadata:{keep:'yes'},flags:[true,false,null],attempts:2,lastError:null,active:false,kind:'enrollment',workspaceId:'w1',canvasId:'c1'});
 assert.equal(updated.status,'Completed');assert.equal(updated.updatedAt>original.updatedAt,true);
 const third=first.put('enrollment','w1','c1',['u1'],{third:true},'Accepted');
 assert.equal(third.updatedAt>updated.updatedAt,true);assert.equal(third.data.attempts,2);
 const reopened=new DatabaseSync(path);connections.push(reopened);
 const persisted=new CanvasRuntimePersistence(reopened).get('enrollment','w1','c1',['u1']);
 assert.equal(persisted?.status,'Accepted');assert.equal(persisted?.data.third,true);assert.equal(persisted?.data.lastError,null);
});

test('duplicate claims on separate SQLite connections never reset event data or persisted job status',t=>{
 const {one,two}=fixture(t),first=new CanvasRuntimePersistence(one),second=new CanvasRuntimePersistence(two);
 assert.equal(first.insertIfAbsent('event','w1','c1',['event1'],{userId:'u1',payload:{price:12}},'Claimed'),true);
 const initial=first.get('event','w1','c1',['event1']);
 assert.equal(second.insertIfAbsent('event','w1','c1',['event1'],{userId:'attacker',payload:{price:99}},'Active'),false);
 assert.deepEqual(second.get('event','w1','c1',['event1']),initial);
 assert.equal(second.insertIfAbsent('event','w2','c1',['event1'],{userId:'other'},'Accepted'),true);
 assert.equal(first.get('event','w2','c1',['event1'])?.status,'Accepted');
});

test('runtime listing enforces every requested scope and never returns another resource type',t=>{
 const {one}=fixture(t),state=new CanvasRuntimePersistence(one);
 state.put('job','w1','c1',['1'],{userId:'u1',runId:'r1'},'Accepted');
 state.put('job','w1','c2',['2'],{userId:'u1',runId:'r2'},'Completed');
 state.put('job','w1','c1',['3'],{userId:'u2',runId:'r1'},'Waiting');
 state.put('job','w2','c1',['4'],{userId:'u1',runId:'r1'},'Failed');
 state.put('event','w1','c1',['5'],{userId:'u1',runId:'r1'},'Recorded');
 one.prepare('INSERT INTO resources VALUES(?,?,?,?,?,?,?)').run('unrelated','canvas','Another resource','Draft','','2026-11-12T10:00:00.000Z','{"kind":"job","workspaceId":"w1","canvasId":"c1","userId":"u1","runId":"r1"}');
 assert.deepEqual(state.list('job',{workspaceId:'w1',canvasId:'c1',userId:'u1',runId:'r1'}).map(row=>row.status),['Accepted']);
 assert.equal(state.list('job',{workspaceId:'w1'}).length,3);
 assert.equal(state.list('job',{workspaceId:'w2'}).length,1);
 assert.deepEqual(state.list('job',{workspaceId:"w1' OR 1=1 --"}),[]);
 assert.deepEqual(state.list('job',{workspaceId:'w1',runId:'foreign'}),[]);
});

test('updatedAt remains strictly monotonic even when the stored revision is ahead of the server clock',t=>{
 const {one}=fixture(t),state=new CanvasRuntimePersistence(one),initial=state.put('job','w1','c1',['clock'],{attempts:1});
 one.prepare('UPDATE resources SET updated_at=? WHERE id=?').run('2099-01-01T00:00:00.000Z',initial.id);
 assert.equal(state.put('job','w1','c1',['clock'],{attempts:2}).updatedAt,'2099-01-01T00:00:00.001Z');
 assert.equal(state.put('job','w1','c1',['clock'],{attempts:3}).updatedAt,'2099-01-01T00:00:00.002Z');
});

test('rolled-back state claims and constructor DDL are retried correctly on the same connection',t=>{
 const {one,two}=fixture(t);
 one.exec('BEGIN');const rolledBack=new CanvasRuntimePersistence(one);
 assert.equal(rolledBack.insertIfAbsent('job','w1','c1',['j1'],{userId:'u1'},'Claimed'),true);
 one.exec('ROLLBACK');
 const restored=new CanvasRuntimePersistence(one),other=new CanvasRuntimePersistence(two);
 assert.equal(restored.get('job','w1','c1',['j1']),null);
 assert.equal(other.insertIfAbsent('job','w1','c1',['j1'],{userId:'u1'},'Accepted'),true);
 assert.equal(restored.get('job','w1','c1',['j1'])?.status,'Accepted');
 const plan=one.prepare("EXPLAIN QUERY PLAN SELECT id FROM resources WHERE type='canvas-runtime-state' AND json_valid(data_json) AND json_extract(data_json,'$.kind')=? AND json_extract(data_json,'$.workspaceId')=? AND json_extract(data_json,'$.canvasId')=? AND json_extract(data_json,'$.userId')=?").all('job','w1','c1','u1');
 assert.equal(plan.some(row=>/USING INDEX/.test(row.detail)),true);
 one.exec('BEGIN');restored.put('job','w1','c1',['j1'],{duringRollback:true},'Completed');
 assert.equal(other.get('job','w1','c1',['j1'])?.status,'Accepted');one.exec('ROLLBACK');
 assert.equal(restored.get('job','w1','c1',['j1'])?.status,'Accepted');assert.equal(restored.get('job','w1','c1',['j1'])?.data.duringRollback,undefined);
});
