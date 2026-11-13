#!/usr/bin/env node
import {mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import path from 'node:path';

function positiveInteger(value,label,max=Number.MAX_SAFE_INTEGER){
  if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1||Number(value)>max)throw new Error(`${label} must be a positive integer${max===2147483647?' no greater than 2147483647':''}.`);
  return Number(value);
}
function options(argv){
  const result={once:false,help:false,healthCheck:false,at:undefined,limit:process.env.CANVAS_WORKER_LIMIT?positiveInteger(process.env.CANVAS_WORKER_LIMIT,'CANVAS_WORKER_LIMIT'):undefined,intervalMs:positiveInteger(process.env.CANVAS_WORKER_INTERVAL_MS??10000,'Worker interval',2147483647),staleAfterMs:positiveInteger(process.env.CANVAS_WORKER_HEALTH_STALE_MS??45000,'Health timeout',2147483647),healthFile:process.env.CANVAS_WORKER_HEALTH_FILE??path.join(path.dirname(process.env.BRAZE_DATABASE_PATH??path.join(process.cwd(),'.data','braze.sqlite')),'canvas-worker-health.json')};
  for(let index=0;index<argv.length;index++){
    const arg=argv[index];
    if(arg==='--once')result.once=true;
    else if(arg==='--help'||arg==='-h')result.help=true;
    else if(arg==='--health-check')result.healthCheck=true;
    else if(['--at','--limit','--interval-ms','--health-file','--stale-after-ms'].includes(arg)){
      const value=argv[++index];
      if(value===undefined||value.startsWith('--'))throw new Error(`Provide a value for ${arg}.`);
      if(arg==='--at'){
        if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Provide --at as an ISO timestamp with a time zone.');
        result.at=new Date(value).toISOString();
      }else if(arg==='--limit')result.limit=positiveInteger(value,'Runtime limit');
      else if(arg==='--interval-ms')result.intervalMs=positiveInteger(value,'Worker interval',2147483647);
      else if(arg==='--stale-after-ms')result.staleAfterMs=positiveInteger(value,'Health timeout',2147483647);
      else if(!value.trim())throw new Error('Provide a health file path.');
      else result.healthFile=path.resolve(value);
    }else throw new Error('Unknown worker option. Use --help for supported options.');
  }
  if(result.at&&!result.once)throw new Error('--at requires --once so periodic workers use the current clock.');
  if(result.once&&result.healthCheck)throw new Error('Choose either --once or --health-check.');
  return result;
}
const safeCodes=new Set(['EACCES','EPERM','ENOENT','ENOTDIR','EEXIST','ENOSPC','EROFS','EBUSY','EMFILE','ENFILE','EIO','SQLITE_BUSY','SQLITE_LOCKED','ERR_SQLITE_ERROR','ERR_SQLITE_BUSY','ERR_MODULE_NOT_FOUND','ERR_REQUIRE_CYCLE_MODULE','CANVAS_RUNTIME_UNAVAILABLE']);
const code=error=>safeCodes.has(error?.code)?error.code:'CANVAS_RUNTIME_ERROR';
const log=(event,fields={})=>console.log(JSON.stringify({event,...fields}));

function checkHealth(config){
  try{
    const health=JSON.parse(readFileSync(config.healthFile,'utf8')),age=Date.now()-Date.parse(health.heartbeatAt);
    if(health.schemaVersion!==1||!['running','idle'].includes(health.status)||health.consecutiveFailures!==0||!Number.isFinite(age)||age<0||age>config.staleAfterMs||!Number.isSafeInteger(health.pid)||health.pid<=0)return false;
    process.kill(health.pid,0);
    return true;
  }catch{return false;}
}

async function work(config){
  const startedAt=new Date().toISOString();
  const health={schemaVersion:1,pid:process.pid,status:'starting',startedAt,heartbeatAt:startedAt,intervalMs:config.intervalMs,lastStartedAt:null,lastFinishedAt:null,lastSucceededAt:null,lastRunAt:null,lastErrorCode:null,successfulPasses:0,consecutiveFailures:0,stoppedAt:null};
  mkdirSync(path.dirname(config.healthFile),{recursive:true});
  const publish=()=>{
    health.heartbeatAt=new Date().toISOString();
    const temporary=`${config.healthFile}.${process.pid}.tmp`;
    writeFileSync(temporary,`${JSON.stringify(health)}\n`,{mode:0o600});
    renameSync(temporary,config.healthFile);
  };
  let stopping=false,fatal=false,onceFailed=false,wake=()=>{},waitTimer;
  const stop=()=>{stopping=true;health.status='stopping';wake();};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  publish();
  const heartbeat=setInterval(()=>{
    try{publish();}catch(error){fatal=true;stopping=true;health.status='error';health.lastErrorCode=code(error);process.exitCode=1;wake();}
  },Math.min(5000,Math.max(250,Math.floor(config.intervalMs/2))));
  log('canvas_worker_started',{pid:process.pid,intervalMs:config.intervalMs});
  try{
    const {processCanvasRuntime}=await import('../lib/braze-store.ts');
    if(typeof processCanvasRuntime!=='function')throw Object.assign(new Error('Canvas runtime is unavailable.'),{code:'CANVAS_RUNTIME_UNAVAILABLE'});
    while(!stopping){
      const at=config.at??new Date().toISOString();
      health.status='running';health.lastStartedAt=new Date().toISOString();health.lastRunAt=at;publish();
      try{
        await processCanvasRuntime(at,config.limit);
        health.lastSucceededAt=new Date().toISOString();health.successfulPasses++;health.consecutiveFailures=0;health.lastErrorCode=null;health.status=stopping?'stopping':'idle';
        log('canvas_runtime_pass_completed',{at,successfulPasses:health.successfulPasses});
      }catch(error){
        health.consecutiveFailures++;health.lastErrorCode=code(error);health.status='error';
        log('canvas_runtime_pass_failed',{code:health.lastErrorCode,consecutiveFailures:health.consecutiveFailures});
        if(config.once){onceFailed=true;process.exitCode=1;}
      }
      health.lastFinishedAt=new Date().toISOString();publish();
      if(config.once||stopping)break;
      await new Promise(resolve=>{wake=resolve;waitTimer=setTimeout(resolve,config.intervalMs);});
      clearTimeout(waitTimer);wake=()=>{};
    }
  }catch(error){
    fatal=true;health.status='error';health.lastErrorCode=code(error);health.consecutiveFailures++;process.exitCode=1;
    log('canvas_worker_failed',{code:health.lastErrorCode});
  }finally{
    clearInterval(heartbeat);clearTimeout(waitTimer);process.off('SIGTERM',stop);process.off('SIGINT',stop);
    health.stoppedAt=new Date().toISOString();
    if(!fatal&&!onceFailed)health.status='stopped';
    publish();log('canvas_worker_stopped',{status:health.status,successfulPasses:health.successfulPasses});
  }
}

let config;
try{config=options(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=2;}
if(config){
  if(config.help)console.log('Canvas worker: --once [--at <ISO timestamp>] [--limit <positive integer>] | --interval-ms <milliseconds>\nHealth: --health-check [--health-file <path>] [--stale-after-ms <milliseconds>]\nRun with Node 22.22.3+, --conditions=react-server --experimental-transform-types --import ./scripts/register-runtime.mjs.');
  else if(config.healthCheck)process.exitCode=checkHealth(config)?0:1;
  else await work(config).catch(error=>{log('canvas_worker_failed',{code:code(error)});process.exitCode=1;});
}
