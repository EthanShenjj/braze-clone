import{triggerCampaign}from"@/lib/braze-store";
import{authorizeIntegration}from"@/lib/integration-auth";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{authorizeIntegration(request,"campaigns.trigger");const {id}=await context.params,input=await request.json();if(!Array.isArray(input.userIds)||input.userIds.some((id:unknown)=>typeof id!=="string"))throw new Error("Provide userIds.");return Response.json(triggerCampaign(id,input.userIds,input.properties??{}));}catch(e){return Response.json({error:e instanceof Error?e.message:"Trigger failed."},{status:400});}}
