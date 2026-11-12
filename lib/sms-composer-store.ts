import 'server-only';
import { configuredAudienceUsers, createResource, getCampaign, getCanvas, listResources, listCatalogs, listCatalogItems, listCatalogSelections, listPreferenceCenters, shortenMessageLink, updateResource, smsWorkspaceVariables,recordSmsComposerTestEvent,messageShortLinkPlaceholder } from './braze-store';
import { scopedSubscriptionGroups } from './audience-management-store';
import { userMatchesLookup } from './audience-users-model';
import { compileSmsSnapshot, normalizeSmsSnapshot, smsCapabilityIssues, smsProfile, smsSnapshotDraft, splitSmsRecipients, type SmsSnapshot } from './sms-composer-model';
import { channelConfigurationIssues } from './channel-message-model';
import { dispatchPreparedMessage, messageDeliveryCapability } from './message-delivery';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const scoped=(type:string,workspaceId:string)=>listResources(type).filter(row=>row.status!=='Archived'&&String(row.data.workspaceId??'local')===workspaceId);
export function smsWorkspaceUsers(workspaceId:string,query=''){
  return configuredAudienceUsers({channel:'push',config:{workspaceId}}).filter(user=>!query||[user.id,user.email,user.firstName,String(user.attributes.phone??user.attributes.phone_number??'')].some(value=>value.toLowerCase().includes(query.toLowerCase())));
}
export function smsOwner(input:Record<string,unknown>){
  const kind=input.kind==='canvas'?'canvas':'campaign',id=String(input.ownerId??'');
  const owner=kind==='canvas'?getCanvas(id):getCampaign(id);
  if(!owner)throw new Error(`${kind==='canvas'?'Canvas':'Campaign'} not found.`);
  const workspaceId=String((kind==='canvas'?(owner as ReturnType<typeof getCanvas>)?.workspaceId:(owner as ReturnType<typeof getCampaign>)?.config.workspaceId)??'local');
  if(input.workspaceId!==undefined&&input.workspaceId!==workspaceId)throw new Error('The message does not belong to this workspace.');
  return {kind,id,workspaceId};
}
export function smsWorkspaceContext(workspaceId:string,query=''){
  const users=smsWorkspaceUsers(workspaceId,query).slice(0,50),attributes=new Set<string>(),nested:Record<string,string[]>={},events:Record<string,string[]>={};
  const walk=(value:unknown,path='',depth=0):string[]=>{if(depth>8||value===null||typeof value!=='object')return path?[path]:[];return Object.entries(value).flatMap(([key,item])=>walk(item,Array.isArray(value)?path+`[${key}]`:path?path+'.'+key:key,depth+1));};
  for(const user of smsWorkspaceUsers(workspaceId))for(const [key,value]of Object.entries(user.attributes)){if(['workspaceId','workspace_id'].includes(key))continue;attributes.add(key);if(value&&typeof value==='object')nested[key]=[...new Set([...(nested[key]??[]),...walk(value)])].sort();}
  for(const event of scoped('user-events',workspaceId))events[event.name]=[...new Set([...(events[event.name]??[]),...Object.keys(object(event.data.properties))])].sort();
  const choices=(type:string)=>scoped(type,workspaceId).map(({id,name})=>({id,name,value:name}));
  const catalogs=listCatalogs().filter(row=>row.status!=='Archived'&&String(row.data.workspaceId??'local')===workspaceId);
  return {users,groups:scopedSubscriptionGroups(workspaceId,{channel:'SMS',status:'Active'}),testGroups:scoped('internal-groups',workspaceId).filter(row=>!row.data.channel||row.data.channel==='SMS'),attributes:[...attributes].sort(),nested,events,contentBlocks:choices('content-blocks'),preferenceCenters:listPreferenceCenters(workspaceId).filter(row=>row.status==='Active'&&row.publishedVersion!==null).map(({id,name})=>({id,name,value:id})),landingPages:scoped('landing-pages',workspaceId).filter(row=>row.status==='Published').map(({id,name})=>({id,name,value:id})),catalogs:catalogs.map(c=>({id:c.id,name:c.name,value:c.name,items:listCatalogItems(c.id).map(row=>({id:row.id,name:row.name})),selections:listCatalogSelections(c.id).map(row=>({name:row.name}))})),recommendations:choices('recommendations'),capability:messageDeliveryCapability('sms'),operator:{configured:Boolean(process.env.WORKSPACE_AI_ENDPOINT&&process.env.WORKSPACE_AI_API_KEY)}};
}
export function smsRenderVariables(workspaceId:string,profile:Record<string,unknown>,ownerId=''){return smsWorkspaceVariables(workspaceId,profile,ownerId);}
export function validateSmsWorkspaceSnapshot(snapshot:SmsSnapshot,workspaceId:string){
  const group=scopedSubscriptionGroups(workspaceId,{channel:'SMS',status:'Active'}).find(row=>row.id===snapshot.subscriptionGroupId);
  const issues=[...smsCapabilityIssues(snapshot,group),...channelConfigurationIssues(smsSnapshotDraft(snapshot,workspaceId))];
  if(issues.length)throw new Error([...new Set(issues)].join(' '));
  return group!;
}
export function renderWorkspaceSms(snapshot:SmsSnapshot,workspaceId:string,profile:Record<string,unknown>,ownerId='',shorten?:(url:string)=>string){
  validateSmsWorkspaceSnapshot(snapshot,workspaceId);
  const context={...profile,message_name:snapshot.variantName??profile.message_name,message_api_id:snapshot.variantId??profile.message_api_id};
  return compileSmsSnapshot(snapshot,context,shorten,smsRenderVariables(workspaceId,context,ownerId));
}
export async function sendSmsComposerTest(raw:unknown){
  const input=object(raw),owner=smsOwner(input),snapshot=normalizeSmsSnapshot(input.snapshot);
  validateSmsWorkspaceSnapshot(snapshot,owner.workspaceId);
  if(input.profile!==undefined&&(input.profile===null||typeof input.profile!=='object'||Array.isArray(input.profile)||JSON.stringify(input.profile).length>20000))throw new Error('Invalid preview user attributes.');
  const groupIds=Array.isArray(input.testGroupIds)?input.testGroupIds:[];
  if(groupIds.some(id=>typeof id!=='string'))throw new Error('Choose valid content test groups.');
  const groups=scoped('internal-groups',owner.workspaceId).filter(row=>!row.data.channel||row.data.channel==='SMS');
  if(groupIds.some(id=>!groups.some(group=>group.id===id)))throw new Error('Content test group not found in this workspace.');
  const recipients=[...new Set([...splitSmsRecipients(input.recipients),...groups.filter(group=>groupIds.includes(group.id)).flatMap(group=>splitSmsRecipients(group.data.recipients??group.data.userIds??group.data.emails))])];
  if(!recipients.length||recipients.length>20||recipients.some(row=>row.length>254))throw new Error('Provide between 1 and 20 test recipients.');
  const users=smsWorkspaceUsers(owner.workspaceId),profile=object(input.profile);
  // Resolve and render the entire batch before any provider request or test record.
  const prepared=recipients.map(recipient=>{
    const user=users.find(user=>userMatchesLookup(user,recipient));
    const to=String(user?.attributes.phone??user?.attributes.phone_number??recipient).replace(/[ ()-]/g,'');
    if(!/^\+[1-9]\d{7,14}$/.test(to))throw new Error(`No SMS phone number for ${recipient} in this workspace. Use an external ID, email, or E.164 phone number.`);
    const renderProfile={...(input.override===true?profile:smsProfile(user)),phone:to,phone_number:to};
    const message=renderWorkspaceSms(snapshot,owner.workspaceId,renderProfile,owner.id,()=>messageShortLinkPlaceholder());
    return {recipient,to,userId:user?.id,profile:renderProfile,message};
  });
  const capability=messageDeliveryCapability('sms'),record=createResource({type:'sms-tests',name:`SMS test · ${String(input.nodeId??snapshot.variantId??owner.id)}`,status:'Pending',data:{...owner,snapshot,recipients,simulated:!capability.configured||!capability.enabled}});
  const tests=[];
  for(const test of prepared){
    try{
      const message=renderWorkspaceSms(snapshot,owner.workspaceId,{...test.profile,dispatch_id:record.id},owner.id,url=>shortenMessageLink(url,owner.id,test.userId??record.id));
      const delivery=await dispatchPreparedMessage(smsSnapshotDraft(snapshot,owner.workspaceId,owner.id),test.to,message,true);
      recordSmsComposerTestEvent(owner.id,test.userId??test.to,delivery.mode==='preview'?'test_prepared':delivery.status,{testId:record.id,nodeId:input.nodeId,variantId:snapshot.variantId,recipient:test.to,message,delivery,simulated:delivery.mode==='preview'});
      tests.push({recipient:test.recipient,to:test.to,message:message.message,mediaUrl:message.mediaUrl,metrics:message.metrics,delivery});
    }catch(error){const detail=error instanceof Error?error.message:'Delivery failed.';tests.push({recipient:test.recipient,to:test.to,error:detail});recordSmsComposerTestEvent(owner.id,test.userId??test.to,'failed',{testId:record.id,nodeId:input.nodeId,recipient:test.to,error:detail,simulated:!capability.enabled||!capability.configured});}
  }
  updateResource(record.id,{status:tests.some(test=>'error'in test)?'Failed':'Completed',data:{...record.data,tests}});
  return {id:record.id,tests,capability};
}
