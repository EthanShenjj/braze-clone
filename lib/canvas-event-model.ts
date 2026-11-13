import type {CanvasRuntimeEvent} from './canvas-runtime-model.ts';
import {createHash} from 'node:crypto';

export type CanvasEventBase={id:string;workspaceId:string;userId:string;at:string};
export type CanvasProfileEventInput=CanvasEventBase&{name:string;properties?:Record<string,unknown>;productId?:string;price?:number;quantity?:number;currency?:string};
export type CanvasMessageEventInput=CanvasEventBase&{campaignId:string;channel:string;event:string;canvasId?:string;nodeId?:string;data?:Record<string,unknown>};
export type CanvasProfileChangeBase=CanvasEventBase&{updateSource?:string};
function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function text(value:unknown):string|undefined{return typeof value==='string'&&value.trim()?value:undefined;}
function field(source:Record<string,unknown>,...keys:string[]):string|undefined{for(const key of keys){const value=text(source[key]);if(value!==undefined)return value;}return undefined;}
function boolean(value:unknown):boolean|undefined{return value===true||value===1||value==='1'||typeof value==='string'&&value.toLowerCase()==='true'?true:value===false||value===0||value==='0'||typeof value==='string'&&value.toLowerCase()==='false'?false:undefined;}
function inboundFields(properties:Record<string,unknown>):Partial<CanvasRuntimeEvent>{
 const subscriptionGroupId=field(properties,'subscriptionGroupId','subscription_group_id','groupId'),keyword=field(properties,'keywordCategory','keyword_category','category'),flowId=field(properties,'flowId','flow_id'),contact=boolean(properties.contact),body=typeof properties.body==='string'?properties.body:typeof properties.messageBody==='string'?properties.messageBody:undefined;
 return{...(subscriptionGroupId?{subscriptionGroupId}:{}),...(keyword?{keywordCategory:keyword.toLowerCase().replace(/[- ]/g,'_')}:{}),...(flowId?{flowId}:{}),...(contact!==undefined?{contact}:{}),...(body!==undefined?{body}:{})};
}
function base(input:CanvasEventBase):CanvasEventBase{
 if(![input.id,input.workspaceId,input.userId].every(value=>typeof value==='string'&&value.trim())||!Number.isFinite(Date.parse(input.at)))throw new TypeError('Provide an event ID, workspace, user and valid timestamp.');
 return{id:input.id,workspaceId:input.workspaceId,userId:input.userId,at:new Date(input.at).toISOString()};
}

/** Ingestion already establishes scope; event properties cannot replace those authoritative IDs. */
export function canvasProfileRuntimeEvent(input:CanvasProfileEventInput):CanvasRuntimeEvent{
 if(typeof input.name!=='string'||!input.name.trim())throw new TypeError('Provide the recorded profile event name.');
 const properties={...object(input.properties)};
 for(const key of ['productId','price','quantity','currency'] as const)if(input[key]!==undefined)properties[key]=input[key];
 const appId=field(properties,'appId','app_id');
 const kind:CanvasRuntimeEvent['kind']=['session_start','Start Session'].includes(input.name)?'session':['app_upgraded','Upgrade App'].includes(input.name)?'app_upgrade':text(input.productId)||input.name==='purchase'?'purchase':'custom';
 const event:CanvasRuntimeEvent={...base(input),kind,name:input.name,properties,...(appId?{appId}:{})};
 if(kind!=='custom')return event;
 const marker=field(properties,'kind','type'),landingPageId=field(properties,'landingPageId','landing_page_id'),interaction=field(properties,'interaction');
 const inboundNames:Record<string,string>={'inbound_sms':'sms','Send Inbound SMS':'sms','Send an SMS inbound message':'sms','inbound_whatsapp':'whatsapp','Send a WhatsApp inbound message':'whatsapp','inbound_line':'line','Send a LINE inbound message':'line'};
 const channel=inboundNames[input.name]??(marker==='inbound'?field(properties,'channel')?.toLowerCase():undefined);
 if(channel&&['sms','whatsapp','line'].includes(channel))return{...event,kind:'inbound',channel,...inboundFields(properties)};
 if(marker==='landing_page'&&landingPageId&&['form','survey'].includes(interaction??''))return{...event,kind:'landing_page',landingPageId,interaction};
 if(marker==='location'&&typeof properties.latitude==='number'&&Number.isFinite(properties.latitude)&&Math.abs(properties.latitude)<=90&&typeof properties.longitude==='number'&&Number.isFinite(properties.longitude)&&Math.abs(properties.longitude)<=180)return{...event,kind:'location',latitude:properties.latitude,longitude:properties.longitude};
 const geofenceSetId=field(properties,'geofenceSetId','geofence_set_id'),transition=field(properties,'geofenceTransition','transition');
 if(marker==='geofence'&&geofenceSetId&&(transition==='enter'||transition==='exit'))return{...event,kind:'geofence',geofenceSetId,geofenceTransition:transition};
 return event;
}

function target(source:Record<string,unknown>,...keys:string[]):string|undefined{
 for(const key of keys){const value=source[key];if(typeof value==='string'&&value.trim())return value;if(typeof value==='number'&&Number.isFinite(value))return String(value);}return undefined;
}
/** Provider acceptance and SDK availability are not receipts. Only recorded interactions enter this feed. */
export function canvasMessageRuntimeEvent(input:CanvasMessageEventInput):CanvasRuntimeEvent|null{
 const data=object(input.data),attributes=object(data.attributes),custom=object(data.properties),sources=[data,attributes,custom];
 if(sources.some(source=>['test','seed','filtered','simulated','bot','isBot'].some(key=>boolean(source[key])===true)))return null;
 const source={...attributes,...custom,...data},channel=input.channel.toLowerCase(),receipt=input.event.toLowerCase();
 if(['accepted','available','prepared','queued','failed','sent','carrier_sent'].includes(receipt))return null;
 const properties={...source},canvasId=text(input.canvasId)??field(source,'canvasId','canvas_id'),stepId=text(input.nodeId)??field(source,'nodeId','stepId','node_id','step_id'),alias=field(source,'alias','linkAlias','link_alias'),buttonId=target(source,'buttonId','button_id','button','actionId'),pageId=target(source,'pageId','page_id','storyPageId','story_page_id');
 const event:CanvasRuntimeEvent={...base(input),kind:'message',name:input.event,campaignId:input.campaignId,channel,properties,...(canvasId?{canvasId}:{}),...(stepId?{stepId}:{}),...(alias?{alias}:{}),...(buttonId?{buttonId}:{}),...(pageId?{pageId}:{})};
 if(receipt==='conversion')return{...event,kind:'conversion',interaction:'conversion'};
 if(receipt==='control')return{...event,interaction:'control'};
 if(['replied','inbound_received','inbound_sms'].includes(receipt)&&['sms','whatsapp','line'].includes(channel))return{...event,kind:'inbound',...inboundFields(source)};
 let interaction:string|undefined;
 if(['opened','open'].includes(receipt)){
  if(channel==='push')interaction='opened_push';
  if(channel==='email'){
   const flags=sources.flatMap(row=>['machine','machineOpen','machine_open'].map(key=>boolean(row[key]))),machine=flags.includes(true)?true:flags.includes(false)?false:undefined;
   if(machine!==undefined)properties.machine=machine;
   interaction=machine===true?'opened_email_machine':machine===false?'opened_email_other':'opened_email';
  }
 }else if(['clicked','click'].includes(receipt)){
  if(alias)interaction=channel==='email'?'clicked_alias_email':['iam','push','content','banner','sms','whatsapp','line'].includes(channel)?'clicked_alias_any':undefined;
  else if(channel==='push')interaction=buttonId?'clicked_push_button':pageId?'clicked_push_story_page':undefined;
  else if(channel==='iam')interaction=buttonId==='1'?'clicked_iam_button_1':buttonId==='2'?'clicked_iam_button_2':'clicked_iam';
  else interaction=({email:'clicked_email',content:'clicked_content_card',banner:'clicked_banner',sms:'clicked_sms_link',whatsapp:'clicked_whatsapp_link',line:'clicked_line_link'} as Record<string,string>)[channel];
 }else if(['impression','impressed'].includes(receipt)||receipt==='delivered'&&source.sdkEvent==='impression')interaction=({iam:'viewed_iam',content:'viewed_content_card',banner:'viewed_banner'} as Record<string,string>)[channel];
 else if(['dismissed','dismiss'].includes(receipt))interaction=({content:'dismissed_content_card',banner:'dismissed_banner'} as Record<string,string>)[channel];
 else if(receipt==='survey_submitted'&&channel==='iam')interaction='submitted_iam_survey';
 else if(receipt==='delivered'){
  if(['accepted','prepared','queued'].includes(String(object(source.delivery).status)))return null;
  interaction=({email:'delivered_email',push:'delivered_push',sms:'delivered_sms',webhook:'delivered_webhook'} as Record<string,string>)[channel];
 }
 return interaction?{...event,interaction}:null;
}

function equivalent(one:unknown,two:unknown):boolean{
 if(Object.is(one,two))return true;
 if(Array.isArray(one)||Array.isArray(two))return Array.isArray(one)&&Array.isArray(two)&&one.length===two.length&&one.every((value,index)=>equivalent(value,two[index]));
 if(one===null||two===null||typeof one!=='object'||typeof two!=='object')return false;
 const a=Object.keys(one).sort(),b=Object.keys(two).sort();return a.length===b.length&&a.every((key,index)=>key===b[index]&&equivalent((one as Record<string,unknown>)[key],(two as Record<string,unknown>)[key]));
}
const scopeKeys=new Set(['workspaceId','workspace_id']);
function profileValues(profile:Record<string,unknown>):Record<string,unknown>{
 const values=Object.fromEntries(Object.entries(object(profile.attributes)).filter(([key])=>!scopeKeys.has(key)&&key!=='subscriptionGroups'));
 const skip=new Set(['id','external_id','user_id','attributes','globalControlGroup','subscribed','emailSubscriptionStatus','email_subscription_status','pushSubscriptionStatus','subscriptionGroups',...scopeKeys]);
 for(const [key,value] of Object.entries(profile))if(!skip.has(key))values[key==='firstName'?'first_name':key]=value;
 return values;
}
function paths(values:Record<string,unknown>,prefix='',result=new Map<string,unknown>()):Map<string,unknown>{
 for(const key of Object.keys(values).sort()){
  if(['__proto__','constructor','prototype'].includes(key))continue;
  const path=prefix?`${prefix}.${key}`:key,value=values[key];result.set(path,value);
  if(value!==null&&typeof value==='object'&&!Array.isArray(value))paths(value as Record<string,unknown>,path,result);
 }
 return result;
}
function subscriptionState(profile:Record<string,unknown>,channel:'email'|'push'):string|undefined{
 const attrs=object(profile.attributes),value=channel==='email'?profile.emailSubscriptionStatus??profile.email_subscription_status:profile.pushSubscriptionStatus??profile.push_subscription_status??attrs.push_subscription_status;
 if(value!==undefined)return ['opted_in','subscribed','unsubscribed'].includes(String(value))?String(value):undefined;
 return channel==='email'&&typeof profile.subscribed==='boolean'?(profile.subscribed?'subscribed':'unsubscribed'):undefined;
}

/** Snapshots may be UserRecord-shaped or flat profiles; `attributes` contains custom fields.
 * Root IDs and workspace metadata never become profile-change actions. Subscription groups are
 * explicitly supplied as attributes.subscriptionGroups[groupId] = {channel,state} when available.
 */
export function canvasProfileRuntimeChanges(before:Record<string,unknown>,after:Record<string,unknown>,input:CanvasProfileChangeBase):CanvasRuntimeEvent[]{
 const scope=base(input),old=paths(profileValues(before)),next=paths(profileValues(after)),events:CanvasRuntimeEvent[]=[];
 const emit=(kind:CanvasRuntimeEvent['kind'],key:string,fields:Partial<CanvasRuntimeEvent>)=>{const id='profile-change:'+createHash('sha256').update(JSON.stringify([scope.id,scope.workspaceId,scope.userId,kind,key])).digest('hex');events.push({...scope,id,kind,...fields,...(input.updateSource?{updateSource:input.updateSource}:{})});};
 for(const path of [...new Set([...old.keys(),...next.keys()])].sort()){
  if(old.has(path)===next.has(path)&&equivalent(old.get(path),next.get(path)))continue;
  const previous=old.has(path)?{previousValue:old.get(path)}:{},value=next.has(path)?{value:next.get(path)}:{};
  emit('attribute',path,{attribute:path,...previous,...value,properties:{attribute:path,...previous,...value,removed:!next.has(path)}});
 }
 const oldEmail=before.email??object(before.attributes).email,newEmail=after.email??object(after.attributes).email;
 if(!oldEmail&&typeof newEmail==='string'&&newEmail.includes('@'))emit('email_added','email',{previousValue:oldEmail,value:newEmail,properties:{email:newEmail}});
 for(const channel of ['email','push'] as const){const previous=subscriptionState(before,channel),value=subscriptionState(after,channel);if(value!==undefined&&value!==previous)emit('subscription',channel,{subscriptionType:channel,subscriptionState:value,previousValue:previous,value,properties:{subscriptionType:channel,subscriptionState:value}});}
 const oldGroups=object(before.subscriptionGroups??object(before.attributes).subscriptionGroups),newGroups=object(after.subscriptionGroups??object(after.attributes).subscriptionGroups);
 for(const groupId of Object.keys(newGroups).sort()){
  const previous=object(oldGroups[groupId]),value=object(newGroups[groupId]),channel=field(value,'channel')?.toLowerCase(),status=field(value,'state');
  if(channel&&['email','sms','whatsapp','line'].includes(channel)&&['subscribed','unsubscribed'].includes(status??'')&&(previous.state!==status||String(previous.channel??'').toLowerCase()!==channel))emit('subscription_group',groupId,{subscriptionGroupId:groupId,subscriptionType:channel,subscriptionState:status,previousValue:previous.state,value:status,properties:{subscriptionGroupId:groupId,subscriptionType:channel,subscriptionState:status}});
 }
 return events;
}
