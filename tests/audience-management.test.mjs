import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return nextResolve(candidate.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'audience-management-')),'test.sqlite');
const store=await import('../lib/braze-store.ts');
const {segmentManagementData}=await import('../lib/audience-management-store.ts');
const management=await import('../lib/audience-management-store.ts');
const {subscriptionSettings,defaultSubscriptionKeywords}=await import('../lib/audience-management-model.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const rule=(field,value,operator='equals',params)=>({id:field,field,value,operator,...params?{params}:{}});
const group=(rules,exclude=false,operator='AND')=>({id:'group',rules,exclude,operator});
const options={appIds:[],analyticsTracking:false};
const config=(groups,segmentOptions=options)=>({workspaceId:'local',audienceGroups:groups,segmentOptions});
store.applyProfileRows([{external_id:'am_a',country:'QA',attributes:{score:12}},{external_id:'am_b',country:'QB',attributes:{score:12}},{external_id:'am_c',country:'QA',attributes:{score:1}}]);

test('saved segments share typed AND/OR/exclusion behavior with direct preview and Canvas membership',()=>{
 const groups=[group([rule('country','QA'),rule('country','QB')],false,'OR'),group([rule('attr:score','5','less_than')],true)];
 const segment=store.createResource({type:'segments',name:'Managed groups',data:config(groups)});
 const direct=store.configuredAudienceUsers({channel:'push',config:config(groups)}).map(user=>user.id);
 assert.deepEqual(direct,['am_a','am_b']);
 assert.deepEqual(store.configuredAudienceUsers({channel:'push',audience:segment.name}).map(user=>user.id),direct);
 assert.equal(store.previewCanvasAudience({...structuredClone(defaultCanvasWizard.audience),segmentIds:[segment.id]}).matching,2);
 for(const id of ['am_a','am_b'])assert.equal(store.configuredAudienceRuleMatches(id,rule('membership:segment','true','equals',{segmentId:segment.id})),true);
 assert.equal(store.configuredAudienceRuleMatches('am_c',rule('segment:'+segment.id,'true')),false);
 const saved=store.getResource(segment.id);assert.match(saved.data.apiIdentifier,/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
 const updated=store.updateResource(segment.id,{data:{...saved.data,segmentOptions:{...options,analyticsTracking:true}}},saved.updatedAt);
 assert.equal(updated.data.apiIdentifier,saved.data.apiIdentifier);
 const duplicate=store.createResource({type:'segments',name:'Copied managed groups',data:saved.data});
 assert.notEqual(duplicate.data.apiIdentifier,saved.data.apiIdentifier);
 const copy=store.createResource({type:'segments',name:'New Users',data:config([group([rule('id','am_a')])])});
 assert.deepEqual(store.configuredAudienceUsers({channel:'push',audience:copy.name}).map(user=>user.id),['am_a']);
});

test('app targeting uses actual scoped sessions or profile apps and rejects unavailable app IDs',()=>{
 const app=store.createResource({type:'app-settings',name:'Managed app',status:'Active',data:{platform:'Web',packageId:'example.test'}});
 const other=store.createResource({type:'app-settings',name:'Remote app',status:'Active',data:{platform:'Web',packageId:'other.test',workspaceId:'remote'}});
 store.trackProfileEvent({userId:'am_a',name:'session_start',properties:{appId:app.id}});
 store.applyProfileRows([{external_id:'am_b',attributes:{appIds:[app.id]}}]);
 store.createResource({type:'user-events',name:'session_start',data:{userId:'am_c',workspaceId:'remote',properties:{appId:app.id}}});
 const snapshot={channel:'push',config:config([group([rule('id','am_','starts_with')])],{appIds:[app.id],analyticsTracking:true})};
 assert.deepEqual(store.configuredAudienceUsers(snapshot).map(user=>user.id),['am_a','am_b']);
 const segment=store.createResource({type:'segments',name:'Managed app members',data:snapshot.config});
 assert.equal(store.configuredAudienceRuleMatches('am_c',rule('membership:segment','true','equals',{segmentId:segment.id})),false);
 assert.throws(()=>store.createResource({type:'segments',name:'Remote apps',data:config([],{appIds:[other.id],analyticsTracking:false})}),/workspace/);
 assert.throws(()=>store.estimateConfiguredAudience({channel:'push',config:config([],{appIds:['missing'],analyticsTracking:false})}),/workspace/);
 const noApps={channel:'push',config:config([group([rule('id','am_','starts_with')])],{appIds:['__no_apps__'],analyticsTracking:false})};
 assert.deepEqual(store.configuredAudienceUsers(noApps).map(user=>user.id),['am_c']);
 noApps.config.segmentOptions.appIds.push(app.id);
 assert.deepEqual(store.configuredAudienceUsers(noApps).map(user=>user.id),['am_a','am_b','am_c']);
});

test('linked inclusion groups support OR while exclusions always omit matching users',()=>{
 const data=config([group([rule('id','am_a')]),group([rule('id','am_b')]),group([rule('id','am_b')],true)],{...options,groupOperator:'OR'});
 const segment=store.createResource({type:'segments',name:'Managed linked groups',data});
 assert.deepEqual(store.configuredAudienceUsers({channel:'push',config:data}).map(user=>user.id),['am_a']);
 assert.deepEqual(store.configuredAudienceUsers({channel:'push',audience:segment.name}).map(user=>user.id),['am_a']);
 assert.throws(()=>store.createResource({type:'segments',name:'Invalid linked groups',data:config([],{...options,groupOperator:'ANY'})}),/AND or OR/);
});

test('group configuration rejects bad shapes and circular edits atomically while preserving legacy filters',()=>{
 assert.throws(()=>store.createResource({type:'segments',name:'Malformed',data:config([{operator:'OR',exclude:'false',rules:[rule('id','am_a')]}])}),/exclusion/);
 assert.throws(()=>store.createResource({type:'segments',name:'Malformed',data:config([group([rule('id','am_a','not-real')])])}),/filter/);
 const one=store.createResource({type:'segments',name:'Cycle one',data:config([group([rule('id','am_a')])])});
 const two=store.createResource({type:'segments',name:'Cycle two',data:config([group([rule('membership:segment','true','equals',{segmentId:one.id})])])});
 assert.throws(()=>store.updateResource(one.id,{data:config([group([rule('membership:segment','true','equals',{segmentId:two.id})])])}),/circular|themselves/);
 assert.equal(store.configuredAudienceRuleMatches('am_a',rule('segment:'+one.id,'true')),true);
 const legacy=store.createResource({type:'segments',name:'Managed legacy',data:{filters:[{field:'country',operator:'is',value:'QA'}]}});
 assert.equal(store.configuredAudienceRuleMatches('am_a',rule('segment:'+legacy.id,'true')),true);
 assert.equal(store.configuredAudienceRuleMatches('am_b',rule('segment:'+legacy.id,'true')),false);
});

test('insights and user preview read real members, events and message references and enforce workspace',async()=>{
 const segment=store.createResource({type:'segments',name:'Managed insights',data:config([group([rule('id','am_a')])])});
 const recent=new Date(Date.now()-86400000).toISOString();
 store.trackProfileEvent({userId:'am_a',name:'purchase',productId:'managed_product',price:12,quantity:2,currency:'USD',createdAt:recent});
 store.upsertCampaign({id:'cmp_managed_usage',name:'Managed use',channel:'push',audience:segment.name});
 store.createResource({type:'segments',name:'Managed dependent',data:config([group([rule('membership:segment','true','equals',{segmentId:segment.id})])])});
 const canvas=store.createCanvas({name:'Managed Canvas use',wizard:{...structuredClone(defaultCanvasWizard),audience:{...structuredClone(defaultCanvasWizard.audience),segmentIds:[segment.id]}}});
 const exitCanvas=store.createCanvas({name:'Managed Canvas exit use',wizard:{...structuredClone(defaultCanvasWizard),audience:{...structuredClone(defaultCanvasWizard.audience),exitSegmentIds:[segment.id]}}});
 store.trackProfileEvent({userId:'am_a',name:'purchase',properties:{revenue:9999,currency:'USD'}});
 const result=segmentManagementData(segment.id);
 assert.equal(result.statistics.matching,1);assert.equal(result.userCount,1);assert.deepEqual(result.users.map(user=>user.id),['am_a']);
 assert.equal(result.metrics.lifetimeRevenue,24);assert.equal(result.metrics.ltvCurrency,'USD');assert.ok(result.metrics.timeSinceLastPurchase>=1);
 assert.ok(result.usage.campaigns.some(row=>row.id==='cmp_managed_usage'));assert.ok(result.usage.segments.some(row=>row.name==='Managed dependent'));
 assert.ok(result.usage.canvases.some(row=>row.id===canvas.id));assert.ok(result.usage.canvases.some(row=>row.id===exitCanvas.id));
 store.trackProfileEvent({userId:'am_a',name:'actual second purchase',productId:'managed_eur_product',price:5,currency:'EUR'});
 assert.equal(segmentManagementData(segment.id).metrics.lifetimeRevenue,null);
 assert.equal(segmentManagementData(segment.id).metrics.ltvCurrency,null);
 assert.throws(()=>segmentManagementData(segment.id,'remote'),/workspace/);
 const endpoint=await import('../app/api/audience/segments/[id]/insights/route.ts');
 const response=await endpoint.GET(new Request('http://localhost/api/audience/segments/'+segment.id+'/insights?workspaceId=remote'),{params:Promise.resolve({id:segment.id})});
 assert.equal(response.status,404);
});

test('subscription groups, keywords and calculated history stay scoped and preserve member state',async()=>{
 const group=management.createManagedSubscriptionGroup({name:'Managed local Email',channel:'Email'});
 const remote=management.createManagedSubscriptionGroup({name:'Managed remote SMS',channel:'SMS'},'remote');
 assert.ok(management.scopedSubscriptionGroups().some(row=>row.id===group.id));
 assert.ok(!management.scopedSubscriptionGroups().some(row=>row.id===remote.id));
 assert.throws(()=>management.scopedSubscriptionGroup(remote.id),/workspace/);
 store.setSubscriptionMember(remote.id,'am_a','subscribed');
 assert.deepEqual(management.subscriptionStatistics(remote.id,'remote'),[]);
 const first=management.calculateSubscriptionStatistics(remote.id,'remote');assert.equal(first.subscribed,1);assert.equal(first.unsubscribed,0);
 store.setSubscriptionMember(remote.id,'am_b','unsubscribed');
 const second=management.calculateSubscriptionStatistics(remote.id,'remote');assert.equal(second.subscribed,1);assert.equal(second.unsubscribed,1);assert.equal(management.subscriptionStatistics(remote.id,'remote').length,1);
 const settings=subscriptionSettings(undefined);settings.languages.push('French');settings.keywords.French=[{id:'custom',category:'Offers',keywords:['offres'],response:'Bonjour',linkShortening:true}];
 const saved=management.updateManagedSubscriptionGroup(remote.id,{settings,expectedUpdatedAt:remote.updatedAt},'remote');assert.deepEqual(saved.settings.keywords.French[0].keywords,['OFFRES']);
 assert.equal(store.listSubscriptionMembers(remote.id,{state:'subscribed'}).total,1);
 assert.throws(()=>management.updateManagedSubscriptionGroup(remote.id,{name:'Stale',expectedUpdatedAt:remote.updatedAt},'remote'),/another tab/);
 const bad=structuredClone(saved.settings);bad.keywords.English.push({id:'duplicate',category:'Duplicate',keywords:['stop'],response:'Duplicate',linkShortening:true});
 assert.throws(()=>management.updateManagedSubscriptionGroup(remote.id,{name:'Should roll back',settings:bad},'remote'),/unique/);assert.equal(store.getSubscriptionGroup(remote.id).name,remote.name);
 const deleted=subscriptionSettings(undefined);deleted.keywords.English[0].keywords=['START'];assert.throws(()=>subscriptionSettings(deleted),/Required/);
 const endpoint=await import('../app/api/subscription-groups/[id]/route.ts');const denied=await endpoint.GET(new Request(`http://localhost/api/subscription-groups/${remote.id}`),{params:Promise.resolve({id:remote.id})});assert.equal(denied.status,404);
});

test('geofence sets validate every coordinate and scoped app settings without partial writes',()=>{
 const geofence={id:'geo_one',name:'Office',latitude:31.2,longitude:121.4,radius:100,analyticsEnter:true,analyticsExit:false,cooldownEnter:0,cooldownExit:60,notificationResponsiveness:1000};
 const set=store.createResource({type:'geofence-sets',name:'Managed locations',status:'Active',data:{workspaceId:'local',tags:[],geofences:[geofence]}});
 assert.throws(()=>store.updateResource(set.id,{data:{...set.data,geofences:[{...geofence,latitude:91}]}}),/Latitude/);
 assert.equal(store.getResource(set.id).data.geofences[0].latitude,31.2);
 assert.throws(()=>store.createResource({type:'geofence-sets',name:'Invalid duplicate geofences',data:{geofences:[geofence,geofence]}}),/unique ID/);
 assert.throws(()=>store.createResource({type:'location-settings',name:'Unknown apps',data:{workspaceId:'local',enabledAppIds:['missing']}}),/workspace/);
});

test('preference revisions enforce scoped Email groups and preserve signed published snapshots',()=>{
 const local=management.createManagedSubscriptionGroup({name:'Preference local',channel:'Email'}),remote=management.createManagedSubscriptionGroup({name:'Preference remote',channel:'Email'},'remote');
 assert.throws(()=>store.createPreferenceCenter({name:'Wrong workspace',groupIds:[remote.id]}),/workspace/);
 assert.throws(()=>store.createPreferenceCenter({name:'x'.repeat(281),groupIds:[]}),/280/);
 const center=store.createPreferenceCenter({name:'Managed preference',description:'Published copy',groupIds:[local.id],status:'Active'});
 const link=store.createPreferenceCenterLink(center.id,'am_a');assert.ok(link?.token);
 assert.equal(store.getPublicPreferenceCenter(center.id,'am_a','invalid'),null);
 const draft=store.updatePreferenceCenter(center.id,{description:'Unpublished copy',groupIds:[]},center.version);
 assert.equal(draft.version,2);assert.equal(draft.publishedVersion,1);
 const published=store.getPublicPreferenceCenter(center.id,'am_a',link.token);assert.equal(published.center.description,'Published copy');assert.equal(published.groups.length,1);
 assert.throws(()=>store.publishPreferenceCenter(center.id,center.version),/another tab/);
 store.publishPreferenceCenter(center.id,draft.version);
 const refreshed=store.getPublicPreferenceCenter(center.id,'am_a',link.token);assert.equal(refreshed.center.description,'Unpublished copy');assert.equal(refreshed.groups.length,0);
 const scoped=store.createPreferenceCenter({name:'Remote preference',groupIds:[remote.id],config:{workspaceId:'remote'}});
 assert.ok(!store.listPreferenceCenters().some(row=>row.id===scoped.id));assert.ok(store.listPreferenceCenters('remote').some(row=>row.id===scoped.id));
 assert.throws(()=>store.updatePreferenceCenter(scoped.id,{config:{workspaceId:'local'}}),/moved/);
});

test('subscription eligibility and test snapshots reject cross-workspace groups before sending',async()=>{
 const remote=management.createManagedSubscriptionGroup({name:'Remote scope SMS',channel:'SMS'},'group_remote');
 const local=management.createManagedSubscriptionGroup({name:'Local scope SMS',channel:'SMS'});
 assert.ok(!store.campaignFormCapabilities().subscriptionGroups.some(group=>group.id===remote.id));
 assert.ok(store.campaignFormCapabilities('group_remote').subscriptionGroups.some(group=>group.id===remote.id));
 assert.throws(()=>store.configuredAudienceRuleMatches('am_a',rule('subscription_group:'+remote.id,'subscribed')),/workspace/);
 assert.throws(()=>store.estimateConfiguredAudience({channel:'sms',config:{subscriptionGroupId:remote.id}}),/workspace/);
 const campaign=store.upsertCampaign({id:'cmp_managed_remote_scope',name:'Cross-workspace group',channel:'sms',body:'Scope test',config:{subscriptionGroupId:remote.id,controlGroup:0}});
 await assert.rejects(store.launchCampaign(campaign.id),/workspace/);
 await assert.rejects(store.sendTestCampaign(campaign.id,{recipient:'+12025550123',snapshot:{...campaign,config:{...campaign.config,workspaceId:'group_remote'}}}),/workspace/);
 const canvas=store.createCanvas({name:'Canvas group scope'});
 assert.throws(()=>store.prepareCanvasSmsTest(canvas.id,{nodeId:'message',message:'Scope',subscriptionGroupId:remote.id,recipients:['+12025550123']}),/workspace/);
 store.setSubscriptionMember(local.id,'am_a','subscribed');assert.equal(store.estimateConfiguredAudience({channel:'sms',config:{subscriptionGroupId:local.id,audienceGroups:[group([rule('id','am_a')])]}}).matching,1);
});

test('Global Control Group generations, tags, Campaigns and Canvases remain isolated by workspace',async()=>{
 const localBefore=store.getGlobalControlSnapshot(),remoteBefore=store.getGlobalControlSnapshot('gcg_remote');
 assert.equal(remoteBefore.updatedAt,null);
 const remoteEnabled=store.saveGlobalControl({action:'enable',percentage:15},remoteBefore.updatedAt,'gcg_remote');
 assert.deepEqual(store.getGlobalControlSnapshot(),localBefore);
 const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH),record=raw.prepare("SELECT data_json FROM resources WHERE type='global-control-group' AND json_extract(data_json,'$.workspaceId')='gcg_remote'").get();
 const seed=JSON.parse(record.data_json).seed;
 const candidate=prefix=>Array.from({length:10000},(_,index)=>prefix+index).find(id=>createHash('sha256').update(`${seed}:${id}`).digest().readUInt32BE(0)/0x100000000<0.15);
 const id=candidate('aa_gcg_remote_'),localId=candidate('aa_gcg_local_');assert.ok(id&&localId);store.applyProfileRows([{external_id:id,attributes:{workspaceId:'gcg_remote'}},{external_id:localId}]);
 const draft=workspaceId=>({channel:'push',config:{workspaceId,audienceGroups:[group([rule('id',workspaceId==='local'?localId:id)])],controlGroup:0}});
 assert.equal(store.estimateConfiguredAudience(draft('local')).globalControlExcluded,0);assert.equal(store.estimateConfiguredAudience(draft('gcg_remote')).globalControlExcluded,1);
 for(const workspaceId of ['local','gcg_remote']){const campaign=store.upsertCampaign({id:'cmp_gcg_'+workspaceId,name:'GCG '+workspaceId,channel:'push',subject:'Scope',body:'Scope message',config:{...draft(workspaceId).config,channelValues:{title:'Scope'},tags:[workspaceId==='local'?'Local active only':'Remote active only']}});const launched=await store.launchCampaign(campaign.id);assert.equal(launched.run.eligible,workspaceId==='local'?1:0);}
 assert.ok(!store.getGlobalControlSnapshot().availableTags.includes('Remote active only'));assert.ok(!store.getGlobalControlSnapshot('gcg_remote').availableTags.includes('Local active only'));
 const graph={nodes:[{id:'entry',label:'Audience',kind:'entry',x:0,y:0},{id:'message',label:'Push',kind:'message',x:200,y:0,config:{channel:'push',message:'Scope message'}}],edges:[['entry','message']]};
 for(const workspaceId of ['local','gcg_remote']){const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[rule('id',workspaceId==='local'?localId:id)];const canvas=store.createCanvas({name:'GCG Canvas '+workspaceId,workspaceId,graph,wizard});const run=store.launchCanvasGraph(canvas.id);assert.equal(run.entered,workspaceId==='local'?1:0);}
 assert.deepEqual(store.exportGlobalControlMembers('gcg_remote'),[id]);
 const remoteVersion=store.getGlobalControlSnapshot('gcg_remote').updatedAt;
 store.saveGlobalControl({action:'enable',percentage:3},localBefore.updatedAt);
 assert.equal(store.getGlobalControlSnapshot('gcg_remote').updatedAt,remoteVersion);
 const localEnabled=store.getGlobalControlSnapshot();store.saveGlobalControl({action:'disable'},localEnabled.updatedAt);
 store.saveGlobalControl({action:'disable'},remoteEnabled.updatedAt,'gcg_remote');raw.close();
});

test('profile populations, imports, unknown emails and duplicate previews use the selected workspace',()=>{
 const remote=store.importUsers([{id:'scoped_csv_user',email:'scoped@example.test',remote_only:'yes'}],'csv_workspace');
 assert.equal(remote.imported,1);assert.equal(store.getUser('scoped_csv_user').attributes.workspaceId,'csv_workspace');
 assert.throws(()=>store.importUsers([{id:'scoped_csv_user'}]),/another workspace/);
 assert.throws(()=>store.applyProfileRows([{external_id:'scoped_csv_user',email:'overwrite@example.test'}]),/another workspace/);
 assert.throws(()=>store.applyProfileRows([{external_id:'am_a',attributes:{workspaceId:'csv_workspace'}}]),/another workspace/);
 assert.equal(store.estimateConfiguredAudience({channel:'push',config:{workspaceId:'csv_workspace'}}).matching,1);
 assert.equal(store.estimateConfiguredAudience({channel:'push',config:{workspaceId:'csv_workspace'}},'am_a').lookup.exists,false);
 assert.ok(!store.campaignFormCapabilities().attributes.includes('remote_only'));assert.ok(store.campaignFormCapabilities('csv_workspace').attributes.includes('remote_only'));
 const blank=store.applyProfileRows([{external_id:'unknown_contact'}]);assert.equal(blank.created,1);assert.equal(store.getUser('unknown_contact').email,'');
 assert.equal(store.estimateConfiguredAudience({channel:'email',config:{audienceGroups:[group([rule('id','unknown_contact')])]}}).reachable,0);
 assert.equal(management.segmentManagementData('__all_users__','csv_workspace').statistics.matching,1);
});

test('duplicate merge migrates actual associations, preserves opt-outs and records completed history',()=>{
 const workspaceId='merge_fixture',winnerId='merge_fixture_winner',loserId='merge_fixture_loser';
 store.applyProfileRows([{external_id:winnerId,email:'merge@example.test',first_name:'Winner',attributes:{workspaceId,created_at:'2026-01-02T00:00:00Z',devices:[{id:'device_winner'}]}},{external_id:loserId,email:'MERGE@example.test',country:'GB',email_subscription_status:'unsubscribed',attributes:{workspaceId,created_at:'2026-01-01T00:00:00Z',extra_attribute:'preserved',devices:[{id:'device_loser'}],user_aliases:[{alias_name:'old_alias',alias_label:'old'}]}},{external_id:'merge_other_workspace',email:'merge@example.test',attributes:{workspaceId:'merge_other'}}]);
 const settings=store.createResource({type:'audience-merge-settings',name:'Merge settings',status:'Active',data:{workspaceId,rules:{identifier:'email',externalId:'Has external ID',resolveTiesUsing:'created_at',prioritization:'newest'},scheduled:false}});
 const sg=management.createManagedSubscriptionGroup({name:'Merge fixture group',channel:'Email'},workspaceId);store.setSubscriptionMember(sg.id,winnerId,'subscribed');store.setSubscriptionMember(sg.id,loserId,'unsubscribed');
 const campaign=store.upsertCampaign({id:'cmp_merge_fixture',name:'Merge fixture history',channel:'api',config:{workspaceId}});store.recordExternalEvent(campaign.id,{userId:loserId,event:'delivered'});store.trackProfileEvent({userId:loserId,name:'merge_fixture_event'});
 const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[rule('id',JSON.stringify([winnerId,loserId]),'is_any_of')];
 const graph={nodes:[{id:'entry',label:'Entry',kind:'entry',x:0,y:0},{id:'delay',label:'Wait',kind:'delay',x:100,y:0,config:{durationHours:24}},{id:'message',label:'Push',kind:'message',x:200,y:0,config:{channel:'push',message:'Merge test'}}],edges:[['entry','delay'],['delay','message']]};
 const canvas=store.createCanvas({name:'Merge fixture Canvas',workspaceId,graph,wizard}),run=store.launchCanvasGraph(canvas.id);assert.equal(run.entered,2);
 const catalog=store.createCatalog({name:'Merge_fixture_catalog',data:{workspaceId}});store.upsertCatalogItem(catalog.id,{id:'merge_item',name:'Merge item'});store.subscribeCatalogItem(catalog.id,{userId:loserId,itemId:'merge_item',subscriptionType:'back_in_stock'});
 const center=store.createPreferenceCenter({name:'Merge fixture preferences',groupIds:[sg.id],status:'Active',config:{workspaceId}}),link=store.createPreferenceCenterLink(center.id,loserId);store.getPublicPreferenceCenter(center.id,loserId,link.token);
 const csv=store.createResource({type:'csv-imports',name:'Merge fixture import',data:{workspaceId,userIds:[winnerId,loserId]}});
 const sdk=store.createResource({type:'sdk-messages',name:'Merge fixture inbox',status:'Available',data:{campaignId:campaign.id,userId:loserId,channel:'content',payload:{body:'History'}}});
 const dueAt='2099-01-01T00:00:00Z';for(const [index,userId] of [winnerId,loserId].entries())store.createResource({id:'job_merge_fixture_'+index,type:'campaign-jobs',name:'Merge fixture pending job',status:'Pending',data:{campaignId:campaign.id,userId,dueAt,triggerProperties:{}}});
 const preview=store.generateAudienceDuplicatePreview(workspaceId);assert.equal(preview.duplicateCount,1);assert.equal(preview.groups[0].profiles[0].id,winnerId);
 const result=store.mergeAudienceDuplicates(workspaceId,preview.fingerprint,preview.previewId);assert.equal(result.profilesMerged,1);assert.equal(result.history.status,'Completed');assert.equal(store.getUser(loserId),null);assert.ok(store.getUser('merge_other_workspace'));
 const winner=store.getUser(winnerId);assert.equal(winner.firstName,'Winner');assert.equal(winner.emailSubscriptionStatus,'unsubscribed');assert.equal(winner.attributes.extra_attribute,'preserved');assert.equal(winner.attributes.devices.length,2);assert.ok(winner.attributes.user_aliases.some(alias=>alias.alias_name===loserId));
 assert.equal(store.listSubscriptionMembers(sg.id,{state:'unsubscribed'}).data[0].id,winnerId);assert.equal(store.getResource(sdk.id).data.userId,winnerId);assert.deepEqual(store.getResource(csv.id).data.userIds,[winnerId]);
 const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);for(const table of ['message_events','subscription_group_memberships','catalog_subscriptions','canvas_pending_steps','canvas_entry_history','preference_center_events'])assert.equal(raw.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=?`).get(loserId).n,0,table);
 assert.equal(raw.prepare('SELECT count(*) AS n FROM catalog_subscriptions WHERE user_id=?').get(winnerId).n,1);assert.equal(raw.prepare('SELECT count(*) AS n FROM canvas_pending_steps WHERE user_id=?').get(winnerId).n,1);
 const traces=JSON.parse(raw.prepare('SELECT traces_json FROM canvas_runs WHERE id=?').get(run.id).traces_json);assert.equal(traces.length,1);assert.equal(traces[0].userId,winnerId);
 assert.equal(store.listResources('campaign-jobs').filter(row=>row.data.campaignId===campaign.id&&row.status==='Pending').length,1);
 assert.throws(()=>store.mergeAudienceDuplicates(workspaceId,preview.fingerprint,preview.previewId),/changed|available/);raw.close();
});

test('stale previews and a late audit error roll back every merge mutation',()=>{
 const workspaceId='merge_rollback',winnerId='merge_rollback_winner',loserId='merge_rollback_loser';
 store.applyProfileRows([{external_id:winnerId,email:'rollback-merge@example.test',attributes:{workspaceId,created_at:'2026-01-02'}},{external_id:loserId,email:'rollback-merge@example.test',attributes:{workspaceId,created_at:'2026-01-01'}}]);
 const first=store.generateAudienceDuplicatePreview(workspaceId);store.applyProfileRows([{external_id:winnerId,first_name:'Changed',attributes:{workspaceId}}]);assert.throws(()=>store.mergeAudienceDuplicates(workspaceId,first.fingerprint,first.previewId),/changed/);
 const preview=store.generateAudienceDuplicatePreview(workspaceId),raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
 raw.exec("CREATE TRIGGER reject_fixture_merge_audit BEFORE INSERT ON audit_log WHEN NEW.action='merged' BEGIN SELECT RAISE(ABORT,'merge audit fixture failure'); END");
 try{assert.throws(()=>store.mergeAudienceDuplicates(workspaceId,preview.fingerprint,preview.previewId),/merge audit fixture failure/);assert.ok(store.getUser(winnerId));assert.ok(store.getUser(loserId));assert.equal(store.getResource(preview.previewId).status,'Previewed');}finally{raw.exec('DROP TRIGGER reject_fixture_merge_audit');raw.close();}
});

test('scheduled merging runs actual due groups once per workspace and day',()=>{
 const workspaceId='scheduled_merge_fixture';store.applyProfileRows([{external_id:'scheduled_merge_a',email:'scheduled-merge@example.test',attributes:{workspaceId,created_at:'2026-01-01'}},{external_id:'scheduled_merge_b',email:'scheduled-merge@example.test',attributes:{workspaceId,created_at:'2026-01-02'}}]);
 const settings=store.createResource({type:'audience-merge-settings',name:'Scheduled merge settings',status:'Active',data:{workspaceId,rules:{identifier:'email',externalId:'Has external ID',resolveTiesUsing:'created_at',prioritization:'newest'},scheduled:true}});
 assert.equal(store.processScheduledAudienceMerges().results.filter(row=>row.workspaceId===workspaceId).length,0);
 const tomorrow=new Date(Date.now()+86400000);const result=store.processScheduledAudienceMerges(tomorrow);assert.equal(result.results.find(row=>row.workspaceId===workspaceId).profilesMerged,1);
 assert.equal(store.processScheduledAudienceMerges(tomorrow).results.filter(row=>row.workspaceId===workspaceId).length,0);
 assert.equal(store.listResources('audience-merge-history').filter(row=>row.data.workspaceId===workspaceId&&row.status==='Completed'&&row.data.type==='Scheduled').length,1);
 const latest=store.getResource(settings.id);store.updateResource(settings.id,{data:{...latest.data,scheduled:false}},latest.updatedAt);
 assert.equal(store.processScheduledAudienceMerges(new Date(Date.now()+2*86400000)).results.filter(row=>row.workspaceId===workspaceId).length,0);
});

test('merge ties remain unresolved and anonymous duplicates can join a single identified profile',()=>{
 const tiedScope='merge_tie_scope';store.applyProfileRows([{external_id:'merge_tie_a',email:'tie@example.test',attributes:{workspaceId:tiedScope,created_at:'2026-01-01'}},{external_id:'merge_tie_b',email:'tie@example.test',attributes:{workspaceId:tiedScope,created_at:'2026-01-01'}}]);const tied=store.generateAudienceDuplicatePreview(tiedScope);assert.equal(tied.duplicateCount,1);assert.equal(tied.mergeableCount,0);assert.equal(tied.groups[0].winnerId,null);assert.throws(()=>store.mergeAudienceDuplicates(tiedScope,tied.fingerprint,tied.previewId),/unique highest-priority/);assert.ok(store.getUser('merge_tie_a')&&store.getUser('merge_tie_b'));
 const scope='merge_identified_scope';store.applyProfileRows([{external_id:'identified_profile',email:'identified@example.test',attributes:{workspaceId:scope}},{external_id:'anonymous_profile',email:'identified@example.test',attributes:{workspaceId:scope,external_id:'',braze_id:'anonymous_braze_id'}}]);const preview=store.generateAudienceDuplicatePreview(scope);assert.equal(preview.mergeableCount,1);assert.equal(preview.groups[0].winnerId,'identified_profile');store.mergeAudienceDuplicates(scope,preview.fingerprint,preview.previewId);assert.equal(store.getUser('anonymous_profile'),null);assert.ok(store.getUser('identified_profile').attributes.user_aliases.some(alias=>alias.alias_name==='anonymous_braze_id'));
});

test('active audience suppression uses real filters, scope, tag aliases, Feature Flag exemptions and message rechecks',async()=>{
 const userId='suppression_managed_member';store.applyProfileRows([{external_id:userId,email:'suppression-managed@example.test',country:'SUP'},{external_id:'suppression_remote_member',email:'suppression-remote@example.test',country:'SUP',attributes:{workspaceId:'suppression_remote'}}]);
 const draft={channel:'push',config:{audienceGroups:[group([rule('id',userId)])],controlGroup:0}};
 const empty=store.createResource({type:'audience-suppression-lists',name:'Empty inactive suppression',status:'Inactive',data:{workspaceId:'local',audienceGroups:[],exceptionTags:[]}});assert.throws(()=>store.updateResource(empty.id,{status:'Active'}),/at least one filter/);
 const list=store.createResource({type:'audience-suppression-lists',name:'Managed suppression',status:'Active',data:{workspaceId:'local',audienceGroups:[group([rule('id',userId)])],exceptionTags:[]}});
 assert.equal(store.estimateConfiguredAudience(draft).matching,1);assert.equal(store.estimateConfiguredAudience(draft).reachable,0);assert.ok(store.estimateConfiguredAudience(draft,userId).lookup.reasons.includes('Suppression list: '+list.name));
 const tag=store.createWorkspaceTag({name:'Suppression exception'});store.updateResource(list.id,{data:{...list.data,exceptionTags:[tag.id]}});
 assert.equal(store.estimateConfiguredAudience({...draft,config:{...draft.config,tags:[tag.name]}}).reachable,1);
 const renamed=store.updateWorkspaceTag(tag.id,{name:'Suppression exception renamed',expectedUpdatedAt:tag.updatedAt});assert.equal(store.estimateConfiguredAudience({...draft,config:{...draft.config,tags:[renamed.name]}}).reachable,1);
 assert.equal(store.estimateConfiguredAudience({...draft,channel:'feature'}).reachable,1);
 store.createResource({type:'audience-suppression-lists',name:'Remote suppression',status:'Active',data:{workspaceId:'suppression_remote',audienceGroups:[group([rule('country','SUP')])],exceptionTags:[]}});
 assert.equal(store.estimateConfiguredAudience({...draft,config:{workspaceId:'suppression_remote',audienceGroups:[group([rule('id','suppression_remote_member')])]}}).reachable,0);
 const campaign=store.upsertCampaign({id:'cmp_managed_suppression',name:'Suppressed communication',channel:'push',subject:'Suppression',body:'Suppression body',config:draft.config});const launch=await store.launchCampaign(campaign.id);assert.equal(launch.run.eligible,0);assert.equal(launch.run.suppressionListHits,1);
 const graph={nodes:[{id:'entry',label:'Entry',kind:'entry',x:0,y:0},{id:'message',label:'Push',kind:'message',x:200,y:0,config:{channel:'push',message:'Suppression body'}}],edges:[['entry','message']]},wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[rule('id',userId)];
 const canvas=store.createCanvas({name:'Managed suppression Canvas',graph,wizard});assert.equal(store.launchCanvasGraph(canvas.id).messages,0);
 const exempt=store.createCanvas({name:'Exempt suppression Canvas',tags:[renamed.name],graph,wizard});assert.equal(store.launchCanvasGraph(exempt.id).messages,1);
 const current=store.getResource(list.id);store.updateResource(list.id,{status:'Inactive'},current.updatedAt);assert.equal(store.estimateConfiguredAudience(draft).reachable,1);store.updateResource(list.id,{status:'Active'});assert.equal(store.estimateConfiguredAudience(draft).reachable,0);
});
