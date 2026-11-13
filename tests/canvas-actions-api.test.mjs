import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'canvas-actions-api-')),'test.sqlite');process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts'),launch=await import('../app/api/canvases/[id]/launch/route.ts');
const graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'update',kind:'update',label:'Updated',x:0,y:100,config:{attribute:'touched',value:'yes'}}],edges:[['entry','update']]};
const canvas=store.createCanvas({name:'Scoped launch',workspaceId:'private-workspace',graph}),ctx={params:Promise.resolve({id:canvas.id})};
const resources=await import('../app/api/resources/[type]/route.ts');
const graphApi=await import('../app/api/canvases/[id]/graph/route.ts');
const detailsApi=await import('../app/api/canvases/[id]/route.ts');
test('Canvas launch refuses a foreign workspace before changing status or enrolling anyone',async()=>{
 const response=await launch.POST(new Request('http://localhost/api/canvases/test/launch?workspaceId=foreign',{method:'POST'}),ctx);
 assert.equal(response.status,404);assert.equal(store.getCanvas(canvas.id).status,'Draft');assert.equal(store.getCanvasWorkspace(canvas.id).runs.length,0);
});
test('Canvas graph saves reject foreign workspace IDs before updating the draft',async()=>{
 const before=store.getCanvasWorkspace(canvas.id),request=new Request('http://localhost/api/canvases/test/graph?workspaceId=foreign',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({graph:{...graph,nodes:graph.nodes.map(node=>({...node,label:'Foreign edit'}))},updatedAt:before.updatedAt})});
 assert.equal((await graphApi.PUT(request,ctx)).status,404);assert.deepEqual(store.getCanvasWorkspace(canvas.id).graph,before.graph);
});
test('Canvas detail and mutation routes default to local scope when no workspace is provided',async()=>{
 assert.equal((await detailsApi.GET(new Request('http://localhost/api/canvases/test'),ctx)).status,404);
 const body=JSON.stringify({name:'Foreign edit',action:'duplicate'}),request=method=>new Request('http://localhost/api/canvases/test',{method,headers:{'Content-Type':'application/json'},body});
 assert.equal((await detailsApi.PATCH(request('PATCH'),ctx)).status,404);assert.equal((await detailsApi.POST(request('POST'),ctx)).status,404);
});
test('generic resource actions cannot create or rewrite Canvas execution records or bypass launch',async()=>{
 for(const type of ['canvas','canvas-runtime-state','canvas-context','canvas-sms-deliveries','canvas-message-timing']){
  const context={params:Promise.resolve({type})},request=new Request('http://localhost/api/resources/'+type,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Fake execution',data:{workspaceId:'private-workspace'},status:'Active'})});
  assert.equal((await resources.POST(request,context)).status,400,type);
 }
 assert.equal(store.getCanvas(canvas.id).status,'Draft');
});
test('readiness checks SQLite and a configured worker heartbeat without assuming shared container PIDs',async()=>{
 const health=await import('../app/api/health/route.ts'),file=join(tmpdir(),'canvas-web-health-'+process.pid+'.json');
 assert.equal((await health.GET()).status,200);
 process.env.CANVAS_WORKER_HEALTH_FILE=file;
 try{
  writeFileSync(file,JSON.stringify({schemaVersion:1,pid:99999999,status:'idle',heartbeatAt:new Date().toISOString(),consecutiveFailures:0}));assert.equal((await health.GET()).status,200);
  writeFileSync(file,JSON.stringify({schemaVersion:1,status:'idle',heartbeatAt:'2000-01-01T00:00:00Z',consecutiveFailures:0}));assert.equal((await health.GET()).status,503);
  writeFileSync(file,JSON.stringify({schemaVersion:1,status:'error',heartbeatAt:new Date().toISOString(),consecutiveFailures:1}));assert.equal((await health.GET()).status,503);
 }finally{delete process.env.CANVAS_WORKER_HEALTH_FILE;}
});
