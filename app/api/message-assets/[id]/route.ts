import { getResource } from "@/lib/braze-store";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params,asset=getResource(id);
  if(!asset||asset.type!=="message-assets")return new Response("Not found",{status:404});
  const inline=String(asset.data.mime).startsWith("image/")||String(asset.data.mime)==="video/mp4";
  return new Response(Buffer.from(String(asset.data.base64),"base64"),{headers:{"Content-Type":String(asset.data.mime),"Content-Disposition":`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=3600"}});
}
