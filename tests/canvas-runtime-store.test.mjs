import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'canvas-parity-runtime-')),'test.sqlite');
process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const {canvasUpdatedProfile}=await import('../lib/canvas-step-model.ts');
const {DatabaseSync}=await import('node:sqlite');
const connection=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);
function fixture(workspaceId,count){
 store.applyProfileRows(Array.from({length:count},(_,i)=>({external_id:workspaceId+'_'+i,email:workspaceId+'_'+i+'@example.test',country:'US',attributes:{workspaceId}})),workspaceId);
 const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[{id:'country',field:'country',operator:'is',value:'US'}];
 const graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'update',kind:'update',label:'Mark entry',x:0,y:200,config:{attribute:'entered',value:'yes'}}],edges:[['entry','update']]};
 return store.createCanvas({name:workspaceId,workspaceId,wizard,graph});
}
test('Canvas User Update cannot move a profile into another workspace through UI or JSON updates',()=>{
 for(const key of ['workspaceId','workspace_id']){
  assert.throws(()=>canvasUpdatedProfile({workspaceId:'local'},{updates:[{attribute:key,action:'update',value:'foreign'}]}),/workspace/i);
  assert.throws(()=>canvasUpdatedProfile({workspaceId:'local'},{updateMode:'json',updateJson:JSON.stringify({attributes:[{[key]:'foreign'}]})}),/workspace/i);
 }
});
test('browser draft migration is idempotent, scoped and preserves the original draft as a new server draft',()=>{
 const source=fixture('browser_import_population',1),draft={canvas:{...source,id:'browser-source-id'},graph:store.getCanvasWorkspace(source.id).graph};
 const imported=store.importCanvasBrowserDraft(draft,'browser_import_population');
 assert.notEqual(imported.id,'browser-source-id');assert.notEqual(imported.id,source.id);assert.equal(imported.status,'Draft');
 assert.equal(store.importCanvasBrowserDraft(draft,'browser_import_population').id,imported.id);
 assert.equal(store.getCanvas(source.id).name,source.name);
 assert.throws(()=>store.importCanvasBrowserDraft(draft,'foreign'),/workspace/i);
});
test('Canvas SDK messages are scoped, exposed for active journeys and actual impression receipts are deduplicated',()=>{
 const canvas=fixture('sdk_canvas_population',1);store.updateCanvas(canvas.id,{status:'Active'});
 const message=store.createResource({type:'sdk-messages',name:'Canvas banner',status:'Available',data:{canvasId:canvas.id,campaignId:canvas.id,workspaceId:'sdk_canvas_population',nodeId:'banner',canvasRunId:'run_sdk',userId:'sdk_canvas_population_0',channel:'banner',payload:{html:'Hello'}}});
 assert.equal(store.sdkCampaignMessages('sdk_canvas_population_0').banners.some(row=>row.id===message.id),true);
 assert.throws(()=>store.sdkMessageReceipt('full_population_0',message.id,'impression'),/user|found/i);
 store.sdkMessageReceipt('sdk_canvas_population_0',message.id,'impression');store.sdkMessageReceipt('sdk_canvas_population_0',message.id,'impression');
 const events=connection.prepare("SELECT data_json FROM message_events WHERE campaign_id=? AND event_type='delivered'").all(canvas.id);
 assert.equal(events.length,1);assert.equal(JSON.parse(events[0].data_json).nodeId,'banner');
 store.updateCanvas(canvas.id,{status:'Stopped'});assert.equal(store.sdkCampaignMessages('sdk_canvas_population_0').banners.length,0);
});
test('explicit Canvas SDK tests materialize a scoped test message on a draft and isolate its receipts',async()=>{
 const canvas=fixture('sdk_test_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'banner',kind:'message',label:'Banner',x:0,y:100,config:{channel:'banner',message:'Hello',channelValues:{editorMode:'html',html:'<p>Hello {{first_name}}</p>'}}}],edges:[['entry','banner']]};store.saveCanvasGraph(graph,undefined,canvas.id);
 const preview={canvasId:canvas.id,workspaceId:'sdk_test_population',userId:'sdk_test_population_0',at:'2026-11-12T12:00:00Z',profileBefore:{},steps:[{nodeId:'banner',status:'passed',eligibility:{eligible:true},message:{channel:'banner',body:'Hello Ada',profile:{first_name:'Ada'}}}]};
 const result=await store.sendCanvasTestMessages(canvas.id,preview,{banner:'sdk_test_population_0'});assert.equal(typeof result[0].messageId,'string');const message=store.getResource(result[0].messageId);
 assert.equal(result[0].status,'available');assert.ok(message);assert.equal(message.data.test,true);assert.match(message.data.payload.html,/Hello Ada/);assert.equal(store.sdkCampaignMessages('sdk_test_population_0').banners.some(row=>row.id===message.id),true);
 store.sdkMessageReceipt('sdk_test_population_0',message.id,'impression');const receipt=connection.prepare("SELECT data_json FROM message_events WHERE campaign_id=? AND event_type='delivered'").get(canvas.id);assert.equal(JSON.parse(receipt.data_json).test,true);
});
test('SDK reads remove available Canvas messages when the current profile now matches exit filters',()=>{
 const canvas=fixture('sdk_exit_read_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'banner',kind:'message',label:'Banner',x:0,y:100,config:{channel:'banner',message:'Hello',channelValues:{editorMode:'html',html:'Hello'}}}],edges:[['entry','banner']]};store.saveCanvasGraph(graph,undefined,canvas.id);store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,audience:{...canvas.wizard.audience,exitFilters:[{id:'exit-country',field:'country',operator:'is',value:'CA'}]}}});
 store.launchCanvasGraph(canvas.id);assert.equal(store.sdkCampaignMessages('sdk_exit_read_population_0').banners.length,1);
 connection.prepare('UPDATE users SET country=? WHERE id=?').run('CA','sdk_exit_read_population_0');assert.equal(store.sdkCampaignMessages('sdk_exit_read_population_0').banners.length,0);
});
test('external Canvas receipts require a scoped user and a real message step',()=>{
 const canvas=fixture('canvas_receipt_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'push',kind:'message',label:'Push',x:0,y:100,config:{channel:'push',subject:'Hello',message:'Hello'}}],edges:[['entry','push']]};store.saveCanvasGraph(graph,undefined,canvas.id);
 assert.equal(store.recordExternalEvent(canvas.id,{userId:'canvas_receipt_population_0',event:'opened',attributes:{nodeId:'push'}}).recorded,true);
 assert.throws(()=>store.recordExternalEvent(canvas.id,{userId:'full_population_0',event:'opened',attributes:{nodeId:'push'}}),/workspace|user/i);
 assert.throws(()=>store.recordExternalEvent(canvas.id,{userId:'canvas_receipt_population_0',event:'opened',attributes:{nodeId:'foreign'}}),/step|node/i);
});
test('Feature Flag SDK results include active Canvas assignments and isolate foreign definitions',()=>{
 const canvas=fixture('canvas_flag_population',1);store.updateCanvas(canvas.id,{status:'Active'});
 store.createResource({type:'feature-flags',name:'Canvas test flag',status:'Active',data:{workspaceId:'canvas_flag_population',flagId:'canvas_test_flag',enabled:false,rollout:0,rules:[],properties:{}}});
 store.createResource({type:'feature-flags',name:'Foreign flag',status:'Active',data:{workspaceId:'foreign_flags',flagId:'foreign_test_flag',enabled:true,rollout:100,rules:[],properties:{}}});
 store.createResource({type:'feature-assignments',name:'Canvas assignment',status:'Active',data:{workspaceId:'canvas_flag_population',canvasId:canvas.id,campaignId:canvas.id,userId:'canvas_flag_population_0',flagId:'canvas_test_flag',enabled:true,properties:{offer:'gold'}}});
 const flags=store.userFeatureFlags('canvas_flag_population_0');assert.equal(flags.some(flag=>flag.id==='foreign_test_flag'),false);const assigned=flags.find(flag=>flag.id==='canvas_test_flag');assert.equal(assigned.enabled,true);assert.equal(assigned.properties.offer,'gold');
 store.updateCanvas(canvas.id,{status:'Stopped'});assert.equal(store.userFeatureFlags('canvas_flag_population_0').find(flag=>flag.id==='canvas_test_flag').enabled,false);
});
test('Canvas entry evaluates the full workspace audience without the former 100/10 demo caps',()=>{
 const canvas=fixture('full_population',140);
 const run=store.launchCanvasGraph(canvas.id);
 assert.equal(run.entered,140);
 assert.equal(run.completed,140);
 assert.equal(store.getUser('full_population_139').attributes.entered,'yes');
 assert.equal(run.traces.length,140);
});
test('configured Canvas entry volume limits apply exactly instead of being capped at ten',()=>{
 const canvas=fixture('limited_population',70);
 store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,audience:{...canvas.wizard.audience,volumeEnabled:true,maxEntries:35,cadence:'Hourly'}}});
 const run=store.launchCanvasGraph(canvas.id);
 assert.equal(run.entered,35);
 assert.equal(store.launchCanvasGraph(canvas.id).entered,0,'the configured hourly quota is shared across runs');
});
test('preview audience checks use simulated attributes and restore the real profile',()=>{
 const canvas=fixture('preview_population',1),before=store.getUser('preview_population_0');
 const config={filterGroups:[{id:'profile',operator:'AND',exclude:false,rules:[{id:'country',field:'country',operator:'is_any_of',value:'["CA"]'}]}]};
 assert.equal(store.previewCanvasConditionsOnProfile(canvas.id,before.id,config,{...before.attributes,country:'CA'}),true);
 assert.equal(store.getUser(before.id).country,'US');
 assert.deepEqual(store.getUser(before.id).attributes,before.attributes);
 assert.throws(()=>store.previewCanvasConditionsOnProfile(canvas.id,'conversion_population_0',config,{country:'CA'}),/workspace|user/i);
});
test('explicit Canvas test sends preserve provider accepted status and never consume live frequency quota',async()=>{
 const canvas=fixture('test_send_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'push',kind:'message',label:'Push',x:0,y:200,config:{channel:'push',subject:'Hello',message:'Preview'}}],edges:[['entry','push']]};
 store.saveCanvasGraph(graph,undefined,canvas.id);
 const preview={canvasId:canvas.id,workspaceId:'test_send_population',userId:'test_send_population_0',at:'2026-11-12T12:00:00.000Z',completedAt:'2026-11-12T12:00:00.000Z',status:'completed',steps:[{nodeId:'push',label:'Push',kind:'message',at:'2026-11-12T12:00:00.000Z',departureAt:'2026-11-12T12:00:00.000Z',eligibility:{eligible:true,reasons:[]},status:'passed',details:[],message:{channel:'push',subject:'Hello',body:'Preview',config:{}}}],profileBefore:{},profileAfter:{},warnings:[],simulated:true,messagesSent:false};
 const originalFetch=globalThis.fetch;let requests=0;
 process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://canvas-test-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://canvas-test-provider.example.test/send');const payload=JSON.parse(options.body);assert.equal(payload.test,true);assert.equal(payload.channel,'push');assert.equal(payload.recipient,'test-device');requests++;return Response.json({id:'accepted_test',status:'accepted'});};
 try{const sent=await store.sendCanvasTestMessages(canvas.id,preview,{push:'test-device'});assert.equal(sent[0].status,'accepted');assert.equal(requests,1);assert.equal(connection.prepare("SELECT count(*) AS n FROM message_events WHERE campaign_id=? AND event_type='delivered'").get(canvas.id).n,0);}
 finally{globalThis.fetch=originalFetch;process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
test('Canvas conversions are attributed once within their own entry window and workspace',()=>{
 const canvas=fixture('conversion_population',1);
 store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,conversionEvents:[{id:'purchase',type:'Performs Custom Event',eventName:'checkout',appScope:'all',deadline:3,unit:'Days'}]}});
 const run=store.launchCanvasGraph(canvas.id);
 store.trackProfileEvent({userId:'conversion_population_0',name:'checkout',createdAt:run.createdAt,properties:{revenue:25}});
 const events=connection.prepare("SELECT data_json FROM message_events WHERE campaign_id=? AND user_id=? AND event_type='conversion'").all(canvas.id,'conversion_population_0');
 assert.equal(events.length,1);
 assert.equal(JSON.parse(events[0].data_json).canvasRunId,run.id);
 store.trackProfileEvent({userId:'conversion_population_0',name:'checkout',createdAt:run.createdAt});
 assert.equal(connection.prepare("SELECT count(*) AS n FROM message_events WHERE campaign_id=? AND event_type='conversion'").get(canvas.id).n,1);
});
test('conversion definitions remain locked after a launched Canvas is stopped',()=>{
 const canvas=fixture('locked_conversion_population',1);store.launchCanvasGraph(canvas.id);store.updateCanvas(canvas.id,{status:'Stopped'});
 assert.throws(()=>store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,conversionEvents:[{id:'changed',type:'Performs Custom Event',eventName:'changed',appScope:'all',deadline:3,unit:'Days'}]}}),/conversion.*cannot.*changed/i);
});
test('Canvas short-link receipts retain the message step for Action Paths',()=>{
 const canvas=fixture('canvas_link_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'push',kind:'message',label:'Push',x:0,y:100,config:{channel:'push',subject:'Hello',message:'Hello'}}],edges:[['entry','push']]};store.saveCanvasGraph(graph,undefined,canvas.id);
 const url=store.shortenMessageLink('https://example.test/offer',canvas.id,'canvas_link_population_0','push'),id=url.split('/').at(-1);
 assert.equal(store.followMessageLink(id),'https://example.test/offer');
 const row=connection.prepare("SELECT data_json FROM message_events WHERE campaign_id=? AND user_id=? AND event_type='clicked'").get(canvas.id,'canvas_link_population_0');
 assert.ok(row);assert.equal(JSON.parse(row.data_json).nodeId,'push');
});
test('Canvas test delivery compiles the saved raw variant once using the profile at that step',async()=>{
 const canvas=fixture('liquid_test_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'push',kind:'message',label:'Push',x:0,y:200,config:{channel:'push',subject:'Hello',message:'Hello {{ first_name }}'}}],edges:[['entry','push']]};
 store.saveCanvasGraph(graph,undefined,canvas.id);
 const preview={canvasId:canvas.id,workspaceId:'liquid_test_population',userId:'liquid_test_population_0',at:'2026-11-12T12:00:00.000Z',completedAt:'2026-11-12T12:00:00.000Z',status:'completed',steps:[{nodeId:'push',label:'Push',kind:'message',at:'2026-11-12T12:00:00.000Z',departureAt:'2026-11-12T12:00:00.000Z',eligibility:{eligible:true,reasons:[]},status:'passed',details:[],message:{channel:'push',subject:'Hello',body:'Hello {{ secret }}',config:{},profile:{first_name:'{{ secret }}',secret:'must stay literal'}}}],profileBefore:{},profileAfter:{first_name:'final profile'},warnings:[],simulated:true,messagesSent:false};
 const originalFetch=globalThis.fetch;process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://canvas-test-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';
 let body;globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return Response.json({id:'accepted_raw',status:'accepted'});};
 try{await store.sendCanvasTestMessages(canvas.id,preview,{push:'test-device'});assert.equal(body.message.platforms[0].body,'Hello {{ secret }}');}
 finally{globalThis.fetch=originalFetch;process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
test('Canvas Optimizer test sends rebuild authored components from selected IDs',async()=>{
 const canvas=fixture('optimizer_test_population',1),config={channel:'push',subject:'Hello',message:"{% message_component 'Body Content' %}",optimizerComponents:[{id:'body',type:'Body Content',variants:[{id:'one',value:'First {{first_name}}'},{id:'two',value:'Selected {{first_name}}'}]}]},graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'optimizer',kind:'optimizer',label:'Optimizer',x:0,y:100,config}],edges:[['entry','optimizer']]};store.saveCanvasGraph(graph,undefined,canvas.id);
 const preview={canvasId:canvas.id,workspaceId:'optimizer_test_population',userId:'optimizer_test_population_0',at:'2026-11-12T12:00:00Z',profileBefore:{},profileAfter:{},steps:[{nodeId:'optimizer',kind:'optimizer',status:'passed',eligibility:{eligible:true},message:{channel:'push',body:'Tampered text',subject:'Hello',config:{},profile:{first_name:'Ada'},optimizerSelections:{body:'two'},optimizerComponents:{'Body Content':'Tampered text'}}}]};
 const original=globalThis.fetch;let payload;process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://canvas-test-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return Response.json({id:'optimizer-accepted'});};
 try{const sent=await store.sendCanvasTestMessages(canvas.id,preview,{push:'device'});assert.equal(sent[0].status,'accepted');assert.equal(payload.message.platforms[0].body,'Selected Ada');}
 finally{globalThis.fetch=original;process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
test('Canvas email Liquid resolves content blocks only from its workspace',()=>{
 store.createResource({type:'content-blocks',name:'canvas_scoped_block',data:{workspaceId:'local',content:'foreign content'}});
 store.createResource({type:'content-blocks',name:'canvas_scoped_block',data:{workspaceId:'scoped_email',content:'scoped content'}});
 const canvas=fixture('scoped_email',1);
 const prepared=store.prepareEmailMessage({id:canvas.id,subject:'Scoped',body:'{{content_blocks.${canvas_scoped_block}}}',config:{workspaceId:'scoped_email'}},'scoped_email_0','test');
 assert.match(prepared.html,/scoped content/);assert.doesNotMatch(prepared.html,/foreign content/);
 assert.equal(store.emailWorkspaceLiquid('different_workspace').contentBlocks.canvas_scoped_block,undefined);
});
test('Canvas email tracking tokens retain step and test scope through the actual tracking endpoint',async()=>{
 const canvas=fixture('canvas_email_tracking_population',1),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'email',kind:'message',label:'Email',x:0,y:100,config:{channel:'email',subject:'Hello',message:'Hello'}}],edges:[['entry','email']]};store.saveCanvasGraph(graph,undefined,canvas.id);
 const email=store.prepareEmailMessage({id:canvas.id,subject:'Hello',body:'Hello',config:{nodeId:'email',workspaceId:'canvas_email_tracking_population'}},'canvas_email_tracking_population_0','test'),token=/email-tracking\/([^?]+)/.exec(email.html)[1];
 const route=await import('../app/api/email-tracking/[token]/route.ts'),response=await route.GET(new Request('http://localhost/api/email-tracking/'+token),{params:Promise.resolve({token})});
 assert.equal(response.status,200);const row=connection.prepare("SELECT data_json FROM message_events WHERE campaign_id=? AND event_type='opened'").get(canvas.id);assert.equal(JSON.parse(row.data_json).nodeId,'email');assert.equal(JSON.parse(row.data_json).test,true);
});
test('designated Canvas entry activates now and enrolls once at its scheduled occurrence',async()=>{
 const canvas=fixture('scheduled_population',1),at='2026-11-12T12:00:00.000Z';
 store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'scheduled',timing:'designated',frequency:'Once',startDate:'2026-11-13',startTime:'12:00',timeZone:'UTC'}}});
 const activation=store.launchCanvasGraph(canvas.id,{at});
 assert.equal(activation.entered,0);assert.equal(store.getCanvas(canvas.id).status,'Active');
 await store.processCanvasRuntime('2026-11-13T11:59:59.000Z');assert.equal(store.getUser('scheduled_population_0').attributes.entered,undefined);
 await store.processCanvasRuntime('2026-11-13T12:00:00.000Z');assert.equal(store.getUser('scheduled_population_0').attributes.entered,'yes');
 const runs=store.getCanvasWorkspace(canvas.id).runs.length;await store.processCanvasRuntime('2026-11-13T12:00:01.000Z');assert.equal(store.getCanvasWorkspace(canvas.id).runs.length,runs);
});
test('API-triggered Canvas entry validates scope and deduplicates a request',()=>{
 const canvas=fixture('api_population',1);store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'api'}}});
 assert.equal(store.launchCanvasGraph(canvas.id).entered,0);
 assert.equal(store.triggerCanvas(canvas.id,['api_population_0'],{offer:'welcome'},'request-1').entered,1);
 assert.equal(store.triggerCanvas(canvas.id,['api_population_0'],{offer:'welcome'},'request-1').entered,0);
 assert.throws(()=>store.triggerCanvas(canvas.id,['conversion_population_0'],{},'request-2'),/workspace|user/i);
});
test('Action-Based Canvas entry consumes matching scoped events instead of entering at activation',()=>{
 const canvas=fixture('action_entry_population',1);store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'action',startDate:'2026-01-01',triggers:['Perform Custom Event'],triggerDetails:[{id:'start',type:'Perform Custom Event',eventName:'begin'}]}}});
 assert.equal(store.launchCanvasGraph(canvas.id).entered,0);
 store.trackProfileEvent({userId:'action_entry_population_0',name:'other'});assert.equal(store.getUser('action_entry_population_0').attributes.entered,undefined);
 store.trackProfileEvent({userId:'action_entry_population_0',name:'begin'});assert.equal(store.getUser('action_entry_population_0').attributes.entered,'yes');
});
test('Action Paths waits for events and immediately follows the first matching path',()=>{
 const canvas=fixture('action_path_population',1),at='2026-11-12T12:00:00.000Z';
 const graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'actions',kind:'action_paths',label:'Actions',x:0,y:100,config:{evaluationValue:5,evaluationUnit:'Minutes',rankedPaths:false,paths:[{id:'engaged',name:'Engaged',nextNodeId:'yes',triggers:[{id:'clicked',type:'Perform Custom Event',eventName:'clicked'}]},{id:'everyone_else',name:'Everyone else',nextNodeId:'no'}]}},{id:'yes',kind:'update',label:'Engaged',x:0,y:200,config:{attribute:'route',value:'engaged'}},{id:'no',kind:'update',label:'Fallback',x:300,y:200,config:{attribute:'route',value:'fallback'}}],edges:[['entry','actions'],['actions','yes'],['actions','no']]};
 store.saveCanvasGraph(graph,undefined,canvas.id);const run=store.launchCanvasGraph(canvas.id,{at});assert.equal(run.completed,0);
 store.trackProfileEvent({userId:'action_path_population_0',name:'clicked',createdAt:'2026-11-12T12:01:00.000Z'});
 assert.equal(store.getUser('action_path_population_0').attributes.route,'engaged');
 assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(item=>item.id===run.id).completed,1);
});
test('attributed Canvas conversions feed Perform Conversion Event Action Paths',()=>{
 const canvas=fixture('conversion_action_population',1),at='2026-11-12T12:00:00.000Z',graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'actions',kind:'action_paths',label:'Wait for conversion',x:0,y:100,config:{evaluationValue:5,evaluationUnit:'Minutes',paths:[{id:'converted',name:'Converted',nextNodeId:'yes',triggers:[{id:'conversion',type:'Perform Conversion Event'}]},{id:'everyone_else',name:'Everyone Else',nextNodeId:'no'}]}},{id:'yes',kind:'update',label:'Converted',x:0,y:200,config:{attribute:'route',value:'converted'}},{id:'no',kind:'update',label:'Fallback',x:300,y:200,config:{attribute:'route',value:'fallback'}}],edges:[['entry','actions'],['actions','yes'],['actions','no']]};
 store.saveCanvasGraph(graph,undefined,canvas.id);store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,conversionEvents:[{id:'checkout',type:'Performs Custom Event',eventName:'checkout',appScope:'all',deadline:3,unit:'Days'}]}});store.launchCanvasGraph(canvas.id,{at});
 store.trackProfileEvent({userId:'conversion_action_population_0',name:'checkout',createdAt:'2026-11-12T12:01:00.000Z'});assert.equal(store.getUser('conversion_action_population_0').attributes.route,'converted');
});
