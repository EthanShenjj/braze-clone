import { followMessageLink } from "@/lib/braze-store";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params,url=followMessageLink(id);return url?new Response(null,{status:302,headers:{Location:url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}}):new Response("Link not found",{status:404});}
