import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),node=process.env.CANVAS_RUNTIME_NODE??process.execPath;
const version=spawnSync(node,['--version'],{encoding:'utf8'}).stdout.trim().slice(1).split('.').map(Number);
const supported=version[0]===22&&(version[1]>22||version[1]===22&&version[2]>=3);
const flags=['--conditions=react-server','--experimental-transform-types','--import',path.join(root,'scripts/register-runtime.mjs')];
const worker=path.join(root,'scripts/canvas-worker.mjs');
const skip=supported?false:'Worker integration requires Node 22.22.3 or newer in Node 22.x.';
const env=(directory)=>({...process.env,NODE_ENV:'test',BRAZE_DATABASE_PATH:path.join(directory,'braze.sqlite'),CANVAS_WORKER_HEALTH_FILE:path.join(directory,'health.json'),MESSAGE_DELIVERY_ENABLED:'false'});
const run=(args,directory)=>spawnSync(node,[...flags,worker,...args],{cwd:root,env:env(directory),encoding:'utf8',timeout:30000});
async function healthWhen(file,predicate,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){try{const value=JSON.parse(await readFile(file,'utf8'));if(predicate(value))return value;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Worker did not reach the expected health state.');}

test('native runtime resolves project aliases and extensionless TS while using real server-only exports',{skip},()=>{
  const result=spawnSync(node,[...flags,'--input-type=module','-e',"import 'server-only'; import {smsMetrics} from '@/lib/sms-model'; import {canvasPaths} from './lib/canvas-step-model'; console.log(JSON.stringify({characters:smsMetrics('Hello').characters,paths:canvasPaths({kind:'experiment_paths',config:{paths:[{id:'p',name:'Path 1',weight:100}]}}).length}));"],{cwd:root,encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{characters:5,paths:1});
});

test('runtime resolution does not bypass the real server-only client guard',{skip},()=>{
  const result=spawnSync(node,flags.filter(flag=>flag!=='--conditions=react-server').concat(['--input-type=module','-e',"import 'server-only';"]),{cwd:root,encoding:'utf8',timeout:10000});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/cannot be imported from a Client Component/);
});

test('once mode starts the actual runtime on a persistent temporary SQLite database at a controlled instant',{skip},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'canvas-worker-once-'));
  try{
    const result=run(['--once','--at','2026-11-12T08:30:00Z','--limit','3'],directory);
    assert.equal(result.status,0,result.stderr);
    assert.ok((await stat(path.join(directory,'braze.sqlite'))).size>0);
    const health=JSON.parse(await readFile(path.join(directory,'health.json'),'utf8'));
    assert.equal(health.status,'stopped');
    assert.equal(health.successfulPasses,1);
    assert.equal(health.consecutiveFailures,0);
    assert.equal(health.lastRunAt,'2026-11-12T08:30:00.000Z');
    assert.ok(Number.isFinite(Date.parse(health.lastSucceededAt)));
    assert.deepEqual(Object.keys(health).sort(),['consecutiveFailures','heartbeatAt','intervalMs','lastErrorCode','lastFinishedAt','lastRunAt','lastStartedAt','lastSucceededAt','pid','schemaVersion','startedAt','status','stoppedAt','successfulPasses'].sort());
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('invalid runtime limits fail before opening a database',{skip},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'canvas-worker-invalid-'));
  try{
    const result=run(['--once','--limit','0'],directory);
    assert.equal(result.status,2);
    assert.match(result.stderr,/positive integer/);
    await assert.rejects(stat(path.join(directory,'braze.sqlite')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('a missing option value cannot consume the once flag and start a daemon',{skip},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'canvas-worker-option-'));
  try{
    const result=spawnSync(node,[...flags,worker,'--health-file','--once'],{cwd:directory,env:env(directory),encoding:'utf8',timeout:5000});
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/Provide a value for --health-file/);
    await assert.rejects(stat(path.join(directory,'braze.sqlite')),{code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('a runtime database failure exits once mode unsuccessfully and records metadata without exception contents',{skip},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'canvas-worker-failure-'));
  try{
    const blocker=path.join(directory,'not-a-directory');await writeFile(blocker,'blocked');
    const result=spawnSync(node,[...flags,worker,'--once'],{cwd:root,env:{...env(directory),BRAZE_DATABASE_PATH:path.join(blocker,'db.sqlite')},encoding:'utf8',timeout:30000});
    assert.equal(result.status,1,result.stderr);
    const health=JSON.parse(await readFile(path.join(directory,'health.json'),'utf8'));
    assert.equal(health.status,'error');
    assert.equal(health.consecutiveFailures,1);
    assert.equal(health.lastSucceededAt,null);
    assert.ok(['EEXIST','ENOTDIR'].includes(health.lastErrorCode));
    assert.ok(!JSON.stringify(health).includes(blocker));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('periodic mode runs the real runtime and SIGTERM interrupts its wait gracefully',{skip},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'canvas-worker-daemon-'));
  const child=spawn(node,[...flags,worker,'--interval-ms','60000'],{cwd:root,env:env(directory),stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  try{
    const first=await healthWhen(path.join(directory,'health.json'),value=>value.status==='idle'&&value.successfulPasses>=1);
    const check=spawnSync(node,[worker,'--health-check'],{cwd:root,env:env(directory),encoding:'utf8',timeout:10000});
    assert.equal(check.status,0,check.stderr);
    const pulse=await healthWhen(path.join(directory,'health.json'),value=>value.heartbeatAt!==first.heartbeatAt,8000);
    assert.equal(pulse.successfulPasses,first.successfulPasses);
    await writeFile(path.join(directory,'health.json'),JSON.stringify({...pulse,heartbeatAt:'2000-01-01T00:00:00.000Z'}));
    assert.equal(spawnSync(node,[worker,'--health-check'],{cwd:root,env:env(directory),timeout:10000}).status,1);
    child.kill('SIGTERM');
    const exit=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('SIGTERM did not stop the waiting worker.')),5000).unref())]);
    assert.deepEqual(exit,{code:0,signal:null},stderr);
    const health=JSON.parse(await readFile(path.join(directory,'health.json'),'utf8'));
    assert.equal(health.status,'stopped');
    assert.ok(health.stoppedAt);
    assert.equal(spawnSync(node,[worker,'--health-check'],{cwd:root,env:env(directory),timeout:10000}).status,1);
  }finally{if(child.exitCode===null)child.kill('SIGKILL');await exited;await rm(directory,{recursive:true,force:true});}
});
