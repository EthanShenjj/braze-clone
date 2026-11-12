import { campaignFormCapabilities, estimateConfiguredAudience } from '@/lib/braze-store';
import { audienceFilterCatalog, otherAudienceFilters } from '@/lib/campaign-filter-catalog';
import { audienceOperators } from '@/lib/audience-rule-model';
import { parseSegmentOperatorProposal } from '@/lib/segment-operator-model';
import { segmentWorkspaceSnapshot } from '@/lib/segment-workspace-model';
export const runtime='nodejs';
export function GET(){return Response.json({configured:Boolean(process.env.WORKSPACE_AI_ENDPOINT&&process.env.WORKSPACE_AI_API_KEY)});}
export async function POST(request:Request){
 const endpoint=process.env.WORKSPACE_AI_ENDPOINT,key=process.env.WORKSPACE_AI_API_KEY;
 if(!endpoint||!key)return Response.json({error:'Connect an AI service to use Operator. Contact your workspace administrator.',configured:false},{status:503});
 try{
  if(new URL(endpoint).protocol!=='https:')throw new Error('The AI endpoint must use HTTPS.');
  const input=await request.json();if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>10000)throw new Error('Enter a request up to 10,000 characters.');
  const workspaceId=typeof input.workspaceId==='string'?input.workspaceId:'local',capabilities=campaignFormCapabilities(workspaceId);
  const instructions=`Help draft a Braze audience segment. Return only JSON {message:string,segment:{name:string,description:string,audienceGroups:[{id:string,name:string,operator:"AND"|"OR",exclude:boolean,rules:[{id:string,field:string,operator:string,value:string,value2?:string,timeUnit?:"hours"|"days"|"weeks",params?:object}]}],segmentOptions:{appIds:string[],analyticsTracking:boolean,groupOperator:"AND"|"OR"}}}. Use only fields and resources from the catalog and capabilities. Rule values are strings. Comparisons are ${JSON.stringify(audienceOperators)}. Empty appIds means all apps; __no_apps__ means no app association. Inclusion groups combine with groupOperator; exclusions always omit. Provide unique ids, never invent resource ids. Do not claim data was saved or users contacted. This is an unsaved reviewable proposal. Catalog: ${JSON.stringify({audienceFilterCatalog,otherAudienceFilters})}. Capabilities: ${JSON.stringify(capabilities)}.`;
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.WORKSPACE_AI_MODEL,messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({request:input.prompt,currentSegment:input.segment??null})}]}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`The AI service returned ${response.status}.`);
  const proposal=parseSegmentOperatorProposal(await response.json());
  const statistics=estimateConfiguredAudience(segmentWorkspaceSnapshot(proposal.draft,workspaceId));
  return Response.json({message:proposal.message,segment:proposal.draft,statistics});
 }catch(cause){return Response.json({error:cause instanceof Error?cause.message:'Unable to generate segment.'},{status:502});}
}
