import {smsWorkspaceUsers} from '@/lib/sms-composer-store';
export const runtime='nodejs';
export function GET(request:Request){const params=new URL(request.url).searchParams,rows=smsWorkspaceUsers(params.get('workspaceId')??'local',params.get('q')??'');return Response.json({data:rows.slice(0,100),total:rows.length},{headers:{'Cache-Control':'no-store'}});}
