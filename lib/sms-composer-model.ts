import { compileSms, type SmsValues } from './channel-message-model.ts';
import {smsMetrics} from './sms-model.ts';
import { audienceDefaultAttributes, audienceDeviceAttributes, audienceSmsProperties, audiencePersonalizationSnippet } from './audience-personalization-model.ts';

export const smsPersonalizationTypes = ['Default Attributes','Custom Attributes','Nested Custom Attributes','Most Recent Device Attributes','Content Blocks','Preference Center','Landing Page','Campaign Attributes','Event Properties','API Trigger Properties','SMS Properties','WhatsApp Properties','Catalog Items','Item Recommendation','Advanced Event Properties','Message Extras'] as const;
export type SmsPersonalizationType = typeof smsPersonalizationTypes[number];
export { audienceDefaultAttributes as smsDefaultAttributes, audienceDeviceAttributes as smsDeviceAttributes, audienceSmsProperties as smsProperties };
export const smsCampaignAttributes = ['name','api_id','message_name','message_api_id','dispatch_id'];
export const smsWhatsAppProperties = ['inbound_message_body','inbound_media_urls','inbound_flow_response','inbound_product_id','inbound_catalog_id','inbound_profile_name','inbound_bsuid','inbound_username','contact_shared_phone_number','contact_share_origin'];
export type SmsSnapshot = { message: string; subscriptionGroupId: string; values: SmsValues; variantId?: string; variantName?: string };
export type SmsSubscriptionGroup = { id: string; name: string; channel: string; capabilities?: { sms?: boolean; mms?: boolean; rcs?: boolean } };
export type SmsPreviewProfile = { id: string; firstName: string; email: string; country: string; attributes: Record<string,unknown> };
export function smsProfile(user?: SmsPreviewProfile | null): Record<string,unknown> {
  return user ? { ...user.attributes, first_name:user.firstName, email:user.email, email_address:user.email, country:user.country, user_id:user.id, most_recently_used_device:user.attributes.most_recently_used_device??(Array.isArray(user.attributes.devices)?user.attributes.devices.at(-1):{}), phone_number:user.attributes.phone_number??user.attributes.phone, phone:user.attributes.phone??user.attributes.phone_number } : {};
}
export function smsPersonalizationSnippet(type:SmsPersonalizationType, attribute:string, fallback='', options:{path?:string;itemIds?:string;property?:string;value?:string}={}) {
  const escape=(value:string)=>value.replaceAll('\\','\\\\').replaceAll("'","\\'");
  if(type==='Message Extras')return attribute&&options.value?`{% message_extras :key ${attribute} :value ${options.value} %}`:'';
  if(!attribute)return '';
  if(type==='Catalog Items')return `{% catalog_items ${JSON.stringify(attribute)}${options.itemIds?.trim()?' '+options.itemIds.trim().split(/[,\s]+/).map(id=>JSON.stringify(id)).join(' '):''} %}`;
  if(type==='Item Recommendation')return `{% catalog_selection_items ${JSON.stringify(attribute)} %}`;
  const scopes:Partial<Record<SmsPersonalizationType,string>>={'Campaign Attributes':'campaign','API Trigger Properties':'api_trigger_properties','WhatsApp Properties':'whats_app'};
  if(scopes[type])return `{{${scopes[type]}.${'${'+attribute+'}'}${fallback?` | default: '${escape(fallback)}'`:''}}}`;
  return audiencePersonalizationSnippet(type as Parameters<typeof audiencePersonalizationSnippet>[0],type==='Advanced Event Properties'?options.property??'':attribute,fallback,options.path);
}
export function smsPersonalizationHasDefault(type:SmsPersonalizationType){return !['Content Blocks','Preference Center','Landing Page','SMS Properties','WhatsApp Properties','Catalog Items','Item Recommendation','Message Extras'].includes(type);}
export function normalizeSmsSnapshot(input:unknown):SmsSnapshot {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Provide an SMS configuration.');
  const value=input as Record<string,unknown>;
  if(typeof value.message!=='string'||value.message.length>20000||typeof value.subscriptionGroupId!=='string')throw new Error('Provide a message and SMS subscription group.');
  const values=value.values??{};
  if(!values||typeof values!=='object'||Array.isArray(values)||JSON.stringify(values).length>100000)throw new Error('Invalid SMS settings.');
  if(!['SMS','MMS','RCS'].includes(String((values as SmsValues).messageType??'SMS')))throw new Error('Choose SMS, MMS or RCS.');
  return {message:value.message,subscriptionGroupId:value.subscriptionGroupId,values:values as SmsValues,...typeof value.variantId==='string'?{variantId:value.variantId}:{},...typeof value.variantName==='string'?{variantName:value.variantName.slice(0,250)}:{}};
}
export function smsSnapshotDraft(snapshot:SmsSnapshot,workspaceId='local',id='sms-preview') {
  return {id,channel:'sms',body:snapshot.message,config:{workspaceId,subscriptionGroupId:snapshot.subscriptionGroupId,channelValues:{appendStop:false,...snapshot.values}}};
}
export function compileSmsSnapshot(snapshot:SmsSnapshot,profile:Record<string,unknown>={},shorten?: (url:string)=>string,variables:Record<string,unknown>={}) {
  return compileSms(smsSnapshotDraft(snapshot),profile,shorten,variables);
}
export function smsCapabilityIssues(snapshot:SmsSnapshot,group?:SmsSubscriptionGroup|null) {
  const issues:string[]=[];
  if(!group||group.channel!=='SMS')issues.push('Select an SMS subscription group.');
  const kind=snapshot.values.messageType??'SMS';
  if(kind==='MMS'&&group?.capabilities?.mms!==true)issues.push('This subscription group does not support MMS.');
  if(kind==='RCS'&&group?.capabilities?.rcs!==true)issues.push('This subscription group does not support RCS.');
  if(!snapshot.message.trim()&&!(kind==='MMS'&&snapshot.values.mediaUrl)&&!(kind==='RCS'&&(snapshot.values.rcsTitle||snapshot.values.rcsCards?.length)))issues.push('Add message content.');
  return issues;
}
export function splitSmsRecipients(value:unknown):string[]{return Array.isArray(value)?value.flatMap(splitSmsRecipients):typeof value==='string'?value.split(/[,;\n]+/).map(value=>value.trim()).filter(Boolean):[];}
export function smsComposePreview(message:string,shorten=true){return shorten?message.replace(/https?:\/\/[^\s<>"']+/g,url=>'https://brz.ai/XXXXXXXX'+(url.match(/[.,!?;:)\]]+$/)?.[0]??'')):message;}
/** Braze's compose count omits dynamic Liquid; actual delivery is validated after rendering. */
export function smsComposeEstimate(message:string,shorten=true){return{...smsMetrics(smsComposePreview(message.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g,''),shorten)),dynamic:/\{[{%]/.test(message)};}
