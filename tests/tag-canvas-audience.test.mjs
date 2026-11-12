import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'tag-canvas-audience-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const audience=patch=>({...structuredClone(defaultCanvasWizard.audience),...patch});
const rule=(field,patch={})=>({id:'tag-rule',field,operator:'greater_than',value:'0',...patch});
const country=(id,value)=>({id,field:'country',operator:'is',value});
store.applyProfileRows([{external_id:'canvas_tag_yes',email:'yes@example.test',country:'QA'},{external_id:'canvas_tag_no',email:'no@example.test',country:'QA'}]);
const source=store.upsertCampaign({id:'cmp_canvas_tag_source',name:'Canvas tag source',channel:'email',config:{tags:['Journey receipt']}});
store.recordExternalEvent(source.id,{userId:'canvas_tag_yes',event:'delivered'});
const tag=store.listWorkspaceTags().find(tag=>tag.name==='Journey receipt');
const field=`receipt_tag_count:delivered:${tag.id}`;

test('Canvas saved Segment evaluates every filter including tagged receipts and keeps same-name Segment workspaces separate',()=>{
 store.applyProfileRows([{external_id:'canvas_remote_yes',country:'QA',attributes:{workspaceId:'other'}},{external_id:'canvas_remote_no',country:'QA',attributes:{workspace_id:'other'}}]);
 const segment=store.createResource({type:'segments',name:'Canvas tag same name',status:'Active',data:{filters:[{field:'country',operator:'equals',value:'QA'},rule(field)]}});
 const other=store.createResource({type:'segments',name:segment.name,status:'Active',data:{workspaceId:'other',filters:[{field:'country',operator:'equals',value:'QA'}]}});
 const result=store.previewCanvasAudience(audience({segmentIds:[segment.id]}),'local','canvas_tag_no');
 assert.equal(result.matching,1);assert.equal(result.lookup.matchesFilters,false);
 assert.equal(store.previewCanvasAudience(audience({segmentIds:[segment.id]}),'local','canvas_tag_yes').lookup.matchesFilters,true);
 assert.equal(store.previewCanvasAudience(audience({segmentIds:[other.id]}),'other').matching,2);
 assert.throws(()=>store.previewCanvasAudience(audience({segmentIds:[other.id]}),'local'),/workspace|Segment/);
 assert.equal(store.estimateConfiguredAudience({channel:'push',config:{workspaceId:'other',audienceSegments:[segment.name]}}).matching,2);
 assert.equal(store.estimateConfiguredAudience({channel:'push',config:{workspaceId:'local',audienceSegments:[segment.name]}}).matching,1);
});

test('Canvas entry, exclusion and exit tag filters preserve comparisons and use the same real receipt evaluation',()=>{
 const base=audience({filters:[country('qa','QA'),rule(field)],filterOperator:'AND'});
 assert.equal(store.previewCanvasAudience(base).matching,1);
 assert.equal(store.previewCanvasAudience({...base,exclusionFilters:[rule(field)]}).matching,0);
 assert.equal(store.previewCanvasAudience({...base,exitFilters:[rule(field)]}).matching,0);
 const latest=rule(`receipt_tag_last:delivered:${tag.id}`,{operator:'less_than_ago',value:'1',timeUnit:'hours'});
 assert.equal(store.previewCanvasAudience({...base,filters:[country('qa','QA'),latest]}).matching,1);
 assert.throws(()=>store.previewCanvasAudience({...base,filters:[{...latest,timeUnit:'months'}]}),/unit|hours|days|weeks/i);
 const clicked=rule(`receipt_tag_count:engaged:${tag.id}`,{tagInteraction:'clicked_email'});
 assert.equal(store.previewCanvasAudience({...base,filters:[country('qa','QA'),clicked]}).matching,0);
 store.recordExternalEvent(source.id,{userId:'canvas_tag_yes',event:'clicked'});
 assert.equal(store.previewCanvasAudience({...base,filters:[country('qa','QA'),clicked]}).matching,1);
});

test('invalid/deleted Segment tag references fail on save with resource and new definitions rolled back',()=>{
 const segment=store.createResource({type:'segments',name:'Invalid tag save checks',data:{filters:[rule(field)],tags:['Segment metadata']}});
 const current=store.listWorkspaceTags().find(item=>item.id===tag.id);
 store.deleteWorkspaceTag(tag.id,current.updatedAt);
 const saved=store.getResource(segment.id);assert.equal(saved.data.filters[0].field,field);
 assert.throws(()=>store.updateResource(segment.id,{name:'Must not save',data:{...saved.data,tags:['Must not exist']}},saved.updatedAt),/tag|available/i);
 assert.deepEqual(store.getResource(segment.id),saved);
 assert.ok(!store.listWorkspaceTags().some(tag=>tag.name==='Must not exist'));
 assert.throws(()=>store.createResource({type:'segments',name:'No invalid creation',data:{filters:[rule(field)]}}),/tag|available/i);
 assert.throws(()=>store.previewCanvasAudience(audience({filters:[rule(field)]})),/tag|available/i);
});

test('Canvas metadata creates, duplicates and lists scoped definitions and same-name journeys independently',()=>{
 const local=store.createCanvas({name:'Scoped Canvas name',tags:['Scoped registry']});
 const other=store.createCanvas({name:local.name,workspaceId:'other',tags:['Scoped registry']});
 assert.equal(other.workspaceId,'other');
 assert.deepEqual(store.listCanvases().filter(item=>item.name===local.name).map(item=>item.id),[local.id]);
 assert.deepEqual(store.listCanvases('other').map(item=>item.id),[other.id]);
 const copy=store.duplicateCanvas(other.id);assert.equal(copy.workspaceId,'other');
 assert.notEqual(store.listWorkspaceTags().find(tag=>tag.name==='Scoped registry').id,store.listWorkspaceTags('other').find(tag=>tag.name==='Scoped registry').id);
});
