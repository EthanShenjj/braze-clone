import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'canvas-execution-')),'runtime.sqlite');process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts');
const {defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts');
const {canvasOptimizerDecision}=await import('../lib/canvas-runtime-model.ts');
function fixture(workspaceId,graph){store.applyProfileRows([{external_id:workspaceId+'_user',email:workspaceId+'@example.test',first_name:'Sam',country:'US',attributes:{workspaceId,push_token:'device-1'}}],workspaceId);const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[{id:'country',field:'country',operator:'is',value:'US'}];return store.createCanvas({name:workspaceId,workspaceId,wizard,graph});}
const node=(id,kind,config={})=>({id,kind,label:id,x:0,y:100,config});
test('unconfigured Canvas push prepares its real compiled payload and never creates a delivered receipt',()=>{
 const canvas=fixture('push_prepared',{nodes:[node('entry','entry'),node('push','message',{channel:'push',subject:'Hello',message:'Hi {{first_name}}'})],edges:[['entry','push']]});
 const run=store.launchCanvasGraph(canvas.id);assert.equal(run.entered,1);
 const events=store.activityLog(1000).filter(row=>row.campaign_id===canvas.id);assert.deepEqual(events.map(row=>row.event_type),['prepared']);
 assert.equal(events[0].data_json.includes('"delivered":false'),true);
});
test('Canvas variants persist a stable actual assignment and execute only their connected graph',()=>{
 const graph={variants:[{id:'a',name:'A',weight:0},{id:'b',name:'B',weight:100}],nodes:[node('entry','entry',{variantTargets:{a:'a-step',b:'b-step'}}),node('a-step','update',{variantId:'a',attribute:'variant_route',value:'a'}),node('b-step','update',{variantId:'b',attribute:'variant_route',value:'b'})],edges:[['entry','a-step'],['entry','b-step']]};
 const canvas=fixture('weighted_variant',graph),run=store.launchCanvasGraph(canvas.id);
 assert.equal(run.traces[0].variantId,'b');assert.equal(store.getUser('weighted_variant_user').attributes.variant_route,'b');assert.deepEqual(run.traces[0].steps.map(step=>step.nodeId),['entry','b-step']);
});

test('two runtime workers claim one actual provider dispatch and retain accepted rather than delivered status',async t=>{
 const graph={nodes:[node('entry','entry'),node('push','message',{channel:'push',subject:'Hello',message:'Hi {{first_name}}'}),node('after','update',{attribute:'after_provider',value:'yes'})],edges:[['entry','push'],['push','after']]},canvas=fixture('push_provider',graph),at='2026-11-12T12:00:00.000Z';
 process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://canvas-provider.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='test-only';let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;const request=JSON.parse(options.body);assert.equal(request.recipient,'device-1');assert.equal(request.channel,'push');assert.equal(request.message.platforms[0].body,'Hi Sam');return Response.json({id:'provider-accepted-1',status:'accepted'});});
 try{
  const run=store.launchCanvasGraph(canvas.id,{at});assert.equal(run.completed,0);
  await Promise.all([store.processCanvasRuntime(at),store.processCanvasRuntime(at)]);
  assert.equal(calls,1);assert.equal(store.getUser('push_provider_user').attributes.after_provider,'yes');
  assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(item=>item.id===run.id)?.completed,1);
  const events=store.activityLog(1000).filter(row=>row.campaign_id===canvas.id);assert.deepEqual(events.map(row=>row.event_type).sort(),['accepted','queued']);
 }finally{process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});

test('Feature Flag steps persist the actual scoped flag decision for the enrolled user',()=>{
 store.createResource({type:'feature-flags',name:'A real flag',status:'Active',data:{workspaceId:'flag_runtime',flagId:'runtime_offer',enabled:true,rollout:100,properties:{offer:'gold'},rules:[]}});
 const canvas=fixture('flag_runtime',{nodes:[node('entry','entry'),node('flag','feature_flag',{featureFlagId:'runtime_offer'})],edges:[['entry','flag']]});
 const run=store.launchCanvasGraph(canvas.id),assignment=store.listResources('feature-assignments').find(row=>row.data.canvasId===canvas.id);
 assert.ok(assignment);assert.equal(assignment.data.userId,'flag_runtime_user');assert.equal(assignment.data.runId,run.id);assert.equal(assignment.data.enabled,true);assert.deepEqual(assignment.data.properties,{offer:'gold'});
 const foreign=fixture('foreign_flag',{nodes:[node('entry','entry'),node('flag','feature_flag',{featureFlagId:'runtime_offer'})],edges:[['entry','flag']]});
 assert.throws(()=>store.launchCanvasGraph(foreign.id),/flag.*workspace/i);
});

test('Agent steps wait for an actual configured provider output before updating context and continuing',async t=>{
 const agent=store.createResource({type:'canvas-step-agents',name:'A real score agent',status:'Active',data:{workspaceId:'agent_runtime',objective:'Compute the real score',instructions:'Return the actual score'}});
 const canvas=fixture('agent_runtime',{nodes:[node('entry','entry'),node('agent','agent',{agentId:agent.id,outputVariable:'score',outputType:'Number'}),node('after','update',{updateMode:'ui',updates:[{id:'score',attribute:'agent_score',action:'update',value:'{{canvas_context.score}}',personalize:true}]})],edges:[['entry','agent'],['agent','after']]}),at='2026-11-12T12:00:00.000Z';
 const run=store.launchCanvasGraph(canvas.id,{at});assert.equal(run.completed,0);
 const missing=await store.processCanvasRuntime(at);assert.equal(missing.connectors.results.some(row=>row.status==='Configuration required'),true);assert.equal(store.getUser('agent_runtime_user').attributes.agent_score,undefined);
 process.env.CANVAS_AGENT_ENDPOINT='https://agent-provider.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='agent-test-only';let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;const request=JSON.parse(options.body);assert.equal(request.kind,'agent');assert.equal(request.scope.workspaceId,'agent_runtime');assert.equal(request.scope.canvasId,canvas.id);assert.equal(request.profile.first_name,'Sam');assert.equal(request.config.agentInstructions,'Return the actual score');assert.equal(new Headers(options.headers).get('Idempotency-Key'),request.jobId);return Response.json({status:'completed',providerId:'real-agent-run',output:7});});
 try{await store.processCanvasRuntime(at);assert.equal(calls,1);assert.equal(store.getUser('agent_runtime_user').attributes.agent_score,7);assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id)?.completed,1);}
 finally{delete process.env.CANVAS_AGENT_ENDPOINT;delete process.env.CANVAS_AGENT_API_KEY;}
});

test('Send to Destination enrolls its scoped active Canvas using destination entry rules without a synthetic send',()=>{
 const target=fixture('destination_runtime',{nodes:[node('entry','entry'),node('after','update',{attribute:'destination_entered',value:'yes'})],edges:[['entry','after']]});
 store.updateCanvas(target.id,{wizard:{...target.wizard,entry:{...target.wizard.entry,type:'api'}}});store.launchCanvasGraph(target.id);
 const source=store.createCanvas({name:'Destination source',workspaceId:'destination_runtime',wizard:target.wizard,graph:{nodes:[node('entry','entry'),node('send','destination',{destinationType:'canvas',destinationId:target.id})],edges:[['entry','send']]}});
 assert.equal(store.launchCanvasGraph(source.id).completed,1);assert.equal(store.getUser('destination_runtime_user').attributes.destination_entered,'yes');
 assert.equal(store.getCanvasWorkspace(target.id).runs.filter(run=>run.entered===1).length,1);
});

test('Winning Path freezes the first UI path on a tied completed window without inventing significance',()=>{
 const graph={nodes:[node('entry','entry'),node('experiment','experiment_paths',{winningPath:true,winningPathMetric:'clicks',experimentWindowDays:1,paths:[{id:'z-first',name:'First',weight:50,nextNodeId:'first'},{id:'a-second',name:'Second',weight:50,nextNodeId:'second'}]}),node('first','update',{attribute:'winner_route',value:'first'}),node('second','update',{attribute:'winner_route',value:'second'})],edges:[['entry','experiment'],['experiment','first'],['experiment','second']]},canvas=fixture('winning_tie',graph),at='2026-11-12T12:00:00.000Z';
 store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'api'}}});store.launchCanvasGraph(canvas.id,{at});store.triggerCanvas(canvas.id,['winning_tie_user'],{},'first',at);
 store.applyProfileRows([{external_id:'winning_tie_later',email:'later@example.test',country:'US',attributes:{workspaceId:'winning_tie'}}],'winning_tie');
 store.triggerCanvas(canvas.id,['winning_tie_later'],{},'later','2026-11-13T12:00:00.000Z');
 assert.equal(store.getUser('winning_tie_later').attributes.winner_route,'first');
 const experiment=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='experiment'&&row.data.canvasId===canvas.id);
 assert.equal(experiment.status,'Assigned');assert.equal(experiment.data.decision.winnerPathId,'z-first');assert.equal(experiment.data.decision.significance,'not_evaluated');
 assert.deepEqual(experiment.data.decision.scores.map(row=>row.conversions),[0,0]);
});

test('Winning Path counts actual attributed conversions in the selected run rather than synthetic outcomes',()=>{
 const graph={nodes:[node('entry','entry'),node('experiment','experiment_paths',{winningPath:true,experimentWindowDays:1,paths:[{id:'actual',name:'Actual',weight:100,nextNodeId:'after'},{id:'unused',name:'Unused',weight:0,exit:true}]}),node('after','update',{attribute:'in_experiment',value:'yes'})],edges:[['entry','experiment'],['experiment','after']]},canvas=fixture('winning_conversion',graph),at='2026-11-12T12:00:00.000Z';
 store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'api'},conversionEvents:[{id:'checkout',type:'Performs Custom Event',eventName:'checkout',appScope:'all',deadline:3,unit:'Days'}]}});store.launchCanvasGraph(canvas.id,{at});store.triggerCanvas(canvas.id,['winning_conversion_user'],{},'first',at);
 store.trackProfileEvent({userId:'winning_conversion_user',name:'checkout',createdAt:'2026-11-12T13:00:00.000Z'});
 store.applyProfileRows([{external_id:'winning_conversion_later',email:'conversion-later@example.test',country:'US',attributes:{workspaceId:'winning_conversion'}}],'winning_conversion');store.triggerCanvas(canvas.id,['winning_conversion_later'],{},'later','2026-11-13T12:00:00.000Z');
 const experiment=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='experiment'&&row.data.canvasId===canvas.id);
 assert.deepEqual(experiment.data.decision.scores,[{pathId:'actual',exposures:1,conversions:1,conversionRate:1}]);
});

test('Optimizer executes only an authored component combination and preserves raw Liquid until rendering',()=>{
 const canvas=fixture('optimizer_runtime',{nodes:[node('entry','entry'),node('optimizer','optimizer',{channel:'push',subject:'Hello',message:"{% message_component 'Body Content' %}",optimizerComponents:[{id:'body',type:'Body Content',variants:[{id:'one',value:'Authored {{first_name}}'},{id:'two',value:'Authored {{first_name}}'}]}]})],edges:[['entry','optimizer']]}),run=store.launchCanvasGraph(canvas.id);
 assert.equal(run.messages,1);const events=store.activityLog(1000).filter(row=>row.campaign_id===canvas.id);assert.deepEqual(events.map(row=>row.event_type),['prepared']);
 assert.equal(JSON.parse(events[0].data_json).message.platforms[0].body,'Authored Sam');
 const selection=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='optimizer-selection'&&row.data.canvasId===canvas.id);assert.deepEqual(Object.keys(selection.data.selections),['body']);assert.equal(['one','two'].includes(selection.data.selections.body),true);assert.equal(selection.data.exposures,0);
});

test('Audience Sync accepted acknowledgement advances once and never resubmits an accepted job',async t=>{
 const canvas=fixture('audience_accepted',{nodes:[node('entry','entry'),node('sync','audience_sync',{partner:'Google',audienceId:'audience-1',accountId:'account-1'}),node('after','update',{attribute:'sync_accepted',value:'yes'})],edges:[['entry','sync'],['sync','after']]});
 process.env.CANVAS_AUDIENCE_SYNC_ENDPOINT='https://audience.example.test/jobs';process.env.CANVAS_AUDIENCE_SYNC_API_KEY='audience-test-only';let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.kind,'audience_sync');assert.equal(body.scope.userId,'audience_accepted_user');assert.equal(body.ref.partner,'Google');return Response.json({status:'accepted',providerId:'audience-accepted-job'},{status:202});});
 try{const run=store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});await store.processCanvasRuntime('2026-11-12T12:00:00.000Z');await store.processCanvasRuntime('2026-11-12T12:01:00.000Z');assert.equal(calls,1);assert.equal(store.getUser('audience_accepted_user').attributes.sync_accepted,'yes');assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id).completed,1);const job=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='connector'&&row.data.canvasId===canvas.id);assert.equal(job.status,'Accepted');}
 finally{delete process.env.CANVAS_AUDIENCE_SYNC_ENDPOINT;delete process.env.CANVAS_AUDIENCE_SYNC_API_KEY;}
});

test('Agent accepted job waits for the real typed completion using the same idempotency key',async t=>{
 const agent=store.createResource({type:'canvas-step-agents',name:'Async agent',status:'Active',data:{workspaceId:'async_agent',objective:'Get actual result',instructions:'Get the real typed result'}}),canvas=fixture('async_agent',{nodes:[node('entry','entry'),node('agent','agent',{agentId:agent.id,outputVariable:'score',outputType:'Number'}),node('after','update',{attribute:'async_finished',value:'yes'})],edges:[['entry','agent'],['agent','after']]}),keys=[];
 process.env.CANVAS_AGENT_ENDPOINT='https://agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='agent-test-only';t.mock.method(globalThis,'fetch',async(_url,options)=>{keys.push(new Headers(options.headers).get('Idempotency-Key'));return keys.length===1?Response.json({status:'accepted',providerId:'async-1'},{status:202}):Response.json({status:'completed',providerId:'async-1',output:3});});
 try{const run=store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});await store.processCanvasRuntime('2026-11-12T12:00:00.000Z');assert.equal(store.getUser('async_agent_user').attributes.async_finished,undefined);await store.processCanvasRuntime('2026-11-12T12:00:09.000Z');assert.equal(keys.length,1);await store.processCanvasRuntime('2026-11-12T12:00:10.000Z');assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(store.getUser('async_agent_user').attributes.async_finished,'yes');assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id).completed,1);}
 finally{delete process.env.CANVAS_AGENT_ENDPOINT;delete process.env.CANVAS_AGENT_API_KEY;}
});

test('a completed experiment window is evaluated durably by the worker without another entrant',async()=>{
 const canvas=fixture('winning_clock',{nodes:[node('entry','entry'),node('experiment','experiment_paths',{winningPath:true,winningPathMetric:'clicks',winningPathFallback:'mix',experimentWindowDays:1,paths:[{id:'first',name:'First',weight:50,exit:true},{id:'second',name:'Second',weight:50,exit:true}]})],edges:[['entry','experiment']]});store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});
 await store.processCanvasRuntime('2026-11-13T12:00:00.000Z');const experiment=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='experiment'&&row.data.canvasId===canvas.id);assert.equal(experiment.status,'Assigned');assert.equal(experiment.data.decision.winnerPathId,null);assert.equal(experiment.data.decision.significance,'not_evaluated');assert.deepEqual(experiment.data.decision.allocations,[{pathId:'first',weight:50},{pathId:'second',weight:50}]);
});

test('Winning Path Delay Group holds real enrollments until the window then follows one frozen winner',async()=>{
 const canvas=fixture('winning_delay',{nodes:[node('entry','entry'),node('experiment','experiment_paths',{winningPath:true,winningPathMetric:'clicks',winningPathDelayWeight:100,experimentWindowDays:1,paths:[{id:'first',name:'First',weight:0,nextNodeId:'first'},{id:'second',name:'Second',weight:0,nextNodeId:'second'}]}),node('first','update',{attribute:'delay_winner',value:'first'}),node('second','update',{attribute:'delay_winner',value:'second'})],edges:[['entry','experiment'],['experiment','first'],['experiment','second']]}),run=store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});
 assert.equal(run.completed,0);assert.equal(store.getUser('winning_delay_user').attributes.delay_winner,undefined);await store.processCanvasRuntime('2026-11-13T11:59:59.000Z');assert.equal(store.getUser('winning_delay_user').attributes.delay_winner,undefined);await store.processCanvasRuntime('2026-11-13T12:00:00.000Z');assert.equal(store.getUser('winning_delay_user').attributes.delay_winner,'first');assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id).completed,1);
});

test('the configured Canvas minute limit counts accepted jobs once and defers the next dispatch',async t=>{
 const canvas=fixture('canvas_rate',{nodes:[node('entry','entry'),node('push','message',{channel:'push',subject:'Hello',message:'Hi {{first_name}}'})],edges:[['entry','push']]});store.applyProfileRows(Array.from({length:10},(_,index)=>({external_id:'canvas_rate_'+index,email:'second'+index+'@example.test',country:'US',attributes:{workspaceId:'canvas_rate',push_token:'device-'+index}})),'canvas_rate');store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,send:{...canvas.wizard.send,rateEnabled:true,rateMode:'shared',ratePerMinute:10}}});
 process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://rate.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='rate-test-only';let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({id:'rate-'+calls,status:'accepted'});});
 try{store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});await store.processCanvasRuntime('2026-11-12T12:00:00.000Z');assert.equal(calls,10);await store.processCanvasRuntime('2026-11-12T12:00:59.000Z');assert.equal(calls,10);await store.processCanvasRuntime('2026-11-12T12:01:00.000Z');assert.equal(calls,11);}
 finally{process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});

test('a rejected real provider records an actionable failed fact and releases its reserved quota',async t=>{
 const canvas=fixture('provider_rejected',{nodes:[node('entry','entry'),node('push','message',{channel:'push',subject:'Hello',message:'Hi {{first_name}}'}),node('after','update',{attribute:'after_failed_message',value:'yes'})],edges:[['entry','push'],['push','after']]});store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'api'},audience:{...canvas.wizard.audience,reentryEnabled:true,reentryValue:1,reentryUnit:'Hours'}}});
 process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://rejected.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='rejected-test-only';t.mock.method(globalThis,'fetch',async()=>Response.json({error:'Provider rejected this address'},{status:400}));
 try{store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});const run=store.triggerCanvas(canvas.id,['provider_rejected_user'],{},'first','2026-11-12T12:00:00.000Z'),result=await store.processCanvasRuntime('2026-11-12T12:00:00.000Z');assert.equal(result.delivery.results[0].status,'Failed');const facts=store.activityLog(1000).filter(row=>row.campaign_id===canvas.id);assert.deepEqual(facts.map(row=>row.event_type).sort(),['failed','queued']);const failure=JSON.parse(facts.find(row=>row.event_type==='failed').data_json);assert.equal(failure.delivered,false);assert.equal(failure.canvasRunId,run.id);assert.equal(typeof failure.error,'string');const connection=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);try{assert.equal(connection.prepare('SELECT count(*) AS n FROM frequency_dispatches WHERE entity_id=?').get(canvas.id).n,0);}finally{connection.close();}assert.equal(store.getUser('provider_rejected_user').attributes.after_failed_message,'yes');assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id).completed,1);assert.equal(store.triggerCanvas(canvas.id,['provider_rejected_user'],{},'after-window','2026-11-12T14:00:00.000Z').entered,1);store.updateCanvas(canvas.id,{status:'Stopped'});}
 finally{process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});

test('a terminal Agent provider rejection exits the enrollment without creating an output or executing dependents',async t=>{
 const agent=store.createResource({type:'canvas-step-agents',name:'Rejecting agent',status:'Active',data:{workspaceId:'agent_rejected',objective:'Get actual result',instructions:'Get the actual result'}}),canvas=fixture('agent_rejected',{nodes:[node('entry','entry'),node('agent','agent',{agentId:agent.id,outputVariable:'score',outputType:'Number'}),node('after','update',{attribute:'must_not_fake_agent_output',value:'yes'})],edges:[['entry','agent'],['agent','after']]});process.env.CANVAS_AGENT_ENDPOINT='https://reject-agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='agent-test-only';t.mock.method(globalThis,'fetch',async()=>Response.json({error:'Rejected'},{status:400}));
 try{const run=store.launchCanvasGraph(canvas.id,{at:'2026-11-12T12:00:00.000Z'});await store.processCanvasRuntime('2026-11-12T12:00:00.000Z');assert.equal(store.getUser('agent_rejected_user').attributes.must_not_fake_agent_output,undefined);assert.equal(store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id).completed,1);const state=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='enrollment'&&row.data.canvasId===canvas.id);assert.equal(state.status,'Completed');assert.equal(store.getResource('canvas-context:'+run.id+':agent_rejected_user'),null);}
 finally{delete process.env.CANVAS_AGENT_ENDPOINT;delete process.env.CANVAS_AGENT_API_KEY;}
});

test('Optimizer promotes an authored combination only after actual accepted exposures and real click receipts',async t=>{
 const config={channel:'push',subject:'Hello',message:"{% message_component 'Body Content' %}",optimizationEvent:'clicks',optimizerComponents:[{id:'body',type:'Body Content',variants:[{id:'one',value:'Winner {{first_name}}'},{id:'two',value:'Other {{first_name}}'}]}]},canvas=fixture('optimizer_outcomes',{nodes:[node('entry','entry'),node('optimizer','optimizer',config)],edges:[['entry','optimizer']]}),cohorts={one:[],two:[]};
 // Select real user IDs for two balanced exploration cohorts. Assertions below use observed
 // provider receipts and literal outcomes, independently of the pure allocation calculation.
 for(let index=0;cohorts.one.length<30||cohorts.two.length<30;index++){const id='optimizer_observation_'+index,choice=canvasOptimizerDecision(config,canvas.id+':optimizer',id,[]).selections.body;if(cohorts[choice].length<30)cohorts[choice].push(id);}
 store.applyProfileRows([{external_id:'optimizer_outcomes_user',country:'CA'},...[...cohorts.one,...cohorts.two].map(id=>({external_id:id,email:id+'@example.test',first_name:'Sam',country:'US',attributes:{workspaceId:'optimizer_outcomes',push_token:id}}))],'optimizer_outcomes');store.updateCanvas(canvas.id,{wizard:{...canvas.wizard,entry:{...canvas.wizard.entry,type:'api'}}});const at=new Date(Date.now()-60000).toISOString();store.launchCanvasGraph(canvas.id,{at});
 process.env.MESSAGE_DELIVERY_ENABLED='true';process.env.MESSAGE_DELIVERY_ENDPOINT='https://optimizer.example.test/send';process.env.MESSAGE_DELIVERY_API_KEY='optimizer-test-only';let calls=0;t.mock.method(globalThis,'fetch',async()=>Response.json({id:'optimizer-provider-'+(++calls),status:'accepted'}));
 try{const run=store.triggerCanvas(canvas.id,[...cohorts.one,...cohorts.two],{},'exploration',at);await store.processCanvasRuntime(at,1000);assert.equal(calls,60);for(const userId of cohorts.one)store.recordExternalEvent(canvas.id,{userId,event:'clicked',attributes:{nodeId:'optimizer',canvasRunId:run.id}});store.applyProfileRows([{external_id:'optimizer_optimized_later',email:'later-optimized@example.test',first_name:'Sam',country:'US',attributes:{workspaceId:'optimizer_outcomes',push_token:'later-optimized'}}],'optimizer_outcomes');store.triggerCanvas(canvas.id,['optimizer_optimized_later'],{},'optimized',new Date().toISOString());const selection=store.listResources('canvas-runtime-state').find(row=>row.data.kind==='optimizer-selection'&&row.data.canvasId===canvas.id&&row.data.userId==='optimizer_optimized_later');assert.equal(selection.data.status,'optimized');assert.deepEqual(selection.data.selections,{body:'one'});assert.equal(selection.data.exposures,30);assert.equal(selection.data.outcomes,30);assert.equal(selection.data.rate,1);}
 finally{process.env.MESSAGE_DELIVERY_ENABLED='false';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
