import {findAudienceUsers} from '@/lib/audience-users-store';
export const runtime='nodejs';
export function GET(request:Request){const params=new URL(request.url).searchParams;return Response.json(findAudienceUsers(params.get('q')??params.get('query')??'',params.get('workspaceId')??params.get('workspace')??'local'),{headers:{'Cache-Control':'no-store'}});}
