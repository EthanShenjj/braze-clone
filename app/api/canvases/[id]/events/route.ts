import {getCanvas,recordExternalEvent} from '@/lib/braze-store';

export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
 const {id}=await context.params,input=await request.json().catch(()=>null),workspaceId=new URL(request.url).searchParams.get('workspaceId')??input?.workspaceId,canvas=getCanvas(id);
 if(typeof workspaceId!=='string'||!workspaceId)return Response.json({error:'Provide a workspaceId.'},{status:400});
 if(!canvas||canvas.workspaceId!==workspaceId)return Response.json({error:'Canvas not found.'},{status:404});
 if(!input||typeof input.userId!=='string'||typeof input.event!=='string'||!input.attributes||typeof input.attributes!=='object'||Array.isArray(input.attributes))return Response.json({error:'Provide a user, event and message step attributes.'},{status:400});
 try{return Response.json(recordExternalEvent(id,input));}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to record event.'},{status:400});}
}
