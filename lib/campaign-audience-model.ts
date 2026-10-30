import type { MessageDraft } from './campaign-shared.ts';
import {audienceFilterCatalog,otherAudienceFilters,type CampaignFilterChoice} from './campaign-filter-catalog.ts';

export type CampaignFormCapabilities={brazeAI:{available:boolean;reason?:string};attributes:string[];apps:Array<{id:string;name:string}>;subscriptionGroups:Array<{id:string;name:string}>;campaigns:Array<{id:string;name:string;channel:string;variants:Array<{id:string;name:string}>}>;featureFlags:Array<{id:string;name:string}>;linkAliases:Array<{name:string}>};
export function campaignAudienceFieldKind(field:string):'date'|'number'|'boolean'|'text'{
 if(['created_at','first_session_at','last_session_at','last_received_message_at','last_engaged_message_at','last_control_at','attr:dob','attr:uninstall_date','attr:email_opt_in_date','attr:email_unsubscribed_date','attr:push_opt_in_date','attr:push_unsubscribed_date'].includes(field)||field.startsWith('receipt_last:')||field.startsWith('receipt_channel_last:')||field.startsWith('session_app_first:')||field.startsWith('session_app_last:'))return'date';
 if(['age','random_bucket','session_count','median_session_duration_seconds','purchase_count','purchase_total','ecommerce_order_count','ecommerce_revenue','ecommerce_refund_total','attr:device_count','attr:facebook_friends_count','attr:twitter_followers_count'].includes(field)||['event_count:','campaign_interaction:','receipt_count:','receipt_variant:','receipt_alias:','session_app_count:','session_recent:'].some(prefix=>field.startsWith(prefix)))return'number';
 if(['subscribed','reachable','pending_deletion','email_available','location_available','never_received_message','attr:uninstalled','attr:connected_facebook','attr:connected_twitter','attr:ad_tracking_enabled','attr:invalid_phone_number','attr:foreground_push_enabled','attr:push_enabled','attr:provisionally_authorized','attr:email_hard_bounced','attr:email_marked_spam','attr:email_soft_bounced'].includes(field)||field.startsWith('segment:')||field.startsWith('feature_enabled:'))return'boolean';
 return'text';
}
export function campaignAudienceFieldLabel(field:string,capabilities?:CampaignFormCapabilities|null):string{
 const find=(choices:CampaignFilterChoice[]):string|undefined=>{for(const choice of choices){if(choice.field===field)return choice.label;const nested=choice.children&&find(choice.children);if(nested)return nested;}};
 const label=find([...otherAudienceFilters,...audienceFilterCatalog.flatMap(category=>category.fields)])??(field.startsWith('attr:')?field.slice(5):field.startsWith('segment:')?`Segment: ${field.slice(8)}`:field.startsWith('event_count:')?`Custom event: ${field.slice(12)}`:field.startsWith('subscription_group:')?'Subscription Group':field.startsWith('receipt_variant:')?'Received Campaign Variant':field.startsWith('receipt_last:')?'Last Received Message from Specific Campaign':field.startsWith('receipt_count:conversion:')?'Converted From Campaign':field.startsWith('receipt_count:control:')?'In Campaign Control Group':field.startsWith('receipt_count:engaged:')?'Clicked/Opened Campaign':field.startsWith('receipt_count:')?'Received Message from Campaign':field.startsWith('receipt_alias:')?'Clicked Alias in Campaign':field.startsWith('feature_enabled:')?'Feature Flags':field.startsWith('session_app_count:')?'Session Count For App':field.startsWith('session_app_first:')?'First Used Specific App':field.startsWith('session_app_last:')?'Last Used Specific App':field.startsWith('session_recent:')?'X Sessions in Last Y Days':field);
 const campaignId=field.startsWith('receipt_variant:')?field.split(':')[1]:['receipt_count:','receipt_last:'].some(prefix=>field.startsWith(prefix))?field.split(':').slice(2).join(':'):undefined;
 const campaign=capabilities?.campaigns.find(campaign=>campaign.id===campaignId),group=field.startsWith('subscription_group:')?capabilities?.subscriptionGroups.find(group=>group.id===field.slice(19)):undefined,app=field.startsWith('session_app_')?capabilities?.apps.find(app=>app.id===field.split(':').slice(1).join(':')):undefined;
 return `${label}${campaign?` · ${campaign.name}`:group?` · ${group.name}`:app?` · ${app.name}`:field.startsWith('session_recent:')?` · last ${field.slice(15)} days`:''}`;
}

export type AudienceStatistics = {matching:number;reachable:number;total:number;globalControlExcluded:number;ltv?:number|null;ltvCurrency?:string|null;calculatedAt?:string;channelBreakdown?:Array<{channel:string;reachable:number;ltv?:number|null}>};
export type AudienceCalculationStatus = 'Queued'|'Running'|'Completed'|'Failed'|'Cancelled';
export type AudienceCalculation = {id:string;campaignId?:string;workspaceId:string;name:string;type:'Exact audience';status:AudienceCalculationStatus;requestedAt:string;startedAt?:string;finishedAt?:string;initiator:string;progress:number;estimatedSecondsLeft:number|null;error?:string;result?:AudienceStatistics;signature:string;transitions:Array<{status:AudienceCalculationStatus;at:string}>};
const audienceKeys=['audienceSegments','audienceSegmentOperator','audienceGroups','audienceCountry','audienceExcludeCountry','subscribeEligibility','subscriptionGroupId','tags','workspaceId'] as const;
/** Only audience criteria are persisted in calculation requests; message content and credentials stay out. */
export function audienceCalculationSnapshot(draft:MessageDraft):MessageDraft {
 const config:Record<string,unknown>={};for(const key of audienceKeys)if(draft.config?.[key]!==undefined)config[key]=draft.config[key];
 if(['multichannel','operator'].includes(draft.channel)){
  const values=draft.config?.channelValues as Record<string,unknown>|undefined;if(Array.isArray(values?.channels))config.channelValues={channels:values.channels};
  const children=draft.config?.multichannelMessages;if(children&&typeof children==='object')config.multichannelMessages=Object.fromEntries(Object.entries(children).map(([channel,child])=>[channel,{config:{subscriptionGroupId:(child as MessageDraft)?.config?.subscriptionGroupId}}]));
 }
 return {id:draft.id,name:draft.name,channel:draft.channel,audience:draft.audience,config};
}
export function audienceCalculationSignature(draft:MessageDraft):string {
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):value;
 const snapshot=audienceCalculationSnapshot(draft);delete snapshot.name;
 return JSON.stringify(stable(snapshot));
}
export const campaignChannelNames:Record<string,string>={email:'Email',push:'Push Notifications',iam:'In-App Messages',content:'Content Cards',banner:'Banners',sms:'SMS/MMS/RCS',webhook:'Webhook',whatsapp:'WhatsApp',line:'LINE',multichannel:'Multichannel',feature:'Feature Flags',operator:'AI Operator',api:'API'};
export type DeliveryTimePreview={calculatedAt:string;channel:string;timezone:'UTC';matching:number;reachable:number;withOptimalTime:number;usingFallback:number;fallbackTime:string;fallbackSource:'activity'|'profile'|'default'|'custom';bins:Array<{at:string;users:number}>;requirements:string[]};
export function intelligentTimingRequirements(draft:MessageDraft,at=new Date()):string[]{
 const delivery=(draft.config?.delivery??{}) as Record<string,unknown>,issues:string[]=[];
 const date=String(delivery.startDate??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<=at.toISOString().slice(0,10))issues.push('Please specify a future Start Date');
 const selected=Array.isArray(draft.config?.audienceSegments)&&draft.config.audienceSegments.length>0||Array.isArray(draft.config?.audienceGroups)&&draft.config.audienceGroups.length>0||draft.audience&&draft.audience!=='All Users';
 if(!selected)issues.push('Please specify Target Users');
 return issues;
}
export function brazeAIAvailability(variantCount:number,capability?:{available:boolean;reason?:string}){
 if(variantCount<2)return{enabled:false,reason:'To use Optimize with BrazeAI™, add at least two variants.'};
 if(!capability?.available)return{enabled:false,reason:capability?.reason??'Optimize with BrazeAI™ is not available for this workspace.'};
 return{enabled:true,reason:''};
}
