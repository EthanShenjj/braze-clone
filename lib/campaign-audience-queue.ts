import 'server-only';
import {createHash} from 'node:crypto';
import {createResource,calculateCampaignAudienceStatistics,getCampaign,getResource,listResources,updateResource,workspaceTransaction,type ResourceRecord} from './braze-store';
import {audienceCalculationSignature,audienceCalculationSnapshot,type AudienceCalculation,type AudienceStatistics} from './campaign-audience-model';
import type {MessageDraft} from './campaign-shared';
const resourceType='campaign-audience-calculations';
function map(row:ResourceRecord):AudienceCalculation{const {snapshot:_,...data}=row.data;return {id:row.id,...data,status:row.status} as AudienceCalculation;}
function signature(draft:MessageDraft){return createHash('sha256').update(audienceCalculationSignature(draft)).digest('hex');}
export function enqueueAudienceCalculation(input:MessageDraft,options:{force?:boolean}={}){
 if(!input||typeof input!=='object'||typeof input.channel!=='string'||!['email','push','iam','content','banner','sms','webhook','whatsapp','line','multichannel','operator','feature','api'].includes(input.channel))throw new Error('Provide a valid campaign snapshot.');
 if(input.config!==undefined&&(!input.config||typeof input.config!=='object'||Array.isArray(input.config)))throw new Error('Provide valid audience criteria.');
 if(input.name!==undefined&&typeof input.name!=='string')throw new Error('Provide a valid Campaign name.');
 if(input.id&&!getCampaign(input.id))throw new Error('Campaign not found.');
 const snapshot=audienceCalculationSnapshot(input);if(JSON.stringify(snapshot).length>2_000_000)throw new Error('Audience criteria are too large.');
 const workspaceId=String(input.id?getCampaign(input.id)?.config.workspaceId??'local':input.config?.workspaceId??'local');snapshot.config={...snapshot.config,workspaceId};const key=signature(snapshot);
 const matches=listResources(resourceType).filter(row=>row.data.signature===key);const existing=matches.find(row=>['Queued','Running'].includes(row.status))??(!options.force?matches.find(row=>row.status==='Completed'):undefined);if(existing)return map(existing);
 const at=new Date().toISOString(),row=createResource({type:resourceType,name:input.name||'Campaign',status:'Queued',data:{campaignId:input.id,workspaceId,name:input.name||'Campaign',type:'Exact audience',snapshot,signature:key,requestedAt:at,initiator:'Local user',progress:0,estimatedSecondsLeft:null,transitions:[{status:'Queued',at}]}});
 return map(row);
}
export function listAudienceCalculations(input:{campaignId?:string;workspaceId?:string}={}){
 const workspaceId=input.campaignId?String(getCampaign(input.campaignId)?.config.workspaceId??'local'):input.workspaceId??'local';
 const rows=listResources(resourceType).filter(row=>row.data.workspaceId===workspaceId).sort((a,b)=>String(b.data.requestedAt).localeCompare(String(a.data.requestedAt)));
 const history=rows.filter(row=>!input.campaignId||row.data.campaignId===input.campaignId).slice(0,50).map(map);
 return {queue:rows.filter(row=>['Queued','Running'].includes(row.status)).reverse().map(map),history,workspaceId};
}
export function getAudienceCalculation(id:string){const row=getResource(id);if(!row||row.type!==resourceType)throw new Error('Audience calculation not found.');return map(row);}
export function cancelAudienceCalculation(id:string){return workspaceTransaction(()=>{const row=getResource(id);if(!row||row.type!==resourceType)throw new Error('Audience calculation not found.');if(!['Queued','Running'].includes(row.status))return map(row);const at=new Date().toISOString();return map(updateResource(id,{status:'Cancelled',data:{...row.data,finishedAt:at,progress:0,transitions:[...(row.data.transitions as unknown[]??[]),{status:'Cancelled',at}]}})!);});}
/** Actual persisted work, atomically claimed; the lifecycle is independent of browser navigation. */
export async function processAudienceCalculationQueue(limit=10){
 for(const row of listResources(resourceType).filter(item=>item.status==='Running'&&Number(item.data.leaseExpiresAt??Infinity)<Date.now())){const at=new Date().toISOString();updateResource(row.id,{status:'Failed',data:{...row.data,error:'Calculation interrupted before completion. Refresh exact statistics to try again.',finishedAt:at,transitions:[...(row.data.transitions as unknown[]??[]),{status:'Failed',at}]}});}
 const pending=listResources(resourceType).filter(row=>row.status==='Queued').sort((a,b)=>String(a.data.requestedAt).localeCompare(String(b.data.requestedAt))).slice(0,Math.max(1,Math.min(limit,50)));
 const results:AudienceCalculation[]=[];
 for(const queued of pending){
  const claimed=workspaceTransaction(()=>{const current=getResource(queued.id);if(!current||current.status!=='Queued')return null;const at=new Date().toISOString();return updateResource(current.id,{status:'Running',data:{...current.data,startedAt:at,leaseExpiresAt:Date.now()+120000,progress:0,transitions:[...(current.data.transitions as unknown[]??[]),{status:'Running',at}]}});});
  if(!claimed)continue;
  // Yield to let cancellation/other queue requests observe the persisted Running state.
  await new Promise<void>(resolve=>setImmediate(resolve));
  try{
   if(getResource(claimed.id)?.status!=='Running')continue;
   const snapshot=claimed.data.snapshot as MessageDraft,result:AudienceStatistics=calculateCampaignAudienceStatistics(snapshot),at=new Date().toISOString();
   const current=getResource(claimed.id);if(current?.status!=='Running')continue;
   results.push(map(updateResource(current.id,{status:'Completed',data:{...current.data,result,progress:100,estimatedSecondsLeft:0,finishedAt:at,transitions:[...(current.data.transitions as unknown[]??[]),{status:'Completed',at}]}})!));
  }catch(error){const current=getResource(claimed.id);if(current?.status!=='Running')continue;const at=new Date().toISOString();results.push(map(updateResource(current.id,{status:'Failed',data:{...current.data,error:error instanceof Error?error.message:'Audience calculation failed.',finishedAt:at,estimatedSecondsLeft:null,transitions:[...(current.data.transitions as unknown[]??[]),{status:'Failed',at}]}})!));}
 }
 return results;
}
