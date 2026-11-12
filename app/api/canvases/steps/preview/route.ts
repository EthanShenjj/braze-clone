import {previewCanvasStep} from '@/lib/braze-store';
import {isCanvasGraph} from '@/lib/canvas-model';
export const runtime='nodejs';
export async function POST(request:Request){try{const input=await request.json();if(!isCanvasGraph({nodes:[input.node],edges:[]})||typeof input.lookup!=='string'||!input.lookup.trim())throw new Error('Provide a step and a user to preview.');return Response.json(previewCanvasStep(input.node,input.lookup.trim(),typeof input.workspaceId==='string'?input.workspaceId:'local'));}catch(error){return Response.json({error:error instanceof Error?error.message:'Could not preview this step.'},{status:400});}}
