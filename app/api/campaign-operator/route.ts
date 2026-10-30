import { createResource,deleteResource,getResource,listResources,updateResource } from '@/lib/braze-store';
import { extractCampaignBriefText,campaignBriefTextLimits } from '@/lib/campaign-brief-text';
import { createCampaignOperatorEndpoint,type OperatorConversation } from '@/lib/campaign-operator-model';
export const runtime='nodejs';
const historyType='campaign-operator-history';
function conversation(id:string){const row=getResource(id);return row?.type===historyType?row as unknown as OperatorConversation:null;}
const handle=createCampaignOperatorEndpoint({
 settings:()=>({endpoint:process.env.WORKSPACE_AI_ENDPOINT,apiKey:process.env.WORKSPACE_AI_API_KEY,model:process.env.WORKSPACE_AI_MODEL}),
 fetch:(...args)=>fetch(...args),getConversation:conversation,
 listConversations:workspaceId=>listResources(historyType).filter(row=>String(row.data.workspaceId??'local')===workspaceId).slice(0,30) as unknown as OperatorConversation[],
 saveConversation:input=>{const data={messages:input.messages,plan:input.plan,brief:input.brief,workspaceId:input.workspaceId};return (input.id?updateResource(input.id,{name:input.name,data},input.expectedUpdatedAt):createResource({type:historyType,name:input.name,status:'Draft',data})) as unknown as OperatorConversation;},
 deleteConversation:id=>{deleteResource(id);},
 resolveBrief:async id=>{const row=getResource(id);if(!row||row.type!=='campaign-briefs')return null;const brief={id:row.id,name:row.name,size:Number(row.data.size??0),type:String(row.data.mime??'application/octet-stream'),url:`/api/campaign-briefs/${encodeURIComponent(row.id)}`};const encoded=String(row.data.content??'');if(encoded.length>4*Math.ceil(campaignBriefTextLimits.inputBytes/3)||!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return {brief,notice:'Brief text was not extracted because its stored data is invalid or exceeds 15MB. The original brief is attached and retained.'};return {brief,...await extractCampaignBriefText(row.name,Buffer.from(encoded,'base64'))};},
});
export const GET=handle,POST=handle,DELETE=handle;
