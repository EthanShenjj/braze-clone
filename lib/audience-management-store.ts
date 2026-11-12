import "server-only";
import { audienceDuplicatePreview,configuredAudienceUsers, estimateConfiguredAudience, getResource, listCampaigns, listResources, createResource,updateResource,workspaceTransaction,listSubscriptionGroups,getSubscriptionGroup,createSubscriptionGroup,updateSubscriptionGroup,listSubscriptionMembers,type SubscriptionGroupRecord, type UserRecord } from "./braze-store";
import type { MessageDraft } from "./campaign-shared";
import { objectValue } from "./workspace-modules";
import { audienceMergeRules,subscriptionSettings } from "./audience-management-model";

export class AudienceManagementError extends Error { constructor(message:string, public status=400){super(message);} }
const scoped=(data:Record<string,unknown>,workspaceId:string)=>String(data.workspaceId??"local")===workspaceId;

export function segmentManagementData(id:string,workspaceId="local") {
  const segment=id==='__all_users__'?{id,type:'segments',name:'All Users',description:'',status:'Active',updatedAt:'',data:{workspaceId,audienceGroups:[]}}:getResource(id);
  if(!segment||segment.type!=="segments"||segment.status==="Archived"||!scoped(segment.data,workspaceId))throw new AudienceManagementError("Segment not found in this workspace.",404);
  const snapshot:MessageDraft={channel:"push",audience:segment.name,config:{workspaceId}};
  const users=configuredAudienceUsers(snapshot),statistics=estimateConfiguredAudience(snapshot),ids=new Set(users.map(user=>user.id));
  const events=listResources("user-events").filter(event=>scoped(event.data,workspaceId));
  const allUsers=configuredAudienceUsers({channel:"push",config:{workspaceId}});
  const references=(value:unknown):boolean=>{
    if(!value||typeof value!=="object")return false;
    if(Array.isArray(value))return value.some(references);
    const data=value as Record<string,unknown>,params=objectValue(data.params);
    if(Array.isArray(data.audienceSegments)&&data.audienceSegments.includes(segment.name))return true;
    if(Array.isArray(data.segments)&&data.segments.includes(segment.name))return true;
    if([data.segmentIds,data.exitSegmentIds].some(ids=>Array.isArray(ids)&&ids.includes(segment.id)))return true;
    if(data.field==="segment:"+segment.id||data.field==="segment:"+segment.name||data.field==="membership:segment"&&params.segmentId===segment.id)return true;
    return Object.values(data).some(references);
  };
  const usage={
    campaigns:listCampaigns({includeArchived:false,limit:1000,workspaceId}).data.filter(campaign=>campaign.audience===segment.name||references(campaign.config)).map(({id,name})=>({id,name})),
    segments:listResources("segments").filter(row=>row.id!==id&&row.status!=="Archived"&&scoped(row.data,workspaceId)&&references(row.data)).map(({id,name})=>({id,name})),
    canvases:listResources("canvas").filter(row=>row.status!=="Archived"&&scoped(row.data,workspaceId)&&references(row.data)).map(({id,name})=>({id,name})),
  };
  const now=Date.now(),days=86400000;
  const metrics=(profiles:UserRecord[])=>{
    const selected=new Set(profiles.map(user=>user.id)),sessions=new Map<string,number[]>(),purchases=new Map<string,number[]>();let revenue=0;const currencies=new Set<string>();
    for(const event of events){const userId=String(event.data.userId);if(!selected.has(userId))continue;const at=Date.parse(String(event.data.createdAt??event.updatedAt));if(!Number.isFinite(at)||at>now)continue;
      if(["session_start","Start Session"].includes(event.name)){const values=sessions.get(userId)??[];values.push(at);sessions.set(userId,values);}
      if(event.data.productId){const values=purchases.get(userId)??[];values.push(at);purchases.set(userId,values);const amount=Number(event.data.price??0)*Number(event.data.quantity??1);if(Number.isFinite(amount))revenue+=amount;const currency=typeof event.data.currency==='string'?event.data.currency.trim().toUpperCase():'';currencies.add(/^[A-Z]{3}$/.test(currency)?currency:'');}
    }
    const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
    const firstSessions=[...sessions.values()].map(values=>Math.min(...values)),lastSessions=[...sessions.values()].map(values=>Math.max(...values));
    return {
      sessionFrequency:mean([...sessions.values()].map(values=>values.length/Math.max(1,(now-Math.min(...values))/days))),
      timeSinceFirstSession:mean(firstSessions.map(at=>(now-at)/days)),timeSinceLastSession:mean(lastSessions.map(at=>(now-at)/days)),
      lifetimeRevenue:currencies.size<=1&&!currencies.has('')?revenue:null,ltvCurrency:currencies.size===1&&!currencies.has('')?[...currencies][0]:null,
      timeToFirstPurchase:mean([...purchases].flatMap(([userId,values])=>{const first=sessions.get(userId);return first?[Math.max(0,(Math.min(...values)-Math.min(...first))/days)]:[];})),
      timeSinceLastPurchase:mean([...purchases.values()].map(values=>(now-Math.max(...values))/days)),
    };
  };
  const preview=users.slice(0,50).map(user=>{const sessions=events.filter(event=>event.data.userId===user.id&&['session_start','Start Session'].includes(event.name)).map(event=>String(event.data.createdAt??event.updatedAt)).filter(at=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now).sort();return sessions.length?{...user,attributes:{...user.attributes,session_count:sessions.length,first_session_at:sessions[0],last_session_at:sessions.at(-1)}}:user;});
  return {segment,statistics,usage,metrics:metrics(users),baselineMetrics:metrics(allUsers),users:preview,userCount:ids.size,calculatedAt:new Date(now).toISOString()};
}

function subscriptionMetadata(id:string){return listResources('subscription-group-metadata').find(row=>row.data.groupId===id);}
export function scopedSubscriptionGroup(id:string,workspaceId='local'){
 const group=getSubscriptionGroup(id),metadata=subscriptionMetadata(id);
 if(!group||String(metadata?.data.workspaceId??'local')!==workspaceId)throw new AudienceManagementError('Subscription group not found in this workspace.',404);
 return{...group,workspaceId,settings:subscriptionSettings(metadata?.data.settings),shortCodes:Array.isArray(metadata?.data.shortCodes)?metadata.data.shortCodes as string[]:[],longCodes:Array.isArray(metadata?.data.longCodes)?metadata.data.longCodes as string[]:[],countryAllowlist:Array.isArray(metadata?.data.countryAllowlist)?metadata.data.countryAllowlist as string[]:[],whatsappSenders:Array.isArray(metadata?.data.whatsappSenders)?metadata.data.whatsappSenders.map(value=>objectValue(value)).filter(value=>typeof value.name==='string'&&typeof value.phoneNumber==='string').map(value=>({name:String(value.name),phoneNumber:String(value.phoneNumber)})):[]};
}
export function scopedSubscriptionGroups(workspaceId='local',input:Parameters<typeof listSubscriptionGroups>[0]={}){
 return listSubscriptionGroups(input).filter(group=>String(subscriptionMetadata(group.id)?.data.workspaceId??'local')===workspaceId).map(group=>scopedSubscriptionGroup(group.id,workspaceId));
}
export function createManagedSubscriptionGroup(input:Parameters<typeof createSubscriptionGroup>[0],workspaceId='local'){
 return workspaceTransaction(()=>{const group=createSubscriptionGroup(input,workspaceId);createResource({type:'subscription-group-metadata',name:group.id,status:'Active',data:{groupId:group.id,workspaceId,settings:subscriptionSettings(undefined)}});return scopedSubscriptionGroup(group.id,workspaceId);});
}
export function updateManagedSubscriptionGroup(id:string,input:Partial<Pick<SubscriptionGroupRecord,'name'|'description'|'channel'|'status'|'capabilities'>>&{settings?:unknown;expectedUpdatedAt?:unknown},workspaceId='local'){
 return workspaceTransaction(()=>{const current=scopedSubscriptionGroup(id,workspaceId);if(input.expectedUpdatedAt!==undefined&&input.expectedUpdatedAt!==current.updatedAt)throw new AudienceManagementError('Subscription group changed in another tab. Reload before saving.',409);if(input.description!==undefined&&input.description.length>250)throw new AudienceManagementError('Description must contain at most 250 characters.');if(input.name!==undefined&&!input.name.trim())throw new AudienceManagementError('Subscription group name is required.');
 const settings=input.settings===undefined?current.settings:subscriptionSettings(input.settings),metadata=subscriptionMetadata(id);
 updateSubscriptionGroup(id,input,workspaceId);
 if(input.settings!==undefined){if(metadata)updateResource(metadata.id,{data:{...metadata.data,settings}});else createResource({type:'subscription-group-metadata',name:id,status:'Active',data:{groupId:id,workspaceId,settings}});}
 return scopedSubscriptionGroup(id,workspaceId);});
}
export function subscriptionStatistics(id:string,workspaceId='local',days=30,range?:{from?:string;to?:string}){
 scopedSubscriptionGroup(id,workspaceId);if(!Number.isInteger(days)||days<1||days>100000)throw new AudienceManagementError('Choose a valid date range.');
 const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const since=range?.from??new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10),until=range?.to??new Date().toISOString().slice(0,10);
 if(!validDate(since)||!validDate(until)||since>until)throw new AudienceManagementError('Choose a valid start and end date.');
 return listResources('subscription-group-statistics').filter(row=>row.data.groupId===id&&scoped(row.data,workspaceId)&&String(row.data.date)>=since&&String(row.data.date)<=until).map(row=>row.data).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
export function calculateSubscriptionStatistics(id:string,workspaceId='local'){
 return workspaceTransaction(()=>{scopedSubscriptionGroup(id,workspaceId);const date=new Date().toISOString().slice(0,10),data={workspaceId,groupId:id,date,subscribed:listSubscriptionMembers(id,{state:'subscribed',limit:1})!.total,unsubscribed:listSubscriptionMembers(id,{state:'unsubscribed',limit:1})!.total,calculatedAt:new Date().toISOString()},existing=listResources('subscription-group-statistics').find(row=>row.data.groupId===id&&row.data.date===date&&scoped(row.data,workspaceId));
 if(existing)updateResource(existing.id,{data});else createResource({type:'subscription-group-statistics',name:`${id} ${date}`,status:'Calculated',data});return data;});
}
export function duplicateAudienceProfiles(workspaceId='local',preview=audienceDuplicatePreview(workspaceId)){
 return{...preview,groups:preview.groups.map(group=>({...group,profiles:group.profiles.map(({id,email,firstName,createdAt,updatedAt,lastSessionAt})=>({id,email,firstName,createdAt,updatedAt,lastSessionAt}))}))};
}
