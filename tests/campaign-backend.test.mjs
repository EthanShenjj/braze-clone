import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// Resolve this application's extensionless TypeScript imports under Node's native test runner.
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='./webhook-delivery'&&context.parentURL?.endsWith('/lib/braze-store.ts'))return {url:'data:text/javascript,'+encodeURIComponent(`export function webhookDeliveryCapability(){return {mode:'test',maxAttempts:1,timeoutMs:100};}export async function deliverWebhook(variant){globalThis.__campaignWebhookHeaders=variant.headers;return {url:variant.url,method:variant.method,requestHeaders:variant.headers,requestBody:variant.body,attempts:[{attempt:1,statusCode:200,outcome:'delivered',responseBody:JSON.stringify(variant.headers),error:'',durationMs:1}],delivered:true};}`),shortCircuit:true};
 if(specifier.startsWith('@/')){const url=new URL('../'+specifier.slice(2)+'.ts',import.meta.url);return nextResolve(url.href,context);}
 if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return nextResolve(url.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.MESSAGE_DELIVERY_ENABLED='false';
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'campaign-backend-')),'test.sqlite');
const store=await import('../lib/braze-store.ts');
const {subscriptionCapabilityIssues}=await import('../lib/campaign-validation.ts');
const base=(id,extra={})=>({id,name:`Campaign ${id}`,channel:'push',subject:'Test',body:'Hello',config:{controlGroup:0},...extra});
const rule=(field,operator,value)=>({id:'g',operator:'AND',exclude:false,rules:[{id:'r',field,operator,value}]});
const estimate=(field,operator,value)=>store.estimateConfiguredAudience({channel:'push',config:{audienceGroups:[rule(field,operator,value)]}});

test('public IDs and creation metadata are stable and archives cannot be resurrected by stale editors',()=>{
 const original=store.upsertCampaign(base('cmp_backend_ids'));
 assert.match(original.config.apiIdentifier,/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
 const saved=store.upsertCampaign({...original,name:'Renamed',config:{...original.config,apiIdentifier:'forged',createdAt:'forged'}});
 assert.equal(saved.config.apiIdentifier,original.config.apiIdentifier);assert.equal(saved.config.createdAt,original.config.createdAt);
 store.archiveCampaign(original.id);
 assert.equal(store.getCampaign(original.id).status,'Archived');
 assert.ok(store.listCampaigns({status:'Archived'}).data.some(c=>c.id===original.id));
 assert.ok(!store.listCampaigns().data.some(c=>c.id===original.id));
 assert.throws(()=>store.upsertCampaign({...saved,status:'Draft'}),/Archived Campaigns cannot be restored/);
});
test('copying to an existing local workspace makes an independent Draft with new identifiers',()=>{
 const workspace=store.createResource({type:'workspaces',name:'Staging',status:'Active'}),source=store.upsertCampaign(base('cmp_backend_copy'));
 const copy=store.copyCampaignToWorkspace(source.id,workspace.id);
 assert.notEqual(copy.id,source.id);assert.notEqual(copy.config.apiIdentifier,source.config.apiIdentifier);assert.equal(copy.status,'Draft');assert.equal(copy.sent,0);assert.equal(copy.config.workspaceId,workspace.id);
 assert.ok(!store.listCampaigns().data.some(c=>c.id===copy.id));assert.ok(store.listCampaigns({workspaceId:workspace.id}).data.some(c=>c.id===copy.id));
 assert.throws(()=>store.copyCampaignToWorkspace(source.id,'missing'),/existing local workspace/);
});
test('subscription transport capabilities persist independently of the seven-column group table',async()=>{
 const group=store.createSubscriptionGroup({name:'Backend SMS',channel:'SMS'});
 assert.deepEqual(group.capabilities,{sms:true,mms:false,rcs:false});
 const draft={channel:'sms',config:{subscriptionGroupId:group.id,channelValues:{messageType:'MMS'}}};
 assert.match(subscriptionCapabilityIssues(draft,group.capabilities).join(' '),/does not support MMS/);
 const saved=store.updateSubscriptionGroup(group.id,{capabilities:{sms:true,mms:true,rcs:false}});
 assert.equal(saved.capabilities.mms,true);assert.deepEqual(subscriptionCapabilityIssues(draft,saved.capabilities),[]);
 assert.throws(()=>store.updateSubscriptionGroup(group.id,{capabilities:{sms:true,mms:'yes',rcs:false}}),/boolean/);
 assert.throws(()=>store.createSubscriptionGroup({name:'Invalid SMS',channel:'SMS',capabilities:{sms:true}}),/boolean/);
 const campaign=store.upsertCampaign({...base('cmp_backend_rcs'),channel:'sms',body:'Hi',config:{subscriptionGroupId:group.id,channelValues:{messageType:'RCS'}}});
 await assert.rejects(store.sendTestCampaign(campaign.id,{recipient:'+12025550123'}),/does not support RCS/);
});
test('SQL audience catalogs execute against attributes, sessions, events, purchases, segments and receipts',()=>{
 store.applyProfileRows([{external_id:'backend_a',email:'backend-a@example.test',country:'US',attributes:{plan:'pro',external_user_id:'alias-a',braze_id:'braze-a',created_at:'2020-01-01T00:00:00Z'}},{external_id:'backend_b',email:'backend-b@example.test',country:'SG',attributes:{plan:'free'}}]);
 store.trackProfileEvent({userId:'backend_a',name:'session_start'});
 store.trackProfileEvent({userId:'backend_a',name:'backend_action'});
 store.trackProfileEvent({userId:'backend_a',name:'purchase',productId:'sku',price:12,quantity:2,currency:'USD'});
 for(const [field,op,value] of [['id','equals','backend_a'],['attr:plan','equals','pro'],['session_count','greater_than','0'],['event_count:backend_action','equals','1'],['purchase_count','greater_than','0'],['purchase_total','equals','24'],['created_at','less_than','2021-01-01'],['emailSubscriptionStatus','equals','subscribed']])assert.ok(estimate(field,op,value).matching>=1,field);
 const segment=store.createResource({type:'segments',name:'Backend pro',status:'Active',data:{filters:[{field:'attr:plan',operator:'equals',value:'pro'}]}});
 assert.ok(estimate(`segment:${segment.name}`,'equals','true').matching>=1);
 const campaign=store.upsertCampaign(base('cmp_backend_receipts'));
 store.recordExternalEvent(campaign.id,{userId:'backend_a',event:'clicked'});
 assert.ok(estimate('campaign_interaction:clicked','greater_than','0').matching>=1);
 const audience={channel:'push',config:{audienceGroups:[rule('id','equals','backend_a')]}};
 assert.equal(store.estimateConfiguredAudience(audience,'alias-a').lookup.eligible,true);assert.equal(store.estimateConfiguredAudience(audience,'braze-a').lookup.eligible,true);
 assert.equal(store.estimateConfiguredAudience(audience).ltv,24);
});
test('new conversion aliases attribute once per exposure and respect properties, app and deadlines',()=>{
 const campaign=store.upsertCampaign(base('cmp_backend_conversion',{config:{conversionEvents:[{type:'Views Product',app:'ios',deadline:3,unit:'Days',properties:[{key:'sku',value:'product-a'}]},{type:'Upgrades App',app:'',deadline:3,unit:'Days'}]}}));
 store.recordExternalEvent(campaign.id,{userId:'backend_a',event:'delivered',attributes:{variantId:'push_variant_1'}});
 store.trackProfileEvent({userId:'backend_a',name:'ecommerce.product_viewed',properties:{sku:'wrong',appId:'ios'}});
 store.trackProfileEvent({userId:'backend_a',name:'ecommerce.product_viewed',properties:{sku:'product-a',appId:'ios'}});
 store.trackProfileEvent({userId:'backend_a',name:'ecommerce.product_viewed',properties:{sku:'product-a',appId:'ios'}});
 store.trackProfileEvent({userId:'backend_a',name:'app_upgrade'});
 const events=store.getCampaignAnalytics(campaign.id).events.filter(e=>e.event_type==='conversion');
 assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.data.conversionIndex).sort(),[0,1]);assert.ok(events.every(e=>e.data.variantId==='push_variant_1'));
 const expired=store.upsertCampaign(base('cmp_backend_conversion_expired',{config:{conversionEvents:[{type:'Upgrades App',app:'',deadline:1,unit:'Minutes'}]}}));
 store.recordExternalEvent(expired.id,{userId:'backend_b',event:'delivered'});
 store.trackProfileEvent({userId:'backend_b',name:'app_upgrade',createdAt:new Date(Date.now()+120000).toISOString()});
 assert.equal(store.getCampaignAnalytics(expired.id).events.filter(e=>e.event_type==='conversion').length,0);
});
test('actual Campaign audits include redacted before/after metadata',()=>{
 const original=store.upsertCampaign(base('cmp_backend_audit',{config:{channelValues:{headers:[{key:'Authorization',value:'secret-bearer'}],apiKey:'secret-api-key'}}}));
 store.upsertCampaign({...original,name:'Changed audited name'});
 const analytics=store.getCampaignAnalytics(original.id),change=analytics.changes.find(c=>c.action==='updated');
 assert.equal(change.before.name,original.name);assert.equal(change.after.name,'Changed audited name');
 assert.ok(!JSON.stringify(change).includes('secret-api-key'));
 assert.ok(!JSON.stringify(change).includes('secret-bearer'));
});
test('local monitoring records real receipt breaches and never claims external delivery',()=>{
 const campaign=store.upsertCampaign(base('cmp_backend_monitor'));
 const saved=store.saveCampaignMonitoring(campaign.id,{lowerEnabled:false,lowerDuration:60,lowerThreshold:0,upperEnabled:true,upperDuration:60,upperThreshold:0,channels:['Email','Webhook']});
 assert.equal(saved.localOnly,true);
 store.recordExternalEvent(campaign.id,{userId:'backend_a',event:'delivered'});
 const monitor=store.getCampaignMonitoring(campaign.id);
 assert.equal(monitor.alerts.length,1);assert.equal(monitor.alerts[0].notificationStatus,'recorded_locally');
 store.evaluateCampaignMonitoring(campaign.id);assert.equal(store.getCampaignMonitoring(campaign.id).alerts.length,1);
 assert.throws(()=>store.saveCampaignMonitoring(campaign.id,{lowerEnabled:false,lowerDuration:60,lowerThreshold:0,upperEnabled:true,upperDuration:60,upperThreshold:-1,channels:['Email']}),/nonnegative/);
 assert.throws(()=>store.getCampaignAnalytics(campaign.id,{from:'2026-02-31',to:'2026-03-01'}),/valid date range/);
});

test('managed credential references resolve only on the server and scrub transport echoes from responses/history',async()=>{
 const credential=store.createResource({type:'webhook-credentials',name:'Managed service',status:'Active',data:{credentialEnv:'BRAZE_TEST_MANAGED_CREDENTIAL',scheme:'Header',headerName:'X-Managed-Auth'}});
 const campaign=store.upsertCampaign({...base('cmp_backend_managed_webhook'),channel:'webhook',config:{controlGroup:0,channelValues:{webhookVariants:[{id:'managed',name:'Managed',url:'https://example.test/hook',method:'POST',headers:[],body:'{}',bodyType:'json',credentialId:credential.id}]}}});
 const missing=await store.sendTestCampaign(campaign.id,{recipient:'user_1'});
 assert.equal(missing.webhook.delivered,false);assert.match(missing.webhook.attempts[0].error,/unavailable/);
 process.env.BRAZE_TEST_MANAGED_CREDENTIAL='fixture-managed-secret';
 const sent=await store.sendTestCampaign(campaign.id,{recipient:'user_1'});
 assert.equal(sent.webhook.delivered,true);assert.equal(globalThis.__campaignWebhookHeaders.find(h=>h.key==='X-Managed-Auth').value,'fixture-managed-secret');
 assert.ok(!JSON.stringify(sent).includes('fixture-managed-secret'));assert.ok(!JSON.stringify(store.getCampaignAnalytics(campaign.id)).includes('fixture-managed-secret'));assert.ok(!JSON.stringify(store.listWebhookAttempts(campaign.id)).includes('fixture-managed-secret'));
 const {GET}=await import('../app/api/resources/[type]/route.ts');
 const response=await GET(new Request('http://localhost/api/resources/webhook-credentials'),{params:Promise.resolve({type:'webhook-credentials'})}),payload=await response.json();
 assert.equal(payload.data[0].data.credentialEnv,'BRAZE_TEST_MANAGED_CREDENTIAL');assert.ok(!JSON.stringify(payload).includes('fixture-managed-secret'));
 assert.throws(()=>store.updateResource(credential.id,{data:{credentialEnv:'BRAZE_TEST_MANAGED_CREDENTIAL',scheme:'Bearer',secret:'inline-secret'}}),/reference/);
 store.updateResource(credential.id,{status:'Archived'});const archived=await store.sendTestCampaign(campaign.id,{recipient:'user_1'});assert.equal(archived.webhook.delivered,false);assert.match(archived.webhook.attempts[0].error,/unavailable/);
 delete process.env.BRAZE_TEST_MANAGED_CREDENTIAL;
});

test('canonical Feature Flag experiments assign weighted variants and preserve shared Flag settings',async()=>{
 const flag=store.createResource({type:'feature-flags',name:'Backend Feature',status:'Active',data:{flagId:'backend_feature',enabled:true,rollout:0,rules:[],properties:{shared:true}}});
 const variants=[{id:'feature-a',name:'A',percentage:100,properties:{color:'red'}},{id:'feature-b',name:'B',percentage:0,properties:{color:'blue'}}];
 const campaign=store.upsertCampaign({...base('cmp_backend_feature'),channel:'feature',subject:'backend_feature',body:'{"color":"red"}',config:{controlGroup:0,variantSplits:[100,0],messageVariants:variants.map(v=>({id:v.id,name:v.name,body:JSON.stringify(v.properties)})),audienceGroups:[rule('id','equals','backend_a')],featureExperiment:{flagId:'backend_feature',variants},channelValues:{rollout:100}}});
 const before=JSON.stringify(store.getResource(flag.id));await store.launchCampaign(campaign.id);
 const assignment=store.listResources('feature-assignments').find(row=>row.data.campaignId===campaign.id);
 assert.equal(assignment.data.variantId,'feature-a');assert.deepEqual(assignment.data.properties,{shared:true,color:'red'});assert.equal(JSON.stringify(store.getResource(flag.id)),before);
});

test('action dispatch reuses actual audience SQL and respects the saved company-time duration',()=>{
 const campaign=store.upsertCampaign({...base('cmp_backend_action_duration'),status:'Active',schedule:'Action-based',config:{controlGroup:0,audienceGroups:[rule('id','equals','backend_a')],delivery:{schemaVersion:3,timing:'now',startDate:'2099-01-01',sendTime:'00:00',timezone:'UTC',iamTriggers:[{id:'action',type:'Perform Custom Event',eventName:'backend_duration_event'}]}}});
 store.trackProfileEvent({userId:'backend_a',name:'backend_duration_event'});
 assert.equal(store.listResources('campaign-jobs').filter(job=>job.data.campaignId===campaign.id).length,0);
 store.upsertCampaign({...campaign,config:{...campaign.config,delivery:{...campaign.config.delivery,startDate:'2020-01-01'}}});
 store.trackProfileEvent({userId:'backend_b',name:'backend_duration_event'});
 store.trackProfileEvent({userId:'backend_a',name:'backend_duration_event'});
 const jobs=store.listResources('campaign-jobs').filter(job=>job.data.campaignId===campaign.id);
 assert.equal(jobs.length,1);assert.equal(jobs[0].data.userId,'backend_a');
});
test('subscription capability APIs validate and persist explicit mode booleans',async()=>{
 const {POST}=await import('../app/api/subscription-groups/route.ts');
 const {PATCH}=await import('../app/api/subscription-groups/[id]/route.ts');
 const created=await POST(new Request('http://localhost/api/subscription-groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'API mode group',channel:'SMS',capabilities:{sms:true,mms:true,rcs:false}})}));
 assert.equal(created.status,201);const group=await created.json();assert.equal(group.capabilities.mms,true);
 const invalid=await PATCH(new Request('http://localhost/api/subscription-groups/'+group.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({capabilities:{sms:true,mms:'false',rcs:false}})}),{params:Promise.resolve({id:group.id})});
 assert.equal(invalid.status,400);assert.equal(store.getSubscriptionGroup(group.id).capabilities.mms,true);
});

test('embedded test snapshots use the selected saved child channel and variant without changing the parent',async()=>{
 const parent=store.upsertCampaign({...base('cmp_backend_embedded_test'),channel:'multichannel',schedule:'Action-based',config:{channelValues:{channels:['Push notification','SMS/MMS/RCS','WhatsApp'],rule:'Send all channels at once'},delivery:{schemaVersion:3,startDate:'',sendTime:'',iamTriggers:[]},audienceGroups:[{id:'invalid',operator:'AND',exclude:false,rules:[]}],conversionEvents:[]}});
 const before=JSON.stringify(store.getCampaign(parent.id));
 const snapshot={id:parent.id,name:parent.name,channel:'sms',subject:'SMS',body:'Unsaved edited SMS',config:{subscriptionGroupId:'sg_sms_alerts',smsVariants:[{id:'sms-child-a',name:'A',body:'Wrong message',values:{messageType:'SMS',appendStop:false}},{id:'sms-child-b',name:'B',body:'Selected child message',values:{messageType:'SMS',appendStop:false}}],delivery:{schemaVersion:3,timing:'designated',startDate:'',sendTime:''},conversionEvents:[],audienceGroups:[{id:'invalid',operator:'AND',exclude:false,rules:[]}]}};
 const result=await store.sendTestCampaign(parent.id,{recipient:'+12025550123',variantId:'sms-child-b',snapshot});
 assert.equal(result.channel,'sms');assert.equal(result.variantId,'sms-child-b');assert.equal(result.message.message,'Selected child message');assert.equal(JSON.stringify(store.getCampaign(parent.id)),before);
 const push=await store.sendTestCampaign(parent.id,{recipient:'backend_a',snapshot:{id:parent.id,channel:'push',subject:'Child {{\${first_name}}}',body:'Push child body',config:{channelValues:{platforms:['iOS']}}}});
 assert.equal(push.channel,'push');assert.equal(push.message.platforms[0].body,'Push child body');
 const {createWhatsAppVariant}=await import('../lib/whatsapp-model.ts');const variant=createWhatsAppVariant();
 const whatsapp=await store.sendTestCampaign(parent.id,{recipient:'+12025550123',variantId:variant.id,snapshot:{id:parent.id,channel:'whatsapp',config:{subscriptionGroupId:'sg_whatsapp_updates',whatsappVariants:[variant]}}});
 assert.equal(whatsapp.channel,'whatsapp');assert.equal(whatsapp.tests.length,1);
});
test('test endpoints reject cross-campaign snapshots, unselected channels, unknown variants and aggregate dispatch before side effects',async()=>{
 const parent=store.upsertCampaign({...base('cmp_backend_snapshot_guards'),channel:'multichannel',config:{channelValues:{channels:['Push notification']}}});
 const before=store.activityLog(10000).length;
 await assert.rejects(store.sendTestCampaign(parent.id,{snapshot:{id:'cmp_another',channel:'push',subject:'Wrong ID',body:'Wrong body'}}),/must belong/);
 await assert.rejects(store.sendTestCampaign(parent.id,{snapshot:{channel:'push',subject:'No ID',body:'No ID'}}),/must belong/);
 await assert.rejects(store.sendTestCampaign(parent.id,{snapshot:{id:parent.id,channel:'email',subject:'Unselected',body:'Unselected'}}),/Save this channel/);
 await assert.rejects(store.sendTestCampaign(parent.id,{snapshot:{id:parent.id,channel:'push',subject:'Chosen',body:'Chosen',config:{}},variantId:'stale-sms-variant'}),/variant not found/);
 await assert.rejects(store.sendTestCampaign(parent.id,{recipient:'backend_a'}),/channel snapshot/);
 assert.throws(()=>store.prepareWhatsAppTest({campaignId:parent.id,config:{},recipients:['+12025550123']}),/Save WhatsApp/);
 const single=store.upsertCampaign(base('cmp_backend_single_snapshot_guard'));
 await assert.rejects(store.sendTestCampaign(single.id,{snapshot:{id:single.id,channel:'webhook',config:{}}}),/does not belong/);
 assert.equal(store.activityLog(10000).length,before);
});

test('multichannel launch uses shared parent delivery/conversions/holdout rather than obsolete hidden child settings',async()=>{
 const child={channel:'push',subject:'Child',body:'Child message',config:{delivery:{schemaVersion:3,timing:'designated',startDate:'',sendTime:''},audienceGroups:[{id:'hidden',operator:'AND',exclude:false,rules:[]}],conversionEvents:[],controlGroup:20,variantSplits:[10]}};
 const parent=store.upsertCampaign({...base('cmp_backend_multichannel_shared_steps'),channel:'multichannel',conversion:'Start Session',config:{controlGroup:0,audienceGroups:[rule('id','equals','backend_a')],channelValues:{channels:['Push notification'],rule:'Send all channels at once'},multichannelMessages:{push:child}}});
 const result=await store.launchCampaign(parent.id);
 assert.equal(result.run.children.length,1);assert.equal(result.run.children[0].channel,'push');assert.equal(result.run.children[0].run.prepared,1);
 assert.deepEqual(store.getCampaign(parent.id).config.multichannelMessages.push,child);
});
