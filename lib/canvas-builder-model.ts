import type {CanvasGraph,CanvasNode} from './canvas-model.ts';
import type {AudienceGroup,AudienceRule} from './campaign-shared.ts';
import {audienceRuleIssues} from './campaign-shared.ts';
import {compareAudienceValue} from './audience-rule-model.ts';
import {canvasDelayDue} from './canvas-step-model.ts';

// Observed in the Braze Canvas rate selector, including its custom-rate dialog.
export const canvasRatePresets=[10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,500000,1000000];
export function canvasCustomRateValid(value:number){return Number.isInteger(value)&&value>=1000&&value<=1000000;}
export const canvasOptimizerComponentTypes=['Subject','Preheader','Sender Name','Body Header','Body Content','Primary CTA','Image'] as const;
export type CanvasOptimizerComponent={id:string;type:typeof canvasOptimizerComponentTypes[number];variants:Array<{id:string;value:string}>};
export function canvasOptimizerComponents(config:Record<string,unknown>):CanvasOptimizerComponent[]{return Array.isArray(config.optimizerComponents)?config.optimizerComponents.map((value,index)=>{const item=value&&typeof value==='object'?value:{};return{id:String(item.id??`component-${index}`),type:String(item.type??'') as CanvasOptimizerComponent['type'],variants:Array.isArray(item.variants)?item.variants.map((value:unknown,variantIndex:number)=>{const variant=value&&typeof value==='object'?value as Record<string,unknown>:{};return{id:String(variant.id??`variant-${variantIndex}`),value:typeof variant.value==='string'?variant.value:''};}):[]};}):[];}
export function canvasOptimizerCombinations(components:CanvasOptimizerComponent[]){return components.length?components.reduce((total,component)=>{const count=component.variants.filter(variant=>variant.value.trim()).length;return total*(count>=2?count:0);},1):0;}
export function canvasComponentSnippet(type:string){return "{% message_component '"+type.replace(/'/g,'')+"' %}";}
export function canvasOptimizerIssues(config:Record<string,unknown>){const components=canvasOptimizerComponents(config),issues:string[]=[];
 if(!['email','push','sms'].includes(String(config.channel??'')))issues.push('Choose Email, Push notifications, or SMS/MMS/RCS.');
 if(!components.length)issues.push('At least one component is required.');
 if(new Set(components.map(component=>component.type)).size!==components.length)issues.push('Add each component only once.');
 for(const component of components){if(!canvasOptimizerComponentTypes.includes(component.type))issues.push('Choose an available content component.');if(component.variants.filter(variant=>variant.value.trim()).length<2)issues.push(`Add at least 2 variants for ${component.type}.`);}
 if(!['opens','clicks'].includes(String(config.optimizationEvent??'clicks')))issues.push('Choose an optimization event.');
 return issues;
}
export function canvasLongestDuration(graph:CanvasGraph,at=new Date()){
 const entry=graph.nodes.find(node=>node.kind==='entry');let personalized=false,cycle=false;const visiting=new Set<string>(),memo=new Map<string,number>();
 const duration=(node:CanvasNode)=>{const config=node.config??{};if(config.personalizeDelay){personalized=true;return 0;}if(node.kind==='delay'){try{return Math.max(0,(Date.parse(canvasDelayDue(config,at))-at.getTime())/1000);}catch{return 0;}}if(node.kind==='action_paths'){const seconds=Number(config.evaluationValue??1)*({Minutes:60,Hours:3600,Days:86400,Weeks:604800}[String(config.evaluationUnit)]??86400);return Number.isFinite(seconds)?Math.max(0,seconds):0;}return 0;};
 const visit=(id:string):number=>{if(visiting.has(id)){cycle=true;return 0;}if(memo.has(id))return memo.get(id)!;const node=graph.nodes.find(node=>node.id===id);if(!node)return 0;visiting.add(id);const seconds=duration(node)+Math.max(0,...graph.edges.filter(([from])=>from===id).map(([,to])=>visit(to)));visiting.delete(id);memo.set(id,seconds);return seconds;};
 const seconds=entry?visit(entry.id):0;return{seconds,personalized,cycle};
}
export function formatCanvasDuration(seconds:number){let rest=Math.max(0,Math.ceil(seconds));const parts:string[]=[];for(const [unit,size] of [['day',86400],['hour',3600],['minute',60],['second',1]] as const){const count=Math.floor(rest/size);if(count)parts.push(`${count} ${unit}${count===1?'':'s'}`);rest%=size;}return parts.join(' ')||'0 seconds';}
export function canvasDeliverySettings(config:Record<string,unknown>){return{
 intelligentTiming:config.intelligentTiming===true,intelligentFallback:(config.intelligentFallback??config.timingFallback)==='custom'?'custom':'popular',intelligentFallbackTime:String(config.intelligentFallbackTime??config.timingTime??'17:00'),
 messageQuietHours:config.messageQuietHours!==false,deliveryValidationEnabled:(config.deliveryValidationEnabled??config.deliveryValidation)===true,deliverySegmentIds:Array.isArray(config.deliverySegmentIds)?config.deliverySegmentIds.filter((id):id is string=>typeof id==='string'):[],deliveryFilterGroups:normalizeCanvasPropertyGroups(config.deliveryFilterGroups).map(group=>({...group,exclude:Boolean(Array.isArray(config.deliveryFilterGroups)&&(config.deliveryFilterGroups.find(item=>item?.id===group.id)?.exclude))})) as AudienceGroup[],deliveryFailure:config.deliveryFailure==='skip'?'skip':'exit',
};}
export function canvasDeliveryIssues(config:Record<string,unknown>){const settings=canvasDeliverySettings(config),issues:string[]=[];if(settings.intelligentTiming&&settings.intelligentFallback==='custom'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.intelligentFallbackTime))issues.push('Choose a valid Intelligent Timing fallback time.');if(settings.deliveryValidationEnabled)for(const group of settings.deliveryFilterGroups)for(const rule of group.rules)issues.push(...audienceRuleIssues(rule));return issues;}
export type CanvasPropertyGroup={id:string;operator:'AND'|'OR';rules:AudienceRule[]};
export function normalizeCanvasPropertyGroups(value:unknown):CanvasPropertyGroup[]{if(!Array.isArray(value))return[];return value.map((value,index)=>{const group=value&&typeof value==='object'?value as Record<string,unknown>:{};return{id:String(group.id??`group-${index}`),operator:group.operator==='OR'?'OR':'AND',rules:Array.isArray(group.rules)?group.rules.map((value,index)=>{const rule=value&&typeof value==='object'?value as Record<string,unknown>:{};return{...rule,id:String(rule.id??`rule-${index}`),field:typeof rule.field==='string'?rule.field:'',operator:typeof rule.operator==='string'?rule.operator:'equals',value:typeof rule.value==='string'?rule.value:''} as AudienceRule;}):[]};});}
export function canvasPropertyGroupsMatch(properties:Record<string,unknown>,groups:CanvasPropertyGroup[]){return groups.filter(group=>group.rules.length).every(group=>{const matches=group.rules.map(rule=>{const actual=Object.hasOwn(properties,rule.field)?properties[rule.field]:rule.field.split('.').reduce<unknown>((value,key)=>value&&typeof value==='object'&&!['__proto__','constructor','prototype'].includes(key)?(value as Record<string,unknown>)[key]:undefined,properties),kind=typeof actual==='number'?'number':typeof actual==='boolean'?'boolean':typeof actual==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(actual)?'date':'text';return compareAudienceValue(actual,rule,kind);});return group.operator==='AND'?matches.every(Boolean):matches.some(Boolean);});}
