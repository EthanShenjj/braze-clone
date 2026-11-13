import type {CanvasGraph,CanvasNode,CanvasNodeKind} from './canvas-model.ts';
import {audienceRuleIssues,type AudienceGroup} from './campaign-shared.ts';
export type CanvasStepTrigger={id:string;type:string;eventName?:string;campaignId?:string;stepId?:string;interaction?:string;specificApp?:boolean;appId?:string;canvasId?:string;stepScope?:'previous'|'other';alias?:string;buttonId?:string;pageId?:string;landingPageId?:string;attribute?:string;attributeMode?:'any'|'specific';value?:string;subscriptionType?:string;subscriptionState?:string;subscriptionGroupId?:string;updateSource?:string;keywordCategory?:string;bodyCondition?:'none'|'text'|'flow'|'contact';bodyOperator?:string;bodyValue?:string;flowId?:string;geofenceSetId?:string;geofenceEnter?:boolean;geofenceExit?:boolean;locationMode?:'circle'|'polygon';latitude?:number;longitude?:number;radius?:number;radiusUnit?:'miles'|'km';polygon?:string;propertiesEnabled?:boolean;propertyFilters?:import('./canvas-builder-model.ts').CanvasPropertyGroup[]};
export type CanvasPath={id:string;name:string;weight?:number;exit?:boolean;segmentIds?:string[];filterGroups?:AudienceGroup[];nextNodeId?:string;triggers?:CanvasStepTrigger[]};
export const canvasActionTriggers=[...['Perform Custom Event','Start Session','Interact With Campaign','Interact With Step','Interact with Landing Page','Perform Conversion Event'].map(type=>({type,group:'GENERAL ACTIVITY'})),...['Change Custom Attribute Value','Update Subscription Status','Update Subscription Group Status','Add an Email Address'].map(type=>({type,group:'PROFILE UPDATES'})),...['View product','Update cart','Start checkout','Place order','Cancel order','Refund order'].map(type=>({type,group:'ECOMMERCE'})),...['Send an SMS inbound message','Send a WhatsApp inbound message','Send a LINE inbound message'].map(type=>({type,group:'INBOUND MESSAGING'})),...['Enter a Location','Trigger a Geofence'].map(type=>({type,group:'LOCATION'}))];
export type CanvasAttributeUpdate={id:string;attribute:string;action:'update'|'remove'|'increment'|'append'|'remove_from_array';value:string;personalize?:boolean};
export type CanvasContextVariable={id:string;name:string;type:'Boolean'|'Number'|'String'|'Array'|'Time'|'Object'|'';value:string};
export const canvasDelayModes=[{id:'duration',label:'Duration',description:'Wait for hours, days, or weeks (Example: 7 days)'},{id:'date',label:'Calendar date',description:'Wait until a specific calendar date (Example: March 25 at 12 pm)'},{id:'weekday',label:'Day of the week',description:'Wait until a specific day of the week (Example: Next Monday)'}] as const;
export const canvasWeekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function canvasPaths(node:CanvasNode):CanvasPath[]{return Array.isArray(node.config?.paths)?node.config.paths as CanvasPath[]:[];}
export function canvasStepDefaults(kind:CanvasNodeKind):NonNullable<CanvasNode['config']>{
 if(kind==='delay')return{delayMode:'duration',delayValue:1,delayUnit:'Days',durationHours:24,delayTime:'12:00',delayTimezone:'company',delayWeekday:1,lateBehavior:'next_week'};
 if(kind==='branch')return{segmentIds:[],filterGroups:[]};
 if(kind==='audience_paths')return{paths:[{id:'group_1',name:'Group 1',segmentIds:[],filterGroups:[]},{id:'everyone_else',name:'Everyone Else',exit:false}]};
 if(kind==='experiment_paths')return{paths:[{id:'path_1',name:'Path 1',weight:50},{id:'path_2',name:'Path 2',weight:50}],randomizedPaths:false,winningPath:false};
 if(kind==='action_paths')return{evaluationValue:1,evaluationUnit:'Days',rankedPaths:false,paths:[{id:'group_1',name:'Group 1',triggers:[]},{id:'everyone_else',name:'Everyone Else'}]};
 if(kind==='update')return{updateMode:'ui',updates:[{id:'update_1',attribute:'',action:'update',value:''}]};
 if(kind==='context')return{contextVariables:[{id:'context_1',name:'',type:'',value:''}]};
 return{};
}
export function canvasEditorConfig(node:CanvasNode){
 const config={...canvasStepDefaults(node.kind),...structuredClone(node.config)};
 if(node.kind==='delay'&&node.config?.delayValue===undefined&&node.config?.durationHours!==undefined){config.delayValue=Number(node.config.durationHours);config.delayUnit='Hours';}
 if(node.kind==='update'&&node.config?.attribute&&!Array.isArray(node.config.updates))config.updates=[{id:'legacy',attribute:node.config.attribute,action:'update',value:node.config.value??''}];
 if(node.kind==='branch'&&node.config?.attribute&&!Array.isArray(node.config.filterGroups))config.filterGroups=[{id:'legacy',operator:'AND',exclude:false,rules:[{id:'legacy',field:node.config.attribute,operator:'equals',value:node.config.value??''}]}];
 return config;
}
export function canvasMaxRoutes(node:CanvasNode){return node.kind==='branch'?2:['audience_paths','action_paths','experiment_paths'].includes(node.kind)?Math.max(1,canvasPaths(node).length):1;}
export function connectCanvasRoute(graph:CanvasGraph,from:string,to:string,index?:number):CanvasGraph{
 const node=graph.nodes.find(node=>node.id===from);if(!node||from===to||!graph.nodes.some(node=>node.id===to))return graph;
 const outgoing=graph.edges.filter(edge=>edge[0]===from);
 if(index!==undefined&&canvasPaths(node).length){const paths=canvasPaths(node).map((path,i)=>({...path,nextNodeId:path.nextNodeId??outgoing[i]?.[1]}));if(!paths[index])return graph;paths[index].nextNodeId=to;return{...graph,nodes:graph.nodes.map(item=>item.id===from?{...item,config:{...item.config,paths}}:item),edges:[...graph.edges.filter(edge=>edge[0]!==from),...[...new Set(paths.map(path=>path.nextNodeId).filter((id):id is string=>Boolean(id)))].map(id=>[from,id] as [string,string])]};}
 if(index!==undefined&&node.kind==='branch'){const targets={yes:outgoing[0]?.[1],no:outgoing[1]?.[1],...(node.config?.branchTargets as Record<string,string>|undefined),[index===0?'yes':'no']:to};return{...graph,nodes:graph.nodes.map(item=>item.id===from?{...item,config:{...item.config,branchTargets:targets}}:item),edges:[...graph.edges.filter(edge=>edge[0]!==from),...[...new Set(Object.values(targets).filter((id):id is string=>Boolean(id)))].map(id=>[from,id] as [string,string])]};}
 if(outgoing.some(edge=>edge[1]===to)||outgoing.length>=canvasMaxRoutes(node))return graph;return{...graph,edges:[...graph.edges,[from,to]]};
}
export function removeCanvasStep(graph:CanvasGraph,id:string):CanvasGraph{return{...graph,nodes:graph.nodes.filter(node=>node.id!==id).map(node=>node.config?{...node,config:{...node.config,...(node.config.branchTargets?{branchTargets:Object.fromEntries(Object.entries(node.config.branchTargets as Record<string,string>).filter(([,target])=>target!==id))}:{}),...(canvasPaths(node).length?{paths:canvasPaths(node).map(path=>path.nextNodeId===id?{...path,nextNodeId:undefined}:path)}:{})}}:node),edges:graph.edges.filter(edge=>!edge.includes(id))};}
export function canvasDelayHours(config:NonNullable<CanvasNode['config']>){return Number(config.delayValue??1)*(config.delayUnit==='Weeks'?168:config.delayUnit==='Hours'?1:24);}
export function canvasDelayDue(config:NonNullable<CanvasNode['config']>,at:string|Date,timezone='UTC'){
 const now=new Date(at),mode=String(config.delayMode??'duration');
 if(!Number.isFinite(now.getTime()))throw new Error('Enter a valid delay start time.');
 // Calendar/weekday delivery uses the selected IANA zone; legacy durations keep their original hours.
 const zone=config.delayTimezone==='user'?timezone:config.delayTimezone==='company'?'America/New_York':String(config.delayTimezone??'UTC');
 const parts=(date:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
 const localInstant=(date:string,time:string)=>{const wanted=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(wanted))throw new Error('Choose a valid delay date and time.');let result=wanted;for(let i=0;i<4;i++){const p=parts(new Date(result)),actual=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`),delta=wanted-actual;if(!delta)break;result+=delta;}return new Date(result);};
 let result:Date;
 if(mode==='duration'){
  result=new Date(now.getTime()+Number(config.delayValue!==undefined?canvasDelayHours(config):config.durationHours)*3600000);
  if(config.specificTime){const minimum=result.getTime(),p=parts(result);result=localInstant(`${p.year}-${p.month}-${p.day}`,String(config.delayTime??'12:00'));if(result.getTime()<minimum){const next=new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);result=localInstant(next.toISOString().slice(0,10),String(config.delayTime??'12:00'));}}
 }else if(mode==='date')result=localInstant(String(config.delayDate??''),String(config.delayTime??'12:00'));
 else {const p=parts(now),today=new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`),offset=(Number(config.delayWeekday??1)-today.getUTCDay()+7)%7;today.setUTCDate(today.getUTCDate()+offset);result=localInstant(today.toISOString().slice(0,10),String(config.delayTime??'12:00'));if(result<now)result=offset===0&&config.lateBehavior==='same_day'?now:localInstant(new Date(today.getTime()+7*86400000).toISOString().slice(0,10),String(config.delayTime??'12:00'));}
 if(!Number.isFinite(result.getTime()))throw new Error('Configure a valid delay.');return new Date(Math.max(now.getTime(),result.getTime())).toISOString();
}
export function canvasStepIssues(node:CanvasNode){
 const c=node.config??{},issues:string[]=[];
 if(node.kind==='delay'){
  if(c.personalizeDelay&&!String(c.delayExpression??'').trim())issues.push('Enter a delay expression.');
  if(!['duration','date','weekday'].includes(String(c.delayMode??'duration')))issues.push('Choose a delay type.');
  if((c.delayMode??'duration')==='duration'&&(!Number.isFinite(Number(c.delayValue!==undefined?canvasDelayHours(c):c.durationHours))||Number(c.delayValue!==undefined?canvasDelayHours(c):c.durationHours)<=0))issues.push('Set a positive delay.');
  if(c.delayMode==='date'){const date=new Date(String(c.delayDate)+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(String(c.delayDate??''))||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==c.delayDate)issues.push('Choose a valid calendar date.');}
  if(c.delayMode==='weekday'&&(!Number.isInteger(c.delayWeekday)||Number(c.delayWeekday)<0||Number(c.delayWeekday)>6))issues.push('Choose a day of the week.');
  if((c.delayMode==='date'||c.delayMode==='weekday'||c.specificTime)&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.delayTime??'')))issues.push('Choose a valid delay time.');
 }
 if(node.kind==='branch'&&!c.attribute&&!(Array.isArray(c.segmentIds)&&c.segmentIds.length)&&!(Array.isArray(c.filterGroups)&&(c.filterGroups as AudienceGroup[]).some(group=>group.rules.length)))issues.push('Add at least one segment or filter to the Decision Split.');
 const groups=[...(Array.isArray(c.filterGroups)?c.filterGroups as AudienceGroup[]:[]),...canvasPaths(node).flatMap(path=>path.filterGroups??[])];
 for(const group of groups)for(const rule of group.rules)issues.push(...audienceRuleIssues(rule));
 if(node.kind==='experiment_paths'&&(canvasPaths(node).length<2||canvasPaths(node).some(path=>!Number.isFinite(path.weight)||Number(path.weight)<0)||Math.abs(canvasPaths(node).reduce((sum,path)=>sum+Number(path.weight??0),0)+(c.winningPath?Number(c.winningPathDelayWeight??0):0)-100)>.001))issues.push('Experiment path percentages including the Delay Group must total 100%.');
 if(node.kind==='experiment_paths'&&canvasPaths(node).length>4)issues.push('An Experiment supports up to four paths.');
 if(node.kind==='experiment_paths'&&c.winningPath&&(Number(c.winningPathDelayWeight??0)<0||Number(c.winningPathDelayWeight??0)>100||!Number.isFinite(Number(c.experimentWindowDays))||Number(c.experimentWindowDays)<=0))issues.push('Choose a positive experiment window and a valid Delay Group percentage.');
 if(node.kind==='audience_paths'&&canvasPaths(node).some(path=>path.id!=='everyone_else'&&!path.segmentIds?.length&&!path.filterGroups?.some(group=>group.rules.length)))issues.push('Define the audience for every audience group.');
 if(node.kind==='action_paths'){
  if(!Number.isFinite(Number(c.evaluationValue))||Number(c.evaluationValue)<=0)issues.push('Choose a positive evaluation window.');
  const duration=Number(c.evaluationValue??1)*({Minutes:60000,Hours:3600000,Days:86400000,Weeks:604800000}[String(c.evaluationUnit??'Days')]??86400000);
  if(duration>31*86400000)issues.push('The Action Paths evaluation window supports up to 31 days.');
  if(canvasPaths(node).length>8)issues.push('Action Paths supports up to eight outcomes.');
  for(const path of canvasPaths(node).filter(path=>path.id!=='everyone_else'))if(!path.triggers?.length||path.triggers.some(trigger=>!canvasActionTriggers.some(row=>row.type===trigger.type)||trigger.type==='Perform Custom Event'&&!trigger.eventName))issues.push('Complete the trigger events for every action group.');
 }
 if(node.kind==='agent'&&(!c.agentId||!c.outputVariable||!c.outputType))issues.push('Choose an agent, output variable and data type.');
 if(node.kind==='destination'&&(!c.destinationType||!c.destinationId))issues.push('Choose a destination type and destination.');
 if(node.kind==='feature_flag'&&!c.featureFlagId)issues.push('Choose a Feature Flag.');
 if(node.kind==='audience_sync'&&!c.partner)issues.push('Choose an Audience Sync partner.');
 if(node.kind==='context'){
  const vars=Array.isArray(c.contextVariables)?c.contextVariables as CanvasContextVariable[]:[];
  if(!vars.length||vars.length>10)issues.push('Add between 1 and 10 context variables.');
  if(new Set(vars.map(row=>row.name)).size!==vars.length)issues.push('Use a unique name for every context variable.');
  if(vars.some(row=>!/^\w+$/.test(row.name)||!row.type||!row.value.trim()))issues.push('Complete each context variable name, data type and value.');
 }
 if(node.kind==='update'&&c.updateMode==='json'){try{const text=String(c.updateJson??'');if(text.length>65536)throw new Error();const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value)||value.attributes!==undefined&&(!Array.isArray(value.attributes)||!value.attributes.length||value.attributes.some((row:unknown)=>!row||typeof row!=='object'||Array.isArray(row))))throw new Error();}catch{issues.push('Enter a valid JSON object of no more than 65,536 characters for the user update.');}}
 if(node.kind==='update'&&c.updateMode!=='json'&&Array.isArray(c.updates)&&(c.updates as CanvasAttributeUpdate[]).some(row=>!row.attribute.trim()||row.action!=='remove'&&!row.value.trim()))issues.push('Complete each attribute name, action and value.');
 return [...new Set(issues)];
}
export function canvasUpdatedProfile(profile:Record<string,unknown>,config:NonNullable<CanvasNode['config']>,render=(value:string)=>value){
 const result={...profile};
 const protectScope=(key:string)=>{if(['workspaceId','workspace_id'].includes(key))throw new Error('Canvas User Update cannot change a user workspace.');};
 if(config.updateMode==='json'){if(String(config.updateJson??'').length>65536)throw new Error('User Update Object exceeds 65,536 characters.');const value=JSON.parse(render(String(config.updateJson??'')));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter a valid user update object.');const rows=Array.isArray(value.attributes)?value.attributes:[value];for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Enter a valid attributes object.');for(const [key,item] of Object.entries(row)){protectScope(key);if(['__proto__','constructor','prototype','id','external_id'].includes(key))continue;if(item===null)delete result[key];else result[key]=item;}}return result;}
 const updates=Array.isArray(config.updates)?config.updates as CanvasAttributeUpdate[]:config.attribute?[{id:'legacy',attribute:config.attribute,action:'update' as const,value:config.value??''}]:[];
 for(const update of updates){const key=update.attribute;protectScope(key);if(!key||['__proto__','constructor','prototype','id','external_id'].includes(key))throw new Error('Choose a valid attribute name.');let value:unknown=update.personalize?render(update.value):update.value;try{value=JSON.parse(String(value));}catch{}
  if(update.action==='remove')delete result[key];else if(update.action==='update')result[key]=value;else if(update.action==='increment'){if(!Number.isFinite(Number(value))||result[key]!==undefined&&!Number.isFinite(Number(result[key])))throw new Error('Increment requires numeric values.');result[key]=Number(result[key]??0)+Number(value);}else if(['append','remove_from_array'].includes(update.action)){const existing=result[key]??[];if(!Array.isArray(existing))throw new Error('Array updates require an array attribute.');const next=Array.isArray(value)?value:[value];result[key]=update.action==='append'?[...existing,...next.filter(item=>!existing.some(previous=>JSON.stringify(previous)===JSON.stringify(item)))]:existing.filter(item=>!next.some(remove=>JSON.stringify(remove)===JSON.stringify(item)));}else throw new Error('Choose a supported attribute action.');
 }return result;
}
export function canvasStepSummary(node:CanvasNode){const c=node.config??{};if(node.kind==='delay')return c.delayMode==='date'?`Wait until ${c.delayDate||'a date'} at ${c.delayTime||'12:00'}`:c.delayMode==='weekday'?`Until ${canvasWeekdays[Number(c.delayWeekday??1)]} at ${c.delayTime||'12:00'}`:`After ${c.delayValue??Number(c.durationHours??24)/24} ${String(c.delayUnit??'Days').toLowerCase()}`;if(node.kind==='context')return `${Array.isArray(c.contextVariables)?c.contextVariables.length:0} context variable(s)`;if(node.kind==='update')return c.updateMode==='json'?'Advanced JSON Editor':`${Array.isArray(c.updates)?c.updates.length:1} attribute update(s)`;return'';}
