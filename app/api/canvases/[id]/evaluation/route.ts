import {createResource,getCanvasWorkspace,listResources} from '@/lib/braze-store';
import {evaluateCanvas,canvasStandardRuleSchema} from '@/lib/canvas-evaluation';

export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
function scopedCanvas(id:string,workspaceId:string){const value=getCanvasWorkspace(id);return value.canvas&&(value.canvas.workspaceId??'local')===workspaceId&&value.graph?value:null;}
export async function GET(request:Request,context:Context){
 const {id}=await context.params,params=new URL(request.url).searchParams,workspaceId=params.get('workspaceId');
 if(!workspaceId)return Response.json({error:'Provide a workspaceId.'},{status:400});
 const canvas=scopedCanvas(id,workspaceId);if(!canvas)return Response.json({error:'Canvas not found.'},{status:404});
 const nodeId=params.get('nodeId');if(nodeId&&!canvas.graph!.nodes.some(node=>node.id===nodeId))return Response.json({error:'Canvas step not found.'},{status:404});
 const data=listResources('canvas-evaluations').filter(row=>row.data.workspaceId===workspaceId&&row.data.canvasId===id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,20).map(row=>{
  if(!nodeId)return row;
  const run=row.data.run as {findings?:Array<{nodeId:string}>}|undefined;return{...row,data:{...row.data,run:{...run,findings:run?.findings?.filter(finding=>finding.nodeId===nodeId)??[]}}};
 });
 return Response.json({data,ruleSchema:canvasStandardRuleSchema});
}
export async function POST(request:Request,context:Context){
 const {id}=await context.params,input=await request.json().catch(()=>null);
 if(!input||typeof input.workspaceId!=='string'||!input.workspaceId||!Array.isArray(input.standardIds)||input.standardIds.length<1||input.standardIds.length>20||input.standardIds.some((value:unknown)=>typeof value!=='string'||!value)||new Set(input.standardIds).size!==input.standardIds.length)return Response.json({error:'Choose 1–20 available Standards.'},{status:400});
 const canvas=scopedCanvas(id,input.workspaceId);if(!canvas)return Response.json({error:'Canvas not found.'},{status:404});
 if(input.nodeId!==undefined&&(typeof input.nodeId!=='string'||!canvas.graph!.nodes.some(node=>node.id===input.nodeId)))return Response.json({error:'Canvas step not found.'},{status:404});
 const standards=listResources('campaign-standards').filter(row=>row.status!=='Archived'&&String(row.data.workspaceId??'local')===input.workspaceId&&input.standardIds.includes(row.id));
 if(standards.length!==input.standardIds.length)return Response.json({error:'A selected Standard was not found in this workspace.'},{status:404});
 try{
  const graph=input.nodeId?{...canvas.graph!,nodes:canvas.graph!.nodes.filter(node=>node.id===input.nodeId),edges:[]}:canvas.graph!;
  const run=await evaluateCanvas({canvasId:id,workspaceId:input.workspaceId,graph,standards,connector:process.env.CANVAS_STANDARDS_ENDPOINT?{endpoint:process.env.CANVAS_STANDARDS_ENDPOINT,apiKey:process.env.CANVAS_STANDARDS_API_KEY,timeoutMs:Number(process.env.CANVAS_STANDARDS_TIMEOUT_MS)||10000}:undefined});
  const record=createResource({type:'canvas-evaluations',name:`${canvas.canvas!.name} evaluation`,status:run.status,data:{workspaceId:input.workspaceId,canvasId:id,createdAt:run.createdAt,canvasUpdatedAt:canvas.updatedAt,...(input.nodeId?{nodeId:input.nodeId}:{}),run}});
  return Response.json({runId:record.id,run});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Canvas evaluation failed.'},{status:400});}
}
