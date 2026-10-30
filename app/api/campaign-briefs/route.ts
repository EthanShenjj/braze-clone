import { createResource } from '@/lib/braze-store';
export const runtime='nodejs';
export async function POST(request:Request){
  try {
    const file=(await request.formData()).get('file');
    if(!(file instanceof File))return Response.json({error:'Choose a campaign brief.'},{status:400});
    if(file.size>15*1024*1024)return Response.json({error:'Campaign briefs must be no larger than 15MB.'},{status:413});
    if(!/\.(pdf|txt|md|csv|docx)$/i.test(file.name))return Response.json({error:'Choose a PDF, TXT, MD, CSV, or DOCX file.'},{status:400});
    const name=file.name.replace(/[\r\n\x00]/g,'').slice(0,200),mime=file.type||'application/octet-stream';
    const record=createResource({type:'campaign-briefs',name,status:'Uploaded',data:{content:Buffer.from(await file.arrayBuffer()).toString('base64'),mime,size:file.size}});
    return Response.json({id:record.id,name,type:mime,size:file.size,url:`/api/campaign-briefs/${record.id}`},{status:201});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not upload the campaign brief.'},{status:400});}
}
