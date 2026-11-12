import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return nextResolve(candidate.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'audience-parity-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const {audienceRuleIssues,matchesRule}=await import('../lib/campaign-shared.ts');
const now=new Date().toISOString(),recent=new Date(Date.now()-2*3600000).toISOString();
const userId='full_audience_member',otherId='full_audience_other';
store.applyProfileRows([{external_id:userId,country:'QA',attributes:{number_test:12,boolean_test:true,date_test:recent,labels_test:['gold','loyal'],intelligent_channel:'email',message_open_likelihood:{email:'high'},latitude:31.23,longitude:121.47}},{external_id:otherId,country:'QA'}]);
const rule=(field,value='true',operator='equals',params=undefined)=>({id:'r',field,operator,value,...(params?{params}:{})});
const draft=(criterion,id=userId,workspaceId='local')=>({channel:'push',config:{workspaceId,audienceGroups:[{id:'g',operator:'AND',exclude:false,rules:[rule('id',id),criterion]}]}});
const canvasAudience=criterion=>({...structuredClone(defaultCanvasWizard.audience),filterOperator:'AND',filters:[rule('id',userId),criterion]});
const check=(criterion,matching=1)=>{
 assert.equal(store.estimateConfiguredAudience(draft(criterion)).matching,matching,JSON.stringify(criterion));
 assert.equal(store.previewCanvasAudience(canvasAudience(criterion)).matching,matching,'Canvas '+JSON.stringify(criterion));
 assert.equal(store.configuredAudienceRuleMatches(userId,criterion),Boolean(matching));
};
const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
const event=(id,source,eventType='delivered',data={},at=recent)=>raw.prepare('INSERT INTO message_events VALUES(?,?,?,?,?,?,?)').run(id,source,'email',userId,eventType,at,JSON.stringify(data));

test('all comparison types share SQLite, Campaign and Canvas semantics',()=>{
 for(const criterion of [rule('country','["US","QA"]','is_any_of'),rule('country','["US","GB"]','is_none_of'),rule('id','full_','starts_with'),rule('id','member','ends_with'),rule('id','^full_audience_.*ber$','matches_regex'),{...rule('attr:number_test','10','between'),value2:'14'},rule('attr:number_test','12','greater_or_equal'),rule('attr:boolean_test','true'),rule('attr:labels_test','["silver","gold"]','is_any_of'),rule('attr:labels_test','loyal','contains'),{...rule('attr:date_test','3','less_than_ago'),timeUnit:'hours'},{...rule('attr:date_test','2020-01-01','between'),value2:'2099-01-01'},rule('created_at','2020-01-01','greater_than')])check(criterion);
 check(rule('attr:number_test','20','greater_than'),0);check(rule('attr:labels_test','["gold"]','is_none_of'),0);
 check({...rule('attr:date_missing','3','less_than_ago'),timeUnit:'hours'},0);
 assert.equal(matchesRule({attributes:{number_test:12}},rule('attr:number_test','12','greater_or_equal')),true);
 assert.ok(audienceRuleIssues(rule('created_at','2026-02-31')).length);
 for(const criterion of [rule('id','[','is_any_of'),rule('id','(','matches_regex'),{...rule('created_at','1','less_than_ago'),timeUnit:'months'},{...rule('attr:number_test','15','between'),value2:'10'}])assert.throws(()=>store.estimateConfiguredAudience(draft(criterion)),/value|expression|period|bound/);
});

test('membership uses saved Segment filters and actual extension, CSV and cohort user lists',()=>{
 const segment=store.createResource({type:'segments',name:'Parity segment',data:{filters:[rule('attr:number_test','10','greater_than')]}});
 const extension=store.createResource({type:'segment-extensions',name:'Parity extension',data:{userIds:[userId]}});
 const csv=store.createResource({type:'csv-imports',name:'Parity CSV',data:{members:[{external_id:userId}]}});
 const cohort=store.createResource({type:'cohorts',name:'Parity Amplitude cohort',data:{provider:'amplitude',userIds:[userId]}});
 for(const criterion of [rule('membership:segment','true','equals',{segmentId:segment.id}),rule('membership:extension','true','equals',{extensionId:extension.id}),rule('membership:csv','true','equals',{importId:csv.id}),rule('cohort:amplitude','true','equals',{cohortId:cohort.id}),rule('segment:'+segment.id)])check(criterion);
 check(rule('membership:segment','false','equals',{segmentId:segment.id}),0);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('cohort:mixpanel','true','equals',{cohortId:cohort.id}))),/provider/);
 for(const provider of ['appsflyer','census','heap','hightouch','kubit','mixpanel','segment','shopify','tinyclues','treasure_data','decisioning_studio_agent']){const source=store.createResource({type:'cohorts',name:'Actual '+provider+' cohort',data:{provider:provider.replaceAll('_',' '),userIds:[userId]}});assert.equal(store.configuredAudienceRuleMatches(userId,rule('cohort:'+provider,'true','equals',{cohortId:source.id})),true,provider);}
 const bad=store.createResource({type:'segment-extensions',name:'No membership source',data:{}});assert.throws(()=>store.estimateConfiguredAudience(draft(rule('membership:extension','true','equals',{extensionId:bad.id}))),/membership list/);
 const remote=store.createResource({type:'segments',name:'Remote parity segment',data:{workspaceId:'other',filters:[rule('id',userId)]}});
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('membership:segment','true','equals',{segmentId:remote.id}))),/workspace/);
 const changed=store.getResource(segment.id);store.updateResource(segment.id,{data:{...changed.data,filters:[rule('membership:segment','true','equals',{segmentId:segment.id})]}},changed.updatedAt);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('membership:segment','true','equals',{segmentId:segment.id}))),/circular|themselves/);
});

test('the actual CSV importer returns persisted IDs and exposes successful import logs as scoped membership',async()=>{
 assert.throws(()=>store.importUsers([{id:'csv_rolled_back'},{id:'csv_invalid',tier:12}]));assert.equal(store.getUser('csv_rolled_back'),null);
 const result=store.importUsers([{external_id:'csv_parity_new',email:'csv-parity@example.test'},{id:userId},{email:'csv-generated@example.test'}]);
 assert.equal(result.imported,2);assert.equal(result.skipped,1);assert.equal(result.userIds.length,3);assert.ok(result.userIds.includes(userId));assert.ok(result.userIds.every(id=>store.getUser(id)));
 const log=store.createResource({type:'import-users',name:'Actual imported CSV',data:{header:['external_id','email'],rows:[['csv_parity_new','csv-parity@example.test']],...result}});
 check(rule('membership:csv','true','equals',{importId:log.id}));
 const legacy=store.createResource({type:'import-users',name:'Legacy successful CSV',data:{header:['external_id'],rows:[[userId],['not_registered']],imported:1,skipped:0}});
 check(rule('membership:csv','true','equals',{importId:legacy.id}));
 const failed=store.createResource({type:'import-users',name:'Failed CSV log',data:{header:['external_id'],rows:[[userId]],imported:0,skipped:0}});
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('membership:csv','true','equals',{importId:failed.id}))),/completed CSV import/);
 const remote=store.createResource({type:'import-users',name:'Remote CSV log',data:{workspaceId:'other',userIds:[userId],imported:1}});
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('membership:csv','true','equals',{importId:remote.id}))),/workspace/);
 const candidates=store.campaignFormCapabilities().csvImports;
 assert.ok(candidates.some(item=>item.id===log.id));assert.ok(candidates.some(item=>item.id===legacy.id));assert.ok(!candidates.some(item=>[failed.id,remote.id].includes(item.id)));
 const route=await import('../app/api/users/route.ts');
 const response=await route.POST(new Request('http://localhost/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:[{id:userId},{id:'csv_route_member',email:'csv-route@example.test'}]})}));
 assert.equal(response.status,200);const payload=await response.json();assert.deepEqual(payload.userIds,[userId,'csv_route_member']);assert.equal(payload.imported,1);assert.equal(payload.skipped,1);
});

test('Canvas retargeting respects message step, variation, real event flags and actual entry history',()=>{
 const source=store.createCanvas({name:'Parity source Canvas',graph:{nodes:[{id:'entry',label:'Entry',kind:'entry',x:0,y:0},{id:'message',label:'Message',kind:'message',x:1,y:1}],edges:[['entry','message']],variants:[{id:'variation_a',name:'Variation A',weight:100}]}});
 event('parity_canvas_delivered',source.id,'delivered',{nodeId:'message',variantId:'variation_a'});
 event('parity_canvas_test',source.id,'delivered',{nodeId:'message',variantId:'variation_a',test:false,attributes:{test:true}});
 event('parity_canvas_simulated',source.id,'delivered',{nodeId:'message',simulated:true});
 event('parity_canvas_engaged',source.id,'clicked',{nodeId:'message',alias:'checkout'});
 event('parity_canvas_conversion',source.id,'conversion',{nodeId:'message'});
 event('parity_canvas_control',source.id,'control',{nodeId:'message'});
 raw.prepare('INSERT INTO canvas_entry_history VALUES(?,?,?)').run(source.id,userId,recent);
 for(const criterion of [rule('canvas_receipt_count:delivered','1','equals',{canvasId:source.id,stepId:'message',variantId:'variation_a'}),rule('canvas_receipt_count:engaged','1','equals',{canvasId:source.id,stepId:'message'}),rule('canvas_receipt_count:conversion','1','equals',{canvasId:source.id}),rule('canvas_receipt_count:control','1','equals',{canvasId:source.id}),{...rule('canvas_receipt_last:delivered','3','less_than_ago',{canvasId:source.id,stepId:'message'}),timeUnit:'hours'},rule('canvas_alias','1','equals',{canvasId:source.id,stepId:'message',alias:'checkout'}),rule('canvas_entered','true','equals',{canvasId:source.id})])check(criterion);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('canvas_receipt_count:delivered','1','equals',{canvasId:source.id,stepId:'missing'}))),/step/);
 assert.throws(()=>store.previewCanvasAudience(canvasAudience(rule('canvas_entered','true','equals',{canvasId:source.id,variantId:'missing'}))),/variant/);
});

test('surveys and forms query persisted submissions and reject cross-workspace sources',()=>{
 const survey=store.createResource({type:'surveys',name:'Parity survey',status:'Active',data:{questions:[{id:'rating',label:'Rate',type:'rating'}]}});
 const page=store.createResource({type:'landing-pages',name:'Parity landing',status:'Published',data:{slug:'parity-page',title:'Page',surveyId:survey.id}});
 const campaign=store.upsertCampaign({id:'cmp_parity_nps',name:'Parity NPS',channel:'api'});
 const canvas=store.createCanvas({name:'Parity survey Canvas'});
 store.createResource({type:'landing-page-submissions',name:'Actual response',data:{pageId:page.id,surveyId:survey.id,userId,answers:{rating:5}}});
 store.createResource({type:'nps-responses',name:'Actual NPS',data:{campaignId:campaign.id,userId,score:9}});
 store.createResource({type:'survey-responses',name:'Actual Canvas survey',data:{canvasId:canvas.id,nodeId:'email',surveyId:survey.id,userId,answers:{rating:4}}});
 for(const criterion of [rule('landing_form','true','equals',{resourceId:page.id}),rule('survey_submitted:landing','1','equals',{resourceId:page.id,surveyId:survey.id}),rule('survey_submitted:campaign','1','equals',{resourceId:campaign.id}),rule('survey_submitted:canvas','1','equals',{resourceId:canvas.id,stepId:'email',surveyId:survey.id})])check(criterion);
 const remote=store.createResource({type:'landing-pages',name:'Remote page',data:{workspaceId:'other',slug:'remote-parity',title:'Remote'}});assert.throws(()=>store.estimateConfiguredAudience(draft(rule('landing_form','true','equals',{resourceId:remote.id}))),/workspace/);
});

test('app push permissions, recorded location and intelligence use actual user measurements',()=>{
 const app=store.createResource({type:'app-settings',name:'Parity app',data:{platform:'Web',packageId:'parity.example.test'}});
 store.applyProfileRows([{external_id:userId,attributes:{push_enabled_by_app:{[app.id]:true},live_activity_push_to_start_by_app:{[app.id]:false}}}]);
 for(const criterion of [rule('push_app_enabled','true','equals',{appId:app.id}),rule('attr:live_activity_push_to_start','false','equals',{appId:app.id}),rule('location_recent','true','equals',{latitude:31.23,longitude:121.47,radius:1,unit:'km'}),rule('intelligent_channel','email'),rule('message_open_likelihood','high','equals',{channel:'email'})])check(criterion);
 check(rule('location_recent','true','equals',{latitude:0,longitude:0,radius:1,unit:'miles'}),0);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('location_recent','true','equals',{latitude:91,longitude:0,radius:1,unit:'km'}))),/latitude/);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('push_app_enabled','true','equals',{appId:'missing'}))),/workspace/);
});

test('all history filters exclude other workspaces and reject invalid scoped references',()=>{
 const local=store.upsertCampaign({id:'cmp_parity_local_history',name:'Local history',channel:'api'}),remote=store.upsertCampaign({id:'cmp_parity_remote_history',name:'Remote history',channel:'api',config:{workspaceId:'other'}});
 event('parity_local_history',local.id,'delivered',{variantId:'historical_variant'});
 event('parity_remote_history',remote.id,'delivered',{});
 event('parity_local_alias',local.id,'clicked',{alias:'parity_alias'});
 check(rule('receipt_count:delivered:'+local.id,'1'));
 check(rule('receipt_variant:'+local.id+':historical_variant','1'));
 check(rule('receipt_alias_any:parity_alias','1'));
 check(rule('receipt_alias:parity_alias','1','equals',{campaignId:local.id}));
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('receipt_count:delivered:'+remote.id,'1'))),/workspace/);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('receipt_variant:'+local.id+':missing','1'))),/variant/);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('receipt_alias:','1'))),/alias/);
 const before=store.configuredAudienceRuleMatches(userId,rule('session_count','0'));
 assert.equal(before,true);
 store.createResource({type:'user-events',name:'session_start',data:{workspaceId:'other',userId,createdAt:now}});
 check(rule('session_count','0'));
 for(const criterion of [rule('pending_deletion','true','contains'),rule('session_count','1','starts_with'),rule('created_at','2026-01-01','contains')])assert.throws(()=>store.estimateConfiguredAudience(draft(criterion)),/operator/);
});

test('inbound SMS keyword category dates combine real inbound events, replies and recorded profile timestamps',()=>{
 const source=store.upsertCampaign({id:'cmp_parity_sms_keywords',name:'SMS keyword source',channel:'sms'});
 store.trackProfileEvent({userId,name:'inbound_sms',properties:{keywordCategory:'Opt-in',subscriptionGroupId:'sg_sms_alerts'},createdAt:recent});
 store.recordExternalEvent(source.id,{userId,event:'replied',attributes:{keywordCategory:'help',subscriptionGroupId:'sg_sms_alerts'}});
 store.applyProfileRows([{external_id:userId,attributes:{inbound_sms_keyword_last_by_group:{sg_sms_alerts:{opt_out:recent}}}}]);
 for(const category of ['opt_in','help','opt_out'])check({...rule('inbound_sms_keyword_last','3','less_than_ago',{category,subscriptionGroupId:'sg_sms_alerts'}),timeUnit:'hours'});
 store.createResource({type:'user-events',name:'inbound_sms',data:{userId,workspaceId:'other',createdAt:now,properties:{keywordCategory:'Opt-in',subscriptionGroupId:'sg_sms_alerts'}}});
 assert.equal(store.estimateConfiguredAudience(draft({...rule('inbound_sms_keyword_last','1','less_than_ago',{category:'opt_in',subscriptionGroupId:'sg_sms_alerts'}),timeUnit:'hours'},otherId)).matching,0);
 store.createResource({type:'user-events',name:'inbound_sms',data:{userId,createdAt:now,test:false,attributes:{test:true},properties:{keywordCategory:'Opt-in',subscriptionGroupId:'sg_sms_alerts'}}});
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('inbound_sms_keyword_last','2026-01-01','greater_than',{category:'unknown',subscriptionGroupId:'sg_sms_alerts'}))),/category/);
 assert.throws(()=>store.estimateConfiguredAudience(draft(rule('inbound_sms_keyword_last','2026-01-01','greater_than',{subscriptionGroupId:'sg_sms_alerts'}))),/category/);
 const remoteGroup=store.createSubscriptionGroup({name:'Remote inbound SMS group',channel:'SMS'});
 const remoteUserId='parity_remote_sms_member';store.applyProfileRows([{external_id:remoteUserId,attributes:{workspaceId:'other'}}]);
 store.createResource({type:'subscription-group-metadata',name:'Remote SMS ownership',data:{groupId:remoteGroup.id,workspaceId:'other'}});
 store.createResource({type:'user-events',name:'inbound_sms',data:{workspaceId:'other',userId:remoteUserId,createdAt:now,properties:{keyword_category:'Opt-out',subscriptionGroupId:remoteGroup.id}}});
 const remoteRule={...rule('inbound_sms_keyword_last','1','less_than_ago',{subscriptionGroupId:remoteGroup.id,category:'opt_out'}),timeUnit:'hours'};
 assert.equal(store.estimateConfiguredAudience(draft(remoteRule,remoteUserId,'other')).matching,1);
 assert.equal(store.previewCanvasAudience({...canvasAudience(remoteRule),filters:[rule('id',remoteUserId),remoteRule]},'other').matching,1);
 assert.throws(()=>store.estimateConfiguredAudience(draft(remoteRule)),/workspace/);
 const groups=store.campaignFormCapabilities('other');assert.ok(groups.smsGroups.some(group=>group.id===remoteGroup.id));assert.deepEqual(groups.smsKeywordCategories.filter(category=>category.subscriptionGroupId===remoteGroup.id).map(category=>category.name),['Opt-in','Opt-out','Help']);
 assert.ok(!store.campaignFormCapabilities().smsGroups.some(group=>group.id===remoteGroup.id));

});

test('capabilities expose scoped resource identities, observed attribute types and event candidates without message content',()=>{
 store.createResource({type:'cohorts',name:'Remote hidden cohort',data:{workspaceId:'other',provider:'mixpanel',userIds:[userId]}});
 store.trackProfileEvent({userId,name:'parity_event'});
 const capability=store.campaignFormCapabilities();
 for(const key of ['segments','extensions','csvImports','canvases','cohorts','surveys','landingPages'])assert.ok(capability[key].length,key);
 assert.ok(!capability.cohorts.some(cohort=>cohort.name==='Remote hidden cohort'));
 assert.equal(capability.attributeTypes.number_test,'number');assert.equal(capability.attributeTypes.boolean_test,'boolean');assert.equal(capability.attributeTypes.date_test,'date');assert.equal(capability.attributeTypes.labels_test,'array');
 assert.ok(capability.attributeValues.labels_test.includes('gold'));assert.ok(capability.events.includes('parity_event'));
 assert.ok(!JSON.stringify(capability).includes('"body"'));
});
