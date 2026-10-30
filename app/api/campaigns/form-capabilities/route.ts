import {campaignFormCapabilities} from '@/lib/braze-store';
export const runtime='nodejs';
export async function GET(request:Request){return Response.json(campaignFormCapabilities(new URL(request.url).searchParams.get("workspaceId")??"local"));}
