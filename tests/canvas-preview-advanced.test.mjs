import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreview} from '../lib/canvas-preview.ts';
import {defaultCanvasWizard} from '../lib/canvas-wizard-model.ts';
const node=(id,kind,config={})=>({id,label:id,kind,config,x:0,y:0});
const user={id:'advanced-preview-user',email:'ada@example.test',firstName:'Ada',country:'US',lifecycle:'New',subscribed:true,emailSubscriptionStatus:'subscribed',reachable:true,attributes:{workspaceId:'local',tier:'free'}};
const base={canvasId:'advanced-preview',workspaceId:'local',wizard:structuredClone(defaultCanvasWizard),user,at:'2026-11-12T00:00:00Z'};

test('preview follows the assigned top-level variant target and never falls back when its mapping is missing',async()=>{
 const graph={variants:[{id:'a',name:'A',weight:0},{id:'b',name:'B',weight:100}],nodes:[node('entry','entry',{variantTargets:{a:'left',b:'right'}}),node('left','message',{channel:'email',message:'Wrong path'}),node('right','message',{channel:'email',message:'Assigned path'})],edges:[['entry','left'],['entry','right']]};
 const result=await runPreview({...base,graph});assert.equal(result.steps.at(-1).message.body,'Assigned path');
 graph.nodes[0].config.variantTargets={a:'left'};
 const missing=await runPreview({...base,graph});assert.equal(missing.status,'blocked');assert.equal(missing.steps.some(step=>step.message),false);
});

test('Winning Path preview normalizes real path weights and skips the holdout window',async()=>{
 const graph={nodes:[node('entry','entry'),node('experiment','experiment_paths',{winningPath:true,winningPathDelayWeight:80,experimentWindowDays:30,paths:[{id:'a',name:'A',weight:20,nextNodeId:'message'},{id:'b',name:'B',weight:0,exit:true}]}),node('message','message',{channel:'email',message:'Immediately'})],edges:[['entry','experiment'],['experiment','message']]};
 const result=await runPreview({...base,graph});assert.equal(result.status,'completed');assert.equal(result.steps.at(-1).at,'2026-11-12T00:00:00.000Z');assert.equal(result.steps.at(-1).message.body,'Immediately');assert.match(result.steps[1].details.join(' '),/Delay Group.*skip|skip.*Delay Group/i);
});

test('advanced actions show expected actions without executing side effects and continue the path',async()=>{
 const graph={nodes:[node('entry','entry'),node('flag','feature_flag',{featureFlagId:'flag_one'}),node('sync','audience_sync',{partner:'Google Ads',audienceId:'audience_one',operation:'add'}),node('destination','destination',{destinationType:'canvas',destinationId:'canvas_two'}),node('message','message',{channel:'email',message:'Still previewing'})],edges:[['entry','flag'],['flag','sync'],['sync','destination'],['destination','message']]};
 const result=await runPreview({...base,graph});assert.equal(result.status,'completed');assert.equal(result.steps.at(-1).message.body,'Still previewing');
 for(const step of result.steps.slice(1,4)){assert.equal(step.status,'skipped');assert.equal(step.action.sideEffectsSkipped,true);assert.equal(step.action.mode,'preview');}
 assert.equal(result.steps[2].action.expected.audienceId,'audience_one');assert.equal(result.steps[3].action.expected.destinationId,'canvas_two');assert.deepEqual(user,base.user);
});

test('an explicit authored Agent fallback flows into later context without calling its service',async()=>{
 const graph={nodes:[node('entry','entry'),node('agent','agent',{agentId:'agent_one',outputVariable:'score',outputType:'Number'}),node('message','message',{channel:'email',message:'Score {{canvas_context.score}}'})],edges:[['entry','agent'],['agent','message']]};
 const result=await runPreview({...base,graph,agentTests:{agent:{execute:false,fallbackValue:0}},services:{executeAgent:async()=>{throw Error('Agent must not be invoked.');}}});
 assert.equal(result.status,'completed');assert.equal(result.steps.at(-1).message.body,'Score 0');assert.equal(result.steps[1].action.mode,'fallback');assert.equal(result.steps[1].action.sideEffectsSkipped,true);assert.equal(user.attributes.score,undefined);
});

test('Agent execution requires opt-in and receives cloned preview profile, context and explicit test context',async()=>{
 const graph={nodes:[node('entry','entry'),node('update','update',{attribute:'tier',value:'gold'}),node('agent','agent',{agentId:'agent_one',outputVariable:'answer',outputType:'String'}),node('message','message',{channel:'email',message:'{{canvas_context.answer}}'})],edges:[['entry','update'],['update','agent'],['agent','message']]};
 const result=await runPreview({...base,graph,agentTests:{agent:{execute:true,context:'cart contents'}},services:{executeAgent:async request=>{assert.equal(request.test,true);assert.equal(request.workspaceId,'local');return{status:'completed',output:`${request.profile.tier}: ${request.testContext}`};}}});
 assert.equal(result.steps.at(-1).message.body,'gold: cart contents');assert.equal(result.steps[2].action.mode,'executed_test');assert.equal(user.attributes.tier,'free');
 const missing=await runPreview({...base,graph});assert.equal(missing.status,'blocked');assert.match(missing.steps.at(-1).details.join(' '),/fallback|choice/i);
});

test('Agent fallback values must match the configured output type',async()=>{
 const result=await runPreview({...base,graph:{nodes:[node('entry','entry'),node('agent','agent',{agentId:'agent_one',outputVariable:'score',outputType:'Number'})],edges:[['entry','agent']]},agentTests:{agent:{execute:false,fallbackValue:'invented'}}});
 assert.equal(result.status,'blocked');assert.match(result.steps.at(-1).details.join(' '),/Number/);
});

test('Content Optimizer previews authored components without generation or invented outcomes',async()=>{
 const graph={nodes:[node('entry','entry'),node('optimizer','optimizer',{channel:'email',subject:"{% message_component 'Subject' %}",message:"{% message_component 'Body Content' %}",optimizerComponents:[{id:'subject',type:'Subject',variants:[{id:'one',value:'Welcome {{first_name}}'},{id:'two',value:'Hello {{first_name}}'}]},{id:'body',type:'Body Content',variants:[{id:'one',value:'Member {{tier}}'},{id:'two',value:'Tier {{tier}}'}]}]})],edges:[['entry','optimizer']]};
 const result=await runPreview({...base,graph,optimizerSelections:{optimizer:{subject:'two',body:'one'}}});
 assert.equal(result.status,'completed');assert.equal(result.steps.at(-1).message.subject,'Hello Ada');assert.equal(result.steps.at(-1).message.body,'Member free');assert.deepEqual(result.steps.at(-1).message.optimizerSelections,{subject:'two',body:'one'});assert.match(result.steps.at(-1).details.join(' '),/authored/i);
});

test('unsupported JSON User Update is skipped in Test Canvas instead of modifying the simulated profile',async()=>{
 const graph={nodes:[node('entry','entry'),node('update','update',{updateMode:'json',updateJson:'{"tier":"gold"}'}),node('message','message',{channel:'email',message:'{{tier}}'})],edges:[['entry','update'],['update','message']]};
 const result=await runPreview({...base,graph});assert.equal(result.steps[1].status,'skipped');assert.equal(result.steps.at(-1).message.body,'free');assert.equal(result.profileAfter.tier,'free');
});
