import {canvasStorageHealth} from '@/lib/braze-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{return Response.json({status:'ok',storage:canvasStorageHealth()},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({status:'unhealthy',storage:{available:false}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
