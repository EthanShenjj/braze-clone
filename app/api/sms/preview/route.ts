import { createResource } from "@/lib/braze-store";
import {normalizeSmsSnapshot} from '@/lib/sms-composer-model';
import {renderWorkspaceSms} from '@/lib/sms-composer-store';

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if(input?.snapshot){try{
    if(input.profile!==undefined&&(!input.profile||typeof input.profile!=='object'||Array.isArray(input.profile)||JSON.stringify(input.profile).length>20000))throw new Error('Invalid preview attributes.');
    const workspaceId=String(input.workspaceId??'local'),message=renderWorkspaceSms(normalizeSmsSnapshot(input.snapshot),workspaceId,input.profile??{},String(input.ownerId??''),()=> 'https://brz.ai/XXXXXXXX');
    const record=createResource({type:'sms-preview-share',name:'SMS preview',data:{workspaceId,message:message.message,mediaUrl:message.mediaUrl,mediaType:message.mediaType,richCard:message.richCard,cards:message.cards,expiresAt:Date.now()+7*86400000}});
    return Response.json({url:`/sms/preview/${record.id}`});
   }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not create preview.'},{status:400});}}
  if (typeof input?.message !== "string" || !input.message.trim() || input.message.length > 20000) return Response.json({ error: "Provide a message of 1–20,000 characters." }, { status: 400 });
  const record = createResource({ type: "sms-preview-share", name: "SMS preview", data: { message: input.message, expiresAt: Date.now() + 7 * 86400000 } });
  return Response.json({ url: `/sms/preview/${record.id}` });
}
