import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}
 return next(specifier,context);
}});
const directory=mkdtempSync('/private/tmp/test-review-canvas-scope-');
process.env.BRAZE_DATABASE_PATH=join(directory,'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts'),imports=await import('../app/api/canvases/import/route.ts'),users=await import('../app/api/users/route.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const connection=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
after(()=>{connection.close();rmSync(directory,{recursive:true,force:true});});
const node=(id,kind,config={})=>({id,kind,label:id,x:0,y:0,config});
const linkedGraph=(campaignId,channel='email')=>({nodes:[node('entry','entry'),node('message','message',{channel,message:'Local source',subject:'Local subject',linkedCampaignId:campaignId})],edges:[['entry','message']]});
const request=(url,input,method='POST')=>new Request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});

test('browser imports and Canvas creation reject missing, foreign and wrong-channel linked Campaigns',async()=>{
 store.upsertCampaign({id:'scope-foreign-email',name:'Foreign email',channel:'email',body:'Private foreign source',config:{workspaceId:'scope-foreign'}});
 store.upsertCampaign({id:'scope-local-push',name:'Local push',channel:'push',body:'Push source',config:{workspaceId:'scope-local'}});
 store.upsertCampaign({id:'scope-local-email',name:'Local email',channel:'email',body:'Authorized source',config:{workspaceId:'scope-local'}});
 for(const campaignId of ['scope-foreign-email','scope-local-push','scope-missing']){
  const response=await imports.POST(request('http://localhost/api/canvases/import',{workspaceId:'scope-local',draft:{canvas:{id:'browser-'+campaignId,name:'Import '+campaignId,workspaceId:'scope-local'},graph:linkedGraph(campaignId)}}));
  assert.equal(response.status,400,campaignId);
  assert.throws(()=>store.createCanvas({name:'Direct '+campaignId,workspaceId:'scope-local',graph:linkedGraph(campaignId)}),/linked|Campaign|workspace|channel/i);
 }
 assert.equal(store.listCanvases('scope-local').length,0);
 const valid=store.createCanvas({name:'Authorized draft',workspaceId:'scope-local',graph:linkedGraph('scope-local-email')});
 assert.equal(store.getCanvasWorkspace(valid.id).graph.nodes[1].config.message,'Authorized source');
 assert.equal(store.createCanvas({name:'Incomplete draft',workspaceId:'scope-local',graph:{nodes:[node('entry','entry')],edges:[]}}).status,'Draft');
});

test('reading a legacy Canvas never resolves message content from a foreign linked Campaign',()=>{
 const graph=linkedGraph('scope-foreign-email'),canvas=store.createCanvas({name:'Legacy local Canvas',workspaceId:'scope-local',graph:{nodes:[node('entry','entry')],edges:[]}});
 const row=connection.prepare('SELECT data_json FROM resources WHERE id=?').get(canvas.id),data={...JSON.parse(row.data_json),...graph};
 connection.prepare('UPDATE resources SET data_json=? WHERE id=?').run(JSON.stringify(data),canvas.id);
 const message=store.getCanvasWorkspace(canvas.id).graph.nodes[1].config;
 assert.equal(message.message,'Local source');assert.equal(message.subject,'Local subject');assert.notEqual(message.workspaceId,'scope-foreign');
});

test('the real user email PATCH emits an email-added fact and enters a matching action Canvas once',async()=>{
 const workspaceId='email-action-scope',userId='email-action-user';
 store.applyProfileRows([{external_id:userId,country:'US'}],workspaceId);
 const wizard=structuredClone(defaultCanvasWizard);
 wizard.audience.filters=[{id:'country',field:'country',operator:'is',value:'US'}];
 wizard.entry={...wizard.entry,type:'action',startDate:'2020-01-01',startTime:'00:00',timeZone:'UTC',triggers:['Add an Email Address'],triggerDetails:[{id:'email-added',type:'Add an Email Address'}]};
 const canvas=store.createCanvas({name:'Email action Canvas',workspaceId,wizard,graph:{nodes:[node('entry','entry'),node('mark','update',{attribute:'email_action_entered',value:'yes'})],edges:[['entry','mark']]}});
 assert.equal(store.launchCanvasGraph(canvas.id).entered,0);
 const response=await users.PATCH(request('http://localhost/api/users',{id:userId,email:'added@example.test'},'PATCH'));
 assert.equal(response.status,200);assert.equal(store.getUser(userId).attributes.email_action_entered,'yes');
 const facts=()=>store.listResources('canvas-runtime-state').filter(row=>row.data.workspaceId===workspaceId&&row.data.event?.kind==='email_added');
 assert.equal(facts().length,1);assert.equal(facts()[0].data.event.userId,userId);assert.equal(facts()[0].data.event.value,'added@example.test');
 await users.PATCH(request('http://localhost/api/users',{id:userId,email:'added@example.test'},'PATCH'));
 assert.equal(facts().length,1);assert.equal(store.getCanvasWorkspace(canvas.id).runs.filter(run=>run.entered===1).length,1);
});

test('feature audiences use the same scoped active Canvas assignment as the SDK',()=>{
 const workspaceId='flag-audience-scope',userId='flag-audience-user',flagId='flag-audience-offer';
 store.applyProfileRows([{external_id:userId,country:'US'}],workspaceId);
 const flag=store.createResource({type:'feature-flags',name:'Assigned feature audience',status:'Active',data:{workspaceId,flagId,enabled:true,rollout:100,rules:[],properties:{offer:'gold'}}});
 const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[{id:'country',field:'country',operator:'is',value:'US'}];
 const canvas=store.createCanvas({name:'Feature audience Canvas',workspaceId,wizard,graph:{nodes:[node('entry','entry'),node('flag','feature_flag',{featureFlagId:flagId})],edges:[['entry','flag']]}});
 store.launchCanvasGraph(canvas.id);
 store.updateResource(flag.id,{data:{...flag.data,enabled:false,rollout:0}});
 const sdkEnabled=()=>store.userFeatureFlags(userId).find(row=>row.id===flagId).enabled;
 const audienceEnabled=()=>store.configuredAudienceRuleMatches(userId,{field:'feature_enabled:'+flagId,operator:'equals',value:'true'},workspaceId);
 assert.equal(sdkEnabled(),true);assert.equal(audienceEnabled(),sdkEnabled());
 const foreign=store.createCanvas({name:'Foreign feature owner',workspaceId:'flag-foreign'});
 store.updateCanvas(foreign.id,{status:'Active'});
 store.createResource({type:'feature-assignments',name:'Foreign owner must not override',status:'Active',data:{workspaceId,canvasId:foreign.id,campaignId:foreign.id,userId,flagId,enabled:false}});
 store.createResource({type:'feature-assignments',name:'Foreign assignment scope must not override',status:'Active',data:{workspaceId:'flag-foreign',canvasId:canvas.id,campaignId:canvas.id,userId,flagId,enabled:false}});
 assert.equal(sdkEnabled(),true);assert.equal(audienceEnabled(),sdkEnabled());
 store.updateCanvas(canvas.id,{status:'Stopped'});
 assert.equal(sdkEnabled(),false);assert.equal(audienceEnabled(),sdkEnabled());
 const campaign=store.upsertCampaign({id:'flag-audience-campaign',name:'Scoped feature campaign',channel:'feature',status:'Active',config:{workspaceId}});
 const campaignAssignment=store.createResource({type:'feature-assignments',name:'Active campaign assignment',status:'Active',data:{workspaceId,campaignId:campaign.id,userId,flagId,enabled:true}});
 assert.equal(sdkEnabled(),true);assert.equal(audienceEnabled(),sdkEnabled());
 store.updateResource(campaignAssignment.id,{status:'Archived'});
 assert.equal(sdkEnabled(),false);assert.equal(audienceEnabled(),sdkEnabled());
});
