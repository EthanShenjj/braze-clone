import { createResource } from "@/lib/braze-store";
export const runtime = "nodejs";
const types = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "application/pdf", "text/vcard", "text/x-vcard", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2 * 1024 * 1024 + 16384) return Response.json({ error:"File must be 2 MB or smaller." },{status:413});
    const form=await request.formData(),file=form.get("file");
    if (!(file instanceof File) || !file.size || file.size>2*1024*1024) return Response.json({error:"Choose a file up to 2 MB."},{status:400});
    if (!types.has(file.type)) return Response.json({error:"Unsupported media or attachment file type."},{status:400});
    const bytes=Buffer.from(await file.arrayBuffer()),asset=createResource({type:"message-assets",name:file.name.replace(/[\r\n"<>]/g,"_").slice(0,160),status:"Active",data:{mime:file.type,size:bytes.length,base64:bytes.toString("base64")}});
    const url=`/api/message-assets/${asset.id}`;
    createResource({type:"media",name:asset.name,status:"Active",data:{src:url,mime:file.type,size:bytes.length,assetId:asset.id}});
    return Response.json({id:asset.id,url,name:asset.name,size:bytes.length,mime:file.type},{status:201});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Upload failed."},{status:400});}
}
