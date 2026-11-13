import {importCanvasBrowserDraft} from '@/lib/braze-store';

export const runtime='nodejs';
export async function POST(request:Request){
 const input=await request.json().catch(()=>null);
 if(!input||typeof input.workspaceId!=='string'||!input.workspaceId)return Response.json({error:'Provide a workspace and browser draft.'},{status:400});
 try{return Response.json(importCanvasBrowserDraft(input.draft,input.workspaceId),{status:201});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Browser draft import failed.'},{status:400});}
}
