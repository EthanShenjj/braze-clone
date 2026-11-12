import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'frequency-capping-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const rule=(id,patch={})=>({id,type:'any',messages:1,seconds:86400,...patch});
const settings=(workspaceId,rules,patch={})=>store.createResource({type:'frequency-capping-rules',name:'Frequency rules',data:{workspaceId,enabled:true,rules,...patch}});
let seq=0;
function entity(workspaceId='local',patch={}){const id='cmp_frequency_'+(++seq);return store.upsertCampaign({id,name:id,channel:'push',subject:'Hello',body:'Message',config:{workspaceId,...patch}});}
const context=(campaign,dispatchId,timestamp='2026-11-12T12:00:00.000Z',patch={})=>({workspaceId:campaign.config.workspaceId??'local',userId:'frequency_user',entityType:'campaign',entityId:campaign.id,channel:'push',dispatchId,timestamp,obey:true,count:true,...patch});
function sent(ctx){const result=store.reserveFrequencyDispatch(ctx);assert.equal(result.allowed,true);store.finishFrequencyDispatch(ctx,true);}

test('resource writes reject more than the workspace rule allowance',()=>{
 assert.throws(()=>settings('over-limit',Array.from({length:11},(_,i)=>rule('r'+i))),/10|limit|rules/i);
 assert.equal(store.listResources('frequency-capping-rules').filter(r=>r.data.workspaceId==='over-limit').length,0);
});
test('direct resource writes reject unsupported channels, fractions and windows over 30 days',()=>{
 for(const patch of [{type:'iam'},{messages:1.5},{messages:0},{seconds:0},{seconds:31*86400}])assert.throws(()=>settings('invalid-rules',[rule('invalid',patch)]));
});
test('per-workspace settings persist revisions and reject stale writes',()=>{
 const first=store.getFrequencyCappingSnapshot('versioned');
 const saved=store.saveFrequencyCapping({enabled:true,rules:[rule('v1')],categories:[]},first.updatedAt,'versioned');
 assert.equal(store.getFrequencyCappingSnapshot('versioned').settings.rules.length,1);
 assert.throws(()=>store.saveFrequencyCapping({enabled:false,rules:[],categories:[]},first.updatedAt,'versioned'),/changed|another tab/i);
 assert.equal(store.getFrequencyCappingSnapshot('versioned').settings.enabled,true);
 assert.notEqual(saved.updatedAt,first.updatedAt);
 const row=store.listResources('frequency-capping-rules').find(row=>row.data.workspaceId==='versioned');
 const next=store.updateResource(row.id,{data:{...row.data,enabled:false}});
 assert.ok(next.updatedAt>saved.updatedAt,'legacy writes must advance the version');
 assert.throws(()=>store.saveFrequencyCapping({enabled:true,rules:[],categories:[]},saved.updatedAt,'versioned'),/changed|another tab/i);
});
test('all applicable caps share user quota across entities and isolate workspaces',()=>{
 settings('shared',[rule('all'),rule('push',{type:'push',messages:3})]);
 settings('foreign',[rule('remote',{messages:20})]);
 const a=entity('shared'),b=entity('shared'),remote=entity('foreign');
 sent(context(a,'shared-1'));
 assert.equal(store.reserveFrequencyDispatch(context(b,'shared-2')).allowed,false);
 assert.equal(store.reserveFrequencyDispatch(context(remote,'remote-1')).allowed,true);
});
test('pending dispatch reservations prevent concurrent over-send and failed attempts release quota',()=>{
 settings('atomic',[rule('one')]);const a=entity('atomic');
 const first=context(a,'reservation-1'),second=context(a,'reservation-2');
 assert.equal(store.reserveFrequencyDispatch(first).allowed,true);
 assert.equal(store.reserveFrequencyDispatch(second).allowed,false);
 store.finishFrequencyDispatch(first,false);
 assert.equal(store.reserveFrequencyDispatch(second).allowed,true);
});
test('a multichannel dispatch counts once for any-channel caps while each channel keeps its own cap',()=>{
 settings('multi',[rule('all'),rule('email',{type:'email'})]);const a=entity('multi');
 sent(context(a,'dispatch-1'));
 sent(context(a,'dispatch-1',undefined,{channel:'email'}));
 assert.equal(store.reserveFrequencyDispatch(context(a,'dispatch-2')).allowed,false);
 assert.equal(store.reserveFrequencyDispatch(context(a,'dispatch-2',undefined,{channel:'email'})).allowed,false);
});
test('user-local midnight resets daily caps even when fewer than 24 hours passed',()=>{
 settings('midnight',[rule('daily')]);const a=entity('midnight');
 store.applyProfileRows([{external_id:'frequency_shanghai',attributes:{workspaceId:'midnight',timezone:'Asia/Shanghai'}}]);
 const patch={userId:'frequency_shanghai'};
 sent(context(a,'night','2026-11-11T15:59:00.000Z',patch));
 assert.equal(store.reserveFrequencyDispatch(context(a,'night2','2026-11-11T15:59:30.000Z',patch)).allowed,false);
 assert.equal(store.reserveFrequencyDispatch(context(a,'morning','2026-11-11T16:00:00.000Z',patch)).allowed,true);
});
test('calendar windows handle a 23-hour daylight saving day',()=>{
 settings('dst',[rule('daily')]);const a=entity('dst');
 store.applyProfileRows([{external_id:'frequency_ny',attributes:{workspaceId:'dst',time_zone:'America/New_York'}}]);
 const patch={userId:'frequency_ny'};
 sent(context(a,'dst1','2026-03-08T05:05:00.000Z',patch));
 assert.equal(store.reserveFrequencyDispatch(context(a,'dst2','2026-03-09T04:01:00.000Z',patch)).allowed,true);
});
test('minute windows expire precisely and unsupported channels never consume any-channel budget',()=>{
 settings('minutes',[rule('minute',{seconds:60})]);const a=entity('minutes');
 sent(context(a,'iam','2026-11-12T12:00:00.000Z',{channel:'iam'}));
 sent(context(a,'push','2026-11-12T12:00:00.000Z'));
 assert.equal(store.reserveFrequencyDispatch(context(a,'push2','2026-11-12T12:00:59.000Z')).allowed,false);
 assert.equal(store.reserveFrequencyDispatch(context(a,'push3','2026-11-12T12:01:00.000Z')).allowed,true);
});
test('exempt sends can independently count or leave future quota untouched',()=>{
 settings('exempt',[rule('all')]);const a=entity('exempt');
 sent(context(a,'no-count',undefined,{obey:false,count:false}));
 sent(context(a,'count',undefined,{obey:false,count:true}));
 assert.equal(store.reserveFrequencyDispatch(context(a,'normal')).allowed,false);
});
test('tag quotas include descendants and re-evaluate historical entities current tags',()=>{
 const b=entity('tags',{tags:['Promotions']});
 const parent=store.listWorkspaceTags('tags').find(t=>t.name==='Promotions');
 const child=store.createWorkspaceTag({name:'Seasonal promotions',parentId:parent.id},'tags');
 const a=entity('tags',{tags:[child.id]});
 settings('tags',[rule('tagged',{tagId:parent.id})]);
 sent(context(a,'tag1'));
 assert.equal(store.reserveFrequencyDispatch(context(b,'tag2')).allowed,false);
 store.upsertCampaign({...a,config:{...a.config,tags:[]}});
 assert.equal(store.reserveFrequencyDispatch(context(b,'tag3')).allowed,true);
});
test('tag and category filters combine with AND across Campaigns and Canvases',()=>{
 const a=entity('categories',{tags:['Promotions']}),parent=store.listWorkspaceTags('categories').find(t=>t.name==='Promotions');
 settings('categories',[rule('scoped',{tagId:parent.id,categoryId:'marketing'})],{categories:[{id:'marketing',name:'Marketing'},{id:'service',name:'Service'}]});
 const canvas=store.createCanvas({name:'Categorized Canvas',workspaceId:'categories',tags:[parent.id],wizard:{send:{frequencyCategoryId:'marketing'}}});
 const c={...context(a,'canvas-1'),entityId:canvas.id,entityType:'canvas'};
 sent(c);
 assert.equal(store.reserveFrequencyDispatch(context(a,'unassigned')).allowed,true);
 store.upsertCampaign({...a,config:{...a.config,delivery:{frequencyCategoryId:'marketing'}}});
 assert.equal(store.reserveFrequencyDispatch(context(a,'marketing')).allowed,false);
 store.upsertCampaign({...a,config:{...a.config,delivery:{frequencyCategoryId:'service'}}});
 assert.equal(store.reserveFrequencyDispatch(context(a,'service')).allowed,true);
});
test('activity categories must belong to the activity workspace',()=>{
 assert.throws(()=>entity('unconfigured',{delivery:{frequencyCategoryId:'foreign'}}),/category|workspace/i);
 assert.throws(()=>store.createCanvas({name:'Foreign category',workspaceId:'unconfigured',wizard:{send:{frequencyCategoryId:'foreign'}}}),/category|workspace/i);
 const canvas=store.createCanvas({name:'No category',workspaceId:'unconfigured'});
 assert.throws(()=>store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,send:{...canvas.wizard.send,frequencyCategoryId:'foreign'}}}),/category|workspace/i);
});
test('read-only frequency settings cannot be edited or bypassed through the legacy resource API',()=>{
 const saved=settings('readonly',[rule('r')],{canEdit:false});
 assert.equal(store.getFrequencyCappingSnapshot('readonly').capabilities.canEdit,false);
 assert.throws(()=>store.saveFrequencyCapping({enabled:false,rules:[],categories:[]},saved.updatedAt,'readonly'),/permission|edit|read.only/i);
 assert.throws(()=>store.updateResource(saved.id,{data:{...saved.data,canEdit:true,enabled:false}}),/permission|edit|read.only/i);
});
