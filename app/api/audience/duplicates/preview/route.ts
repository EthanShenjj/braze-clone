import {generateAudienceDuplicatePreview} from '@/lib/braze-store';
import {duplicateAudienceProfiles} from '@/lib/audience-management-store';
export const runtime='nodejs';
export async function POST(request:Request){try{const input=await request.json(),workspaceId=typeof input.workspaceId==='string'?input.workspaceId:'local',preview=generateAudienceDuplicatePreview(workspaceId);return Response.json({...duplicateAudienceProfiles(workspaceId,preview),previewId:preview.previewId});}catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to generate duplicate profiles.'},{status:400});}}
