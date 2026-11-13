import type {CanvasVariant} from './canvas-model.ts';
import type {CanvasPath,CanvasStepTrigger} from './canvas-step-model.ts';
import type {CanvasWizardConfig} from './canvas-wizard-model.ts';
import {canvasPropertyGroupsMatch,canvasOptimizerComponents,canvasOptimizerIssues} from './canvas-builder-model.ts';
import {compareAudienceValue} from './audience-rule-model.ts';
import {canvasRecommendedEvents} from './canvas-action-model.ts';

/** Normalized, scoped facts supplied by the store; this module never reads or writes profiles. */
export type CanvasRuntimeEvent={
 id?:string;kind:'custom'|'session'|'app_upgrade'|'purchase'|'message'|'conversion'|'landing_page'|'attribute'|'subscription'|'subscription_group'|'email_added'|'inbound'|'location'|'geofence'|'exception'|'back_in_stock'|'price_drop';
 at:string;workspaceId?:string;userId?:string;name?:string;properties?:Record<string,unknown>;
 appId?:string;campaignId?:string;canvasId?:string;stepId?:string;interaction?:string;alias?:string;buttonId?:string;pageId?:string;landingPageId?:string;
 attribute?:string;previousValue?:unknown;value?:unknown;subscriptionType?:string;subscriptionState?:string;subscriptionGroupId?:string;updateSource?:string;
 channel?:string;keywordCategory?:string;body?:string;flowId?:string;contact?:boolean;latitude?:number;longitude?:number;geofenceSetId?:string;geofenceTransition?:'enter'|'exit';
};
export type CanvasTriggerContext={workspaceId?:string;userId?:string;canvasId?:string;previousStepId?:string;previousStepIds?:string[];profile?:Record<string,unknown>};

function locationMatches(trigger:CanvasStepTrigger,event:CanvasRuntimeEvent):boolean{
 const latitude=event.latitude,longitude=event.longitude;
 if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return false;
 if(trigger.locationMode==='polygon'){
  try{
   const points:unknown=JSON.parse(trigger.polygon??'[]');
   if(!Array.isArray(points)||points.length<3||points.some(point=>!Array.isArray(point)||point.length!==2||point.some(value=>typeof value!=='number'||!Number.isFinite(value))||Math.abs(point[0])>90||Math.abs(point[1])>180))return false;
   let inside=false;
   for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [y1,x1]=points[j] as number[],[y2,x2]=points[i] as number[];
    const cross=(longitude-x1)*(y2-y1)-(latitude-y1)*(x2-x1);
    if(Math.abs(cross)<1e-10&&longitude>=Math.min(x1,x2)&&longitude<=Math.max(x1,x2)&&latitude>=Math.min(y1,y2)&&latitude<=Math.max(y1,y2))return true;
    if((y1>latitude)!==(y2>latitude)&&longitude<(x2-x1)*(latitude-y1)/(y2-y1)+x1)inside=!inside;
   }
   return inside;
  }catch{return false;}
 }
 if(trigger.latitude===undefined&&trigger.longitude===undefined&&trigger.radius===undefined)return true;
 const lat=trigger.latitude??40.75,lon=trigger.longitude??-74,radius=trigger.radius??5;
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(radius)||radius<=0)return false;
 const radians=Math.PI/180,dLat=(latitude-lat)*radians,dLon=(longitude-lon)*radians,a=Math.sin(dLat/2)**2+Math.cos(lat*radians)*Math.cos(latitude*radians)*Math.sin(dLon/2)**2;
 return 6371.0088*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))<=radius*(trigger.radiusUnit==='km'?1:1.609344);
}

/** Type-only triggers are supported for the existing entry picker; populated fields narrow the event. */
export function canvasTriggerMatches(trigger:CanvasStepTrigger,event:CanvasRuntimeEvent,context:CanvasTriggerContext={}):boolean{
 if(!Number.isFinite(Date.parse(event.at))||context.workspaceId!==undefined&&event.workspaceId!==context.workspaceId||context.userId!==undefined&&event.userId!==context.userId)return false;
 const field=(key:keyof CanvasStepTrigger,actual:unknown)=>trigger[key]===undefined||trigger[key]===''||trigger[key]===actual;
 let matched=false;
 switch(trigger.type){
  case 'Perform Custom Event':matched=event.kind==='custom'&&field('eventName',event.name);break;
  case 'Start Session':matched=event.kind==='session'&&(!trigger.specificApp||Boolean(trigger.appId)&&trigger.appId===event.appId);break;
  case 'Perform Conversion Event':matched=event.kind==='conversion'&&field('canvasId',event.canvasId)&&(!context.canvasId||event.canvasId===context.canvasId);break;
  case 'Perform Exception Event For Campaign':matched=event.kind==='exception'&&field('campaignId',event.campaignId);break;
  case 'Perform Back in Stock Event':matched=event.kind==='back_in_stock';break;
  case 'Perform Price Drop Event':matched=event.kind==='price_drop';break;
  case 'Interact With Campaign':case 'Interact With Step':{
   const interaction=event.kind==='conversion'?'conversion':event.interaction,subtypes:Record<string,string[]>={opened_email:['opened_email_machine','opened_email_other'],clicked_email:['clicked_alias_email'],clicked_iam:['clicked_iam_button_1','clicked_iam_button_2'],clicked_alias_any:['clicked_alias_email']};
   const interactionMatches=field('interaction',interaction)||Boolean(trigger.interaction&&interaction&&subtypes[trigger.interaction]?.includes(interaction));
   matched=(event.kind==='message'||event.kind==='conversion'&&trigger.interaction==='conversion')&&interactionMatches&&field('alias',event.alias)&&field('buttonId',event.buttonId)&&field('pageId',event.pageId);
   if(trigger.type==='Interact With Campaign')matched=matched&&(trigger.interaction==='clicked_alias_any'||field('campaignId',event.campaignId));
   else if(trigger.stepScope==='other')matched=matched&&Boolean(trigger.canvasId&&trigger.stepId)&&trigger.canvasId===event.canvasId&&trigger.stepId===event.stepId;
   else matched=matched&&Boolean(context.canvasId)&&event.canvasId===context.canvasId&&[context.previousStepId,...context.previousStepIds??[]].some(id=>Boolean(id)&&id===event.stepId);
   break;
  }
  case 'Interact with Landing Page':matched=event.kind==='landing_page'&&field('landingPageId',event.landingPageId)&&field('interaction',event.interaction);break;
  case 'Change Custom Attribute Value':matched=event.kind==='attribute'&&field('attribute',event.attribute)&&JSON.stringify(event.previousValue)!==JSON.stringify(event.value)&&(trigger.attributeMode!=='specific'||compareAudienceValue(event.value,{operator:'equals',value:String(trigger.value??'')},typeof event.value==='number'?'number':typeof event.value==='boolean'?'boolean':'text'));break;
  case 'Update Subscription Status':matched=event.kind==='subscription'&&field('subscriptionType',event.subscriptionType)&&field('subscriptionState',event.subscriptionState);break;
  case 'Update Subscription Group Status':matched=event.kind==='subscription_group'&&field('subscriptionType',event.subscriptionType)&&field('subscriptionState',event.subscriptionState)&&field('subscriptionGroupId',event.subscriptionGroupId)&&field('updateSource',event.updateSource);break;
  case 'Add an Email Address':matched=event.kind==='email_added'&&!event.previousValue&&typeof event.value==='string'&&event.value.includes('@');break;
  case 'Send an SMS inbound message':case 'Send a WhatsApp inbound message':case 'Send a LINE inbound message':{
   const channel=trigger.type.includes('SMS')?'sms':trigger.type.includes('WhatsApp')?'whatsapp':'line';
   matched=event.kind==='inbound'&&event.channel?.toLowerCase()===channel&&field('subscriptionGroupId',event.subscriptionGroupId)&&(channel!=='sms'||field('keywordCategory',event.keywordCategory));
   if(trigger.bodyCondition==='text')matched=matched&&typeof event.body==='string'&&compareAudienceValue(event.body,{operator:trigger.bodyOperator??'equals',value:trigger.bodyValue??''});
   else if(trigger.bodyCondition==='flow')matched=matched&&Boolean(trigger.flowId)&&trigger.flowId===event.flowId;
   else if(trigger.bodyCondition==='contact')matched=matched&&event.contact===true;
   break;
  }
  case 'Trigger a Geofence':matched=event.kind==='geofence'&&field('geofenceSetId',event.geofenceSetId)&&(!trigger.geofenceEnter&&!trigger.geofenceExit||event.geofenceTransition==='enter'&&trigger.geofenceEnter===true||event.geofenceTransition==='exit'&&trigger.geofenceExit===true);break;
  case 'Enter a Location':matched=event.kind==='location'&&locationMatches(trigger,event);break;
  default:if(canvasRecommendedEvents[trigger.type])matched=['custom','purchase'].includes(event.kind)&&event.name===(trigger.eventName||canvasRecommendedEvents[trigger.type]);
 }
 if(!matched)return false;
 if(!trigger.propertiesEnabled)return true;
 const groups=trigger.propertyFilters??[],properties=event.properties??{};
 if(!groups.some(group=>group.rules.length))return false;
 // Ordinary predicates retain the shared Canvas semantics. Relative predicates use this event's
 // timestamp explicitly, rather than the wall clock, so delayed replay remains deterministic.
 if(!groups.some(group=>group.rules.some(rule=>['less_than_ago','more_than_ago'].includes(rule.operator))))return canvasPropertyGroupsMatch(properties,groups);
 return groups.filter(group=>group.rules.length).every(group=>{
  const results=group.rules.map(rule=>{
   if(!['less_than_ago','more_than_ago'].includes(rule.operator))return canvasPropertyGroupsMatch(properties,[{...group,operator:'AND',rules:[rule]}]);
   const actual=Object.hasOwn(properties,rule.field)?properties[rule.field]:rule.field.split('.').reduce<unknown>((value,key)=>value&&typeof value==='object'&&!['__proto__','constructor','prototype'].includes(key)&&Object.hasOwn(value,key)?(value as Record<string,unknown>)[key]:undefined,properties);
   return compareAudienceValue(actual,rule,'date',Date.parse(event.at));
  });
  return group.operator==='OR'?results.some(Boolean):results.every(Boolean);
 });
}

const dayMs=86400000;
type WallDate={year:number;month:number;day:number;hour:number;minute:number;second:number};
function wallDate(at:number,formatter:Intl.DateTimeFormat):WallDate{
 const fields=Object.fromEntries(formatter.formatToParts(new Date(at)).map(part=>[part.type,Number(part.value)]));
 return {year:fields.year,month:fields.month,day:fields.day,hour:fields.hour,minute:fields.minute,second:fields.second};
}
function wallStamp(parts:WallDate):number{return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);}
function calendarDate(value:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===value?date:null;
}
/** Compatible DST disambiguation: first occurrence in a fold; shift forward by the gap. */
function localEntryInstant(date:number,time:string,formatter:Intl.DateTimeFormat):number|null{
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
 const target=date+Number(time.slice(0,2))*3600000+Number(time.slice(3))*60000,offsets=new Set<number>();
 for(let delta=-2*dayMs;delta<=2*dayMs;delta+=21600000){const sample=target+delta;offsets.add(wallStamp(wallDate(sample,formatter))-sample);}
 const candidates=[...offsets].map(offset=>target-offset).sort((a,b)=>a-b);
 const exact=candidates.find(at=>wallStamp(wallDate(at,formatter))===target);
 if(exact!==undefined)return exact;
 const after=candidates.filter(at=>wallStamp(wallDate(at,formatter))>target).sort((a,b)=>wallStamp(wallDate(a,formatter))-wallStamp(wallDate(b,formatter))||a-b);
 return after[0]??null;
}

/** Returns the next designated occurrence strictly after `after`; immediate entry returns the cursor. */
export function canvasNextEntryAt(entry:CanvasWizardConfig['entry'],after:string,timezone?:string):string|null{
 const cursor=Date.parse(after);
 if(entry.type!=='scheduled'||!Number.isFinite(cursor))return null;
 try{
  const zone=entry.localTimeZone?timezone||'UTC':entry.timeZone?.startsWith('Company time')?'America/New_York':entry.timeZone||'UTC';
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let end=Infinity;
  if(entry.endEnabled){const date=calendarDate(entry.endDate);if(date===null)return null;const instant=localEntryInstant(date,entry.endTime,formatter);if(instant===null)return null;end=instant;}
  if(entry.timing==='immediate')return cursor<=end?new Date(cursor).toISOString():null;
  const start=calendarDate(entry.startDate);
  if(start===null||!['Once','Daily','Weekly','Monthly'].includes(entry.frequency))return null;
  const anchor=new Date(start),local=wallDate(cursor,formatter),localDay=Date.UTC(local.year,local.month-1,local.day),monthly=entry.frequency==='Monthly',stride=entry.frequency==='Weekly'?7:1;
  let index=entry.frequency==='Once'?0:monthly?Math.max(0,(local.year-anchor.getUTCFullYear())*12+local.month-1-anchor.getUTCMonth()-1):Math.max(0,Math.floor((localDay-start)/(stride*dayMs))-1);
  for(let attempts=0;attempts<5;attempts++,index++){
   let date=start+index*stride*dayMs;
   if(monthly){const month=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+index,1)),lastDay=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();date=Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),Math.min(anchor.getUTCDate(),lastDay));}
   const instant=localEntryInstant(date,entry.startTime,formatter);
   if(instant===null)return null;
   if(instant>cursor)return instant<=end?new Date(instant).toISOString():null;
   if(entry.frequency==='Once')return null;
  }
  return null;
 }catch{return null;}
}

function stableFraction(parts:string[]):number{
 let hash=2166136261;
 for(const character of JSON.stringify(parts)){hash^=character.codePointAt(0)!;hash=Math.imul(hash,16777619);}
 hash^=hash>>>16;hash=Math.imul(hash,0x85ebca6b);hash^=hash>>>13;hash=Math.imul(hash,0xc2b2ae35);hash^=hash>>>16;
 return (hash>>>0)/4294967296;
}

/** A deterministic weighted assignment; zero-weight or invalid distributions never receive users. */
export function canvasAssignedVariant(canvasId:string,userId:string,variants:CanvasVariant[]):CanvasVariant|null{
 if(variants.some(variant=>!variant.id||!Number.isFinite(variant.weight)||variant.weight<0)||new Set(variants.map(variant=>variant.id)).size!==variants.length)return null;
 const sorted=variants.filter(variant=>variant.weight>0).slice().sort((a,b)=>a.id.localeCompare(b.id,'en')),total=sorted.reduce((sum,variant)=>sum+variant.weight,0);
 if(!total||!Number.isFinite(total))return null;
 let cursor=stableFraction([canvasId,userId])*total;
 for(const variant of sorted){cursor-=variant.weight;if(cursor<0)return variant;}
 return sorted.at(-1)??null;
}

export type CanvasActionPathDecision={status:'waiting'|'nextPath';deadline:string;nextPath:CanvasPath|null;at:string|null;eventId?:string};
/** First action wins immediately; ranked evaluation waits and uses the saved path order. */
export function canvasActionPathDecision(config:Record<string,unknown>,enteredAt:string,now:string,events:CanvasRuntimeEvent[],context:CanvasTriggerContext={}):CanvasActionPathDecision{
 const start=Date.parse(enteredAt),current=Date.parse(now),duration=Number(config.evaluationValue??1)*({Seconds:1000,Minutes:60000,Hours:3600000,Days:dayMs,Weeks:7*dayMs}[String(config.evaluationUnit??'Days')]??NaN);
 if(!Number.isFinite(start)||!Number.isFinite(current)||!Number.isFinite(duration)||duration<=0)throw new Error('Configure a valid Action Paths evaluation window.');
 const until=start+duration,deadline=new Date(until).toISOString(),waiting:CanvasActionPathDecision={status:'waiting',deadline,nextPath:null,at:null};
 const paths=Array.isArray(config.paths)?config.paths as CanvasPath[]:[],ordered=paths.filter(path=>path.id!=='everyone_else');
 if(config.rankedPaths===true&&current<until)return waiting;
 const facts=events.filter(event=>{const at=Date.parse(event.at);return Number.isFinite(at)&&at>=start&&at<=until&&at<=current;}).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||(a.id??'').localeCompare(b.id??'','en'));
 const match=(path:CanvasPath,event:CanvasRuntimeEvent)=>(path.triggers??[]).some(trigger=>canvasTriggerMatches(trigger,event,context));
 let nextPath:CanvasPath|undefined,event:CanvasRuntimeEvent|undefined;
 if(config.rankedPaths===true){nextPath=ordered.find(path=>facts.some(fact=>match(path,fact)));if(nextPath)event=facts.find(fact=>match(nextPath!,fact));}
 else for(const fact of facts){const path=ordered.find(path=>match(path,fact));if(path){nextPath=path;event=fact;break;}}
 if(!nextPath&&current<until)return waiting;
 nextPath??=paths.find(path=>path.id==='everyone_else');
 return{status:'nextPath',deadline,nextPath:nextPath??null,at:config.rankedPaths===true||!event?deadline:new Date(event.at).toISOString(),...(event?.id?{eventId:event.id}:{})};
}

export type CanvasPathExposure={id:string;userId:string;pathId:string;at:string};
export type CanvasPathConversion={exposureId:string;at:string};
export type CanvasWinningPathState={winnerPathId:string;decidedAt:string};
export type CanvasWinningPathInput={startedAt:string;now:string;exposures:CanvasPathExposure[];conversions:CanvasPathConversion[];/** @deprecated Retained for callers; Winning Path has no local exposure-count requirement. */minExposuresPerPath?:number;statisticallySignificant?:boolean;state?:CanvasWinningPathState};
export type CanvasWinningPathDecision={status:'waiting'|'assigned';deadline:string;winnerPathId:string|null;decidedAt:string|null;reason:'window'|'data'|null;significance:'not_evaluated'|'significant'|'not_significant';scores:Array<{pathId:string;exposures:number;conversions:number;conversionRate:number}>;allocations:Array<{pathId:string;weight:number}>};

function winningPathSignificance(scores:CanvasWinningPathDecision['scores']):CanvasWinningPathDecision['significance']{
 if(scores.length<2||scores.some(score=>score.exposures<=0))return'not_evaluated';
 const best=scores.reduce((one,two)=>two.conversionRate>one.conversionRate?two:one);
 for(const other of scores.filter(score=>score!==best)){
  const total=best.exposures+other.exposures,successes=best.conversions+other.conversions;
  const expected=[best.exposures*successes/total,best.exposures*(total-successes)/total,other.exposures*successes/total,other.exposures*(total-successes)/total];
  // Pearson's asymptotic approximation is not reported on sparse expected cells.
  if(expected.some(count=>count<5))return'not_evaluated';
  const actual=[best.conversions,best.exposures-best.conversions,other.conversions,other.exposures-other.conversions];
  const chiSquared=actual.reduce((sum,count,index)=>sum+(count-expected[index])**2/expected[index],0);
  // A 2x2 table has one degree of freedom; this is the p=0.05 critical value.
  if(best.conversionRate<=other.conversionRate||chiSquared<=3.841458820694124)return'not_significant';
 }
 return'significant';
}

/** Inputs must be actual observations scoped to this Canvas and experiment step by the caller.
 * Braze's default selects the highest rate when the window ends, even without significance;
 * ties follow the saved UI order. Pairwise Pearson chi-squared tests at p<0.05 follow
 * Braze's published A/B test method; sparse expected cells remain unevaluated.
 * Explicit `winningPathFallback: 'mix'` retains distribution until a significant leader exists.
 */
export function canvasWinningPathDecision(config:Record<string,unknown>,input:CanvasWinningPathInput):CanvasWinningPathDecision{
 const start=Date.parse(input.startedAt),current=Date.parse(input.now),window=Number(config.experimentWindowDays??7)*dayMs;
 if(!Number.isFinite(start)||!Number.isFinite(current)||!Number.isFinite(window)||window<=0)throw new Error('Configure a valid experiment window.');
 const until=start+window,deadline=new Date(until).toISOString(),paths=(Array.isArray(config.paths)?config.paths:[]) as CanvasPath[],positive=paths.filter(path=>Number(path.weight)>0),candidates=positive.length?positive:paths,ids=new Set(candidates.map(path=>path.id));
 const exposures=new Map<string,CanvasPathExposure>(),conflicting=new Set<string>();
 for(const exposure of input.exposures){
  const at=Date.parse(exposure.at);
  if(!exposure.id||!exposure.userId||!ids.has(exposure.pathId)||!Number.isFinite(at)||at<start||at>until||at>current||conflicting.has(exposure.id))continue;
  const existing=exposures.get(exposure.id);
  if(existing&&(existing.userId!==exposure.userId||existing.pathId!==exposure.pathId||existing.at!==exposure.at)){exposures.delete(exposure.id);conflicting.add(exposure.id);}else exposures.set(exposure.id,exposure);
 }
 const converted=new Set<string>();
 for(const conversion of input.conversions){const exposure=exposures.get(conversion.exposureId),at=Date.parse(conversion.at);if(exposure&&Number.isFinite(at)&&at>=Date.parse(exposure.at)&&at<=until&&at<=current)converted.add(exposure.id);}
 const scores=candidates.map(path=>{const observations=[...exposures.values()].filter(exposure=>exposure.pathId===path.id),conversions=observations.filter(exposure=>converted.has(exposure.id)).length;return{pathId:path.id,exposures:observations.length,conversions,conversionRate:observations.length?conversions/observations.length:0};});
 const state=input.state;
 const validState=state&&ids.has(state.winnerPathId)&&Number.isFinite(Date.parse(state.decidedAt))&&Date.parse(state.decidedAt)>=until&&Date.parse(state.decidedAt)<=current?state:undefined;
 const significance:CanvasWinningPathDecision['significance']=input.statisticallySignificant===true?'significant':input.statisticallySignificant===false?'not_significant':winningPathSignificance(scores);
 const completed=Boolean(validState)||current>=until&&scores.length>0,mix=completed&&!validState&&config.winningPathFallback==='mix'&&significance!=='significant';
 const best=scores.reduce<(typeof scores)[number]|undefined>((best,score)=>!best||score.conversionRate>best.conversionRate?score:best,undefined);
 const winnerPathId=validState?.winnerPathId??(completed&&!mix?best?.pathId??null:null);
 const reason:CanvasWinningPathDecision['reason']=mix?'data':completed?null:current<until?'window':'data';
 return{status:completed?'assigned':'waiting',deadline,winnerPathId,decidedAt:completed?(validState?.decidedAt??new Date(current).toISOString()):null,reason,significance,scores,allocations:paths.map(path=>({pathId:path.id,weight:winnerPathId?(path.id===winnerPathId?100:0):Number(path.weight??0)}))};
}

export type CanvasOptimizerOutcome={selections:Record<string,string>;exposures:number;opens:number;clicks:number};
export type CanvasOptimizerDecision={status:'exploring'|'optimized'|'unavailable';combinationId:string|null;selections:Record<string,string>;components:Record<string,string>;exposures:number;outcomes:number;rate:number|null;reason?:string};

/** Selects only authored content. Outcome counts must be scoped, deduplicated observations from the store.
 * The default 30-exposure threshold is a local exploration policy, not Braze's optimization algorithm.
 */
export function canvasOptimizerDecision(config:Record<string,unknown>,canvasId:string,userId:string,outcomes:CanvasOptimizerOutcome[],options:{minExposures?:number}={}):CanvasOptimizerDecision{
 const components=canvasOptimizerComponents(config).map(component=>({...component,variants:component.variants.filter(variant=>variant.value.trim()).slice().sort((a,b)=>a.id.localeCompare(b.id,'en'))})).sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const issues=canvasOptimizerIssues(config),minimum=options.minExposures??30;
 if(new Set(components.map(component=>component.id)).size!==components.length||components.some(component=>!component.id||component.variants.some(variant=>!variant.id)||new Set(component.variants.map(variant=>variant.id)).size!==component.variants.length))issues.push('Use unique component and variant IDs.');
 if(!Number.isInteger(minimum)||minimum<1)issues.push('Choose a positive minimum number of exposures.');
 if(issues.length)return{status:'unavailable',combinationId:null,selections:{},components:{},exposures:0,outcomes:0,rate:null,reason:issues.join(' ')};
 const key=(selections:Record<string,string>)=>JSON.stringify(components.map(component=>[component.id,selections[component.id]]));
 const observations=new Map<string,CanvasOptimizerOutcome>();
 for(const row of outcomes){
  if(!row.selections||Object.keys(row.selections).length!==components.length||!components.every(component=>Object.hasOwn(row.selections,component.id)&&component.variants.some(variant=>variant.id===row.selections[component.id]))||![row.exposures,row.opens,row.clicks].every(value=>Number.isSafeInteger(value)&&value>=0)||row.opens>row.exposures||row.clicks>row.exposures)continue;
  const id=key(row.selections),previous=observations.get(id);
  observations.set(id,{selections:{...row.selections},exposures:(previous?.exposures??0)+row.exposures,opens:(previous?.opens??0)+row.opens,clicks:(previous?.clicks??0)+row.clicks});
 }
 const metric=config.optimizationEvent==='opens'?'opens':'clicks',eligible=[...observations.entries()].filter(([,row])=>row.exposures>=minimum).sort(([a,one],[b,two])=>two[metric]/two.exposures-one[metric]/one.exposures||a.localeCompare(b,'en'));
 const best=eligible[0]?.[1],selections=Object.fromEntries(components.map(component=>[component.id,best?best.selections[component.id]:component.variants[Math.floor(stableFraction([canvasId,userId,component.id])*component.variants.length)].id])),selected=observations.get(key(selections));
 return{status:best?'optimized':'exploring',combinationId:key(selections),selections,components:Object.fromEntries(components.map(component=>[component.type,component.variants.find(variant=>variant.id===selections[component.id])!.value])),exposures:selected?.exposures??0,outcomes:selected?.[metric]??0,rate:selected?.exposures?selected[metric]/selected.exposures:null};
}
