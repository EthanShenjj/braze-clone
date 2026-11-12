import 'server-only';
import {applyProfileRows,audienceUserMessageHistory,configuredAudienceRuleMatches,configuredAudienceUsers,getAudienceUserSubscriptionState,getCampaign,getResource,getUser,listResources,setSubscriptionMember,setUserEmailSubscriptionStatus,type UserRecord} from './braze-store';
import {AudienceManagementError,scopedSubscriptionGroup,scopedSubscriptionGroups} from './audience-management-store';
import {profileAliases,profileDevices,userBelongsToWorkspace,userMatchesLookup} from './audience-users-model';
import {evaluateFlag,stableBucket} from './workspace-modules';
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const scoped=(data:Record<string,unknown>,workspaceId:string)=>String(data.workspaceId??'local')===workspaceId;
export function findAudienceUsers(query:string,workspaceId='local'){
 const users=query.trim()?configuredAudienceUsers({channel:'push',config:{workspaceId}}).filter(user=>userBelongsToWorkspace(user,workspaceId)&&userMatchesLookup(user,query)):[];
 return {data:users,total:users.length,query};
}
export function audienceUser(id:string,workspaceId='local'){
 const user=getUser(id);if(!user||!userBelongsToWorkspace(user,workspaceId))throw new AudienceManagementError('User not found in this workspace.',404);return user;
}
export function audienceUserDetail(id:string,workspaceId='local'){
 const user=audienceUser(id,workspaceId),events=listResources('user-events').filter(row=>row.data.userId===id&&scoped(row.data,workspaceId)),apps=listResources('app-settings').filter(row=>row.status!=='Archived'&&scoped(row.data,workspaceId));
 const messages=audienceUserMessageHistory(id,workspaceId).map(row=>({id:String(row.id),channel:String(row.channel),event_type:String(row.event_type),created_at:String(row.created_at),campaign_id:String(row.campaign_id),campaign_name:row.campaign_name==null?null:String(row.campaign_name),data:obj(JSON.parse(String(row.data_json??'{}')))}));
 const sessions=events.filter(event=>['session_start','Start Session'].includes(event.name)),dates=sessions.map(row=>String(row.data.createdAt??row.updatedAt)).filter(value=>Number.isFinite(Date.parse(value))).sort();
 const custom=new Map<string,{name:string;count:number;lastAt:string}>();for(const event of events.filter(event=>!event.data.productId&&!['session_start','Start Session'].includes(event.name))){const time=String(event.data.createdAt??event.updatedAt),entry=custom.get(event.name)??{name:event.name,count:0,lastAt:''};entry.count++;if(time>entry.lastAt)entry.lastAt=time;custom.set(event.name,entry);}
 const purchases=events.filter(event=>Boolean(event.data.productId)),orders=events.filter(event=>event.name==='ecommerce.order_placed'),refunds=events.filter(event=>event.name==='ecommerce.order_refunded');
 const money=(rows:typeof events)=>{const totals=new Map<string,number>();for(const row of rows){const props=obj(row.data.properties),currency=String(row.data.currency??props.currency??'').toUpperCase(),amount=Number(row.data.productId?Number(row.data.price)*Number(row.data.quantity??1):props.total_price??props.total??props.revenue);if(!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(amount))continue;totals.set(currency,(totals.get(currency)??0)+amount);}return [...totals].map(([currency,amount])=>({currency,amount}));};
 const groups=scopedSubscriptionGroups(workspaceId).filter(group=>group.status==='Active').map(group=>({id:group.id,name:group.name,channel:group.channel,state:getAudienceUserSubscriptionState(group.id,id)}));
 const segments=listResources('segments').filter(row=>row.status!=='Archived'&&scoped(row.data,workspaceId)).map(({id,name})=>({id,name}));
 const assignments=listResources('feature-assignments').filter(row=>{const campaign=getCampaign(String(row.data.campaignId));return row.data.userId===id&&row.status==='Active'&&campaign?.status==='Active'&&scoped(campaign.config,workspaceId);});
 const flags=listResources('feature-flags').filter(resource=>resource.status==='Active'&&scoped(resource.data,workspaceId)).map(resource=>{const evaluation=evaluateFlag(resource.data,user),assignment=assignments.find(row=>row.data.flagId===resource.data.flagId);return{...evaluation,name:resource.name,id:resource.id,flagId:evaluation.id,...assignment?{enabled:assignment.data.enabled===true,properties:obj(assignment.data.properties),matchedRule:'Campaign experiment'}:{},type:assignment?'Experiment':resource.data.canvasId?'Canvas':'Rollout',appIds:resource.data.appIds??[]};});
 return {user,aliases:profileAliases(user.attributes),devices:profileDevices(user.attributes,apps),apps:apps.map(({id,name,data})=>({id,name,platform:String(data.platform??'')})),session:{count:sessions.length||Number(user.attributes.session_count??0),firstAt:dates[0]??user.attributes.first_used_app??null,lastAt:dates.at(-1)??user.attributes.last_used_app??null},customEvents:[...custom.values()].sort((a,b)=>b.lastAt.localeCompare(a.lastAt)),randomBucket:Math.floor(stableBucket(id)*100),messages,groups,segments,flags,commerce:{cart:user.attributes.cart??user.attributes.cart_items??[],revenue:money(orders),refunds:money(refunds),orders:orders.length,purchases:purchases.map(({id,name,data,updatedAt})=>({id,name,...data,createdAt:data.createdAt??updatedAt})),lifetimeRevenue:money(purchases)},calculatedAt:new Date().toISOString()};
}
export function checkUserSegment(userId:string,segmentId:string,workspaceId='local'){
 audienceUser(userId,workspaceId);const segment=getResource(segmentId);if(!segment||segment.type!=='segments'||segment.status==='Archived'||!scoped(segment.data,workspaceId))throw new AudienceManagementError('Choose an available segment.',404);
 return {segmentId,matches:configuredAudienceRuleMatches(userId,{field:'membership:segment',operator:'equals',value:'true',params:{segmentId}},workspaceId)};
}
export function updateAudienceUser(id:string,input:Record<string,unknown>,workspaceId='local'){
 const user=audienceUser(id,workspaceId);
 if(input.action==='email-subscription'){
  if(!['opted_in','subscribed','unsubscribed'].includes(String(input.state)))throw new AudienceManagementError('Choose a valid subscription state.');setUserEmailSubscriptionStatus(id,input.state as UserRecord['emailSubscriptionStatus']);
 }else if(input.action==='push-subscription'){
  if(!['opted_in','subscribed','unsubscribed'].includes(String(input.state)))throw new AudienceManagementError('Choose a valid subscription state.');applyProfileRows([{external_id:id,attributes:{...user.attributes,push_subscription_status:input.state}}]);
 }else if(input.action==='group-subscription'){
  if(!['subscribed','unsubscribed'].includes(String(input.state)))throw new AudienceManagementError('Choose a valid subscription state.');const group=scopedSubscriptionGroup(String(input.groupId??''),workspaceId);if(group.status!=='Active')throw new AudienceManagementError('Subscription group is archived.');setSubscriptionMember(group.id,id,input.state as 'subscribed'|'unsubscribed');
 }else throw new AudienceManagementError('Choose a supported profile action.');
 return audienceUserDetail(id,workspaceId);
}
