import type {CanvasGraph,CanvasNode} from './canvas-model.ts';

export type CanvasStandard={id:string;name:string;type?:string;status?:string;description?:string;data:Record<string,unknown>};
export type CanvasStandardRule={id:string;type:'required'|'max_length'|'contains'|'forbidden_text'|'equals'|'one_of'|'https_url';field:string;value?:string|number|string[];nodeKinds?:string[];channels?:string[];message?:string};
export type CanvasEvaluationStatus='passed'|'failed'|'configuration_required'|'error';
export type CanvasEvaluationFinding={nodeId:string;standardId:string;standardName:string;ruleId:string;status:CanvasEvaluationStatus;message:string;source:'structural'|'semantic'};
export type CanvasEvaluationResult={canvasId:string;workspaceId:string;createdAt:string;status:CanvasEvaluationStatus;standardIds:string[];findings:CanvasEvaluationFinding[]};
export type CanvasEvaluationConnector={endpoint:string;apiKey?:string;timeoutMs?:number};
/** These rules inspect saved configuration; semantic instructions always require a connector. */
export const canvasStandardRuleSchema={
 $schema:'https://json-schema.org/draft/2020-12/schema',
 type:'object',required:['id','type','field'],additionalProperties:false,
 properties:{id:{type:'string',pattern:'\\S'},type:{enum:['required','max_length','contains','forbidden_text','equals','one_of','https_url']},field:{type:'string',pattern:'^(?!(?:.*\\.)?(?:__proto__|prototype|constructor)(?:\\.|$))\\w+(?:\\.\\w+)*$',description:'Safe dotted path in node.config, e.g. subject, message, channelValues.url'},value:{oneOf:[{type:'string'},{type:'integer',minimum:0},{type:'array',minItems:1,items:{type:'string'}}]},nodeKinds:{type:'array',items:{type:'string'}},channels:{type:'array',items:{type:'string'}},message:{type:'string'}},
 allOf:[{if:{properties:{type:{const:'max_length'}}},then:{required:['value'],properties:{value:{type:'integer',minimum:0}}}},{if:{properties:{type:{enum:['contains','forbidden_text','equals']}}},then:{required:['value'],properties:{value:{type:'string'}}}},{if:{properties:{type:{const:'one_of'}}},then:{required:['value'],properties:{value:{type:'array',minItems:1,items:{type:'string'}}}}}],
} as const;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function validateRule(value:unknown):CanvasStandardRule{
 const rule=object(value),types=['required','max_length','contains','forbidden_text','equals','one_of','https_url'];
 if(Object.keys(rule).some(key=>!['id','type','field','value','nodeKinds','channels','message'].includes(key))||rule.message!==undefined&&typeof rule.message!=='string')throw Error('Invalid structural rule properties.');
 if(!types.includes(String(rule.type)))throw Error(`Unsupported structural rule type: ${String(rule.type??'missing')}.`);
 if(typeof rule.id!=='string'||!rule.id.trim()||typeof rule.field!=='string'||!rule.field.trim()||rule.field.split('.').some(key=>!/^\w+$/.test(key)||['__proto__','prototype','constructor'].includes(key)))throw Error('Structural rules require an id and a safe configuration field.');
 if(rule.value!==undefined&&typeof rule.value!=='string'&&!(Number.isInteger(rule.value)&&Number(rule.value)>=0)&&!(Array.isArray(rule.value)&&rule.value.length>0&&rule.value.every(value=>typeof value==='string')))throw Error(`Invalid value for structural rule ${rule.id}.`);
 if(rule.type==='max_length'&&(!Number.isInteger(rule.value)||Number(rule.value)<0)||rule.type==='one_of'&&(!Array.isArray(rule.value)||!rule.value.length||rule.value.some(value=>typeof value!=='string'))||['contains','forbidden_text','equals'].includes(String(rule.type))&&typeof rule.value!=='string')throw Error(`Invalid value for structural rule ${rule.id}.`);
 if(['nodeKinds','channels'].some(key=>rule[key]!==undefined&&(!Array.isArray(rule[key])||(rule[key] as unknown[]).some(value=>typeof value!=='string'))))throw Error(`Invalid scope for structural rule ${rule.id}.`);
 return rule as CanvasStandardRule;
}
function rulePasses(rule:CanvasStandardRule,node:CanvasNode){
 const actual=rule.field.split('.').reduce<unknown>((value,key)=>object(value)[key],node.config??{}),text=actual===undefined||actual===null?'':String(actual);
 switch(rule.type){
  case'required':return text.trim().length>0;
  case'max_length':return text.length<=Number(rule.value);
  case'contains':return text.includes(String(rule.value));
  case'forbidden_text':return!text.includes(String(rule.value));
  case'equals':return text===rule.value;
  case'one_of':return(rule.value as string[]).includes(text);
  case'https_url':try{const url=new URL(text);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
 }
}
function overall(findings:CanvasEvaluationFinding[]):CanvasEvaluationStatus{
 return findings.some(row=>row.status==='error')?'error':findings.some(row=>row.status==='configuration_required')?'configuration_required':findings.some(row=>row.status==='failed')?'failed':'passed';
}
export async function evaluateCanvas(input:{canvasId:string;workspaceId:string;graph:CanvasGraph;standards:CanvasStandard[];connector?:CanvasEvaluationConnector}):Promise<CanvasEvaluationResult>{
 if(!input.standards.length)throw Error('Select at least one Standard.');
 if(input.standards.some(standard=>String(standard.data.workspaceId??'local')!==input.workspaceId||standard.type&&standard.type!=='campaign-standards'||standard.status==='Archived'))throw Error('A selected Standard is not available in this workspace.');
 const findings:CanvasEvaluationFinding[]=[],nodes=input.graph.nodes.filter(node=>node.kind!=='entry');
 for(const standard of input.standards){
  const add=(nodeId:string,ruleId:string,status:CanvasEvaluationStatus,message:string,source:'structural'|'semantic')=>findings.push({nodeId,standardId:standard.id,standardName:standard.name,ruleId,status,message,source});
  const rawRules=standard.data.rules,explicitInstructions=String(standard.data.instructions??standard.data.prompt??standard.data.criteria??'').trim(),instructions=explicitInstructions||(rawRules===undefined?String(standard.description??'').trim():''),semantic=standard.data.mode==='semantic'||standard.data.mode==='agentic'||rawRules===undefined||Boolean(explicitInstructions);
  if(rawRules!==undefined){
   if(!Array.isArray(rawRules)||!rawRules.length&&!semantic){for(const node of nodes)add(node.id,'configuration','error','Configure at least one executable structural rule, or semantic instructions.','structural');continue;}
   for(const raw of rawRules){
    try{const rule=validateRule(raw);for(const node of nodes.filter(node=>(!rule.nodeKinds?.length||rule.nodeKinds.includes(node.kind))&&(!rule.channels?.length||rule.channels.includes(String(node.config?.channel??''))))){const pass=rulePasses(rule,node);add(node.id,rule.id,pass?'passed':'failed',pass?`${rule.field} satisfies ${rule.type}.`:rule.message??`${rule.field} does not satisfy ${rule.type}${rule.value===undefined?'':` (${Array.isArray(rule.value)?rule.value.join(', '):rule.value})`}.`,'structural');}}
    catch(error){for(const node of nodes)add(node.id,String(object(raw).id??'configuration'),'error',error instanceof Error?error.message:'Invalid structural rule.','structural');}
   }
  }
  if(!semantic)continue;
  let endpoint:URL|undefined;try{endpoint=new URL(input.connector?.endpoint??'');}catch{}
  if(!endpoint||endpoint.protocol!=='https:'||endpoint.username||endpoint.password){for(const node of nodes)add(node.id,'semantic','configuration_required','Configure CANVAS_STANDARDS_ENDPOINT with an HTTPS Standards evaluation service.','semantic');continue;}
  if(!instructions){for(const node of nodes)add(node.id,'semantic','error','Add semantic instructions to this Standard.','semantic');continue;}
  const timeoutMs=Math.min(30000,Math.max(100,input.connector?.timeoutMs??10000)),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(input.connector?.apiKey?{Authorization:`Bearer ${input.connector.apiKey}`}:{})},body:JSON.stringify({canvasId:input.canvasId,workspaceId:input.workspaceId,standard:{id:standard.id,name:standard.name,instructions},steps:nodes.map(node=>({nodeId:node.id,label:node.label,kind:node.kind,config:node.config??{}}))}),signal:controller.signal,redirect:'error'});
   if(!response.ok)throw Error(`Standards service returned HTTP ${response.status}.`);
   const result=object(await response.json()),rows=result.findings;
   if(!Array.isArray(rows)||rows.length!==nodes.length||rows.some(row=>!row||typeof row!=='object'||!nodes.some(node=>node.id===row.nodeId)||!['passed','failed'].includes(row.status)||typeof row.message!=='string'||!row.message.trim())||new Set(rows.map(row=>row.nodeId)).size!==nodes.length)throw Error('Standards service returned invalid or missing step findings.');
   for(const row of rows)add(row.nodeId,'semantic',row.status,row.message.slice(0,4000),'semantic');
  }catch(error){for(const node of nodes)add(node.id,'semantic','error',controller.signal.aborted?`Standards service timed out after ${timeoutMs} ms.`:error instanceof Error?error.message:'Standards service failed.','semantic');}
  finally{clearTimeout(timeout);}
 }
 if(!findings.length)throw Error('No executable Standard rules apply to the steps in this Canvas.');
 return{canvasId:input.canvasId,workspaceId:input.workspaceId,createdAt:new Date().toISOString(),status:overall(findings),standardIds:input.standards.map(row=>row.id),findings};
}
