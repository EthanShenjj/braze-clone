import type {CanvasOptimizerComponent} from './canvas-builder-model.ts';
import {canvasOptimizerComponentTypes} from './canvas-builder-model.ts';

export type CanvasConnectorKind='agent'|'audience_sync'|'optimizer'|'destination';
export type CanvasConnectorErrorCode='configuration_required'|'invalid_configuration'|'invalid_input'|'timeout'|'provider_rejected'|'provider_unavailable'|'invalid_response';
export class CanvasConnectorError extends Error{
 readonly code:CanvasConnectorErrorCode;readonly kind:CanvasConnectorKind;readonly retryable:boolean;readonly statusCode?:number;
 constructor(kind:CanvasConnectorKind,code:CanvasConnectorErrorCode,message:string,retryable=false,statusCode?:number){super(message);this.name='CanvasConnectorError';this.kind=kind;this.code=code;this.retryable=retryable;this.statusCode=statusCode;}
}
export type CanvasConnectorInput={kind:CanvasConnectorKind;jobId:string;workspaceId:string;canvasId:string;nodeId:string;userId:string;config:Record<string,unknown>;profile:Record<string,unknown>;context:Record<string,unknown>;entryProperties?:Record<string,unknown>;test?:boolean};
export type CanvasConnectorResult={status:'completed'|'accepted';output?:unknown;providerId?:string;details?:Record<string,unknown>};
export type CanvasConnectorOptimizerOutput={selections:Record<string,string>}|{components:CanvasOptimizerComponent[]};
export type CanvasConnectorCapability={kind:CanvasConnectorKind;configured:boolean;reason:string|null;timeoutMs:number};
type Settings={endpoint:URL;apiKey:string;timeoutMs:number};

function connectorSettings(kind:CanvasConnectorKind):Settings{
 const prefix={agent:'CANVAS_AGENT',destination:'CANVAS_AGENT',audience_sync:'CANVAS_AUDIENCE_SYNC',optimizer:'CANVAS_OPTIMIZER'}[kind];
 if(!prefix)throw new CanvasConnectorError(kind,'invalid_input','Choose a supported Canvas connector kind.');
 const raw=process.env[`${prefix}_ENDPOINT`]?.trim(),apiKey=process.env[`${prefix}_API_KEY`]?.trim();
 if(!raw||!apiKey)throw new CanvasConnectorError(kind,'configuration_required',`Configure ${prefix}_ENDPOINT and ${prefix}_API_KEY on the server to run this step.`);
 const timeoutMs=process.env.CANVAS_CONNECTOR_TIMEOUT_MS===undefined?30000:Number(process.env.CANVAS_CONNECTOR_TIMEOUT_MS);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new CanvasConnectorError(kind,'invalid_configuration','Set CANVAS_CONNECTOR_TIMEOUT_MS to an integer from 1 to 120000.');
 let endpoint:URL;
 try{endpoint=new URL(raw);}catch{throw new CanvasConnectorError(kind,'invalid_configuration',`Configure ${prefix}_ENDPOINT as a valid HTTPS URL.`);}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
 if(endpoint.username||endpoint.password||endpoint.hash||endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&process.env.NODE_ENV!=='production'&&loopback))throw new CanvasConnectorError(kind,'invalid_configuration',`${prefix}_ENDPOINT must use HTTPS without URL credentials or fragments. HTTP loopback is allowed only in development or tests.`);
 if(apiKey.length>16384||/[\u0000-\u0020\u007f]/.test(apiKey))throw new CanvasConnectorError(kind,'invalid_configuration',`Configure ${prefix}_API_KEY as a valid bearer credential.`);
 return{endpoint,apiKey,timeoutMs};
}

/** Reports configuration availability only; it does not invent a successful provider health check. */
export function canvasConnectorCapability(kind:CanvasConnectorKind):CanvasConnectorCapability{
 try{const settings=connectorSettings(kind);return{kind,configured:true,reason:null,timeoutMs:settings.timeoutMs};}
 catch(error){return{kind,configured:false,reason:error instanceof CanvasConnectorError?error.message:'Configure the Canvas connector on the server.',timeoutMs:30000};}
}

function object(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
const payloadLimit=1048576;
function boundedJson(value:unknown,kind:CanvasConnectorKind,code:'invalid_input'|'invalid_response'):string{
 try{
  const active=new Set<object>();let budget=payloadLimit;
  const visit=(item:unknown,depth:number):void=>{
   if(depth>20)throw new Error();
   if(item===null){budget-=4;return;}
   if(typeof item==='string'){budget-=Buffer.byteLength(item,'utf8')+2;}
   else if(typeof item==='number'){if(!Number.isFinite(item))throw new Error();budget-=String(item).length;}
   else if(typeof item==='boolean')budget-=item?4:5;
   else if(typeof item==='object'){
    if(active.has(item)||!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)throw new Error();
    active.add(item);budget-=2;
    if(Array.isArray(item)){for(const child of item){budget--;visit(child,depth+1);}}
    else for(const [key,child] of Object.entries(item)){if(child===undefined)continue;budget-=Buffer.byteLength(key,'utf8')+4;visit(child,depth+1);}
    active.delete(item);
   }else throw new Error();
   if(budget<0)throw new Error();
  };
  visit(value,0);const text=JSON.stringify(value);if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>payloadLimit)throw new Error();return text;
 }catch{throw new CanvasConnectorError(kind,code,'Canvas connector data must be valid JSON of at most 1 MiB and 20 nesting levels. Reduce the payload or correct the response mapping.');}
}
async function responsePayload(response:Response,kind:CanvasConnectorKind):Promise<unknown>{
 const invalid=()=>new CanvasConnectorError(kind,'invalid_response','The Canvas connector must return valid JSON of at most 1 MiB. Check its response mapping.');
 if(!response.body||Number(response.headers.get('content-length')??0)>payloadLimit||!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw invalid();}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>payloadLimit){await reader.cancel();throw invalid();}chunks.push(value);}}
 finally{reader.releaseLock();}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));}catch{throw invalid();}
}
const outputTypes=['String','Number','Boolean','Array','Object','Time'];
function validTime(value:unknown):boolean{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)||!Number.isFinite(Date.parse(value)))return false;
 const calendar=Date.parse(value.slice(0,10)+'T00:00:00Z');return Number.isFinite(calendar)&&new Date(calendar).toISOString().slice(0,10)===value.slice(0,10);
}
function agentOutputValid(value:unknown,type:string):boolean{return type==='String'?typeof value==='string':type==='Number'?typeof value==='number'&&Number.isFinite(value):type==='Boolean'?typeof value==='boolean':type==='Array'?Array.isArray(value):type==='Object'?object(value):type==='Time'?validTime(value):false;}
function identifier(value:unknown):value is string{return typeof value==='string'&&Boolean(value.trim())&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value);}
function optimizerComponentsValid(value:unknown,mode:'input'|'generated',generating=false):value is CanvasOptimizerComponent[]{
 if(!Array.isArray(value)||value.length<1||value.length>7)return false;
 const ids=new Set<string>(),types=new Set<string>();
 return value.every(component=>{
  if(!object(component)||!identifier(component.id)||ids.has(component.id)||!canvasOptimizerComponentTypes.includes(component.type as CanvasOptimizerComponent['type'])||types.has(String(component.type))||!Array.isArray(component.variants)||component.variants.length>20)return false;
  ids.add(component.id);types.add(String(component.type));
  const variantIds=new Set<string>();
  if(!component.variants.every(variant=>{if(!object(variant)||!identifier(variant.id)||variantIds.has(variant.id)||typeof variant.value!=='string'||variant.value.length>32768||mode==='generated'&&!variant.value.trim())return false;variantIds.add(variant.id);return true;}))return false;
  return mode==='generated'?component.variants.length>0:generating||component.variants.filter(variant=>String(variant.value).trim()).length>=2;
 });
}
function optimizerOutputValid(value:unknown,config:Record<string,unknown>):boolean{
 if(!object(value)||Object.keys(value).length!==1||!optimizerComponentsValid(config.optimizerComponents,'input',config.operation==='generate'))return false;
 const components=config.optimizerComponents;
 if(Object.hasOwn(value,'selections'))return config.operation!=='generate'&&object(value.selections)&&Object.keys(value.selections).length===components.length&&components.every(component=>Object.hasOwn(value.selections as object,component.id)&&component.variants.some(variant=>variant.value.trim()&&variant.id===(value.selections as Record<string,unknown>)[component.id]));
 if(!Object.hasOwn(value,'components')||config.operation!=='generate'||!optimizerComponentsValid(value.components,'generated')||value.components.length!==components.length)return false;
 return components.every(component=>(value.components as CanvasOptimizerComponent[]).some(result=>result.id===component.id&&result.type===component.type));
}
const allowedConfig:Record<CanvasConnectorKind,string[]>={agent:['agentId','outputVariable','outputType','instructions','agentInstructions'],destination:['destinationType','destinationId','instructions'],audience_sync:['partner','accountId','audienceId','operation'],optimizer:['channel','optimizationEvent','optimizerComponents','instructions','operation']};
function requestPayload(input:CanvasConnectorInput):Record<string,unknown>{
 const scope={workspaceId:input.workspaceId,canvasId:input.canvasId,nodeId:input.nodeId,userId:input.userId};
 if(!/^[A-Za-z0-9:_./-]{1,200}$/.test(input.jobId)||Object.values(scope).some(value=>typeof value!=='string'||!value.trim()||value.length>512||/[\u0000-\u001f\u007f]/.test(value))||!object(input.config)||!object(input.profile)||!object(input.context)||input.entryProperties!==undefined&&!object(input.entryProperties)||input.test!==undefined&&typeof input.test!=='boolean')throw new CanvasConnectorError(input.kind,'invalid_input','Supply a valid job ID, workspace, Canvas, step, user, profile and context.');
 const config=Object.fromEntries(allowedConfig[input.kind].filter(key=>Object.hasOwn(input.config,key)).map(key=>[key,input.config[key]]));
 if(input.kind==='agent'&&(typeof config.agentId!=='string'||!config.agentId.trim()||typeof config.outputVariable!=='string'||!/^\w+$/.test(config.outputVariable)||!outputTypes.includes(String(config.outputType))))throw new CanvasConnectorError(input.kind,'invalid_input','Configure the agent, output context variable and String, Number, Boolean, Array, Object or Time output type.');
 if(input.kind==='audience_sync'&&(typeof config.partner!=='string'||!config.partner.trim()||config.operation!==undefined&&!['add','remove'].includes(String(config.operation))))throw new CanvasConnectorError(input.kind,'invalid_input','Choose an Audience Sync partner and a supported add or remove operation.');
 if(input.kind==='destination'&&(!['agent','canvas'].includes(String(config.destinationType))||typeof config.destinationId!=='string'||!config.destinationId.trim()))throw new CanvasConnectorError(input.kind,'invalid_input','Choose a destination type and destination ID.');
 if(input.kind==='optimizer'&&(!['email','push','sms'].includes(String(config.channel))||config.optimizationEvent!==undefined&&!['opens','clicks'].includes(String(config.optimizationEvent))||config.operation!==undefined&&!['select','generate'].includes(String(config.operation))||!optimizerComponentsValid(config.optimizerComponents,'input',config.operation==='generate')))throw new CanvasConnectorError(input.kind,'invalid_input','Choose a supported optimizer channel, operation, event and valid content components.');
 const ref=input.kind==='agent'?{agentId:config.agentId}:input.kind==='destination'?{destinationType:config.destinationType,destinationId:config.destinationId}:input.kind==='audience_sync'?{partner:config.partner,accountId:config.accountId,audienceId:config.audienceId}:{componentIds:Array.isArray(config.optimizerComponents)?config.optimizerComponents.map(component=>object(component)?component.id:undefined):[]};
 return{version:1,kind:input.kind,jobId:input.jobId,scope,ref,config,profile:input.profile,context:input.context,...(input.entryProperties!==undefined?{entryProperties:input.entryProperties}:{}),test:input.test===true};
}

export async function executeCanvasConnector(input:CanvasConnectorInput):Promise<CanvasConnectorResult>{
 const settings=connectorSettings(input.kind),body=boundedJson(requestPayload(input),input.kind,'invalid_input'),controller=new AbortController();
 const dispatched=JSON.parse(body) as {kind:CanvasConnectorKind;jobId:string;config:Record<string,unknown>},kind=dispatched.kind,config=dispatched.config;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new CanvasConnectorError(kind,'timeout','The Canvas connector timed out. Retry this job using the same job ID.',true));},settings.timeoutMs);});
 try{
  return await Promise.race([(async()=>{
   const response=await fetch(settings.endpoint,{method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json','Idempotency-Key':dispatched.jobId},body,signal:controller.signal,redirect:'error',cache:'no-store'});
   if(!response.ok)throw new CanvasConnectorError(kind,'provider_rejected',`The Canvas connector rejected this job (HTTP ${response.status}). Check its credentials and configuration before retrying.`,response.status===408||response.status===429||response.status>=500,response.status);
   const payload=await responsePayload(response,kind);
   if(object(payload)&&(['rejected','failed','error'].includes(String(payload.status))||payload.success===false||payload.accepted===false||payload.error!==undefined&&payload.error!==null&&payload.error!==false&&payload.error!==''))throw new CanvasConnectorError(kind,'provider_rejected','The Canvas connector rejected this job. Check its provider configuration and resource permissions.');
   const responseJson=boundedJson(payload,kind,'invalid_response');
   if(responseJson.includes(JSON.stringify(settings.apiKey).slice(1,-1)))throw new CanvasConnectorError(kind,'invalid_response','The Canvas connector response exposed a server credential. Correct its response mapping.');
   if(!object(payload)||!['accepted','completed'].includes(String(payload.status))||response.status===202&&payload.status!=='accepted')throw new CanvasConnectorError(kind,'invalid_response','The Canvas connector must return an explicit accepted or completed status; HTTP 202 must remain accepted.');
   if(payload.providerId!==undefined&&(typeof payload.providerId!=='string'||!payload.providerId.trim()||payload.providerId.length>512||/[\u0000-\u001f\u007f]/.test(payload.providerId))||payload.status==='accepted'&&typeof payload.providerId!=='string'||payload.details!==undefined&&!object(payload.details))throw new CanvasConnectorError(kind,'invalid_response','The Canvas connector must return a valid provider ID for accepted jobs and a JSON object for details.');
   if(payload.status==='completed'&&kind==='agent'&&(!Object.hasOwn(payload,'output')||!agentOutputValid(payload.output,String(config.outputType))))throw new CanvasConnectorError(kind,'invalid_response',`The agent must return output matching its configured ${config.outputType} type. Check the connector response mapping.`);
   if(payload.status==='completed'&&kind==='optimizer'&&!optimizerOutputValid(payload.output,config))throw new CanvasConnectorError(kind,'invalid_response','The optimizer must return valid selections from the authored variants, or requested generated components with matching IDs and types. Limit each generated value to 32768 characters.');
   return{status:payload.status as CanvasConnectorResult['status'],...(Object.hasOwn(payload,'output')?{output:payload.output}:{}),...(typeof payload.providerId==='string'?{providerId:payload.providerId}:{}),...(object(payload.details)?{details:payload.details}:{})};
  })(),timeout]);
 }catch(error){if(error instanceof CanvasConnectorError)throw error;throw new CanvasConnectorError(kind,controller.signal.aborted?'timeout':'provider_unavailable',controller.signal.aborted?'The Canvas connector timed out. Retry this job using the same job ID.':'The Canvas connector could not be reached. Check its configuration and retry this job.',true);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
