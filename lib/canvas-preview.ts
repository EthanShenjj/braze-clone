import type {CanvasGraph,CanvasNode} from './canvas-model.ts';
import type {CanvasWizardConfig} from './canvas-wizard-model.ts';
import {canvasDelayDue,canvasPaths,canvasStepIssues,canvasUpdatedProfile,type CanvasContextVariable} from './canvas-step-model.ts';
import {canvasPropertyGroupsMatch,canvasDeliverySettings} from './canvas-builder-model.ts';
import {canvasAssignedVariant,canvasActionPathDecision,canvasTriggerMatches,type CanvasRuntimeEvent} from './canvas-runtime-model.ts';
import {canvasSmsDeliveryTime} from './canvas-sms-runtime.ts';
import {nextAllowedDeliveryTime,inQuietHours} from './campaign-scheduling.ts';
import {renderBrazeLiquid} from './email-liquid.ts';
import {compileSms} from './channel-message-model.ts';
import {campaignVariants,variantDraft,type MessageDraft} from './campaign-shared.ts';
import {canvasOptimizerPreviewDraft,canvasOptimizerPreviewSelection,canvasOptimizerPreviewValues} from './canvas-optimizer-preview-model.ts';

export type CanvasPreviewUser={id:string;email:string;firstName:string;country:string;lifecycle:string;subscribed:boolean;emailSubscriptionStatus:string;reachable:boolean;attributes:Record<string,unknown>;globalControlGroup?:boolean};
export type CanvasPreviewEvent=CanvasRuntimeEvent;
export type CanvasPreviewStep={nodeId:string;label:string;kind:CanvasNode['kind'];at:string;departureAt:string;eligibility:{eligible:boolean;reasons:string[]};routing?:{pathId?:string;pathName?:string;nextNodeId?:string;reason:string};message?:{channel:string;subject:string;body:string;config:Record<string,unknown>;variantId?:string;profile?:Record<string,unknown>;optimizerSelections?:Record<string,string>;optimizerComponents?:Record<string,string>};action?:{kind:string;mode:'preview'|'fallback'|'executed_test';sideEffectsSkipped:boolean;expected?:Record<string,unknown>};profileChanges?:Record<string,unknown>;context?:Record<string,unknown>;status:'passed'|'skipped'|'blocked';details:string[]};
export type CanvasPreviewResult={canvasId:string;workspaceId:string;userId:string;at:string;completedAt:string;status:'completed'|'blocked';variantId?:string;steps:CanvasPreviewStep[];profileBefore:Record<string,unknown>;profileAfter:Record<string,unknown>;warnings:string[];simulated:true;messagesSent:false};
export type CanvasPreviewAgentTest={execute:boolean;fallbackValue?:unknown;context?:string};
export type CanvasPreviewAgentRequest={node:CanvasNode;workspaceId:string;canvasId:string;userId:string;at:string;profile:Record<string,unknown>;context:Record<string,unknown>;testContext?:string;test:true};
export type CanvasPreviewInput={canvasId:string;workspaceId:string;graph:CanvasGraph;wizard:CanvasWizardConfig;user:CanvasPreviewUser;at?:string;eventInputs?:CanvasPreviewEvent[];messageVariants?:Record<string,string>;optimizerSelections?:Record<string,Record<string,string>>;agentTests?:Record<string,CanvasPreviewAgentTest>;services?:{executeAgent?:(request:CanvasPreviewAgentRequest)=>Promise<{status:'completed'|'accepted';output?:unknown}>;previewFeatureFlag?:(node:CanvasNode,profile:Record<string,unknown>)=>Record<string,unknown>};audienceMatches?:(config:Record<string,unknown>,profile:Record<string,unknown>)=>boolean;messageEligibility?:(node:CanvasNode,profile:Record<string,unknown>,at:string)=>{eligible:boolean;reasons:string[]};variables?:Record<string,unknown>};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function agentOutput(value:unknown,type:string){
 const valid=type==='String'?typeof value==='string':type==='Number'?typeof value==='number'&&Number.isFinite(value):type==='Boolean'?typeof value==='boolean':type==='Array'?Array.isArray(value):type==='Object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='Time'?typeof value==='string'&&Number.isFinite(Date.parse(value)):false;
 if(!valid)throw Error(`Provide an authored fallback or Agent result matching ${type}.`);
 if(JSON.stringify(value).length>65536)throw Error('Agent preview output exceeds 65,536 characters.');
 return type==='Time'?new Date(String(value)).toISOString():structuredClone(value);
}

/** Runs only on cloned data. It has no store/provider dependency and never sends or writes a profile. */
export async function runPreview(input:CanvasPreviewInput):Promise<CanvasPreviewResult>{
 if(String(input.user.attributes.workspaceId??input.user.attributes.workspace_id??'local')!==input.workspaceId)throw Error('Test user is not available in this workspace.');
 const parsed=Date.parse(input.at??new Date().toISOString());if(!Number.isFinite(parsed))throw Error('Choose a valid preview time.');
 const entries=input.graph.nodes.filter(node=>node.kind==='entry');if(entries.length!==1)throw Error('Add exactly one Audience entry step before testing.');
 const nodes=new Map(input.graph.nodes.map(node=>[node.id,node]));if(nodes.size!==input.graph.nodes.length||input.graph.edges.some(([from,to])=>!nodes.has(from)||!nodes.has(to)))throw Error('Correct the Canvas connections before testing.');
 const profileBefore:Record<string,unknown>=structuredClone({...input.user.attributes,user_id:input.user.id,first_name:input.user.firstName,email:input.user.email,country:input.user.country,lifecycle:input.user.lifecycle,subscribed:input.user.subscribed,emailSubscriptionStatus:input.user.emailSubscriptionStatus});
 let profile:Record<string,unknown>=structuredClone(profileBefore),at=new Date(parsed).toISOString(),context:Record<string,unknown>={},eventProperties:Record<string,unknown>={};
 const variant=canvasAssignedVariant(input.canvasId,input.user.id,input.graph.variants??[{id:'variant_1',name:'Variant 1',weight:100}]);
 const result:CanvasPreviewResult={canvasId:input.canvasId,workspaceId:input.workspaceId,userId:input.user.id,at,completedAt:at,status:'completed',variantId:variant?.id,steps:[],profileBefore,profileAfter:profile,warnings:[],simulated:true,messagesSent:false};
 const render=(source:string)=>{
  let expanded=source;
  for(let depth=0;depth<10;depth++){
   let changed=false;
   expanded=expanded.replace(/\{\{\s*content_blocks\.(?:\$\{([^}]+)\}|([A-Za-z_]\w*))\s*\}\}/g,(_match,braced,key)=>{const name=braced??key,block=object(input.variables?.content_blocks)[name];if(typeof block!=='string')throw Error(`Content block ${name} is unavailable in this workspace.`);changed=true;return block;});
   if(!changed)return renderBrazeLiquid(expanded,profile,{...input.variables,canvas_context:context,event_properties:eventProperties,canvas_entry_properties:object(input.variables?.canvas_entry_properties??profile.canvas_entry_properties),canvas:{...object(input.variables?.canvas),api_id:input.canvasId}});
  }
  throw Error('Content blocks contain a circular reference.');
 };
 const matches=(config:Record<string,unknown>)=>{
  if(input.audienceMatches){const normalized=config.attribute?{...config,filterGroups:[{id:'legacy',operator:'AND',rules:[{id:'legacy',field:String(config.attribute),operator:'equals',value:String(config.value??'')}]}]}:config;return input.audienceMatches(normalized,profile);}
  if(Array.isArray(config.segmentIds)&&config.segmentIds.length)throw Error('Scoped audience data is required to preview saved segments.');
  if(config.attribute)return String(profile[String(config.attribute)]??'')===String(config.value??'');
  const groups=Array.isArray(config.filterGroups)?config.filterGroups:[];
  return groups.every(group=>{const value=canvasPropertyGroupsMatch(profile,[group]);return group.exclude?!value:value;});
 };
 let current:CanvasNode|undefined=entries[0];const visited=new Set<string>();let previousMessageId:string|undefined;
 while(current){
  if(visited.has(current.id)||visited.size>1000){result.status='blocked';result.warnings.push('A loop in this Canvas prevents a finite preview.');break;}visited.add(current.id);
  let config:NonNullable<CanvasNode['config']>=structuredClone(current.config??{});const outgoing=input.graph.edges.filter(([from])=>from===current!.id).map(([,to])=>to);
  let next:string|undefined=outgoing[0];
  const step:CanvasPreviewStep={nodeId:current.id,label:current.label,kind:current.kind,at,departureAt:at,eligibility:{eligible:true,reasons:[]},status:'passed',details:[]};result.steps.push(step);
  try{
   const experimentPaths=current.kind==='experiment_paths'?canvasPaths(current).filter(path=>path.id!=='delay_group'):[],experimentWeight=experimentPaths.reduce((sum,path)=>sum+Number(path.weight??0),0);
   if(current.kind==='experiment_paths'&&(experimentWeight<=0||experimentPaths.some(path=>!Number.isFinite(path.weight)||Number(path.weight)<0)))throw Error('Choose valid positive experiment path allocations.');
   const validationNode=current.kind==='experiment_paths'&&config.winningPath?{...current,config:{...config,winningPath:false,paths:experimentPaths.map(path=>({...path,weight:Number(path.weight??0)/experimentWeight*100}))}}:current;
   const issues=current.kind==='update'&&config.updateMode==='json'?[]:canvasStepIssues(validationNode);if(issues.length)throw Error(issues.join(' '));
   if(current.kind==='entry'){
    const audience=input.wizard.audience,filters=audience.filters.map(filter=>({...filter,operator:filter.operator==='is'?'equals':filter.operator==='is_not'?'not_equals':filter.operator}));
    if(audience.segmentIds.length||filters.length){const eligible=matches({segmentIds:audience.segmentIds,filterGroups:filters.length?[{id:'entry',operator:audience.filterOperator,rules:filters}]:[]});if(!eligible)step.eligibility={eligible:false,reasons:['The test user does not match the entry audience.']};}
    if(audience.exclusionFilters.length&&matches({filterGroups:[{id:'excluded',operator:'AND',rules:audience.exclusionFilters}]}))step.eligibility={eligible:false,reasons:[...step.eligibility.reasons,'The test user matches an entry exclusion.']};
    if(!step.eligibility.eligible)step.details.push('Test users continue through the preview even when they do not qualify for entry.');
    if(variant){step.details.push(`Assigned ${variant.name}.`);if(Object.hasOwn(config,'variantTargets')){const target=object(config.variantTargets)[variant.id];if(typeof target!=='string'||!nodes.has(target)||!outgoing.includes(target))throw Error('Connect the assigned Canvas variant to an available first step.');next=target;step.routing={nextNodeId:next,reason:`Assigned Canvas variant ${variant.name}.`};}}
   }else if(current.kind==='delay'){
    if(config.personalizeDelay){const value=render(String(config.delayExpression??''));if(config.delayMode==='date')config.delayDate=value.slice(0,10);else{if(!value.trim()||!Number.isFinite(Number(value))||Number(value)<=0)throw Error('The personalized delay did not return a positive number.');config.delayValue=Number(value);}}
    at=canvasDelayDue(config,at,String(profile.time_zone??profile.timezone??'UTC'));step.details.push(`Continue at ${at}.`);
   }else if(current.kind==='update'){
    if(config.updateMode==='json'){step.status='skipped';step.details.push('Test Canvas skips JSON User Update steps; no profile changes were applied.');}else{const before=profile;profile=canvasUpdatedProfile(profile,config,render);step.profileChanges=Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(profile)])].filter(key=>JSON.stringify(before[key])!==JSON.stringify(profile[key])).map(key=>[key,profile[key]??null]));step.details.push('Profile changes are simulated for this preview.');}
   }else if(current.kind==='context'){
    for(const variable of (config.contextVariables??[]) as CanvasContextVariable[]){const raw=render(variable.value);let value:unknown=raw;if(variable.type==='Number'){value=Number(raw);if(!raw.trim()||!Number.isFinite(value))throw Error(`Context ${variable.name} must be a number.`);}else if(variable.type==='Boolean'){if(!['true','false'].includes(raw.toLowerCase()))throw Error(`Context ${variable.name} must be a Boolean.`);value=raw.toLowerCase()==='true';}else if(['Array','Object'].includes(variable.type)){value=JSON.parse(raw);if(variable.type==='Array'?!Array.isArray(value):!value||typeof value!=='object'||Array.isArray(value))throw Error(`Context ${variable.name} has an invalid type.`);}else if(variable.type==='Time'){if(!Number.isFinite(Date.parse(raw)))throw Error(`Context ${variable.name} must be a time.`);value=new Date(raw).toISOString();}context={...context,[variable.name]:value};}step.context=structuredClone(context);
   }else if(current.kind==='branch'){
    const yes=matches(config),targets=object(config.branchTargets);next=String((yes?targets.yes:targets.no)??outgoing[yes?0:1]??'')||undefined;step.routing={nextNodeId:next,reason:yes?'Matched the decision conditions.':'Did not match the decision conditions.'};
   }else if(current.kind==='audience_paths'){
    const paths=canvasPaths(current),path=paths.find(path=>path.id!=='everyone_else'&&matches(path))??paths.find(path=>path.id==='everyone_else');next=path&&!path.exit?path.nextNodeId??outgoing[paths.indexOf(path)]:undefined;step.routing={pathId:path?.id,pathName:path?.name,nextNodeId:next,reason:path?'First matching audience path.':'No audience path matched.'};
   }else if(current.kind==='experiment_paths'){
    const paths=experimentPaths,assigned=canvasAssignedVariant(`${input.canvasId}:${current.id}`,input.user.id,paths.map(path=>({id:path.id,name:path.name,weight:Number(path.weight??0)/experimentWeight*100}))),path=paths.find(path=>path.id===assigned?.id);next=path&&!path.exit?path.nextNodeId??outgoing[canvasPaths(current).findIndex(item=>item.id===path.id)]:undefined;step.routing={pathId:path?.id,pathName:path?.name,nextNodeId:next,reason:'Stable weighted test-user assignment.'};if(config.winningPath)step.details.push('Delay Group and Winning Path waiting are skipped in Test Canvas; the selected real path starts immediately.');
   }else if(current.kind==='action_paths'){
    const duration=Number(config.evaluationValue??1)*({Minutes:60000,Hours:3600000,Days:86400000,Weeks:604800000}[String(config.evaluationUnit)]??86400000);if(!Number.isFinite(duration)||duration<=0)throw Error('Configure a valid Action Paths evaluation window.');
    const enteredAt=at,triggerContext={workspaceId:input.workspaceId,userId:input.user.id,canvasId:input.canvasId,previousStepId:previousMessageId,profile},decision=canvasActionPathDecision(config,at,new Date(Date.parse(at)+duration).toISOString(),input.eventInputs??[],triggerContext),path=decision.nextPath,paths=canvasPaths(current);at=new Date(decision.at??decision.deadline).toISOString();next=path&&!path.exit?path.nextNodeId??outgoing[paths.findIndex(item=>item.id===path.id)]:undefined;step.routing={pathId:path?.id,pathName:path?.name,nextNodeId:next,reason:decision.eventId?`Matched event ${decision.eventId}.`:'Evaluated supplied events and the Action Paths window.'};const event=(input.eventInputs??[]).filter(event=>Date.parse(event.at)>=Date.parse(enteredAt)&&Date.parse(event.at)<=Date.parse(at)&&(path?.triggers??[]).some(trigger=>canvasTriggerMatches(trigger,event,triggerContext))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).find(event=>decision.eventId?event.id===decision.eventId:true);if(event)eventProperties=event.properties??{};
   }else if(current.kind==='agent'){
    const choice=input.agentTests?.[current.id];let output:unknown;
    if(!choice)throw Error('Agent preview requires an explicit run choice or configured authored fallback.');
    if(choice.execute){if(!input.services?.executeAgent)throw Error('Configure an Agent test service or provide an authored fallback without running the Agent.');const response=await input.services.executeAgent({node:structuredClone(current),workspaceId:input.workspaceId,canvasId:input.canvasId,userId:input.user.id,at,profile:structuredClone(profile),context:structuredClone(context),testContext:choice.context,test:true});if(response.status!=='completed'||!Object.hasOwn(response,'output'))throw Error('The Agent test has not completed. Supply an authored fallback or retry after the provider completes.');output=response.output;step.action={kind:'agent',mode:'executed_test',sideEffectsSkipped:false};step.details.push('Agent executed in test mode; its output is used only in this preview context.');}
    else{if(!Object.hasOwn(choice,'fallbackValue'))throw Error('Provide a configured or authored Agent fallback value before continuing.');output=choice.fallbackValue;step.action={kind:'agent',mode:'fallback',sideEffectsSkipped:true};step.details.push('Agent was not invoked. The authored fallback is used only in this preview context.');}
    context={...context,[String(config.outputVariable)]:agentOutput(output,String(config.outputType))};step.context=structuredClone(context);
   }else if(['feature_flag','audience_sync','destination'].includes(current.kind)){
    const expected=current.kind==='feature_flag'?input.services?.previewFeatureFlag?.(structuredClone(current),structuredClone(profile))??{featureFlagId:config.featureFlagId}:current.kind==='audience_sync'?{partner:config.partner,accountId:config.accountId,audienceId:config.audienceId,operation:config.operation??'add'}:{destinationType:config.destinationType,destinationId:config.destinationId};
    step.status='skipped';step.action={kind:current.kind,mode:'preview',sideEffectsSkipped:true,expected};step.details.push('Expected action preview only. No external sync, destination enrollment or feature assignment was performed.');
   }else if(current.kind==='message'||current.kind==='optimizer'){
    let optimizerSelections:Record<string,string>|undefined,optimizerComponents:Record<string,string>|undefined;
    if(current.kind==='optimizer'){optimizerSelections=input.optimizerSelections?.[current.id]??canvasOptimizerPreviewSelection(current,input.canvasId,input.user.id);optimizerComponents=canvasOptimizerPreviewValues(current,optimizerSelections);config=canvasOptimizerPreviewDraft(current,optimizerSelections).config!;step.details.push('Selected authored Content Optimizer components for preview only; no AI content was generated and no optimization outcome was recorded.');}
    const channel=String(config.channel??'email'),reasons:string[]=[];
    if(!input.messageEligibility){
     if(!input.user.reachable)reasons.push('The test user is not reachable.');
     if(input.user.globalControlGroup)reasons.push('The test user belongs to the global control group.');
     if(channel==='email'&&input.wizard.send.subscriptionMode!=='all'&&(profile.subscribed===false||profile.emailSubscriptionStatus==='unsubscribed'||input.wizard.send.subscriptionMode==='opted_in_only'&&profile.emailSubscriptionStatus!=='opted_in'))reasons.push('The test user does not satisfy the email subscription settings.');
    }
    const settings=canvasDeliverySettings(config);if(settings.deliveryValidationEnabled&&!matches({segmentIds:settings.deliverySegmentIds,filterGroups:settings.deliveryFilterGroups}))reasons.push('The test user does not match delivery validation.');
    if(settings.intelligentTiming)at=canvasSmsDeliveryTime(config,at,profile);
    const quiet={quietHours:input.wizard.send.quietEnabled&&settings.messageQuietHours,quietStart:input.wizard.send.quietStart,quietEnd:input.wizard.send.quietEnd},zone=String(profile.time_zone??profile.timezone??'UTC');
    if(inQuietHours(new Date(at),quiet,zone)){if(input.wizard.send.quietFallback==='abort')reasons.push('The message falls in quiet hours and is configured to abort.');else{at=nextAllowedDeliveryTime(new Date(at),quiet,zone).toISOString();step.details.push(`Quiet hours defer the message until ${at}.`);}}
    const draft:MessageDraft={channel,body:String(config.message??''),subject:String(config.subject??''),config},variants=campaignVariants(draft),weights=Array.isArray(config.variantSplits)&&config.variantSplits.length===variants.length?config.variantSplits.map(Number):variants.map(()=>1),selectedId=input.messageVariants?.[current.id]??canvasAssignedVariant(`${input.canvasId}:${current.id}:message`,input.user.id,variants.map((variant,index)=>({id:variant.id,name:variant.name,weight:weights[index]})))?.id,selectedIndex=variants.findIndex(variant=>variant.id===selectedId);
    if(selectedIndex<0)throw Error('Choose an available message variant with a valid allocation.');const message=variantDraft(draft,selectedIndex);
    const eligibility=input.messageEligibility?.({...current,config:{...message.config,channel,message:message.body,subject:message.subject}},profile,at);if(eligibility&&!eligibility.eligible)reasons.push(...eligibility.reasons);
    const compiledConfig=structuredClone(message.config??{}),body=channel==='sms'?compileSms(message,profile,undefined,{...input.variables,canvas_context:context,event_properties:eventProperties}).message:render(message.body??'');
    step.message={channel,subject:render(message.subject??''),body,config:compiledConfig,variantId:variants[selectedIndex]?.id,...(optimizerSelections?{optimizerSelections,optimizerComponents}:{}),profile:structuredClone({...profile,event_properties:eventProperties,canvas_entry_properties:object(input.variables?.canvas_entry_properties??profile.canvas_entry_properties),canvas_context:context})};step.context=structuredClone(context);step.eligibility={eligible:!reasons.length,reasons:[...new Set(reasons)]};if(reasons.length){step.status='skipped';step.details.push('The test user continues to the next step; this message is not eligible to send.');}step.details.push('Compiled preview only; no message was sent.');previousMessageId=current.id;
   }else{step.status='skipped';step.details.push('This step is skipped in Test Canvas; no side effect was executed.');}
   step.departureAt=at;if(!step.routing&&next)step.routing={nextNodeId:next,reason:'Connected next step.'};
  }catch(error){step.status='blocked';step.eligibility={eligible:false,reasons:[error instanceof Error?error.message:'Could not preview this step.']};step.details.push(...step.eligibility.reasons);result.status='blocked';next=undefined;}
  current=next?nodes.get(next):undefined;
 }
 result.profileAfter=structuredClone(profile);result.completedAt=at;
 if(input.wizard.send.frequencyCapping)result.warnings.push('Frequency caps and provider eligibility are checked again only if you explicitly send test messages.');
 if(input.wizard.send.rateEnabled)result.warnings.push('Preview timing excludes live workspace rate-limit queue contention.');
 return result;
}
