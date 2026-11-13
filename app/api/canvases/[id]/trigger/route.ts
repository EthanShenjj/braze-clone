import {getCanvas,triggerCanvas,processCanvasRuntime} from '@/lib/braze-store';

export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
 const {id}=await context.params,input=await request.json().catch(()=>null),queryWorkspace=new URL(request.url).searchParams.get('workspaceId');
 if(!input||typeof input!=='object'||Array.isArray(input)||!Array.isArray(input.userIds)||!input.userIds.length||input.userIds.length>1000||input.userIds.some((value:unknown)=>typeof value!=='string'||!value.trim())||input.properties!==undefined&&(!input.properties||typeof input.properties!=='object'||Array.isArray(input.properties))||input.requestId!==undefined&&(typeof input.requestId!=='string'||!input.requestId.trim()||input.requestId.length>200))return Response.json({error:'Provide 1–1,000 user IDs, entry properties and an optional request ID.'},{status:400});
 const workspaceId=queryWorkspace??input.workspaceId;
 if(typeof workspaceId!=='string'||!workspaceId||input.workspaceId!==undefined&&input.workspaceId!==workspaceId)return Response.json({error:'Provide a matching workspaceId.'},{status:400});
 const canvas=getCanvas(id);if(!canvas||(canvas.workspaceId??'local')!==workspaceId)return Response.json({error:'Canvas not found.'},{status:404});
 try{const run=triggerCanvas(id,input.userIds,input.properties??{},input.requestId);await processCanvasRuntime();return Response.json(run,{status:202});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Canvas trigger failed.'},{status:422});}
}
