import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreview} from '../lib/canvas-preview.ts';
import {defaultCanvasWizard} from '../lib/canvas-wizard-model.ts';
const node=(id,kind,config={})=>({id,label:id,kind,config,x:0,y:0});
const user={id:'preview-user',email:'ada@example.test',firstName:'Ada',country:'US',lifecycle:'New',subscribed:true,emailSubscriptionStatus:'subscribed',reachable:true,attributes:{workspaceId:'local',tier:'free'}};
const wizard=()=>({...structuredClone(defaultCanvasWizard),entry:{...defaultCanvasWizard.entry,timing:'immediate'}});
test('preview advances delay and renders later messages using simulated updates without mutating the supplied profile',async()=>{
 const graph={nodes:[node('entry','entry'),node('update','update',{attribute:'tier',value:'gold'}),node('delay','delay',{durationHours:2}),node('message','message',{channel:'email',subject:'Hello {{first_name}}',message:'{{custom_attribute.${tier}}} at {{canvas_context.offer}}'}),node('context','context',{contextVariables:[{id:'offer',name:'offer',type:'String',value:'Member price'}]})],edges:[['entry','update'],['update','context'],['context','delay'],['delay','message']]};
 const original=structuredClone(user),result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z'});
 assert.equal(result.steps.at(-1).at,'2026-11-12T02:00:00.000Z');
 assert.equal(result.steps.at(-1).message.body,'gold at Member price');
 assert.equal(result.steps.at(-1).message.subject,'Hello Ada');
 assert.equal(result.profileAfter.tier,'gold');assert.deepEqual(user,original);
 assert.equal(result.messagesSent,false);assert.equal(result.simulated,true);
});
test('preview routes on the simulated profile and reports ineligible subscriptions without preparing a send',async()=>{
 const graph={nodes:[node('entry','entry'),node('update','update',{attribute:'country',value:'CA'}),node('split','branch',{attribute:'country',value:'CA',branchTargets:{yes:'yes',no:'no'}}),node('yes','message',{channel:'email',message:'Canada'}),node('no','message',{channel:'email',message:'Other'})],edges:[['entry','update'],['update','split'],['split','yes'],['split','no']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user:{...user,emailSubscriptionStatus:'unsubscribed',subscribed:false},at:'2026-11-12T00:00:00Z'});
 assert.equal(result.steps.find(step=>step.nodeId==='split').routing.nextNodeId,'yes');
 assert.equal(result.steps.at(-1).eligibility.eligible,false);assert.equal(result.steps.at(-1).status,'skipped');
 assert.equal(result.steps.some(step=>step.nodeId==='no'),false);
});
test('preview fails closed for foreign users, cyclic paths and unconfigured side effect components',async()=>{
 const base={canvasId:'preview',workspaceId:'local',wizard:wizard(),user,at:'2026-11-12T00:00:00Z'};
 await assert.rejects(runPreview({...base,user:{...user,attributes:{workspaceId:'foreign'}},graph:{nodes:[node('entry','entry')],edges:[]}}),/workspace/i);
 const cycle=await runPreview({...base,graph:{nodes:[node('entry','entry'),node('loop','delay',{durationHours:1})],edges:[['entry','loop'],['loop','entry']]}});
 assert.equal(cycle.status,'blocked');assert.match(cycle.warnings.join(' '),/loop/i);
 const agent=await runPreview({...base,graph:{nodes:[node('entry','entry'),node('agent','agent',{agentId:'agent',outputVariable:'response',outputType:'String'})],edges:[['entry','agent']]}});
 assert.equal(agent.status,'blocked');assert.match(agent.steps.at(-1).details.join(' '),/configured/i);
});
test('action path preview uses only scoped events and advances to the selected event time',async()=>{
 const graph={nodes:[node('entry','entry'),node('action','action_paths',{evaluationValue:2,evaluationUnit:'Hours',paths:[{id:'purchase',name:'Purchased',triggers:[{id:'t',type:'Perform Custom Event',eventName:'checkout'}],nextNodeId:'message'},{id:'everyone_else',name:'Everyone Else',exit:true}]}),node('message','message',{channel:'email',message:'Thanks'})],edges:[['entry','action'],['action','message']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z',eventInputs:[{kind:'custom',name:'checkout',at:'2026-11-12T00:10:00Z',workspaceId:'foreign',userId:user.id},{kind:'custom',name:'checkout',at:'2026-11-12T00:30:00Z',workspaceId:'local',userId:user.id}]});
 assert.equal(result.steps.at(-1).nodeId,'message');assert.equal(result.steps.at(-1).at,'2026-11-12T00:30:00.000Z');
 assert.equal(result.steps.find(step=>step.nodeId==='action').routing.pathId,'purchase');
});
test('test delivery receives the profile at each message arrival rather than the final updated profile',async()=>{
 const graph={nodes:[node('entry','entry'),node('before','message',{channel:'email',message:'{{tier}}'}),node('update','update',{attribute:'tier',value:'gold'}),node('after','message',{channel:'email',message:'{{tier}}'})],edges:[['entry','before'],['before','update'],['update','after']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z'});
 assert.equal(result.steps.find(step=>step.nodeId==='before').message.profile.tier,'free');assert.equal(result.steps.at(-1).message.profile.tier,'gold');
});
test('messages after an Action Path use the matching supplied event properties',async()=>{
 const graph={nodes:[node('entry','entry'),node('action','action_paths',{evaluationValue:1,evaluationUnit:'Hours',paths:[{id:'checkout',name:'Checkout',triggers:[{id:'t',type:'Perform Custom Event',eventName:'checkout'}],nextNodeId:'message'},{id:'everyone_else',name:'Everyone Else',exit:true}]}),node('message','message',{channel:'email',message:'Total {{event_properties.total}}'})],edges:[['entry','action'],['action','message']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z',eventInputs:[{kind:'custom',name:'unrelated',at:'2026-11-12T00:05:00Z',workspaceId:'local',userId:user.id,properties:{total:10}},{kind:'custom',name:'checkout',at:'2026-11-12T00:15:00Z',workspaceId:'local',userId:user.id,properties:{total:50}}]});
 assert.equal(result.steps.at(-1).message.body,'Total 50');
 assert.equal(result.steps.at(-1).message.profile.event_properties.total,50);
});
test('entry audience mismatch is displayed while the test user continues, and skipped messages also continue',async()=>{
 const settings=wizard();settings.audience.filters=[{id:'country',field:'country',operator:'is',value:'CA'}];
 const graph={nodes:[node('entry','entry'),node('message','message',{channel:'email',message:'Hello'}),node('after','update',{attribute:'tier',value:'gold'})],edges:[['entry','message'],['message','after']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:settings,user:{...user,subscribed:false,emailSubscriptionStatus:'unsubscribed'},at:'2026-11-12T00:00:00Z'});
 assert.equal(result.steps[0].eligibility.eligible,false);assert.equal(result.steps[1].status,'skipped');assert.equal(result.steps.at(-1).nodeId,'after');assert.equal(result.profileAfter.tier,'gold');
});
test('message variants honor saved allocation and an explicit test variant selection',async()=>{
 const graph={nodes:[node('entry','entry'),node('email','message',{channel:'email',message:'Base',variants:[{id:'a',name:'A',body:'First {{first_name}}'},{id:'b',name:'B',body:'Second {{first_name}}'}],variantSplits:[0,100]})],edges:[['entry','email']]},base={canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z'};
 const allocated=await runPreview(base);assert.equal(allocated.steps.at(-1).message.variantId,'b');assert.equal(allocated.steps.at(-1).message.body,'Second Ada');
 const selected=await runPreview({...base,messageVariants:{email:'a'}});assert.equal(selected.steps.at(-1).message.variantId,'a');assert.equal(selected.steps.at(-1).message.body,'First Ada');
});
test('read-only message eligibility supplies real workspace reasons without ending the preview',async()=>{
 const graph={nodes:[node('entry','entry'),node('message','message',{channel:'sms',message:'Hello',subscriptionGroupId:'sms'}),node('after','update',{attribute:'tier',value:'gold'})],edges:[['entry','message'],['message','after']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z',messageEligibility:()=>({eligible:false,reasons:['The user has not subscribed to this SMS group.']})});
 assert.equal(result.steps[1].eligibility.eligible,false);assert.match(result.steps[1].eligibility.reasons.join(' '),/SMS group/);assert.equal(result.steps.at(-1).nodeId,'after');
});
test('scoped content blocks are expanded before Liquid rendering without allocating links or changing the profile',async()=>{
 const graph={nodes:[node('entry','entry'),node('message','message',{channel:'email',message:'{{content_blocks.${welcome}}}'})],edges:[['entry','message']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z',variables:{content_blocks:{welcome:'Welcome {{first_name}}, {{tier}} member.'}}});
 assert.equal(result.steps.at(-1).message.body,'Welcome Ada, free member.');
});
test('future event inputs do not overwrite explicit Canvas entry properties',async()=>{
 const graph={nodes:[node('entry','entry'),node('message','message',{channel:'email',message:'Entry {{canvas_entry_properties.offer}}'})],edges:[['entry','message']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user,at:'2026-11-12T00:00:00Z',variables:{canvas_entry_properties:{offer:'Welcome'}},eventInputs:[{kind:'custom',name:'future',at:'2026-11-12T01:00:00Z',workspaceId:'local',userId:user.id,properties:{offer:'Later event'}}]});
 assert.equal(result.steps.at(-1).message.body,'Entry Welcome');
});
test('workspace eligibility can honor control-group exemptions for the specific Canvas and channel',async()=>{
 const graph={nodes:[node('entry','entry'),node('message','message',{channel:'email',message:'Exempt message'})],edges:[['entry','message']]};
 const result=await runPreview({canvasId:'preview',workspaceId:'local',graph,wizard:wizard(),user:{...user,globalControlGroup:true},messageEligibility:()=>({eligible:true,reasons:[]})});
 assert.equal(result.steps.at(-1).eligibility.eligible,true);
});
