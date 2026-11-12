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
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'tag-audience-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const model=await import('../lib/campaign-audience-model.ts');
const segmentModel=await import('../lib/segment-tag-audience.ts');
const interactions=await import('../lib/tag-interactions.ts');

test('Segment tags persist as resource metadata without changing audience membership or user attributes',()=>{
 store.applyProfileRows([{external_id:'segment_tag_member',email:'segment-tag@example.test',country:'NZ',attributes:{loyalty:'member'}}]);
 const segment=store.createResource({type:'segments',name:'Tagged NZ members',data:{tags:['Audience organization'],filters:[{field:'country',operator:'equals',value:'NZ'}]}});
 const draft={channel:'push',audience:segment.name,config:{audienceSegments:[segment.name]}};
 const before=store.estimateConfiguredAudience(draft);
 assert.equal(before.matching,1);
 assert.deepEqual(store.getResource(segment.id).data.tags,['Audience organization']);
 const tagged=store.listWorkspaceTags().find(tag=>tag.name==='Audience organization');
 assert.ok(tagged.usages.some(usage=>usage.type==='segments'&&usage.id===segment.id));
 const updated=store.updateResource(segment.id,{data:{...segment.data,tags:['Changed organization']}},segment.updatedAt);
 assert.deepEqual(updated.data.filters,segment.data.filters);
 assert.equal(store.estimateConfiguredAudience(draft).matching,before.matching);
 const member=store.estimateConfiguredAudience({channel:'push',config:{audienceGroups:[{id:'metadata',operator:'AND',exclude:false,rules:[{id:'member',field:'id',operator:'equals',value:'segment_tag_member'},{id:'user-tag',field:'attr:tags',operator:'not_exists',value:''}]}]}});
 assert.equal(member.matching,1);
 const campaign=store.upsertCampaign({id:'cmp_segment_tag_not_inherited',name:'Segment tag independence',channel:'push',audience:segment.name,config:{audienceSegments:[segment.name],controlGroup:0}});
 assert.deepEqual(campaign.config.tags,[]);
});

test('tagged receipt references preserve stable tag identity and use receipt types rather than profile types',()=>{
 const capability={tags:[{id:'tag_stable',name:'Renamed',path:'Lifecycle / Renamed'}]};
 assert.equal(model.campaignAudienceFieldKind('receipt_tag_count:delivered:tag_stable'),'number');
 assert.equal(model.campaignAudienceFieldKind('receipt_tag_count:engaged:tag_stable'),'number');
 assert.equal(model.campaignAudienceFieldKind('receipt_tag_last:delivered:tag_stable'),'date');
 assert.equal(model.campaignAudienceFieldLabel('receipt_tag_count:delivered:tag_stable',capability),'Received Message from Campaign or Canvas with Tag · Lifecycle / Renamed');
 assert.equal(model.campaignAudienceFieldLabel('receipt_tag_last:delivered:tag_stable',capability),'Last Received Message from Campaign or Canvas With Tag · Lifecycle / Renamed');
 assert.equal(model.campaignAudienceFieldLabel('receipt_tag_count:engaged:tag_stable',capability),'Clicked/Opened Campaign or Canvas With Tag · Lifecycle / Renamed');
 assert.match(model.campaignAudienceFieldLabel('receipt_tag_count:delivered:tag_missing',capability),/tag_missing$/);
});

const taggedDraft=(userId,field,value,operator='equals',exclude=false)=>({channel:'push',config:{audienceGroups:[{id:'user',operator:'AND',exclude:false,rules:[{id:'id',field:'id',operator:'equals',value:userId}]},{id:'receipt',operator:'AND',exclude,rules:[{id:'rule',field,operator,value}]}]}});

test('tag receipt rules query actual Campaign and Canvas message events while excluding previews and unrelated resources',()=>{
 const userId='tag_receipt_member';
 store.applyProfileRows([{external_id:userId,email:'tag-receipt@example.test',attributes:{tags:['Profile-only']}}]);
 const source=store.upsertCampaign({id:'cmp_tag_receipt_source',name:'Tagged receipt source',channel:'api',config:{tags:['Receipt source'],controlGroup:0}});
 const canvas=store.createCanvas({name:'Tagged receipt Canvas',tags:['Receipt source']});
 const segment=store.createResource({type:'segments',name:'Segment-only receipt tag',data:{tags:['Segment-only'],filters:[{field:'country',operator:'equals',value:'US'}]}});
 const registry=store.listWorkspaceTags(),tag=registry.find(tag=>tag.name==='Receipt source'),segmentTag=registry.find(tag=>tag.name==='Segment-only');
 const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
 const insert=raw.prepare('INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)');
 const event=(id,resource,eventType,at,data={},channel='push')=>insert.run(id,resource,channel,userId,eventType,at,JSON.stringify(data));
 try{
  event('tag_campaign_receipt',source.id,'delivered','2026-01-01T12:00:00Z');
  event('tag_canvas_receipt',canvas.id,'delivered','2026-02-02T12:00:00Z',{canvasRunId:'real_run',nodeId:'message'});
  event('tag_opened',source.id,'opened','2026-02-03T12:00:00Z',{},'email');
  event('tag_clicked',canvas.id,'clicked','2026-02-04T12:00:00Z',{},'iam');
  event('tag_test_receipt',source.id,'delivered','2026-03-01T12:00:00Z',{test:true});
  event('tag_nested_test_receipt',canvas.id,'delivered','2026-03-02T12:00:00Z',{attributes:{test:true}});
  event('tag_simulated_receipt',source.id,'delivered','2026-03-03T12:00:00Z',{simulated:true});
  event('tag_nested_simulated_receipt',canvas.id,'delivered','2026-03-04T12:00:00Z',{attributes:{simulated:true}});
  event('tag_nested_test_cannot_be_overridden',source.id,'delivered','2026-03-04T12:01:00Z',{test:false,attributes:{test:true}});
  event('tag_nested_simulation_cannot_be_overridden',canvas.id,'delivered','2026-03-04T12:02:00Z',{simulated:false,attributes:{simulated:true}});
  event('tag_bot_open',source.id,'opened','2026-03-04T12:03:00Z',{bot:true},'email');
  event('tag_filtered_click',canvas.id,'clicked','2026-03-04T12:04:00Z',{attributes:{filtered:true}});
  event('tag_simulated_open',source.id,'opened','2026-03-05T12:00:00Z',{simulated:true},'email');
  event('tag_sent',source.id,'sent','2026-03-06T12:00:00Z');
  event('tag_control',source.id,'control','2026-03-07T12:00:00Z');
  event('tag_bot_clicked',source.id,'bot_clicked','2026-03-08T12:00:00Z');
  event('tag_segment_nonmessage',segment.id,'delivered','2026-03-09T12:00:00Z');
 }finally{raw.close();}
 const delivered=`receipt_tag_count:delivered:${tag.id}`,engaged=`receipt_tag_count:engaged:${tag.id}`,last=`receipt_tag_last:delivered:${tag.id}`;
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,delivered,'2')).matching,1);
 const openedEmail=taggedDraft(userId,engaged,'1');openedEmail.config.audienceGroups[1].rules[0].tagInteraction='opened_email';
 assert.equal(store.estimateConfiguredAudience(openedEmail).matching,1);
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,last,'2026-02-02')).matching,1);
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,last,'2026-03-01','greater_than')).matching,0);
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,`receipt_tag_count:delivered:${segmentTag.id}`,'0')).matching,1);
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,delivered,'0','greater_than',true)).matching,0);
 const lookup=store.estimateConfiguredAudience(taggedDraft(userId,delivered,'2'),userId).lookup;
 assert.equal(lookup.matchesFilters,true);
 const renamed=store.updateWorkspaceTag(tag.id,{name:'Renamed receipt source',expectedUpdatedAt:tag.updatedAt});
 assert.equal(renamed.id,tag.id);
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,delivered,'2')).matching,1);
 const draft=store.upsertCampaign({id:'cmp_tag_saved_rule',name:'Stable tag rule',channel:'push',config:taggedDraft(userId,delivered,'2').config});
 assert.equal(store.getCampaign(draft.id).config.audienceGroups[1].rules[0].field,delivered);
 assert.throws(()=>store.estimateConfiguredAudience(taggedDraft(userId,'receipt_tag_count:delivered:missing_tag','0')),/tag/i);
 store.deleteWorkspaceTag(tag.id,renamed.updatedAt);
 assert.deepEqual(store.getCampaign(source.id).config.tags,[]);
 assert.deepEqual(store.getCanvas(canvas.id).tags,[]);
 assert.equal(store.getCampaign(draft.id).config.audienceGroups[1].rules[0].field,delivered);
 assert.throws(()=>store.estimateConfiguredAudience(store.getCampaign(draft.id)),/tag/i);
});

test('same-name tags and message receipts stay isolated by task workspace',()=>{
 const userId='tag_workspace_member',remoteUserId='tag_workspace_remote_member',workspaceId='tag_other_workspace',name='Shared receipt name';
 store.applyProfileRows([{external_id:userId,email:'tag-workspace@example.test'},{external_id:remoteUserId,email:'tag-remote-workspace@example.test',attributes:{workspaceId}}]);
 const local=store.upsertCampaign({id:'cmp_tag_local_workspace',name:'Local task',channel:'api',config:{tags:[name]}});
 const remote=store.upsertCampaign({id:'cmp_tag_remote_workspace',name:'Other workspace task',channel:'api',config:{tags:[name],workspaceId}});
 const remoteCanvas=store.createResource({type:'canvas',name:'Other workspace Canvas',data:{tags:[name],workspaceId}});
 store.recordExternalEvent(local.id,{userId,event:'delivered'});store.recordExternalEvent(remote.id,{userId:remoteUserId,event:'delivered'});
 const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
 try{raw.prepare('INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)').run('tag_remote_canvas_receipt',remoteCanvas.id,'push',remoteUserId,'delivered','2026-04-01T12:00:00Z','{}');}finally{raw.close();}
 const localTag=store.listWorkspaceTags().find(tag=>tag.name===name),remoteTag=store.listWorkspaceTags(workspaceId).find(tag=>tag.name===name);
 assert.notEqual(localTag.id,remoteTag.id);
 assert.equal(store.estimateConfiguredAudience(taggedDraft(userId,`receipt_tag_count:delivered:${localTag.id}`,'1')).matching,1);
 const other=taggedDraft(remoteUserId,`receipt_tag_count:delivered:${remoteTag.id}`,'2');other.config.workspaceId=workspaceId;
 assert.equal(store.estimateConfiguredAudience(other).matching,1);
 assert.throws(()=>store.estimateConfiguredAudience(taggedDraft(userId,`receipt_tag_count:delivered:${remoteTag.id}`,'0')),/workspace|tag/i);
 assert.ok(store.campaignFormCapabilities(workspaceId).tags.some(tag=>tag.id===remoteTag.id));
 assert.ok(!store.campaignFormCapabilities(workspaceId).tags.some(tag=>tag.id===localTag.id));
});

test('unsupported tagged receipt event/type combinations fail explicitly',()=>{
 const tag=store.createWorkspaceTag({name:'Receipt type validation'});
 for(const field of [`receipt_tag_count:sent:${tag.id}`,`receipt_tag_last:conversion:${tag.id}`,`receipt_tag_last:engaged:${tag.id}`]){
  assert.throws(()=>store.estimateConfiguredAudience(taggedDraft('tag_workspace_member',field,field.startsWith('receipt_tag_last:')?'2026-01-01':'0')),/receipt|supported/i);
 }
});

test('tagged last-receipt relative comparisons use real elapsed hours, days and weeks with required units',()=>{
 const userId='relative_tag_member',unknown='relative_tag_unknown';
 store.applyProfileRows([{external_id:userId,email:'relative-tag@example.test'},{external_id:unknown,email:'relative-tag-unknown@example.test'}]);
 const source=store.upsertCampaign({id:'cmp_tag_relative_source',name:'Relative receipt task',channel:'api',config:{tags:['Relative receipt']}}),tag=store.listWorkspaceTags().find(tag=>tag.name==='Relative receipt');
 const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
 try{raw.prepare('INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)').run('relative_real_receipt',source.id,'push',userId,'delivered',new Date(Date.now()-48*3600000).toISOString(),'{}');}finally{raw.close();}
 const field=`receipt_tag_last:delivered:${tag.id}`;
 const relative=(amount,unit,operator='less_than_ago',user=userId)=>{const draft=taggedDraft(user,field,amount,operator);draft.config.audienceGroups[1].rules[0].timeUnit=unit;return draft;};
 for(const [amount,unit,operator,matching] of [['3','days','less_than_ago',1],['1','days','less_than_ago',0],['1','days','more_than_ago',1],['3','days','more_than_ago',0],['49','hours','less_than_ago',1],['1','weeks','less_than_ago',1]])assert.equal(store.estimateConfiguredAudience(relative(amount,unit,operator)).matching,matching,`${operator} ${amount} ${unit}`);
 assert.equal(store.estimateConfiguredAudience(relative('0','hours','more_than_ago',unknown)).matching,0);
 for(const [amount,unit] of [['-1','days'],['invalid','days'],['','days'],['1',undefined],['1','months']])assert.throws(()=>store.estimateConfiguredAudience(relative(amount,unit)),/period|unit|hours|days|weeks|filter/i);
 const invalidField=relative('1','days');invalidField.config.audienceGroups[1].rules[0].field='country';assert.throws(()=>store.estimateConfiguredAudience(invalidField),/relative|tagged/i);
 assert.notEqual(model.audienceCalculationSignature(relative('1','hours')),model.audienceCalculationSignature(relative('1','days')));
 assert.equal(model.audienceCalculationSnapshot(relative('1','weeks')).config.audienceGroups[1].rules[0].timeUnit,'weeks');
});

test('Segment tagged-receipt builder snapshots, HTTP previews and saved Campaign targeting share actual receipt results',async()=>{
 const userId='segment_receipt_member';store.applyProfileRows([{external_id:userId,email:'segment-receipt@example.test',country:'TZ'}]);
 const source=store.upsertCampaign({id:'cmp_segment_receipt_source',name:'Segment receipt source',channel:'api',config:{tags:['Segment receipt rule']}});store.recordExternalEvent(source.id,{userId,event:'delivered'});
 const tag=store.listWorkspaceTags().find(tag=>tag.name==='Segment receipt rule'),field=`receipt_tag_last:delivered:${tag.id}`;
 const filters=[{field:'country',operator:'equals',value:'TZ'},{field,operator:'less_than_ago',value:'1',timeUnit:'weeks'}];
 assert.equal(segmentModel.hasTaggedReceiptFilters(filters),true);
 const preview=segmentModel.segmentAudienceSnapshot(filters);
 assert.equal(preview.config.audienceGroups[0].operator,'AND');
 assert.equal(preview.config.audienceGroups[0].rules[1].field,field);
 assert.equal(preview.config.audienceGroups[0].rules[1].timeUnit,'weeks');
 const segment=store.createResource({type:'segments',name:'Received tagged task recently',status:'Active',data:{filters,tags:['Organizational Segment tag']}});
 const targeting={channel:'push',audience:segment.name,config:{audienceSegments:[segment.name]}};
 assert.equal(store.estimateConfiguredAudience(preview).matching,1);
 assert.equal(store.estimateConfiguredAudience(targeting).matching,1);
 const route=await import('../app/api/campaigns/audience-preview/route.ts');
 const response=await route.POST(new Request('http://localhost/api/campaigns/audience-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:preview})}));
 assert.equal(response.status,200);assert.equal((await response.json()).matching,1);
 store.updateWorkspaceTag(tag.id,{name:'Renamed Segment receipt rule',expectedUpdatedAt:tag.updatedAt});
 assert.equal(store.getResource(segment.id).data.filters[1].field,field);
 assert.equal(store.estimateConfiguredAudience(targeting).matching,1);
 const saved=store.getResource(segment.id),updated=store.updateResource(segment.id,{data:{...saved.data,filters:filters.map(filter=>filter.field===field?{...filter,timeUnit:'hours'}:filter)}},saved.updatedAt);
 assert.equal(updated.data.filters[1].timeUnit,'hours');
 assert.equal(store.estimateConfiguredAudience(targeting).matching,1);
 const invalid=segmentModel.segmentAudienceSnapshot([{field:'receipt_tag_count:delivered:',operator:'greater_than',value:'0'}]);
 const failure=await route.POST(new Request('http://localhost/api/campaigns/audience-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign:invalid})}));
 assert.equal(failure.status,400);assert.match((await failure.json()).error,/tag/i);
});

test('tag interaction rules require a specific source choice and match its channel, event and selector',()=>{
 assert.deepEqual(interactions.taggedInteractions.map(choice=>choice.label),['clicked banner','clicked content card','clicked email','clicked in-app message','clicked in-app message button 1','clicked in-app message button 2','clicked shortened sms link','clicked tracked KakaoTalk link','clicked tracked LINE link','clicked tracked WhatsApp link','directly opened push notification','dismissed banner','dismissed content card','opened email','opened email (machine opens)','opened email (other opens)','read WhatsApp message','replied to sms','viewed banner','viewed content card','viewed in-app message']);
 const source=store.upsertCampaign({id:'cmp_tag_interaction_source',name:'Interaction source',channel:'api',config:{tags:['Interaction choice']}}),canvas=store.createCanvas({name:'Interaction Canvas',tags:['Interaction choice']}),tag=store.listWorkspaceTags().find(tag=>tag.name==='Interaction choice');
 const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH),insert=raw.prepare('INSERT INTO message_events VALUES (?, ?, ?, ?, ?, ?, ?)');
 try{
  interactions.taggedInteractions.forEach((choice,index)=>{
   const userId=`tag_interaction_${choice.id}`;store.applyProfileRows([{external_id:userId,email:`${userId}@example.test`}]);
   const taskId=index%2?canvas.id:source.id,data={...(choice.button?{attributes:{button:choice.button}}:{}),...(choice.machine===undefined?{}:{attributes:{machine:choice.machine}})};
   insert.run(`interaction_real_${index}`,taskId,choice.channel,userId,choice.event,'2026-05-01T12:00:00Z',JSON.stringify(data));
   insert.run(`interaction_wrong_channel_${index}`,taskId,'wrong-channel',userId,choice.event,'2026-05-02T12:00:00Z',JSON.stringify(data));
   insert.run(`interaction_wrong_event_${index}`,taskId,choice.channel,userId,'failed','2026-05-03T12:00:00Z',JSON.stringify(data));
   insert.run(`interaction_test_${index}`,taskId,choice.channel,userId,choice.event,'2026-05-04T12:00:00Z',JSON.stringify({...data,test:true}));
   if(choice.button)insert.run(`interaction_wrong_button_${index}`,taskId,choice.channel,userId,choice.event,'2026-05-05T12:00:00Z',JSON.stringify({button:choice.button===1?2:1}));
   if(choice.machine!==undefined)insert.run(`interaction_wrong_machine_${index}`,taskId,choice.channel,userId,choice.event,'2026-05-06T12:00:00Z',JSON.stringify({machine:!choice.machine}));
   if(choice.id.startsWith('viewed_'))insert.run(`interaction_delivery_without_impression_${index}`,taskId,choice.channel,userId,'delivered','2026-05-07T12:00:00Z','{}');
  });
 }finally{raw.close();}
 const draft=(userId,interaction,performed=true)=>{const value=taggedDraft(userId,`receipt_tag_count:engaged:${tag.id}`,performed?'1':'0');value.config.audienceGroups[1].rules[0].tagInteraction=interaction;return value;};
 for(const choice of interactions.taggedInteractions){const userId=`tag_interaction_${choice.id}`;assert.equal(store.estimateConfiguredAudience(draft(userId,choice.id)).matching,1,choice.id);assert.equal(store.estimateConfiguredAudience(draft(userId,choice.id,false)).matching,0,`${choice.id} performed false`);}
 assert.throws(()=>store.estimateConfiguredAudience(draft('tag_interaction_clicked_email',undefined)),/interaction/i);
 assert.throws(()=>store.estimateConfiguredAudience(draft('tag_interaction_clicked_email','not-a-source-option')),/interaction/i);
 const clicked=draft('tag_interaction_clicked_email','clicked_email'),opened=draft('tag_interaction_clicked_email','opened_email');
 assert.notEqual(model.audienceCalculationSignature(clicked),model.audienceCalculationSignature(opened));
 assert.equal(model.audienceCalculationSnapshot(clicked).config.audienceGroups[1].rules[0].tagInteraction,'clicked_email');
 const filters=segmentModel.segmentAudienceSnapshot([{field:`receipt_tag_count:engaged:${tag.id}`,operator:'greater_than',value:'0',tagInteraction:'clicked_email'}]);
 assert.equal(filters.config.audienceGroups[0].rules[0].tagInteraction,'clicked_email');
});
