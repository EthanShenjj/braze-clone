import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier==='next/server')return{url:'data:text/javascript,'+encodeURIComponent('export function after(callback){(globalThis.__audienceAfter??=[]).push(callback);}'),shortCircuit:true};
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return nextResolve(candidate.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'audience-queue-')),'test.sqlite');process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts'),queue=await import('../lib/campaign-audience-queue.ts'),model=await import('../lib/campaign-audience-model.ts');
const group=(field,value,operator='equals')=>({id:'g',operator:'AND',exclude:false,rules:[{id:'r',field,operator,value}]});
const campaign=(id,config={})=>store.upsertCampaign({id,name:id,channel:'push',subject:'Title',body:'Content',config:{controlGroup:0,...config}});

test('audience-only snapshots omit message content/credentials but retain actual channel criteria',()=>{
 const draft={id:'snapshot',name:'Snapshot',channel:'multichannel',subject:'Secret subject',body:'secret body',config:{channelValues:{channels:['Email','SMS/MMS/RCS'],Authorization:'secret auth'},audienceSegments:['New Users'],multichannelMessages:{sms:{body:'secret sms',config:{subscriptionGroupId:'sg_sms_alerts',apiKey:'secret key'}}}}};
 const snapshot=model.audienceCalculationSnapshot(draft);assert.ok(!JSON.stringify(snapshot).includes('secret'));assert.deepEqual(snapshot.config.channelValues,{channels:['Email','SMS/MMS/RCS']});assert.equal(snapshot.config.multichannelMessages.sms.config.subscriptionGroupId,'sg_sms_alerts');
 assert.equal(model.audienceCalculationSignature(draft),model.audienceCalculationSignature({...draft,name:'Renamed',body:'different secret'}));
});
test('queue is SQLite-persisted, observable while running, deduplicated and cached by criteria',async()=>{
 const draft=campaign('cmp_queue_lifecycle',{audienceGroups:[group('country','US')]});
 const first=queue.enqueueAudienceCalculation(draft);assert.equal(first.status,'Queued');assert.equal(queue.enqueueAudienceCalculation(draft).id,first.id);assert.equal(store.getResource(first.id).status,'Queued');
 const running=queue.processAudienceCalculationQueue(1);assert.equal(queue.getAudienceCalculation(first.id).status,'Running');await running;
 const finished=queue.getAudienceCalculation(first.id);assert.equal(finished.status,'Completed');assert.deepEqual(finished.transitions.map(step=>step.status),['Queued','Running','Completed']);assert.equal(finished.result.matching,store.estimateConfiguredAudience(draft).matching);assert.equal(finished.progress,100);assert.equal(queue.enqueueAudienceCalculation(draft).id,first.id);assert.ok(!('snapshot' in finished));
 const refreshed=queue.enqueueAudienceCalculation(draft,{force:true});assert.notEqual(refreshed.id,first.id);queue.cancelAudienceCalculation(refreshed.id);assert.equal(queue.getAudienceCalculation(refreshed.id).status,'Cancelled');assert.equal(queue.listAudienceCalculations({campaignId:draft.id}).history.length,2);
});
test('actual validation failures and worker interruptions persist failed states without invented results',async()=>{
 const invalid=campaign('cmp_queue_failure',{audienceGroups:[group('purchase_total','not a number','greater_than')]});const requested=queue.enqueueAudienceCalculation(invalid);await queue.processAudienceCalculationQueue();const failed=queue.getAudienceCalculation(requested.id);assert.equal(failed.status,'Failed');assert.match(failed.error,/numeric/);assert.equal(failed.result,undefined);
 const interrupted=queue.enqueueAudienceCalculation(campaign('cmp_queue_interrupted'));
 const raw=store.getResource(interrupted.id);store.updateResource(raw.id,{status:'Running',data:{...raw.data,leaseExpiresAt:Date.now()-1}});await queue.processAudienceCalculationQueue();assert.equal(queue.getAudienceCalculation(raw.id).status,'Failed');assert.match(queue.getAudienceCalculation(raw.id).error,/interrupted/);
});
test('queue cancellation prevents calculation and workspace queue/history is shared across requests',async()=>{
 const local=campaign('cmp_queue_local'),workspace=store.createResource({type:'workspaces',name:'Queue workspace',status:'Active'}),other=store.copyCampaignToWorkspace(local.id,workspace.id);
 const a=queue.enqueueAudienceCalculation(local,{force:true}),b=queue.enqueueAudienceCalculation(other,{force:true});assert.ok(queue.listAudienceCalculations({campaignId:local.id}).queue.some(item=>item.id===a.id));assert.ok(!queue.listAudienceCalculations({campaignId:local.id}).queue.some(item=>item.id===b.id));queue.cancelAudienceCalculation(a.id);await queue.processAudienceCalculationQueue();assert.equal(queue.getAudienceCalculation(a.id).status,'Cancelled');assert.equal(queue.getAudienceCalculation(b.id).status,'Completed');
});
test('HTTP requests return202 before real after-response work and another request sees persisted completion',async()=>{
 const route=await import('../app/api/campaigns/audience-calculations/route.ts'),draft=campaign('cmp_queue_http');
 const response=await route.POST(new Request('http://localhost/api/campaigns/audience-calculations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:draft})})),payload=await response.json();assert.equal(response.status,202);assert.equal(payload.calculation.status,'Queued');
 await globalThis.__audienceAfter.shift()();const next=await route.GET(new Request(`http://localhost/api/campaigns/audience-calculations?id=${payload.calculation.id}`)),result=await next.json();assert.equal(result.calculation.status,'Completed');assert.ok(result.calculation.result.total>0);
});
test('delivery preview uses actual profile times/activity fallback, eligible users and quiet hours',()=>{
 store.applyProfileRows([{external_id:'timing_a',email:'timing-a@example.test',attributes:{best_send_hour:7,timezone:'Asia/Shanghai'}},{external_id:'timing_b',email:'timing-b@example.test',attributes:{timezone:'UTC'}}]);
 for(let i=0;i<3;i++)store.trackProfileEvent({userId:'timing_a',name:'session_start',createdAt:`2026-01-0${i+1}T15:00:00Z`});
 const draft={channel:'push',audience:'All Users',config:{audienceGroups:[{id:'or',operator:'OR',exclude:false,rules:[{id:'a',field:'id',operator:'equals',value:'timing_a'},{id:'b',field:'id',operator:'equals',value:'timing_b'}]}],delivery:{timing:'intelligent',startDate:'2030-07-02',timezone:'UTC',sendTime:'10:00',intelligentFallback:'popular',quietHours:true,quietStart:'22:00',quietEnd:'08:00'}}};
 assert.deepEqual(store.intelligentTimingFallback(draft),{time:'23:00',source:'activity'});const preview=store.previewCampaignDeliveryTimes(draft,'push',new Date('2030-07-01T00:00:00Z'));assert.equal(preview.reachable,2);assert.equal(preview.withOptimalTime,1);assert.equal(preview.usingFallback,1);assert.equal(preview.bins.reduce((sum,bin)=>sum+bin.users,0),2);assert.ok(preview.bins.some(bin=>bin.at==='2030-07-03T08:00:00.000Z'));
 const custom={...draft,config:{...draft.config,delivery:{...draft.config.delivery,intelligentFallback:'custom',intelligentFallbackTime:'11:30'}}};assert.equal(store.previewCampaignDeliveryTimes(custom,'push',new Date('2030-07-01')).fallbackTime,'11:30');
 const missing=store.previewCampaignDeliveryTimes({channel:'email',config:{delivery:{timing:'intelligent'}}});assert.equal(missing.requirements.length,2);assert.deepEqual(missing.bins,[]);
});
test('all six Other Filters and session dates have actual SQL implementations',()=>{
 store.applyProfileRows([{external_id:'filter_source',email:'source@example.test',attributes:{created_from:'SDK',pending_deletion:true}}]);store.trackProfileEvent({userId:'filter_source',name:'session_start',createdAt:'2026-01-01T01:00:00Z'});
 for(const [field,value,operator] of [['random_bucket','-1','greater_than'],['created_from','SDK','equals'],['pending_deletion','true','equals'],['first_session_at','2027-01-01','less_than'],['last_session_at','2025-01-01','greater_than']])assert.ok(store.estimateConfiguredAudience({channel:'push',config:{audienceGroups:[group(field,value,operator)]}}).matching>0,field);
 const capability=store.campaignFormCapabilities();assert.equal(model.brazeAIAvailability(1,capability.brazeAI).enabled,false);assert.match(model.brazeAIAvailability(1,capability.brazeAI).reason,/at least two variants/);assert.equal(model.brazeAIAvailability(2,capability.brazeAI).enabled,false);
});
test('Median Session Duration filters recorded durations and leaves absent measurements unknown',()=>{
 store.applyProfileRows([{external_id:'median_a',email:'median-a@example.test'},{external_id:'median_unknown',email:'median-unknown@example.test'}]);
 for(const properties of [{duration_seconds:20},{duration_ms:180000},{session_duration_seconds:60},{duration_seconds:100},{duration_seconds:'invalid'}])store.trackProfileEvent({userId:'median_a',name:'session_start',properties});
 store.trackProfileEvent({userId:'median_unknown',name:'session_start'});
 const filter=(id,value,operator='equals')=>({channel:'push',config:{audienceGroups:[{id:'median',operator:'AND',exclude:false,rules:[{id:'id',field:'id',operator:'equals',value:id},{id:'duration',field:'median_session_duration_seconds',operator,value}]}]}});
 assert.equal(store.estimateConfiguredAudience(filter('median_a','80')).matching,1);
 assert.equal(store.estimateConfiguredAudience(filter('median_a','90','greater_than')).matching,0);
 assert.equal(store.estimateConfiguredAudience(filter('median_unknown','0')).matching,0);
 assert.equal(store.estimateConfiguredAudience(filter('median_unknown','','not_exists')).matching,1);
});
test('source Campaign receipt, profile, subscription and eCommerce leaves query recorded data',()=>{
 store.applyProfileRows([{external_id:'catalog_a',first_name:'Catalog',email:'catalog@example.test',attributes:{dob:'2000-01-01',phone:'+1 (212) 555-0123',latitude:40,longitude:-73}}]);
 const source=store.upsertCampaign({id:'cmp_catalog_receipts',name:'Catalog receipt',channel:'api',config:{controlGroup:0}});
 store.recordExternalEvent(source.id,{userId:'catalog_a',event:'delivered',attributes:{variantId:'variant_a'}});store.recordExternalEvent(source.id,{userId:'catalog_a',event:'clicked',attributes:{alias:'checkout'}});store.recordExternalEvent(source.id,{userId:'catalog_a',event:'delivered',attributes:{test:true}});
 store.setSubscriptionMember('sg_sms_alerts','catalog_a','subscribed');
 store.trackProfileEvent({userId:'catalog_a',name:'ecommerce.order_placed',properties:{total_price:125.5}});store.trackProfileEvent({userId:'catalog_a',name:'ecommerce.order_refunded',properties:{total_price:25.5}});
 const matching=(field,value,operator='equals')=>store.estimateConfiguredAudience({channel:'push',config:{audienceGroups:[{id:'actual',operator:'AND',exclude:false,rules:[{id:'user',field:'id',operator:'equals',value:'catalog_a'},{id:'criterion',field,operator,value}]}]}}).matching;
 for(const [field,value] of [['first_name','Catalog'],['phone_unformatted','12125550123'],['email_available','true'],['location_available','true'],['subscription_group:sg_sms_alerts','subscribed'],['ecommerce_order_count','1'],['ecommerce_revenue','125.5'],['ecommerce_refund_total','25.5'],[`receipt_count:delivered:${source.id}`,'1'],[`receipt_variant:${source.id}:variant_a`,'1'],['receipt_alias:checkout','1'],['never_received_message','false']])assert.equal(matching(field,value),1,field);
 assert.equal(matching('last_received_message_at','2020-01-01','greater_than'),1);assert.equal(matching(`receipt_last:delivered:${source.id}`,'2020-01-01','greater_than'),1);
 assert.equal(matching(`receipt_count:delivered:${source.id}`,'2'),0);
 const capability=store.campaignFormCapabilities();assert.ok(capability.campaigns.some(campaign=>campaign.id===source.id));assert.ok(!JSON.stringify(capability).includes('body'));
});
test('specific-app sessions, recent session windows and feature status use actual local records',()=>{
 const app=store.createResource({type:'app-settings',name:'Actual app',status:'Active',data:{packageId:'catalog.example.test',platform:'Web'}});store.applyProfileRows([{external_id:'catalog_app',email:'app@example.test'}]);
 store.trackProfileEvent({userId:'catalog_app',name:'session_start',properties:{appId:app.id}});store.trackProfileEvent({userId:'catalog_app',name:'session_start',createdAt:'2020-01-01T00:00:00Z',properties:{appId:app.id}});
 store.createResource({type:'feature-flags',name:'Catalog flag',status:'Active',data:{flagId:'catalog_flag',enabled:true,rollout:100,rules:[],properties:{}}});
 const matching=(field,value,operator='equals')=>store.estimateConfiguredAudience({channel:'push',config:{audienceGroups:[{id:'actual',operator:'AND',exclude:false,rules:[{id:'user',field:'id',operator:'equals',value:'catalog_app'},{id:'criterion',field,operator,value}]}]}}).matching;
 assert.equal(matching(`session_app_count:${app.id}`,'2'),1);assert.equal(matching(`session_app_first:${app.id}`,'2020-01-01'),1);assert.equal(matching(`session_app_last:${app.id}`,'2021-01-01','greater_than'),1);assert.equal(matching('session_recent:7','1'),1);assert.equal(matching('feature_enabled:catalog_flag','true'),1);
 assert.throws(()=>matching('session_recent:31','1'),/1 and 30/);
});
