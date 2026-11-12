import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}
 return next(specifier,context);
}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'sms-composer-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
delete process.env.TWILIO_ACCOUNT_SID;delete process.env.TWILIO_AUTH_TOKEN;delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;
const store=await import('../lib/braze-store.ts'),sms=await import('../lib/sms-composer-store.ts'),management=await import('../lib/audience-management-store.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
store.applyProfileRows([{external_id:'sms_user_a',email:'a@example.test',first_name:'Ada',country:'US',attributes:{phone:'+12025550101',timezone:'UTC'}},{external_id:'sms_user_b',email:'b@example.test',first_name:'Bea',country:'US',attributes:{phone:'+12025550102',timezone:'UTC'}}],'sms-workspace');
store.applyProfileRows([{external_id:'sms_other',email:'other@example.test',first_name:'Other',attributes:{phone:'+12025550103'}}],'other-workspace');
const group=management.createManagedSubscriptionGroup({name:'SMS',channel:'SMS'},'sms-workspace'),otherGroup=management.createManagedSubscriptionGroup({name:'SMS',channel:'SMS'},'other-workspace');
store.setSubscriptionMember(group.id,'sms_user_a','subscribed');store.setSubscriptionMember(group.id,'sms_user_b','subscribed');
const campaign=store.upsertCampaign({id:'cmp_sms_store',name:'SMS test',channel:'sms',status:'Draft',config:{workspaceId:'sms-workspace',subscriptionGroupId:group.id}});
const snapshot={message:'Hi {{${first_name}}} https://example.test/offer',subscriptionGroupId:group.id,values:{appendStop:false}};
const request={kind:'campaign',ownerId:campaign.id,workspaceId:'sms-workspace',snapshot,recipients:['sms_user_a']};
let canvasNumber=0;
function canvas(config={}){
 const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.entry.frequency='Once';wizard.audience.filters=[{id:'id',field:'id',operator:'is_any_of',value:'["sms_user_a"]'},{id:'country',field:'country',operator:'is',value:'US'}];wizard.audience.filterOperator='AND';
 return store.createCanvas({name:'SMS runtime '+(++canvasNumber),workspaceId:'sms-workspace',wizard,graph:{nodes:[{id:'entry',kind:'entry',label:'Audience entry',x:100,y:100},{id:'sms',kind:'message',label:'SMS',x:400,y:100,config:{channel:'sms',message:snapshot.message,subscriptionGroupId:group.id,channelValues:{appendStop:false},...config}}],edges:[['entry','sms']]}});
}
test('SMS context excludes other workspace groups, users and content test groups',()=>{
 store.createResource({type:'internal-groups',name:'Other testers',status:'Active',data:{workspaceId:'other-workspace',channel:'SMS',emails:'other@example.test'}});
 const result=sms.smsWorkspaceContext('sms-workspace');assert.deepEqual(result.groups.map(row=>row.id),[group.id]);assert.equal(result.users.some(row=>row.id==='sms_other'),false);assert.deepEqual(result.testGroups,[]);
});
test('SMS test rejects foreign recipients and subscription groups before any side effects',async()=>{
 const before=store.listResources('sms-tests').length;
 await assert.rejects(sms.sendSmsComposerTest({...request,recipients:['sms_other']}),/workspace/);
 await assert.rejects(sms.sendSmsComposerTest({...request,snapshot:{...snapshot,subscriptionGroupId:otherGroup.id}}),/subscription group/);
 assert.equal(store.listResources('sms-tests').length,before);
});
test('all personalized recipients validate before a provider call or test record',async()=>{
 const before=store.listResources('sms-tests').length;
 await assert.rejects(sms.sendSmsComposerTest({...request,snapshot:{...snapshot,message:'{{${long}}}'},override:true,profile:{long:'x'.repeat(1601)}}),/after personalization/);
 assert.equal(store.listResources('sms-tests').length,before);
});
test('Canvas stores a compiled prepared payload when delivery is disabled',()=>{
 const value=canvas(),run=store.launchCanvasGraph(value.id);assert.equal(run.messages,1);
 const event=store.audienceUserMessageHistory('sms_user_a','sms-workspace').find(row=>row.campaign_id===value.id);assert.equal(event.event_type,'prepared');assert.match(JSON.parse(event.data_json).message.message,/Hi Ada/);
});
test('Intelligent Timing waits once and rechecks audience after the wait',()=>{
 const at=new Date(store.getDemoState().simulatedTime),hour=(at.getUTCHours()+1)%24,time=String(hour).padStart(2,'0')+':00',value=canvas({intelligentTiming:true,timingFallback:'custom',timingTime:time,deliveryValidation:true}),run=store.launchCanvasGraph(value.id);
 assert.equal(run.completed,0);const timing=store.listResources('canvas-message-timing').find(row=>row.data.canvasId===value.id);assert.ok(timing);assert.ok(timing.data.dueAt>at.toISOString());
 store.applyProfileRows([{external_id:'sms_user_a',country:'CA'}],'sms-workspace');store.demoAction('advance');
 const events=store.audienceUserMessageHistory('sms_user_a','sms-workspace').filter(row=>row.campaign_id===value.id);assert.ok(events.some(row=>row.event_type==='suppressed'));assert.equal(events.some(row=>row.event_type==='prepared'),false);assert.equal(store.listResources('canvas-message-timing').filter(row=>row.data.canvasId===value.id).length,1);
 store.applyProfileRows([{external_id:'sms_user_a',country:'US'}],'sms-workspace');
});
test('Campaign and Canvas tests dispatch through the same connected provider without claiming delivery',async()=>{
 const original=globalThis.fetch;process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://sms-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';const calls=[];
 globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://sms-provider.example.test/send');calls.push(JSON.parse(init.body));return Response.json({id:'provider-test-'+calls.length,status:'accepted'});};
 try{const value=canvas();for(const owner of [{kind:'campaign',ownerId:campaign.id},{kind:'canvas',ownerId:value.id,nodeId:'sms'}]){const result=await sms.sendSmsComposerTest({...request,...owner});assert.equal(result.tests[0].delivery.status,'accepted');assert.equal(result.tests[0].delivery.delivered,false);}assert.equal(calls.length,2);assert.ok(calls.every(row=>row.recipient==='+12025550101'&&row.message.message.startsWith('Hi Ada')));
 }finally{globalThis.fetch=original;process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
test('Canvas provider queue is claimed once and records accepted instead of delivered',async()=>{
 const original=globalThis.fetch;process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://sms-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({id:'canvas-provider-test',status:'accepted'});};
 try{const value=canvas();store.launchCanvasGraph(value.id);assert.equal((await store.processCanvasSmsDeliveries()).processed,1);assert.equal((await store.processCanvasSmsDeliveries()).processed,0);assert.equal(calls,1);assert.equal(store.getCanvasWorkspace(value.id).runs[0].completed,1);const events=store.audienceUserMessageHistory('sms_user_a','sms-workspace').filter(row=>row.campaign_id===value.id);assert.ok(events.some(row=>row.event_type==='accepted'));assert.equal(events.some(row=>row.event_type==='delivered'),false);
 }finally{globalThis.fetch=original;process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
test('Operator performs a real configured review and reports unavailable configuration honestly',async()=>{
 const {POST}=await import('../app/api/sms/review/route.ts'),original=globalThis.fetch;
 delete process.env.WORKSPACE_AI_ENDPOINT;delete process.env.WORKSPACE_AI_API_KEY;
 const req=()=>new Request('https://local.test/api/sms/review',{method:'POST',body:JSON.stringify({message:'Hi {{${first_name}}}'})});assert.equal((await POST(req())).status,503);
 process.env.WORKSPACE_AI_ENDPOINT='https://ai.example.test';process.env.WORKSPACE_AI_API_KEY='test-only';let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;assert.match(JSON.parse(init.body).messages[0].content,/untrusted/);return Response.json({summary:'Clear greeting',findings:[]});};
 try{const response=await POST(req());assert.equal(response.status,200);assert.equal((await response.json()).summary,'Clear greeting');assert.equal(calls,1);}finally{globalThis.fetch=original;delete process.env.WORKSPACE_AI_ENDPOINT;delete process.env.WORKSPACE_AI_API_KEY;}
});

test('queued SMS rechecks modern delivery filters and applies skip behavior',async()=>{
 const original=globalThis.fetch;process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://sms-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'unexpected'});};
 try{const value=canvas({deliveryValidationEnabled:true,deliveryFailure:'skip',deliveryFilterGroups:[{id:'country',operator:'AND',exclude:false,rules:[{id:'r',field:'country',operator:'equals',value:'US'}]}]});const saved=store.getCanvasWorkspace(value.id),graph=saved.graph;graph.nodes.push({id:'after',kind:'update',label:'After SMS',x:600,y:100,config:{attribute:'sms_after',value:'yes'}});graph.edges.push(['sms','after']);store.saveCanvasGraph(graph,saved.updatedAt,value.id);store.launchCanvasGraph(value.id);store.applyProfileRows([{external_id:'sms_user_a',country:'CA'}],'sms-workspace');
 const result=await store.processCanvasSmsDeliveries();assert.equal(result.results[0].status,'Suppressed');assert.equal(calls,0);assert.equal(store.getUser('sms_user_a').attributes.sms_after,'yes');assert.equal(store.getCanvasWorkspace(value.id).runs[0].completed,1);
 }finally{store.applyProfileRows([{external_id:'sms_user_a',country:'US'}],'sms-workspace');globalThis.fetch=original;process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});

test('shortening happens before the length check and MMS requires an enabled group',async()=>{
 const result=await sms.sendSmsComposerTest({...request,snapshot:{...snapshot,message:'https://example.test/'+ 'x'.repeat(1900)}});assert.equal(result.tests.length,1);assert.ok(result.tests[0].metrics.characters<1600);
 const rich=management.createManagedSubscriptionGroup({name:'Rich SMS',channel:'SMS',capabilities:{sms:true,mms:true,rcs:true}},'sms-workspace');const mms=await sms.sendSmsComposerTest({...request,snapshot:{message:'',subscriptionGroupId:rich.id,values:{messageType:'MMS',mediaUrl:'https://example.test/image.png'}}});assert.equal(mms.tests[0].mediaUrl,'https://example.test/image.png');
 await assert.rejects(sms.sendSmsComposerTest({...request,snapshot:{message:'Media',subscriptionGroupId:rich.id,values:{messageType:'MMS',mediaUrl:'{{${media}}}'}},override:true,profile:{media:'javascript:alert(1)'}}),/rendered media/);
});

test('the protected delivery worker resumes due SMS timing without advancing the demo clock',async()=>{
 const value=canvas({intelligentTiming:true,intelligentFallback:'custom',intelligentFallbackTime:'23:59'});store.launchCanvasGraph(value.id);const timing=store.listResources('canvas-message-timing').find(row=>row.data.canvasId===value.id);assert.ok(timing);store.updateResource(timing.id,{data:{...timing.data,dueAt:'2000-01-01T00:00:00.000Z'}});
 const database=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);database.prepare('UPDATE canvas_pending_steps SET due_at=? WHERE run_id=?').run('2000-01-01T00:00:00.000Z',timing.data.runId);database.close();
 const result=await store.processCampaignJobs();assert.equal(result.resumedCanvasSteps,1);assert.equal(store.getCanvasWorkspace(value.id).runs[0].completed,1);
});

test('Campaign message attributes and dispatch IDs reach the compiled SMS test',async()=>{
 const result=await sms.sendSmsComposerTest({...request,snapshot:{...snapshot,variantId:'message-one',variantName:'Welcome variant',message:'{{campaign.${message_name}}} {{campaign.${message_api_id}}} {{campaign.${dispatch_id}}}'}});assert.equal(result.tests[0].message,'Welcome variant message-one '+result.id);
});

test('preference-center and landing-page Liquid point to real published routes with scoped tokens',async()=>{
 const model=await import('../lib/preference-center-model.ts'),config=model.newPreferenceComposerConfig('sms-workspace');config.editorReady=true;const center=store.createPreferenceCenter({name:'SMS published preferences',groupIds:[],config});store.publishPreferenceCenter(center.id,center.version);
 const page=store.createResource({type:'landing-pages',name:'SMS published landing',status:'Published',data:{workspaceId:'sms-workspace',slug:'sms-published-landing',title:'SMS landing',html:'<p>Published</p>',buttonLabel:'Submit',published:{html:'<p>Published</p>',buttonLabel:'Submit'}}});
 const variables=store.smsWorkspaceVariables('sms-workspace',{user_id:'sms_user_a'}),link=new URL(variables.preference_center[center.id]);assert.equal(link.pathname,'/preferences/'+center.id);assert.equal(link.searchParams.get('user'),'sms_user_a');assert.ok(store.getPublicPreferenceCenter(center.id,'sms_user_a',link.searchParams.get('token')));
 assert.equal(new URL(variables.landing_page[page.id]).pathname,'/pages/sms-published-landing');assert.equal(store.smsWorkspaceVariables('sms-workspace',{user_id:'sms_other'}).preference_center[center.id],undefined);
 const rendered=sms.renderWorkspaceSms({message:'Manage {{preference_center.${'+center.id+'}}}',subscriptionGroupId:group.id,values:{linkShortening:false}},'sms-workspace',{user_id:'sms_user_a'},campaign.id);assert.match(rendered.message,/\/preferences\//);assert.doesNotMatch(rendered.message,/\/preference-center\//);
});
