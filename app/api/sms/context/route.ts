import {smsWorkspaceContext} from '@/lib/sms-composer-store';
export const runtime='nodejs';
export function GET(request:Request){const params=new URL(request.url).searchParams;return Response.json(smsWorkspaceContext(params.get('workspaceId')??'local',params.get('q')??''),{headers:{'Cache-Control':'no-store'}});}
