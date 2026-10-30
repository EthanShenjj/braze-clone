import { estimateConfiguredAudience } from "@/lib/braze-store";
export const runtime="nodejs";
export async function POST(request:Request){try{const input=await request.json();if(!input.campaign||typeof input.campaign.channel!=="string")throw new Error("Provide a campaign snapshot.");return Response.json(estimateConfiguredAudience(input.campaign,typeof input.lookup==="string"?input.lookup.trim():undefined));}catch(e){return Response.json({error:e instanceof Error?e.message:"Invalid audience."},{status:400});}}
