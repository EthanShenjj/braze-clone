import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCanvas} from '../lib/canvas-evaluation.ts';
const graph={nodes:[{id:'entry',label:'Entry',kind:'entry',x:0,y:0},{id:'email',label:'Email',kind:'message',x:1,y:1,config:{channel:'email',message:'Welcome',subject:''}}],edges:[['entry','email']]};
const standard=(id,data)=>({id,type:'campaign-standards',name:id,status:'Active',description:'',updatedAt:'2026-11-12',data:{workspaceId:'local',...data}});
test('local structural standards produce real per-step pass and fail findings',async()=>{
 const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('required',{rules:[{id:'subject',type:'required',field:'subject',nodeKinds:['message'],channels:['email']},{id:'length',type:'max_length',field:'message',value:20,nodeKinds:['message']} ]})]});
 assert.equal(result.status,'failed');assert.deepEqual(result.findings.map(row=>[row.nodeId,row.ruleId,row.status]),[['email','subject','failed'],['email','length','passed']]);
});
test('semantic standards require the actual configured HTTPS service and cannot pass from matching keywords',async()=>{
 const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('tone',{instructions:'Use a friendly welcome tone'})]});
 assert.equal(result.status,'configuration_required');assert.equal(result.findings[0].status,'configuration_required');
 assert.match(result.findings[0].message,/HTTPS/i);
});
test('foreign standards and malformed structural rules are never treated as passing',async()=>{
 await assert.rejects(evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('foreign',{workspaceId:'else',rules:[]})]}),/workspace/i);
 const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('bad',{rules:[{id:'x',type:'guess',field:'subject'}]})]});
 assert.equal(result.status,'error');assert.match(result.findings[0].message,/Unsupported/i);
});
test('semantic connector validates step findings and reports provider errors instead of passing',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({findings:[{nodeId:'email',status:'failed',message:'Missing required offer details'}]});
  const input={canvasId:'c',workspaceId:'local',graph,standards:[standard('tone',{instructions:'Offer details'})],connector:{endpoint:'https://standards.example.test/evaluate',timeoutMs:100}};
  const failed=await evaluateCanvas(input);assert.equal(failed.status,'failed');assert.equal(failed.findings[0].message,'Missing required offer details');
  globalThis.fetch=async()=>Response.json({findings:[{nodeId:'foreign',status:'passed',message:'OK'}]});
  const malformed=await evaluateCanvas(input);assert.equal(malformed.status,'error');assert.match(malformed.findings[0].message,/invalid|unknown|missing/i);
  globalThis.fetch=async()=>new Response('Unavailable',{status:503});
  const unavailable=await evaluateCanvas(input);assert.equal(unavailable.status,'error');assert.match(unavailable.findings[0].message,/503/);
 }finally{globalThis.fetch=old;}
});
test('structural rule descriptions do not silently opt into semantic evaluation',async()=>{
 const configured=standard('local',{rules:[{id:'body',type:'required',field:'message',nodeKinds:['message']}]});configured.description='Require a message body.';
 const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[configured]});
 assert.equal(result.status,'passed');assert.equal(result.findings[0].source,'structural');
});
test('semantic timeout is recorded as an error with no passing findings',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Aborted'))));
  const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('tone',{instructions:'Review tone'})],connector:{endpoint:'https://standards.example.test',timeoutMs:100}});
  assert.equal(result.status,'error');assert.match(result.findings[0].message,/timed out/);
 }finally{globalThis.fetch=old;}
});
test('semantic Standards with an empty structural rules list still require the semantic service',async()=>{
 const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('semantic',{rules:[],instructions:'Verify the offer terms'})]});
 assert.equal(result.status,'configuration_required');assert.equal(result.findings[0].source,'semantic');
});
test('structural rules reject malformed optional values instead of reporting a pass',async()=>{
 const result=await evaluateCanvas({canvasId:'c',workspaceId:'local',graph,standards:[standard('invalid',{rules:[{id:'body',type:'required',field:'message',value:true}]})]});
 assert.equal(result.status,'error');assert.match(result.findings[0].message,/value/i);
});
