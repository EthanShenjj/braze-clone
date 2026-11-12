import { AudienceManagementError, segmentManagementData } from "@/lib/audience-management-store";

export const runtime="nodejs";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params,params=new URL(request.url).searchParams;
    return Response.json(segmentManagementData(id,params.get("workspaceId")??params.get("workspace")??"local"),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to load segment insights."},{status:error instanceof AudienceManagementError?error.status:400});}
}
