import { syncWhatsAppTemplates,submitWhatsAppTemplate,whatsappProviderConfigured } from "@/lib/whatsapp-provider";
import { validateWhatsAppTemplate } from "@/lib/whatsapp-model";
export const runtime="nodejs";
export async function GET(request:Request){if(new URL(request.url).searchParams.get("capability")==="true")return Response.json({configured:whatsappProviderConfigured()});try{return Response.json(await syncWhatsAppTemplates());}catch(e){return Response.json({error:e instanceof Error?e.message:"Synchronization failed."},{status:whatsappProviderConfigured()?502:503});}}
export async function POST(request:Request){try{const input=await request.json(),issues=validateWhatsAppTemplate(input);if(issues.length)return Response.json({error:issues.join(" ")},{status:400});return Response.json(await submitWhatsAppTemplate(input));}catch(e){return Response.json({error:e instanceof Error?e.message:"Submission failed."},{status:whatsappProviderConfigured()?502:503});}}
