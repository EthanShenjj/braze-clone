import{processCampaignJobs}from"@/lib/braze-store";
import{timingSafeEqual}from"node:crypto";
export const runtime="nodejs";
export async function POST(request:Request){const expected=process.env.CAMPAIGN_SCHEDULER_SECRET,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";if(!expected)return Response.json({error:"Configure CAMPAIGN_SCHEDULER_SECRET for the delivery worker."},{status:503});if(token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return Response.json({error:"Unauthorized."},{status:401});try{return Response.json(await processCampaignJobs());}catch(e){return Response.json({error:e instanceof Error?e.message:"Worker failed."},{status:500});}}
