import { getCampaignAnalytics, saveCampaignMonitoring, evaluateCampaignMonitoring } from '@/lib/braze-store';
export const runtime='nodejs';
export async function GET(request:Request,context:RouteContext<'/api/campaigns/[id]/analytics'>){
  try{const params=new URL(request.url).searchParams;const result=getCampaignAnalytics((await context.params).id,{from:params.get('from')??undefined,to:params.get('to')??undefined});return result?Response.json(result):Response.json({error:'Campaign not found.'},{status:404});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Could not load campaign analytics.'},{status:400});}
}
export async function POST(request:Request,context:RouteContext<'/api/campaigns/[id]/analytics'>){
  try{const body=await request.json(),id=(await context.params).id;
    if(body.action==='monitor')return Response.json(saveCampaignMonitoring(id,body));
    if(body.action==='evaluate-monitor')return Response.json(evaluateCampaignMonitoring(id));
    return Response.json({error:'Unknown analytics action.'},{status:400});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not save monitoring settings.'},{status:400});}
}
