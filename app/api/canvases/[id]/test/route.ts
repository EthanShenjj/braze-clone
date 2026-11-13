import {createResource,getResource,getCanvasWorkspace,getUser,listResources,previewCanvasConditionsOnProfile,searchCanvasTestUsers,sendCanvasTestMessages,canvasWorkspaceQuietHours,canvasTestMessageEligibility} from '@/lib/braze-store';
import {runPreview,type CanvasPreviewEvent,type CanvasPreviewAgentTest} from '@/lib/canvas-preview';
import {campaignVariants} from '@/lib/campaign-shared';
import {executeCanvasConnector} from '@/lib/canvas-connectors';
import {canvasOptimizerPreviewDraft} from '@/lib/canvas-optimizer-preview-model';
import {evaluateFlag} from '@/lib/workspace-modules';
import {randomUUID} from 'node:crypto';

export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
const message=(error:unknown)=>error instanceof Error?error.message:'Canvas test failed.';
function scopedCanvas(id:string,workspaceId:string){const workspace=getCanvasWorkspace(id);return workspace.canvas&&(workspace.canvas.workspaceId??'local')===workspaceId&&workspace.graph?workspace:null;}
function scopedAgent(agentId:unknown,workspaceId:string){const agent=typeof agentId==='string'?getResource(agentId):null;return agent&&agent.type==='canvas-step-agents'&&agent.status!=='Archived'&&String(agent.data.workspaceId??'local')===workspaceId?agent:null;}
export async function GET(request:Request,context:Context){
 const {id}=await context.params,params=new URL(request.url).searchParams,workspaceId=params.get('workspaceId');
 if(!workspaceId)return Response.json({error:'Provide a workspaceId.'},{status:400});
 if(!scopedCanvas(id,workspaceId))return Response.json({error:'Canvas not found.'},{status:404});
 const users=searchCanvasTestUsers(workspaceId,params.get('q')??'');
 const runs=listResources('canvas-test-runs').filter(row=>row.data.canvasId===id&&row.data.workspaceId===workspaceId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,10);
 return Response.json({users,runs});
}
export async function POST(request:Request,context:Context){
 const {id}=await context.params,input=await request.json().catch(()=>null);
 if(!input||typeof input.workspaceId!=='string'||!input.workspaceId||typeof input.userId!=='string'||!input.userId||input.at!==undefined&&(typeof input.at!=='string'||!Number.isFinite(Date.parse(input.at)))||input.sendMessages!==undefined&&typeof input.sendMessages!=='boolean')return Response.json({error:'Provide a workspace, test user and valid preview time.'},{status:400});
 const workspace=scopedCanvas(id,input.workspaceId),user=getUser(input.userId);
 if(!workspace||!user||String(user.attributes.workspaceId??user.attributes.workspace_id??'local')!==input.workspaceId)return Response.json({error:'Canvas or test user not found in this workspace.'},{status:404});
 if(input.messageVariants!==undefined&&(!input.messageVariants||typeof input.messageVariants!=='object'||Array.isArray(input.messageVariants)||Object.entries(input.messageVariants).some(([nodeId,variantId])=>{const node=workspace.graph!.nodes.find(node=>node.id===nodeId&&['message','optimizer'].includes(node.kind));return!node||typeof variantId!=='string'||!campaignVariants({channel:String(node.config?.channel??'email'),body:node.config?.message,subject:node.config?.subject,config:node.config}).some(variant=>variant.id===variantId);})))return Response.json({error:'Choose available message variants from this Canvas.'},{status:400});
 const agents=input.agentTests===undefined?{}:input.agentTests;
 if(!agents||typeof agents!=='object'||Array.isArray(agents)||JSON.stringify(agents).length>131072||Object.entries(agents).some(([nodeId,value])=>{const choice=value as Record<string,unknown>;return !workspace.graph!.nodes.some(node=>node.id===nodeId&&node.kind==='agent')||!choice||typeof choice!=='object'||Array.isArray(choice)||typeof choice.execute!=='boolean'||choice.context!==undefined&&(typeof choice.context!=='string'||choice.context.length>8000);} ))return Response.json({error:'Choose whether to run each available Agent and provide valid test context or fallback output.'},{status:400});
 const agentTests=structuredClone(agents) as Record<string,CanvasPreviewAgentTest>;
 for(const [nodeId,choice] of Object.entries(agentTests)){
  const node=workspace.graph!.nodes.find(node=>node.id===nodeId)!,agent=scopedAgent(node.config?.agentId,input.workspaceId);
  if(choice.execute&&!agent)return Response.json({error:'Agent not found in this workspace.'},{status:404});
  if(!choice.execute&&!Object.hasOwn(choice,'fallbackValue')&&agent&&Object.hasOwn(agent.data,'fallbackOutput'))choice.fallbackValue=structuredClone(agent.data.fallbackOutput);
 }
 const optimizerSelections=input.optimizerSelections??{};
 if(!optimizerSelections||typeof optimizerSelections!=='object'||Array.isArray(optimizerSelections)||JSON.stringify(optimizerSelections).length>65536)return Response.json({error:'Choose authored optimizer component variants.'},{status:400});
 try{for(const [nodeId,selections] of Object.entries(optimizerSelections)){const node=workspace.graph!.nodes.find(node=>node.id===nodeId&&node.kind==='optimizer');if(!node)throw Error('Choose optimizer components from this Canvas.');canvasOptimizerPreviewDraft(node,selections as Record<string,string>);}}catch(error){return Response.json({error:message(error)},{status:400});}
 const events=input.eventInputs??[],kinds=['custom','session','app_upgrade','purchase','message','conversion','landing_page','attribute','subscription','subscription_group','email_added','inbound','location','geofence','exception','back_in_stock','price_drop'];
 if(!Array.isArray(events)||events.length>200||events.some(event=>!event||typeof event!=='object'||Array.isArray(event)||!kinds.includes(event.kind)||typeof event.at!=='string'||!Number.isFinite(Date.parse(event.at))||event.workspaceId!==undefined&&event.workspaceId!==input.workspaceId||event.userId!==undefined&&event.userId!==user.id||event.properties!==undefined&&(!event.properties||typeof event.properties!=='object'||Array.isArray(event.properties))))return Response.json({error:'Provide up to 200 valid events for this test user and workspace.'},{status:400});
 try{
  const wizard=structuredClone(workspace.canvas!.wizard);
  if(wizard.send.quietEnabled&&wizard.send.quietMode==='workspace'){const quiet=canvasWorkspaceQuietHours(input.workspaceId);wizard.send.quietStart=quiet.start;wizard.send.quietEnd=quiet.end;}
  const variables={canvas:{name:workspace.canvas!.name,api_id:id},content_blocks:Object.fromEntries(listResources('content-blocks').filter(block=>block.status!=='Archived'&&String(block.data.workspaceId??'local')===input.workspaceId).map(block=>[block.name,String(block.data.content??'')]))};
  const preview=await runPreview({canvasId:id,workspaceId:input.workspaceId,graph:workspace.graph!,wizard,user,at:input.at,messageVariants:input.messageVariants,optimizerSelections:input.optimizerSelections,agentTests,variables,eventInputs:events.map((event,index)=>({...event,id:event.id??`preview-event-${index+1}`,workspaceId:input.workspaceId,userId:user.id})) as CanvasPreviewEvent[],audienceMatches:(config,profile)=>previewCanvasConditionsOnProfile(id,user.id,config,profile),messageEligibility:(node,profile,at)=>canvasTestMessageEligibility(id,user.id,node,profile,at),services:{
   executeAgent:async request=>{
    const agent=scopedAgent(request.node.config?.agentId,input.workspaceId);if(!agent)throw Error('Agent not found in this workspace.');
    const instructions=[request.node.config?.instructions,request.testContext?`Test context: ${request.testContext}`:''].filter(value=>typeof value==='string'&&value).join('\n\n');
    return executeCanvasConnector({kind:'agent',jobId:`canvas_test_agent_${randomUUID()}`,workspaceId:input.workspaceId,canvasId:id,nodeId:request.node.id,userId:user.id,config:{...request.node.config,agentInstructions:String(agent.data.instructions??''),instructions},profile:request.profile,context:request.context,test:true});
   },
   previewFeatureFlag:(node,profile)=>{const flag=getResource(String(node.config?.featureFlagId??''));if(!flag||flag.type!=='feature-flags'||flag.status==='Archived'||String(flag.data.workspaceId??'local')!==input.workspaceId)throw Error('Feature Flag not found in this workspace.');return{featureFlagId:flag.id,...evaluateFlag(flag.data,{id:user.id,country:String(profile.country??''),lifecycle:String(profile.lifecycle??''),attributes:profile})};},
  }});
  const recipients:Record<string,string>={};
  if(input.sendMessages===true){
   if(preview.status==='blocked')return Response.json({error:'Resolve blocked preview steps before sending test messages.',preview},{status:409});
   if(!input.recipients||typeof input.recipients!=='object'||Array.isArray(input.recipients))return Response.json({error:'Provide an explicit recipient for each message channel.',preview},{status:400});
   for(const step of preview.steps.filter(step=>step.message&&step.eligibility.eligible)){
    const channel=step.message!.channel,value=input.recipients[channel];
    if(typeof value!=='string'||!value.trim()||value.length>1000||/[\r\n]/.test(value))return Response.json({error:`Provide an explicit ${channel} test recipient.`,preview},{status:400});
    recipients[channel]=value.trim();
   }
  }
  let deliveries:Awaited<ReturnType<typeof sendCanvasTestMessages>>=[],deliveryError='';
  if(input.sendMessages===true)try{deliveries=await sendCanvasTestMessages(id,preview,recipients);}catch(error){deliveryError=message(error);}
  const record=createResource({type:'canvas-test-runs',name:`${workspace.canvas!.name} test`,status:deliveryError?'Error':preview.status==='blocked'?'Blocked':input.sendMessages===true?'Test requested':'Previewed',data:{workspaceId:input.workspaceId,canvasId:id,userId:user.id,createdAt:new Date().toISOString(),preview,sendRequested:input.sendMessages===true,deliveries,...(deliveryError?{deliveryError}:{})}});
  return Response.json({runId:record.id,preview,deliveries,...(deliveryError?{error:deliveryError}:{})},{status:deliveryError?502:200});
 }catch(error){return Response.json({error:message(error)},{status:400});}
}
