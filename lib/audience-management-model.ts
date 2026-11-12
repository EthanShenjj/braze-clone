import { audienceConfigurationIssues, type AudienceGroup } from "./campaign-shared.ts";

export type SegmentOptions = { appIds: string[]; analyticsTracking: boolean; groupOperator: "AND"|"OR" };

export function segmentOptions(value: unknown): SegmentOptions {
  if (value === undefined) return { appIds: [], analyticsTracking: false, groupOperator:"AND" };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid segment options.");
  const options = value as Record<string, unknown>;
  if (!Array.isArray(options.appIds) || options.appIds.some(id => typeof id !== "string" || !id.trim()) || typeof options.analyticsTracking !== "boolean") throw new Error("Choose valid apps and an Analytics Tracking state.");
  if(options.groupOperator!==undefined&&options.groupOperator!=="AND"&&options.groupOperator!=="OR")throw new Error("Choose AND or OR for linked segment groups.");
  return { appIds: [...new Set(options.appIds as string[])], analyticsTracking: options.analyticsTracking, groupOperator:options.groupOperator==="OR"?"OR":"AND" };
}

export function segmentGroups(value: unknown): AudienceGroup[] {
  if (!Array.isArray(value)) throw new Error("Invalid segment filter groups.");
  if (value.some(group => !group || typeof group.exclude !== "boolean")) throw new Error("Each segment group needs a valid exclusion state.");
  const issues = audienceConfigurationIssues({ channel: "push", config: { audienceGroups: value } });
  if (issues.length) throw new Error(issues.join(" "));
  return value as AudienceGroup[];
}

export const subscriptionKeywordLanguages=["English","Afrikaans","Arabic","Bengali","Chinese","Croatian","Czech","Danish","Dutch","Estonian","Finnish","French","German","Greek","Hebrew","Hindi","Hungarian","Italian","Japanese","Korean","Latvian","Lithuanian","Malay","Norwegian","Polish","Portuguese","Russian","Slovak","Slovenian","Spanish","South Ndebele","Southern Sotho","Swati","Swedish","Tamil","Tswana","Tsonga","Venda","Xhosa","Zulu","Other"] as const;
export type SubscriptionKeyword={id:string;category:string;keywords:string[];response:string;linkShortening:boolean;required?:boolean};
export type SubscriptionSettings={linkShorteningDomain:string;languages:string[];keywords:Record<string,SubscriptionKeyword[]>};
export const defaultSubscriptionKeywords:SubscriptionKeyword[]=[
 {id:"opt-in",category:"Opt-In",keywords:["START","UNSTOP","YES"],response:"You have been re-subscribed to messages from this number. Reply HELP for help. Reply STOP to unsubscribe. Msg&Data Rates May Apply.",linkShortening:true,required:true},
 {id:"opt-out",category:"Opt-Out",keywords:["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT","OPT OUT","REVOKE"],response:"You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.",linkShortening:true,required:true},
 {id:"help",category:"Help",keywords:["HELP","INFO"],response:"Reply STOP to unsubscribe. Msg&Data Rates May Apply.",linkShortening:true,required:true},
];
export function subscriptionSettings(value:unknown):SubscriptionSettings{
 if(value===undefined)return{linkShorteningDomain:"brz.ai",languages:["English"],keywords:{English:structuredClone(defaultSubscriptionKeywords)}};
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid subscription group settings.");
 const data=value as Record<string,unknown>;
 if(typeof data.linkShorteningDomain!=="string"||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(data.linkShorteningDomain))throw new Error("Choose a valid link shortening domain.");
 if(!Array.isArray(data.languages)||!data.languages.length||data.languages.some(language=>typeof language!=="string"||!subscriptionKeywordLanguages.includes(language as typeof subscriptionKeywordLanguages[number]))||new Set(data.languages).size!==data.languages.length)throw new Error("Choose valid keyword languages.");
 if(!data.keywords||typeof data.keywords!=="object"||Array.isArray(data.keywords))throw new Error("Add keyword categories for each language.");
 const keywords:Record<string,SubscriptionKeyword[]>={};
 for(const language of data.languages as string[]){
  const entries=(data.keywords as Record<string,unknown>)[language];if(!Array.isArray(entries)||entries.length>100)throw new Error("Invalid keyword categories.");
  const seen=new Set<string>(),ids=new Set<string>();
  keywords[language]=entries.map((entry:SubscriptionKeyword)=>{
   if(!entry||typeof entry.id!=="string"||!entry.id||ids.has(entry.id)||typeof entry.category!=="string"||!entry.category.trim()||entry.category.length>100||typeof entry.response!=="string"||!entry.response.trim()||entry.response.length>1600||typeof entry.linkShortening!=="boolean"||!Array.isArray(entry.keywords)||!entry.keywords.length)throw new Error("Complete the keyword category, keywords and reply message.");
   ids.add(entry.id);
   const normalized=entry.keywords.map(keyword=>{if(typeof keyword!=="string"||!keyword.trim()||keyword.length>50)throw new Error("Enter valid keywords (maximum 50 characters).");const result=keyword.trim().toUpperCase();if(seen.has(result))throw new Error("Keywords must be unique across categories (case-insensitive).");seen.add(result);return result;});
   const required=defaultSubscriptionKeywords.find(item=>item.id===entry.id);
   if(required&&required.keywords.some(keyword=>!normalized.includes(keyword)))throw new Error("Required keywords cannot be removed.");
   return{id:entry.id,category:entry.category.trim(),keywords:normalized,response:entry.response,linkShortening:entry.linkShortening,...required?{required:true}:{}};
  });
  if(language==="English"&&defaultSubscriptionKeywords.some(required=>!ids.has(required.id)))throw new Error("Keep required English keyword categories.");
 }
 if(Object.values(keywords).flat().filter(entry=>!entry.required).length>25)throw new Error('Custom keyword categories are limited to a maximum of 25 per Subscription Group.');
 return{linkShorteningDomain:data.linkShorteningDomain,languages:data.languages as string[],keywords};
}

export type ManagedGeofence={id:string;name:string;radius:number;latitude:number;longitude:number;analyticsEnter:boolean;analyticsExit:boolean;cooldownEnter:number;cooldownExit:number;notificationResponsiveness:number};
export function validateGeofenceSet(input:{name:unknown;status?:unknown;data:Record<string,unknown>}){
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)throw new Error('Geofence set name is required (maximum 200 characters).');
 if(input.status!==undefined&&!['Draft','Active','Archived'].includes(String(input.status)))throw new Error('Invalid geofence set status.');
 const {geofences,tags}=input.data;
 if(!Array.isArray(geofences)||geofences.length>10000)throw new Error('Geofences must be an array containing at most 10,000 locations.');
 if(tags!==undefined&&(!Array.isArray(tags)||tags.some(tag=>typeof tag!=='string'||!tag.trim())))throw new Error('Choose valid geofence set tags.');
 const ids=new Set<string>();
 for(const entry of geofences as ManagedGeofence[]){
  if(!entry||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>200)throw new Error('Each geofence needs a unique ID and a name.');ids.add(entry.id);
  if(typeof entry.latitude!=='number'||!Number.isFinite(entry.latitude)||entry.latitude< -90||entry.latitude>90)throw new Error('Latitude must be between -90 and 90.');
  if(typeof entry.longitude!=='number'||!Number.isFinite(entry.longitude)||entry.longitude< -180||entry.longitude>180)throw new Error('Longitude must be between -180 and 180.');
  if(typeof entry.radius!=='number'||!Number.isFinite(entry.radius)||entry.radius<=0)throw new Error('Radius must be greater than zero.');
  if(typeof entry.analyticsEnter!=='boolean'||typeof entry.analyticsExit!=='boolean')throw new Error('Choose the analytics state for entry and exit.');
  if([entry.cooldownEnter,entry.cooldownExit,entry.notificationResponsiveness].some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Cooldown and notification responsiveness must be nonnegative whole numbers.');
 }
}
export type AudienceMergeRules={identifier:'email'|'phone';externalId:'Has external ID';resolveTiesUsing:'created_at'|'updated_at'|'last_session_at';prioritization:'newest'|'oldest'};
export type MergeableAudienceProfile={id:string;email:string;firstName:string;attributes:Record<string,unknown>;createdAt:string|null;updatedAt:string|null;lastSessionAt:string|null};
export function duplicateProfileGroups<T extends MergeableAudienceProfile>(users:T[],rules:AudienceMergeRules){
 const buckets=new Map<string,T[]>();
 for(const user of users){const value=rules.identifier==='email'?user.email.trim().toLowerCase():String(user.attributes.phone??user.attributes.phone_number??'').trim().replace(/[ ()-]/g,'');if(!value)continue;const entries=buckets.get(value)??[];entries.push(user);buckets.set(value,entries);}
 const dateKey={created_at:'createdAt',updated_at:'updatedAt',last_session_at:'lastSessionAt'}[rules.resolveTiesUsing] as 'createdAt'|'updatedAt'|'lastSessionAt';
 return [...buckets].filter(([,profiles])=>profiles.length>1).map(([value,profiles])=>{profiles.sort((a,b)=>{const left=a[dateKey],right=b[dateKey];if(!left||!right)return left?-1:right?1:a.id.localeCompare(b.id);return (rules.prioritization==='newest'?-1:1)*(Date.parse(left)-Date.parse(right))||a.id.localeCompare(b.id);});const candidates=profiles.filter(profile=>!Object.hasOwn(profile.attributes,'external_id')||typeof profile.attributes.external_id==='string'&&Boolean(profile.attributes.external_id.trim())),first=candidates[0]?.[dateKey],mergeable=candidates.length===1||Boolean(candidates.length>1&&first&&candidates.filter(profile=>profile[dateKey]!==null&&Date.parse(profile[dateKey]!)===Date.parse(first)).length===1),winnerId=mergeable?candidates[0].id:null;if(winnerId)profiles=[profiles.find(profile=>profile.id===winnerId)!,...profiles.filter(profile=>profile.id!==winnerId)];return{identifier:rules.identifier,value,profiles,mergeable,winnerId};});
}
export function audienceMergeRules(value:unknown):AudienceMergeRules{
 if(value===undefined)return{identifier:'email',externalId:'Has external ID',resolveTiesUsing:'created_at',prioritization:'newest'};
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid merge rules.');const rules=value as Record<string,unknown>;
 if(!['email','phone'].includes(String(rules.identifier))||rules.externalId!=='Has external ID'||!['created_at','updated_at','last_session_at'].includes(String(rules.resolveTiesUsing))||!['newest','oldest'].includes(String(rules.prioritization)))throw new Error('Choose a valid identifier, external ID rule, tie resolution and prioritization.');return rules as AudienceMergeRules;
}
export function validateAudienceMergeSettings(data:Record<string,unknown>){audienceMergeRules(data.rules);if(typeof data.scheduled!=='boolean')throw new Error('Choose a scheduled merging state.');}
export function validateAudienceSuppressionList(input:{name:string;description?:string;status?:string;data?:Record<string,unknown>}){
 if(!input.name.trim()||input.name.length>200)throw new Error('Suppression list name is required (maximum 200 characters).');if((input.description??'').length>250)throw new Error('Description must contain at most 250 characters.');if(input.status&&!['Active','Inactive','Archived'].includes(input.status))throw new Error('Invalid suppression list status.');if(input.data?.exceptionTags!==undefined&&(!Array.isArray(input.data.exceptionTags)||input.data.exceptionTags.some(tag=>typeof tag!=='string'||!tag.trim())))throw new Error('Choose valid exception tags.');
}
