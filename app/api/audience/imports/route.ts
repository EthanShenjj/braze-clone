import { audienceImportHistory, AudienceImportError, runAudienceImport } from '@/lib/audience-import-store';
export const runtime='nodejs';
export function GET(request:Request){const params=new URL(request.url).searchParams;return Response.json({data:audienceImportHistory(params.get('workspaceId')??params.get('workspace')??'local')},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){try{const params=new URL(request.url).searchParams,input=await request.json();return Response.json(runAudienceImport(input,params.get('workspaceId')??params.get('workspace')??'local'),{status:201});}catch(cause){return Response.json({error:cause instanceof Error?cause.message:'Unable to import this file.'},{status:cause instanceof AudienceImportError?cause.status:400});}}
