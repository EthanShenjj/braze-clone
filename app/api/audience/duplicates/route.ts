import {duplicateAudienceProfiles} from '@/lib/audience-management-store';
export const runtime='nodejs';
export function GET(request:Request){try{return Response.json(duplicateAudienceProfiles(new URL(request.url).searchParams.get('workspaceId')??'local'),{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to preview duplicate profiles.'},{status:400});}}
