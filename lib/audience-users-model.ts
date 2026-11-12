import type { UserRecord } from './braze-store';

export const profileHistoryFilters = [
 {channel:'email',label:'Email',events:['Abort','Bounce','Click','Deferral','Delivery','Frequency capped','Mark as spam','Open','Send','Soft bounce','Unsubscribe']},
 {channel:'sms',label:'SMS/MMS',events:['Abort','Carrier send','Delivery','Delivery failure','Frequency capped','Inbound receive','Rejection','Send']},
 {channel:'push',label:'Push',events:['Abort','Bounce','Frequency capped','Influenced open','iOS Foreground','Open','Send']},
 {channel:'iam',label:'In-App Message',events:['Click','Frequency capped','Impression']},
 {channel:'content',label:'Content Card',events:['Click','Dismiss','Frequency capped','Impression','Send']},
 {channel:'webhook',label:'Webhook',events:['Abort','Frequency capped','Send']},
 {channel:'whatsapp',label:'WhatsApp',events:['Abort','Delivery','Failure','Frequency capped','Inbound receive','Read','Send']},
] as const;
export const profileTabs=['Overview','Engagement','Messaging History','Event History','Commerce','Feature Flags Eligibility'] as const;
export type ProfileTab=typeof profileTabs[number];
export type UserDevice={id:string;platform:string;appId:string;appName:string;model:string;os:string;version:string;pushToken?:string};
export type UserAlias={name:string;label:string};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):typeof value==='string'?[value]:[];
export function profileAliases(attributes:Record<string,unknown>):UserAlias[]{
 const candidates=[...(Array.isArray(attributes.user_aliases)?attributes.user_aliases:[]),...(Array.isArray(attributes.aliases)?attributes.aliases:[]),...(attributes.user_alias?[attributes.user_alias]:[])];
 return candidates.flatMap(value=>{if(typeof value==='string')return[{name:value,label:''}];const row=object(value),name=String(row.alias_name??row.name??'');return name?[{name,label:String(row.alias_label??row.label??'')}]:[];});
}
export function profileDevices(attributes:Record<string,unknown>,apps:Array<{id:string;name:string;data?:Record<string,unknown>}>=[]):UserDevice[]{
 const rows=Array.isArray(attributes.devices)?attributes.devices:attributes.device_id||attributes.device_model||attributes.model?[attributes]:[];
 return rows.map(value=>{const row=object(value),appId=String(row.appId??row.app_id??''),app=apps.find(item=>item.id===appId);return{id:String(row.id??row.device_id??''),platform:String(row.platform??row.os_type??app?.data?.platform??''),appId,appName:String(row.appName??app?.name??''),model:String(row.model??row.device_model??''),os:String(row.os??row.device_os??''),version:String(row.version??row.app_version??''),pushToken:typeof row.push_token==='string'?row.push_token:undefined};});
}
/** Lookup identifiers, including aliases and tokens, without searching unrelated custom attributes. */
export function userMatchesLookup(user:UserRecord,query:string){
 const value=query.trim();if(!value)return false;const attrs=user.attributes;
 const identifiers=[user.id,...strings(attrs.external_id),...strings(attrs.braze_id),...profileAliases(attrs).flatMap(alias=>[alias.name,...alias.label?[`${alias.label}:${alias.name}`]:[]]),...strings(attrs.push_token),...strings(attrs.push_tokens),...profileDevices(attrs).flatMap(device=>device.pushToken?[device.pushToken]:[])];
 if(identifiers.includes(value))return true;
 if(user.email.toLowerCase()===value.toLowerCase())return true;
 const phone=String(attrs.phone??attrs.phone_number??'');return Boolean(phone)&&phone.replace(/[ ()-]/g,'')===value.replace(/[ ()-]/g,'');
}
export function userBelongsToWorkspace(user:UserRecord,workspaceId='local'){
 const workspace=user.attributes.workspaceId??user.attributes.workspace_id;return workspace===undefined?workspaceId==='local':workspace===workspaceId;
}
export function historyEventLabel(event:string){return ({aborted:'Abort',abort:'Abort',bounced:'Bounce',clicked:'Click',deferred:'Deferral',delivered:'Delivery',frequency_capped:'Frequency capped',spam:'Mark as spam',opened:'Open',sent:'Send',soft_bounced:'Soft bounce',unsubscribed:'Unsubscribe',carrier_sent:'Carrier send',delivery_failed:'Delivery failure',inbound_received:'Inbound receive',rejected:'Rejection',influenced_open:'Influenced open',ios_foreground:'iOS Foreground',impression:'Impression',impressed:'Impression',dismissed:'Dismiss',failed:'Failure',read:'Read'} as Record<string,string>)[event]??event;}
export function historyFilterKey(channel:string,event:string){return `${channel}:${historyEventLabel(event)}`;}

