import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {registerHooks} from 'node:module';
import {existsSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';

// Native project resolution only. The real server-only react-server export remains in use.
const resolver=String.raw`
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('@/'))return next(new URL('./'+specifier.slice(2)+'.ts',pathToFileURL(process.cwd()+'/')).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
`;
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(candidate.pathname)&&existsSync(fileURLToPath(candidate)+'.ts'))return next(candidate.href+'.ts',context);}return next(specifier,context);}});
const directory=mkdtempSync(join(tmpdir(),'canvas-runtime-concurrency-')),databasePath=join(directory,'runtime.sqlite');process.env.BRAZE_DATABASE_PATH=databasePath;process.env.MESSAGE_DELIVERY_ENABLED='false';
const store=await import('../lib/braze-store.ts'),{defaultCanvasWizard}=await import('../lib/canvas-wizard-model.ts'),root=fileURLToPath(new URL('../',import.meta.url)),node=process.env.CANVAS_RUNTIME_NODE??process.execPath;

function worker(canvasId,at,userIds,profileField,profileValue,wrapped=false){
 const source=resolver+String.raw`
await import('server-only');
const store=await import('./lib/braze-store.ts');
const canvas=store.getCanvas(process.env.CONCURRENCY_CANVAS_ID);
const go=new Promise(resolve=>process.once('message',resolve));process.send({phase:'ready',pid:process.pid});await go;
try{
 store.applyProfileRows(JSON.parse(process.env.CONCURRENCY_USERS).map(id=>({external_id:id,attributes:{[process.env.CONCURRENCY_PROFILE_FIELD]:Number(process.env.CONCURRENCY_PROFILE_VALUE)}})),canvas.workspaceId);
 let operation;
 if(process.env.CONCURRENCY_WRAPPED==='true')store.workspaceTransaction(()=>{
  store.getCanvas(process.env.CONCURRENCY_CANVAS_ID);
  // Only the synchronous due-delay work before processCanvasRuntime's first await is
  // enclosed here. The synchronous workspace transaction does not span async work.
  operation=store.processCanvasRuntime(process.env.CONCURRENCY_AT,1000);
 });else operation=store.processCanvasRuntime(process.env.CONCURRENCY_AT,1000);
 const result=await operation;process.send({phase:'done',pid:process.pid,resumed:result.resumed,wrapped:process.env.CONCURRENCY_WRAPPED==='true'});
}
catch(error){process.send({phase:'failed',pid:process.pid,code:error.code,errcode:error.errcode,message:error.message,stack:error.stack});process.exitCode=1;}
finally{process.disconnect();}
`;
 const child=spawn(node,['--conditions=react-server','--experimental-transform-types','--input-type=module','--eval',source],{cwd:root,env:{...process.env,NODE_ENV:'test',BRAZE_DATABASE_PATH:databasePath,MESSAGE_DELIVERY_ENABLED:'false',CONCURRENCY_CANVAS_ID:canvasId,CONCURRENCY_AT:at,CONCURRENCY_WRAPPED:String(wrapped),CONCURRENCY_USERS:JSON.stringify(userIds),CONCURRENCY_PROFILE_FIELD:profileField,CONCURRENCY_PROFILE_VALUE:String(profileValue)},stdio:['ignore','pipe','pipe','ipc']});let stderr='',result,ready=false;
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});child.stdout.resume();
 const started=new Promise((resolve,reject)=>{child.on('message',message=>{if(message.phase==='ready'){ready=true;resolve(message);}else result=message;});child.once('error',reject);child.once('exit',(code,signal)=>{if(!ready)reject(new Error('Worker exited before its independent database connection was ready: '+JSON.stringify({code,signal,stderr})));});});
 const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,result,stderr}));});return{child,started,finished};
}

test('two independent Node processes ingest profiles and claim 80 delays once, directly and through a synchronous API transaction',{timeout:60000},async t=>{
 const workspaceId='real_process_concurrency',userIds=Array.from({length:80},(_,index)=>'concurrent_user_'+String(index).padStart(3,'0'));store.applyProfileRows(userIds.map(id=>({external_id:id,email:id+'@example.test',country:'US',attributes:{workspaceId}})),workspaceId);
 const wizard=structuredClone(defaultCanvasWizard);wizard.entry.timing='immediate';wizard.audience.filters=[{id:'us',field:'country',operator:'is',value:'US'}];wizard.audience.reentryEnabled=true;wizard.audience.reentryMode='window';wizard.audience.reentryValue=1;wizard.audience.reentryUnit='Hours';
 const canvas=store.createCanvas({name:'Real process concurrency',workspaceId,wizard,graph:{nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'delay',kind:'delay',label:'Delay',x:0,y:100,config:{durationHours:1}},{id:'increment',kind:'update',label:'Count one actual continuation',x:0,y:200,config:{updateMode:'ui',updates:[{id:'count',attribute:'actual_resume_count',action:'increment',value:'1'}]}}],edges:[['entry','delay'],['delay','increment']]}});
 for(const round of [{enteredAt:'2026-11-12T12:00:00.000Z',dueAt:'2026-11-12T13:00:00.000Z',wrapped:false,expected:1},{enteredAt:'2026-11-12T14:00:00.000Z',dueAt:'2026-11-12T15:00:00.000Z',wrapped:true,expected:2}]){
  const run=store.launchCanvasGraph(canvas.id,{at:round.enteredAt});assert.equal(run.entered,80);assert.equal(run.completed,0);
  const one=worker(canvas.id,round.dueAt,userIds,'profile_worker_one',round.expected,round.wrapped),two=worker(canvas.id,round.dueAt,userIds,'profile_worker_two',round.expected);t.after(async()=>{for(const current of [one,two])if(current.child.exitCode===null)current.child.kill('SIGKILL');await Promise.allSettled([one.finished,two.finished]);});
  const readiness=await Promise.all([one.started,two.started]);assert.notEqual(readiness[0].pid,readiness[1].pid);one.child.send({go:true});two.child.send({go:true});
  const results=await Promise.all([one.finished,two.finished]);for(const result of results){assert.equal(result.code,0,JSON.stringify(result));assert.equal(result.signal,null);assert.equal(result.result.phase,'done');assert.doesNotMatch(JSON.stringify(result),/SQLITE_BUSY_SNAPSHOT|"errcode":517/);}assert.equal(results[0].result.wrapped,round.wrapped);assert.equal(results[1].result.wrapped,false);assert.equal(results.reduce((sum,result)=>sum+result.result.resumed,0),80);
  const final=store.getCanvasWorkspace(canvas.id).runs.find(row=>row.id===run.id);assert.equal(final.entered,80);assert.equal(final.completed,80);assert.equal(final.traces.length,80);for(const id of userIds){const attributes=store.getUser(id).attributes;assert.equal(attributes.actual_resume_count,round.expected,id);assert.equal(attributes.profile_worker_one,round.expected,id);assert.equal(attributes.profile_worker_two,round.expected,id);}
  const verification=new DatabaseSync(databasePath,{readOnly:true});try{assert.equal(verification.prepare('PRAGMA journal_mode').get().journal_mode,'wal');assert.equal(verification.prepare('SELECT count(*) AS n FROM canvas_pending_steps WHERE run_id=?').get(run.id).n,0);assert.equal(verification.prepare("SELECT count(*) AS n FROM resources WHERE type='canvas-runtime-state' AND json_extract(data_json,'$.kind')='enrollment' AND json_extract(data_json,'$.runId')=? AND status='Completed'").get(run.id).n,80);}finally{verification.close();}
 }
});
