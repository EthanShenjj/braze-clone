import { getResource } from '@/lib/braze-store';
export const runtime='nodejs';
export async function GET(_request:Request,context:RouteContext<'/api/campaign-briefs/[id]'>){
  const record=getResource((await context.params).id);
  if(!record||record.type!=='campaign-briefs')return Response.json({error:'Brief not found.'},{status:404});
  return new Response(Buffer.from(String(record.data.content??''),'base64'),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${record.name.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(record.name)}`,'X-Content-Type-Options':'nosniff'}});
}
