import test from 'node:test';
import assert from 'node:assert/strict';
import {CanvasConnectorError,canvasConnectorCapability,executeCanvasConnector} from '../lib/canvas-connectors.ts';

const envNames=['NODE_ENV','CANVAS_AGENT_ENDPOINT','CANVAS_AGENT_API_KEY','CANVAS_AUDIENCE_SYNC_ENDPOINT','CANVAS_AUDIENCE_SYNC_API_KEY','CANVAS_OPTIMIZER_ENDPOINT','CANVAS_OPTIMIZER_API_KEY','CANVAS_CONNECTOR_TIMEOUT_MS'];
const initial=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
test.beforeEach(()=>{for(const name of envNames)delete process.env[name];process.env.NODE_ENV='test';});
test.afterEach(()=>{for(const name of envNames){if(initial[name]===undefined)delete process.env[name];else process.env[name]=initial[name];}});
const input={kind:'agent',jobId:'job-1',workspaceId:'workspace-1',canvasId:'canvas-1',nodeId:'step-1',userId:'user-1',config:{agentId:'agent-1',outputVariable:'score',outputType:'Number',instructions:'Score this profile',agentInstructions:'Use actual context'},profile:{first_name:'Sam'},context:{tier:'gold'},entryProperties:{source:'web'},test:true};

test('missing or invalid connector configuration reports an actionable typed error without claiming capability',async()=>{
 assert.equal(canvasConnectorCapability('agent').configured,false);
 assert.match(canvasConnectorCapability('agent').reason,/CANVAS_AGENT_ENDPOINT/);
 await assert.rejects(executeCanvasConnector(input),error=>error instanceof CanvasConnectorError&&error.code==='configuration_required'&&error.kind==='agent'&&error.retryable===false);
 process.env.CANVAS_AGENT_ENDPOINT='http://provider.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 assert.equal(canvasConnectorCapability('agent').configured,false);
 await assert.rejects(executeCanvasConnector(input),error=>error.code==='invalid_configuration'&&error.message.includes('HTTPS')&&!error.message.includes('test-only-private-key'));
});

test('agent execution sends actual scoped inputs with bearer authentication and a stable job idempotency key',async t=>{
 process.env.CANVAS_AGENT_ENDPOINT='https://agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(String(url),'https://agent.example.test/jobs');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  const headers=new Headers(options.headers);
  assert.equal(headers.get('Authorization'),'Bearer test-only-private-key');assert.equal(headers.get('Idempotency-Key'),'job-1');assert.equal(headers.get('Content-Type'),'application/json');assert.equal(options.signal instanceof AbortSignal,true);
  assert.deepEqual(JSON.parse(options.body),{version:1,kind:'agent',jobId:'job-1',scope:{workspaceId:'workspace-1',canvasId:'canvas-1',nodeId:'step-1',userId:'user-1'},ref:{agentId:'agent-1'},config:{agentId:'agent-1',outputVariable:'score',outputType:'Number',instructions:'Score this profile',agentInstructions:'Use actual context'},profile:{first_name:'Sam'},context:{tier:'gold'},entryProperties:{source:'web'},test:true});
  return Response.json({status:'completed',providerId:'provider-1',output:42,details:{model:'configured-agent'}});
 });
 assert.equal(canvasConnectorCapability('agent').configured,true);
 assert.deepEqual(await executeCanvasConnector({...input,config:{...input.config,apiKey:'must-not-forward',endpoint:'https://untrusted.example.test'}}),{status:'completed',providerId:'provider-1',output:42,details:{model:'configured-agent'}});
});

test('agent completed outputs strictly match the configured context variable type without coercion',async t=>{
 process.env.CANVAS_AGENT_ENDPOINT='https://agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 let output;
 t.mock.method(globalThis,'fetch',async()=>Response.json({status:'completed',output}));
 const cases=[['String','42',true],['String',42,false],['Number',42,true],['Number','42',false],['Number',null,false],['Boolean',false,true],['Boolean','false',false],['Array',[1,'a',false],true],['Array',{value:1},false],['Object',{score:1},true],['Object',[],false],['Object',null,false],['Time','2026-11-12T10:00:00.000Z',true],['Time','2026-11-12T18:00:00+08:00',true],['Time','2026-02-30T10:00:00.000Z',false],['Time','2026-11-12',false],['Time',1762941600000,false]];
 for(const [outputType,value,valid] of cases){
  output=value;
  if(valid)assert.deepEqual((await executeCanvasConnector({...input,config:{...input.config,outputType}})).output,value);
  else await assert.rejects(executeCanvasConnector({...input,config:{...input.config,outputType}}),error=>error instanceof CanvasConnectorError&&error.code==='invalid_response',`${outputType} must reject ${JSON.stringify(value)}`);
 }
});

test('Audience Sync preserves accepted versus completed and refuses contradictory or rejected provider responses',async t=>{
 process.env.CANVAS_AUDIENCE_SYNC_ENDPOINT='https://audience.example.test/jobs';process.env.CANVAS_AUDIENCE_SYNC_API_KEY='audience-private-key';
 let payload={status:'accepted',providerId:'sync-1'},status=202;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(String(url),'https://audience.example.test/jobs');assert.equal(new Headers(options.headers).get('Authorization'),'Bearer audience-private-key');
  const request=JSON.parse(options.body);assert.equal(request.kind,'audience_sync');assert.deepEqual(request.ref,{partner:'Google Ads',accountId:'account-1',audienceId:'audience-1'});assert.deepEqual(request.scope,{workspaceId:'workspace-1',canvasId:'canvas-1',nodeId:'step-1',userId:'user-1'});
  return Response.json(payload,{status});
 });
 const sync={...input,kind:'audience_sync',config:{partner:'Google Ads',accountId:'account-1',audienceId:'audience-1',operation:'add'}};
 assert.deepEqual(await executeCanvasConnector(sync),{status:'accepted',providerId:'sync-1'});
 payload={status:'completed',providerId:'sync-1',details:{matched:true}};status=200;
 assert.deepEqual(await executeCanvasConnector(sync),{status:'completed',providerId:'sync-1',details:{matched:true}});
 status=202;
 await assert.rejects(executeCanvasConnector(sync),error=>error.code==='invalid_response');
 status=200;payload={status:'rejected',error:'audience-private-key'};
 await assert.rejects(executeCanvasConnector(sync),error=>error.code==='provider_rejected'&&!error.message.includes('audience-private-key'));
 payload={status:'completed',accepted:false};
 await assert.rejects(executeCanvasConnector(sync),error=>error.code==='provider_rejected');
 payload={status:'accepted'};
 await assert.rejects(executeCanvasConnector(sync),error=>error.code==='invalid_response');
});

test('Optimizer only returns valid authored selections or bounded component content supplied by its actual provider',async t=>{
 process.env.CANVAS_OPTIMIZER_ENDPOINT='https://optimizer.example.test/jobs';process.env.CANVAS_OPTIMIZER_API_KEY='optimizer-private-key';
 let output={selections:{subject:'s2'}};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(String(url),'https://optimizer.example.test/jobs');assert.equal(JSON.parse(options.body).kind,'optimizer');
  return Response.json({status:'completed',providerId:'optimizer-1',output});
 });
 const optimizer={...input,kind:'optimizer',config:{channel:'email',optimizationEvent:'clicks',optimizerComponents:[{id:'subject',type:'Subject',variants:[{id:'s1',value:'Hello'},{id:'s2',value:'Welcome'}]}]}};
 assert.deepEqual((await executeCanvasConnector(optimizer)).output,{selections:{subject:'s2'}});
 output={components:[{id:'subject',type:'Subject',variants:[{id:'provider-new',value:'A real provider suggestion'}]}]};
 assert.deepEqual((await executeCanvasConnector({...optimizer,config:{...optimizer.config,operation:'generate'}})).output,{components:[{id:'subject',type:'Subject',variants:[{id:'provider-new',value:'A real provider suggestion'}]}]});
 const invalid=[{selections:{subject:'invented'}},{selections:{}},{selections:{subject:'s1'},components:[]},{components:[{id:'foreign',type:'Subject',variants:[{id:'new',value:'No'}]}]},{components:[{id:'subject',type:'Body Content',variants:[{id:'new',value:'No'}]}]},{components:[{id:'subject',type:'Subject',variants:[{id:'new',value:' ' }]}]},{components:[{id:'subject',type:'Subject',variants:[{id:'new',value:'x'.repeat(32769)}]}]},{components:[{id:'subject',type:'Subject',variants:[{id:'same',value:'One'},{id:'same',value:'Two'}]}]}];
 for(const value of invalid){output=value;await assert.rejects(executeCanvasConnector({...optimizer,config:{...optimizer.config,...(value.components?{operation:'generate'}:{})}}),error=>error.code==='invalid_response');}
});

test('connector payload limits reject oversized, deeply nested and malformed data with safe typed errors',async t=>{
 process.env.CANVAS_AGENT_ENDPOINT='https://agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 let response=()=>Response.json({status:'completed',output:'ok'});
 t.mock.method(globalThis,'fetch',async()=>response());
 const textInput={...input,config:{...input.config,outputType:'String'}};
 await assert.rejects(executeCanvasConnector({...textInput,profile:{large:'x'.repeat(1048576)}}),error=>error.code==='invalid_input');
 const deep={};let node=deep;for(let depth=0;depth<25;depth++){node.next={};node=node.next;}
 await assert.rejects(executeCanvasConnector({...textInput,context:deep}),error=>error.code==='invalid_input');
 const circular={};circular.self=circular;
 await assert.rejects(executeCanvasConnector({...textInput,profile:circular}),error=>error.code==='invalid_input');
 response=()=>Response.json({status:'completed',output:'x'.repeat(1048576)});
 await assert.rejects(executeCanvasConnector(textInput),error=>error.code==='invalid_response');
 response=()=>Response.json({status:'completed',output:deep});
 await assert.rejects(executeCanvasConnector({...input,config:{...input.config,outputType:'Object'}}),error=>error.code==='invalid_response');
 response=()=>new Response('{broken json',{headers:{'Content-Type':'application/json'}});
 await assert.rejects(executeCanvasConnector(textInput),error=>error.code==='invalid_response');
 response=()=>Response.json({status:'completed',output:'test-only-private-key'});
 await assert.rejects(executeCanvasConnector(textInput),error=>error.code==='invalid_response'&&!error.message.includes('test-only-private-key'));
});

test('provider HTTP rejection, transport failure and timeout stay typed, actionable and free of credentials',async t=>{
 process.env.CANVAS_AGENT_ENDPOINT='https://agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 let mode='unauthorized',signal;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  signal=options.signal;
  if(mode==='unauthorized')return new Response('test-only-private-key',{status:401});
  if(mode==='unavailable')return new Response('test-only-private-key',{status:503});
  if(mode==='network')throw new Error('Failed with test-only-private-key');
  return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Aborted with test-only-private-key')),{once:true}));
 });
 await assert.rejects(executeCanvasConnector(input),error=>error.code==='provider_rejected'&&error.statusCode===401&&error.retryable===false&&!error.message.includes('test-only-private-key'));
 mode='unavailable';await assert.rejects(executeCanvasConnector(input),error=>error.code==='provider_rejected'&&error.statusCode===503&&error.retryable===true);
 mode='network';await assert.rejects(executeCanvasConnector(input),error=>error.code==='provider_unavailable'&&error.retryable===true&&!error.message.includes('test-only-private-key'));
 mode='timeout';process.env.CANVAS_CONNECTOR_TIMEOUT_MS='10';
 await assert.rejects(executeCanvasConnector(input),error=>error.code==='timeout'&&error.retryable===true&&!error.message.includes('test-only-private-key'));
 assert.equal(signal.aborted,true);
});

test('destination reuses agent credentials while retaining its own kind, and HTTP loopback is rejected in production',async t=>{
 process.env.CANVAS_AGENT_ENDPOINT='http://127.0.0.1:8123/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 assert.equal(canvasConnectorCapability('destination').configured,true);
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const request=JSON.parse(options.body);assert.equal(request.kind,'destination');assert.deepEqual(request.ref,{destinationType:'agent',destinationId:'decision-1'});assert.equal(new Headers(options.headers).get('Authorization'),'Bearer test-only-private-key');
  return Response.json({status:'accepted',providerId:'destination-1'},{status:202});
 });
 assert.deepEqual(await executeCanvasConnector({...input,kind:'destination',config:{destinationType:'agent',destinationId:'decision-1'}}),{status:'accepted',providerId:'destination-1'});
 process.env.NODE_ENV='production';assert.equal(canvasConnectorCapability('destination').configured,false);
 await assert.rejects(executeCanvasConnector({...input,kind:'destination',config:{destinationType:'agent',destinationId:'decision-1'}}),error=>error.code==='invalid_configuration');
 process.env.NODE_ENV='test';
 for(const endpoint of ['http://localhost.evil.test/jobs','https://user:password@agent.example.test/jobs','https://agent.example.test/jobs#secret','not-a-url']){process.env.CANVAS_AGENT_ENDPOINT=endpoint;assert.equal(canvasConnectorCapability('agent').configured,false);}
});

test('agent response validation uses the dispatched configuration when the caller edits its draft during a request',async t=>{
 process.env.CANVAS_AGENT_ENDPOINT='https://agent.example.test/jobs';process.env.CANVAS_AGENT_API_KEY='test-only-private-key';
 const draft=structuredClone(input);
 t.mock.method(globalThis,'fetch',async()=>{draft.config.outputType='String';return Response.json({status:'completed',output:42});});
 assert.deepEqual(await executeCanvasConnector(draft),{status:'completed',output:42});
});
