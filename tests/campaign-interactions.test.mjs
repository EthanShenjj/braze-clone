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
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'campaign-interactions-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const {taggedInteractions,campaignInteractions,findCampaignInteraction,findTagInteraction}=await import('../lib/tag-interactions.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const {audienceRuleIssues}=await import('../lib/campaign-shared.ts');
const source=store.upsertCampaign({id:'cmp_interaction_source',name:'Interaction source',channel:'api'}),canvas=store.createCanvas({name:'Actual interaction Canvas'});
const raw=new DatabaseSync(process.env.BRAZE_DATABASE_PATH),insert=raw.prepare('INSERT INTO message_events VALUES(?,?,?,?,?,?,?)');
const criterion=(field,interaction,params)=>({id:'interaction',field,operator:'equals',value:'1',tagInteraction:interaction,...(params?{params}:{})});
const draft=(userId,rule,workspaceId='local')=>({channel:'push',config:{workspaceId,audienceGroups:[{id:'g',operator:'AND',exclude:false,rules:[{id:'id',field:'id',operator:'equals',value:userId},rule]}]}});
const audience=(userId,rule)=>({...structuredClone(defaultCanvasWizard.audience),filterOperator:'AND',filters:[{id:'id',field:'id',operator:'equals',value:userId},rule]});
const at='2026-01-01T12:00:00Z';

test('Campaign interaction catalog adds exactly two Push choices while tag filters retain the verified 21',()=>{
 assert.equal(taggedInteractions.length,21);assert.equal(campaignInteractions.length,23);
 assert.deepEqual(campaignInteractions.slice(6,8).map(choice=>choice.label),['clicked push notification button','clicked push story page']);
 for(const id of ['clicked_push_button','clicked_push_story_page']){assert.ok(findCampaignInteraction(id));assert.equal(findTagInteraction(id),undefined);}
});

test('every concrete Campaign and Canvas interaction filters recorded channels, event types, selectors and machines',()=>{
 for(const [index,interaction] of campaignInteractions.entries()){
  const userId='campaign_interaction_'+interaction.id;store.applyProfileRows([{external_id:userId}]);
  const attributes={...(interaction.button?{buttonId:interaction.button}:{}),...(interaction.machine===undefined?{}:{machine:interaction.machine}),...(interaction.selector==='button'?{buttonId:'push_action'}:{}),...(interaction.selector==='page'?{pageId:'story_page'}:{})};
  for(const [prefix,resource] of [['campaign',source.id],['canvas',canvas.id]]){
   const event=(suffix,type,channel,data)=>insert.run(`${prefix}_${index}_${suffix}`,resource,channel,userId,type,at,JSON.stringify(data));
   event('actual',interaction.event,interaction.channel,{attributes,nodeId:'email'});
   event('wrong_channel',interaction.event,'wrong-channel',{attributes,nodeId:'email'});
   event('wrong_event','failed',interaction.channel,{attributes,nodeId:'email'});
   event('nested_test',interaction.event,interaction.channel,{test:false,attributes:{...attributes,test:true},nodeId:'email'});
   event('bot',interaction.event,interaction.channel,{attributes:{...attributes,bot:true},nodeId:'email'});
   if(interaction.button)event('wrong_button',interaction.event,interaction.channel,{buttonId:interaction.button===1?2:1,nodeId:'email'});
   if(interaction.machine!==undefined)event('wrong_machine',interaction.event,interaction.channel,{machine:!interaction.machine,nodeId:'email'});
   if(interaction.selector)event('no_selector',interaction.event,interaction.channel,{nodeId:'email'});
  }
  const rule=criterion('receipt_count:engaged:'+source.id,interaction.id);
  assert.equal(store.estimateConfiguredAudience(draft(userId,rule)).matching,1,interaction.id);
  assert.equal(store.previewCanvasAudience(audience(userId,rule)).matching,1,'Canvas targeting '+interaction.id);
  const canvasRule=criterion('canvas_receipt_count:engaged',interaction.id,{canvasId:canvas.id,stepId:'email'});
  assert.equal(store.estimateConfiguredAudience(draft(userId,canvasRule)).matching,1,'Canvas source '+interaction.id);
  assert.equal(store.configuredAudienceRuleMatches(userId,canvasRule),true);
  const anyCampaign=criterion('receipt_count:engaged:',interaction.id);
  assert.equal(store.estimateConfiguredAudience(draft(userId,anyCampaign)).matching,1,'All Campaigns exclude Canvas '+interaction.id);
 }
});

test('optional Push selectors narrow actual metadata and blank selectors mean any recorded button or story page',()=>{
 for(const [id,key,value] of [['clicked_push_button','buttonId','push_action'],['clicked_push_story_page','pageId','story_page']]){
  const userId='campaign_interaction_'+id;
  for(const params of [{[key]:value},{[key]:''}])assert.equal(store.estimateConfiguredAudience(draft(userId,criterion('receipt_count:engaged:',id,params))).matching,1);
  assert.equal(store.estimateConfiguredAudience(draft(userId,criterion('receipt_count:engaged:',id,{[key]:'other'}))).matching,0);
 }
});

test('incomplete new choices fail, saved aggregate rules remain compatible and all-Campaign interactions stay scoped',()=>{
 const userId='campaign_interaction_clicked_email',field='receipt_count:engaged:'+source.id;
 const incomplete=criterion(field,'');assert.ok(audienceRuleIssues(incomplete).length);assert.throws(()=>store.estimateConfiguredAudience(draft(userId,incomplete)),/Interaction/);
 assert.throws(()=>store.estimateConfiguredAudience(draft(userId,criterion(field,'not-a-source-interaction'))),/Interaction/);
 assert.throws(()=>store.estimateConfiguredAudience(draft(userId,{id:'missing',field:'receipt_count:delivered:',operator:'greater_than',value:'0'})),/Campaign/);
 const legacy={id:'legacy',field,operator:'greater_than',value:'1'};assert.equal(store.estimateConfiguredAudience(draft(userId,legacy)).matching,1);
 const remote=store.upsertCampaign({id:'cmp_remote_interaction',name:'Remote interaction source',channel:'api',config:{workspaceId:'other'}});
 const remoteUserId=userId+'_remote';store.applyProfileRows([{external_id:remoteUserId,attributes:{workspaceId:'other'}}]);
 insert.run('remote_actual',remote.id,'email',remoteUserId,'clicked',at,'{}');
 assert.equal(store.estimateConfiguredAudience(draft(userId,criterion('receipt_count:engaged:','clicked_email'))).matching,1);
 assert.equal(store.estimateConfiguredAudience(draft(remoteUserId,criterion('receipt_count:engaged:','clicked_email'),'other')).matching,1);
 assert.throws(()=>store.estimateConfiguredAudience(draft(userId,criterion('receipt_count:engaged:'+remote.id,'clicked_email'))),/workspace/);
});

test('Push selector candidates use saved action IDs and recorded receipt IDs without inventing story page identities',()=>{
 const campaign=store.upsertCampaign({id:'cmp_push_actual_ids',name:'Actual push selectors',channel:'push',config:{channelValues:{actions:[{id:'saved_action',label:'Save item'}],stories:[{title:'No ID story'},{id:'saved_page',title:'Story with ID'}]}}});
 insert.run('observed_push_selector',campaign.id,'push','campaign_interaction_clicked_email','clicked',at,JSON.stringify({buttonId:'observed_action',pageId:'observed_page'}));
 const choice=store.campaignFormCapabilities().campaigns.find(item=>item.id===campaign.id);
 assert.deepEqual(choice.buttons.map(item=>item.id),['saved_action','observed_action']);
 assert.deepEqual(choice.pages.map(item=>item.id),['saved_page','observed_page']);
 assert.equal(choice.buttons[0].name,'Save item');assert.ok(!choice.pages.some(item=>item.name==='No ID story'));
 const canvasSource=store.createCanvas({name:'Actual push step selectors',graph:{nodes:[{id:'entry',label:'Entry',kind:'entry',x:0,y:0},{id:'push1',label:'Push one',kind:'message',x:1,y:1,config:{channel:'push',linkedCampaignId:campaign.id}},{id:'push2',label:'Push two',kind:'message',x:2,y:2,config:{channel:'push',channelValues:{actions:[{id:'second_action',label:'Second action'}]}}}],edges:[['entry','push1'],['push1','push2']]}});
 insert.run('observed_canvas_step_selector',canvasSource.id,'push','campaign_interaction_clicked_email','clicked',at,JSON.stringify({nodeId:'push2',buttonId:'second_observed'}));
 const canvasChoice=store.campaignFormCapabilities().canvases.find(item=>item.id===canvasSource.id);
 assert.deepEqual(canvasChoice.steps.find(step=>step.id==='push1').buttons.map(item=>item.id),['saved_action']);
 assert.deepEqual(canvasChoice.steps.find(step=>step.id==='push2').buttons.map(item=>item.id),['second_action','second_observed']);
 assert.deepEqual(canvasChoice.buttons.map(item=>item.id),['saved_action','second_action','second_observed']);

});
