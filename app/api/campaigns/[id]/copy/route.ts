import { copyCampaignToWorkspace } from '@/lib/braze-store';
export const runtime='nodejs';
export async function POST(request:Request,context:RouteContext<'/api/campaigns/[id]/copy'>){
  try{const body=await request.json();if(typeof body.workspaceId!=='string')throw new Error('Select a destination workspace.');return Response.json(copyCampaignToWorkspace((await context.params).id,body.workspaceId),{status:201});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Could not copy this campaign.'},{status:400});}
}
