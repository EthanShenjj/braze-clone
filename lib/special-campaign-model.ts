import type { MessageDraft } from './campaign-shared.ts';

export const apiCampaignChannels = [
  {key:'email',label:'Email'}, {key:'android_push',label:'Android Push'}, {key:'apple_push',label:'iOS Push'}, {key:'kindle_push',label:'Kindle Push'}, {key:'web_push',label:'Web Push'}, {key:'content_card',label:'Content Card'}, {key:'sms',label:'SMS'}, {key:'webhook',label:'Webhook'}, {key:'whatsapp',label:'WhatsApp'},
] as const;
export type ApiCampaignChannel = (typeof apiCampaignChannels)[number]['key'];
export type ApiCampaignVariation = { id:string;channel:ApiCampaignChannel;name:string;[key:string]:unknown };
export type FeatureExperimentVariant = {id:string;name:string;percentage:number;properties:Record<string,unknown>;[key:string]:unknown};
export type FeatureExperiment = {flagId:string;variants:FeatureExperimentVariant[];[key:string]:unknown};
export type FeatureFlagResource = {id:string;name:string;status:string;data:{flagId:string;enabled?:boolean;rollout?:number;properties?:Record<string,unknown>;rules?:unknown[];[key:string]:unknown}};
export const specialUuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function normalizeApiCampaign(draft:MessageDraft,newId:()=>string=()=>crypto.randomUUID()) {
  const config=draft.config??{},stored=Array.isArray(config.apiMessageVariations)?config.apiMessageVariations:[];
  const variations=stored.filter(value=>value&&apiCampaignChannels.some(channel=>channel.key===value.channel)).map((value,index)=>({...value,id:String(value.id??newId()),channel:value.channel,name:String(value.name??`Variant ${index+1}`)})) as ApiCampaignVariation[];
  return {identifier:String(config.apiIdentifier??newId()),variations:variations.length?variations:[{id:newId(),channel:'email' as const,name:'Variant 1'}]};
}
export function apiCampaignIssues(draft:MessageDraft,variations:ApiCampaignVariation[]) {
  const issues:string[]=[];if(!draft.name?.trim())issues.push('Enter a campaign name.');
  if(!variations.length)issues.push('Add at least one channel.');
  if(new Set(variations.map(row=>row.id)).size!==variations.length||variations.some(row=>!row.id))issues.push('Each message variation requires a unique identifier.');
  if(variations.some(row=>!apiCampaignChannels.some(channel=>channel.key===row.channel)))issues.push('Choose a supported API campaign channel.');
  const delivery=object(draft.config?.delivery);
  if(delivery.reeligible===true&&(!Number.isFinite(Number(delivery.reentryValue??0))||Number(delivery.reentryValue??0)<0))issues.push('Re-eligibility must be a nonnegative interval.');
  if(draft.config?.rateLimitEnabled&&(!Number.isSafeInteger(draft.config.rateLimit)||Number(draft.config.rateLimit)<=0))issues.push('The send rate must be a positive whole number.');
  return issues;
}
/** Reference JSON only. Channel content must be supplied by the external sending system. */
export function apiCampaignSendExample(identifier:string,variation:ApiCampaignVariation) {
  return {campaign_id:identifier,external_user_ids:['EXTERNAL_USER_ID'],messages:{[variation.channel]:{message_variation_id:variation.id}}};
}
/** This is the existing local receipt API, not a simulated send action. */
export function apiCampaignReceiptExample(variation:ApiCampaignVariation) {return {userId:'EXTERNAL_USER_ID',event:'delivered',attributes:{variantId:variation.id,channel:variation.channel}};}
export function parseFeatureProperties(source:string):Record<string,unknown> {
  const value=JSON.parse(source);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Variant properties must be a JSON object.');
  if(JSON.stringify(value).length>10000)throw Error('Variant properties may contain no more than 10,000 characters.');
  return value;
}
export function normalizeFeatureExperiment(draft:MessageDraft,newId:()=>string=()=>crypto.randomUUID()):FeatureExperiment {
  const stored=object(draft.config?.featureExperiment);let legacy:Record<string,unknown>={};try{legacy=parseFeatureProperties(draft.body||'{}');}catch{}
  const canonical=Array.isArray(stored.variants)?stored.variants:[];
  const oldVariants=Array.isArray(draft.config?.messageVariants)?draft.config.messageVariants:[];
  const source=canonical.length?canonical:oldVariants;
  const splits=Array.isArray(draft.config?.variantSplits)?draft.config.variantSplits.map(Number):[];
  const splitTotal=splits.reduce((sum,value)=>sum+value,0);
  const variants=source.length?source.map((value,index)=>{const row=object(value);let properties=object(row.properties);if(row.properties===undefined){try{properties=parseFeatureProperties(String(row.body??draft.body??'{}'));}catch{}}
    return {...row,id:String(row.id??newId()),name:String(row.name??`Variant ${index+1}`),percentage:Number(row.percentage??(!canonical.length&&splitTotal>0?(splits[index]??0)/splitTotal*100:100/source.length)),properties};
  }):[{id:newId(),name:'Variant 1',percentage:100,properties:legacy}];
  return {...stored,flagId:String(stored.flagId??draft.subject??''),variants};
}
export function featureExperimentIssues(experiment:FeatureExperiment,flags:FeatureFlagResource[],requireFlag=true):string[] {
  const issues:string[]=[];const flag=flags.find(row=>row.data.flagId===experiment.flagId&&row.status!=='Archived');
  if(requireFlag&&!flag)issues.push('Select an available Feature Flag.');
  if(flag&&Number(flag.data.rollout??0)>0)issues.push('Set the Feature Flag’s everyone else rollout to 0 before starting an experiment.');
  if(experiment.variants.length<2||experiment.variants.length>8)issues.push('Add between 2 and 8 experiment variants.');
  if(new Set(experiment.variants.map(row=>row.id)).size!==experiment.variants.length)issues.push('Experiment variant identifiers must be unique.');
  for(const row of experiment.variants){if(!row.name.trim())issues.push('Name every experiment variant.');if(!Number.isFinite(row.percentage)||row.percentage<0||row.percentage>100)issues.push('Variant percentages must be between 0 and 100.');try{parseFeatureProperties(JSON.stringify(row.properties));}catch(error){issues.push(error instanceof Error?error.message:'Invalid variant properties.');}}
  if(Math.abs(experiment.variants.reduce((sum,row)=>sum+row.percentage,0)-100)>.01)issues.push('Experiment variant percentages must total 100%.');
  return [...new Set(issues)];
}
/** Persist canonical experiment config plus the legacy fields consumed by shared audience/runtime. */
export function featureExperimentPatch(draft:MessageDraft,experiment:FeatureExperiment):Partial<MessageDraft> {
  const first=experiment.variants[0];
  return {subject:experiment.flagId,body:JSON.stringify(first?.properties??{}),schedule:'One time',config:{...draft.config,featureExperiment:experiment,messageVariants:experiment.variants.map(row=>({id:row.id,name:row.name,body:JSON.stringify(row.properties),properties:row.properties})),variantSplits:experiment.variants.map(row=>row.percentage*(100-Number(draft.config?.controlGroup??0))/100),controlGroup:Number(draft.config?.controlGroup??0),channelValues:{...object(draft.config?.channelValues),rollout:100}}};
}
export function updateFeaturePercentages(experiment:FeatureExperiment,percentages:number[]):FeatureExperiment {return {...experiment,variants:experiment.variants.map((variant,index)=>({...variant,percentage:percentages[index]??variant.percentage}))};}
