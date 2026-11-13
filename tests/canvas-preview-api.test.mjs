import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const path=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(path.pathname)&&existsSync(fileURLToPath(path)+'.ts'))return nextResolve(path.href+'.ts',context);}return nextResolve(specifier,context);}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'canvas-preview-')),'test.sqlite');process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts'),api=await import('../app/api/canvases/[id]/test/route.ts'),evaluation=await import('../app/api/canvases/[id]/evaluation/route.ts');
const node=(id,kind,config={})=>({id,label:id,kind,config,x:0,y:0}),graph={nodes:[node('entry','entry'),node('update','update',{attribute:'tier',value:'gold'}),node('email','message',{channel:'email',message:'Hello {{first_name}} {{custom_attribute.${tier}}}'})],edges:[['entry','update'],['update','email']]};
const canvas=store.createCanvas({name:'Preview API',workspaceId:'preview-workspace',graph});
store.applyProfileRows([{external_id:'preview-user',email:'preview@example.test',first_name:'Ada',attributes:{tier:'free'}}],'preview-workspace');store.applyProfileRows([{external_id:'foreign-user',email:'foreign@example.test'}],'foreign-workspace');
const ctx={params:Promise.resolve({id:canvas.id})},request=input=>new Request('http://localhost/api/canvases/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
test('test API stores a preview while leaving real profile and message events untouched',async()=>{
 const before=store.getUser('preview-user'),db=new DatabaseSync(process.env.BRAZE_DATABASE_PATH),events=db.prepare('SELECT count(*) n FROM message_events').get().n;
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',at:'2026-11-12T00:00:00Z'}),ctx),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.preview.steps.at(-1).message.body,'Hello Ada gold');assert.deepEqual(body.deliveries,[]);
 assert.deepEqual(store.getUser('preview-user'),before);assert.equal(db.prepare('SELECT count(*) n FROM message_events').get().n,events);db.close();
 assert.equal(store.getResource(body.runId).type,'canvas-test-runs');assert.equal(store.getResource(body.runId).data.workspaceId,'preview-workspace');
});
test('test API rejects foreign canvas/user IDs and requires explicit recipients before sending',async()=>{
 for(const input of [{workspaceId:'foreign-workspace',userId:'foreign-user'},{workspaceId:'preview-workspace',userId:'foreign-user'}])assert.equal((await api.POST(request(input),ctx)).status,404);
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',sendMessages:true,recipients:{}}),ctx)).status,400);
 const response=await api.GET(new Request('http://localhost/api/canvases/test?workspaceId=preview-workspace&q=user'),ctx),body=await response.json();assert.equal(body.users.some(user=>user.id==='foreign-user'),false);assert.equal(body.users.some(user=>user.id==='preview-user'),true);
});
test('evaluation API persists findings, isolates Standard IDs and exposes stored step results',async()=>{
 const standard=store.createResource({type:'campaign-standards',name:'Subject required',data:{workspaceId:'preview-workspace',rules:[{id:'subject',type:'required',field:'subject',nodeKinds:['message']}]}}),foreign=store.createResource({type:'campaign-standards',name:'Foreign',data:{workspaceId:'foreign-workspace',rules:[]}});
 assert.equal((await evaluation.POST(request({workspaceId:'preview-workspace',standardIds:[foreign.id]}),ctx)).status,404);
 const response=await evaluation.POST(request({workspaceId:'preview-workspace',standardIds:[standard.id]}),ctx),body=await response.json();assert.equal(response.status,200);assert.equal(body.run.status,'failed');assert.equal(body.run.findings[0].nodeId,'email');assert.equal(store.getResource(body.runId).type,'canvas-evaluations');
 const results=await evaluation.GET(new Request('http://localhost/api/canvases/test?workspaceId=preview-workspace&nodeId=email'),ctx);assert.equal((await results.json()).data[0].data.run.findings[0].status,'failed');
});
test('single-step evaluation evaluates only that step and rejects foreign step IDs',async()=>{
 const standard=store.createResource({type:'campaign-standards',name:'A message exists',data:{workspaceId:'preview-workspace',rules:[{id:'message',type:'required',field:'message'}]}});
 const response=await evaluation.POST(request({workspaceId:'preview-workspace',standardIds:[standard.id],nodeId:'email'}),ctx),body=await response.json();
 assert.deepEqual(body.run.findings.map(row=>row.nodeId),['email']);assert.equal(body.run.status,'passed');
 assert.equal((await evaluation.POST(request({workspaceId:'preview-workspace',standardIds:[standard.id],nodeId:'foreign-step'}),ctx)).status,404);
});
test('explicit test send with disabled provider stays prepared rather than recording delivery',async()=>{
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',sendMessages:true,recipients:{email:'test-recipient@example.test'}}),ctx),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.deliveries.length,1);assert.equal(body.deliveries[0].delivered,false);assert.notEqual(body.deliveries[0].status,'delivered');assert.equal(store.getUser('preview-user').attributes.tier,'free');
});
test('legacy decision conditions use the simulated profile when previewing through the API',async()=>{
 const branched=store.createCanvas({name:'Legacy decision preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('split','branch',{attribute:'country',value:'CA',branchTargets:{yes:'canada',no:'other'}}),node('canada','message',{channel:'email',message:'Canada'}),node('other','message',{channel:'email',message:'Elsewhere'})],edges:[['entry','split'],['split','canada'],['split','other']]}});
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user'}),{params:Promise.resolve({id:branched.id})}),body=await response.json();assert.equal(body.preview.steps.at(-1).nodeId,'other');
});
test('test API validates message variant IDs against this Canvas before previewing the selected variant',async()=>{
 const variants=store.createCanvas({name:'Variant test preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('email','message',{channel:'email',message:'Base',variants:[{id:'a',name:'A',body:'First'},{id:'b',name:'B',body:'Second'}]})],edges:[['entry','email']]}}),context={params:Promise.resolve({id:variants.id})};
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',messageVariants:{email:'b'}}),context),body=await response.json();assert.equal(body.preview.steps.at(-1).message.body,'Second');
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',messageVariants:{foreign:'b'}}),context)).status,400);
});
test('message Liquid only receives content blocks from the Canvas workspace',async()=>{
 store.createResource({type:'content-blocks',name:'scoped-welcome',data:{workspaceId:'foreign-workspace',content:'Foreign text'}});store.createResource({type:'content-blocks',name:'scoped-welcome',data:{workspaceId:'preview-workspace',content:'Welcome {{first_name}}'}});
 const blocks=store.createCanvas({name:'Scoped block preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('email','message',{channel:'email',message:'{{content_blocks.${scoped-welcome}}}'})],edges:[['entry','email']]}});
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user'}),{params:Promise.resolve({id:blocks.id})}),body=await response.json();assert.equal(body.preview.steps.at(-1).message.body,'Welcome Ada');
});
test('preview reports real same-workspace channel membership eligibility and leaves the profile unchanged',async()=>{
 const group=store.createSubscriptionGroup({name:'Preview SMS group',channel:'SMS'},'preview-workspace'),sms=store.createCanvas({name:'SMS eligibility preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('sms','message',{channel:'sms',message:'Hello',subscriptionGroupId:group.id}),node('after','update',{attribute:'tier',value:'simulated'})],edges:[['entry','sms'],['sms','after']]}}),before=store.getUser('preview-user');
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user'}),{params:Promise.resolve({id:sms.id})}),body=await response.json();
 assert.equal(body.preview.steps[1].eligibility.eligible,false);assert.match(body.preview.steps[1].eligibility.reasons.join(' '),/subscribed.*group/);assert.equal(body.preview.steps.at(-1).nodeId,'after');assert.deepEqual(store.getUser('preview-user'),before);
});

test('Agent test API uses authored fallback without a provider and invokes a scoped test connector only after opt-in',async()=>{
 const agent=store.createResource({type:'canvas-step-agents',name:'Preview agent',status:'Active',data:{workspaceId:'preview-workspace',objective:'Preview a response',instructions:'Use the profile.',fallbackOutput:'Configured fallback'}});
 const subject=store.createCanvas({name:'Agent preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('update','update',{attribute:'tier',value:'gold'}),node('agent','agent',{agentId:agent.id,outputVariable:'answer',outputType:'String'}),node('email','message',{channel:'email',message:'{{canvas_context.answer}}'})],edges:[['entry','update'],['update','agent'],['agent','email']]}}),context={params:Promise.resolve({id:subject.id})};
 const before=store.getUser('preview-user'),received=[],saved={endpoint:process.env.CANVAS_AGENT_ENDPOINT,key:process.env.CANVAS_AGENT_API_KEY,fetch:globalThis.fetch};
 process.env.CANVAS_AGENT_ENDPOINT='https://agent-preview.example.test/run';process.env.CANVAS_AGENT_API_KEY='preview-test-key';
 // Replace only the external HTTP boundary; use the actual API, connector validation and SQLite store.
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://agent-preview.example.test/run');const input=JSON.parse(options.body);received.push(input);return Response.json({status:'completed',output:`Provider ${input.profile.tier}`});};
 try{
  const fallback=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',agentTests:{agent:{execute:false}}}),context),fallbackBody=await fallback.json();
  assert.equal(fallbackBody.preview.steps.at(-1).message.body,'Configured fallback');assert.equal(received.length,0);
  const db=new DatabaseSync(process.env.BRAZE_DATABASE_PATH),quota=db.prepare('SELECT count(*) n FROM frequency_dispatches').get().n,events=db.prepare('SELECT count(*) n FROM message_events').get().n;
  const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',agentTests:{agent:{execute:true,context:'cart contents'}}}),context),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.preview.steps.at(-1).message.body,'Provider gold');assert.equal(received.length,1);assert.equal(received[0].test,true);assert.equal(received[0].scope.workspaceId,'preview-workspace');assert.match(received[0].config.instructions,/cart contents/);assert.deepEqual(store.getUser('preview-user'),before);assert.equal(db.prepare('SELECT count(*) n FROM frequency_dispatches').get().n,quota);assert.equal(db.prepare('SELECT count(*) n FROM message_events').get().n,events);db.close();
 }finally{globalThis.fetch=saved.fetch;for(const [key,value] of [['CANVAS_AGENT_ENDPOINT',saved.endpoint],['CANVAS_AGENT_API_KEY',saved.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('Agent test API rejects foreign Agent resources and malformed execution choices',async()=>{
 const agent=store.createResource({type:'canvas-step-agents',name:'Foreign preview agent',status:'Active',data:{workspaceId:'foreign-workspace',objective:'Preview a response',instructions:'Foreign instructions'}}),subject=store.createCanvas({name:'Foreign agent preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('agent','agent',{agentId:agent.id,outputVariable:'answer',outputType:'String'})],edges:[['entry','agent']]}}),context={params:Promise.resolve({id:subject.id})};
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',agentTests:{agent:{execute:true}}}),context)).status,404);
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',agentTests:{agent:{execute:'yes'}}}),context)).status,400);
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',agentTests:{missing:{execute:true}}}),context)).status,400);
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',agentTests:null}),context)).status,400);
});

test('Optimizer test API validates authored component IDs before preview without generating content',async()=>{
 const subject=store.createCanvas({name:'Authored optimizer preview',workspaceId:'preview-workspace',graph:{nodes:[node('entry','entry'),node('optimizer','optimizer',{channel:'email',message:"{% message_component 'Body Content' %}",optimizerComponents:[{id:'body',type:'Body Content',variants:[{id:'first',value:'First {{first_name}}'},{id:'second',value:'Second {{first_name}}'}]}]})],edges:[['entry','optimizer']]}}),context={params:Promise.resolve({id:subject.id})};
 const response=await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',optimizerSelections:{optimizer:{body:'second'}}}),context),body=await response.json();assert.equal(response.status,200);assert.equal(body.preview.steps.at(-1).message.body,'Second Ada');
 assert.equal((await api.POST(request({workspaceId:'preview-workspace',userId:'preview-user',optimizerSelections:{optimizer:{body:'foreign'}}}),context)).status,400);
});
