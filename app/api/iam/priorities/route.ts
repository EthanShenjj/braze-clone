import {getCampaign,getResource,listCampaigns,listResources,upsertCampaign,updateResource,workspaceTransaction} from '@/lib/braze-store';
export const runtime='nodejs';
type Row={id:string;name:string;type:string;status:string;priority:string;order:number;revision:string;canvasId?:string;nodeId?:string};
export function GET(request:Request){
 const workspaceId=new URL(request.url).searchParams.get('workspace')??'local';
 const campaigns:Row[]=listCampaigns({limit:1000,status:'All',workspaceId}).data.filter(c=>c.channel==='iam').map(c=>{const d=c.config.delivery as Record<string,unknown>|undefined;return{id:c.id,name:c.name,type:'Campaign',status:c.status,priority:String(d?.iamPriority??'Medium'),order:Number(d?.iamOrder??0),revision:c.edited};});
 for(const canvas of listResources('canvas').filter(c=>String(c.data.workspaceId??'local')===workspaceId)){
  const nodes=canvas.data.nodes as Array<{id:string;label:string;config?:Record<string,unknown>}>|undefined;
  for(const node of nodes??[])if(node.config?.channel==='iam'){const d=node.config.delivery as Record<string,unknown>|undefined;campaigns.push({id:`${canvas.id}:${node.id}`,name:`${canvas.name} · ${node.label}`,type:'Canvas',status:canvas.status,priority:String(d?.iamPriority??'Medium'),order:Number(d?.iamOrder??0),revision:canvas.updatedAt,canvasId:canvas.id,nodeId:node.id});}
 }
 return Response.json({data:campaigns});
}
export async function POST(request:Request){try{
 const input=await request.json(),workspaceId=String(input.workspaceId??'local');
 if(!Array.isArray(input.rows)||input.rows.length>1000)throw new Error('Invalid priority changes.');
 const rows=input.rows as Row[];
 for(const row of rows){
  if(!['Campaign','Canvas'].includes(row.type)||!['High','Medium','Low'].includes(row.priority)||!Number.isInteger(row.order)||row.order<0)throw new Error('Choose a valid priority and order.');
  if(row.type==='Campaign'){
   const current=getCampaign(row.id);if(!current||current.channel!=='iam'||String(current.config.workspaceId??'local')!==workspaceId)throw new Error('Choose an in-app message in the current workspace.');
   if(current.edited!==row.revision)throw new Error('A message changed in another editor. Reload before saving priorities.');
  }else{
   const canvas=getResource(row.canvasId??'');
   if(!canvas||canvas.type!=='canvas'||String(canvas.data.workspaceId??'local')!==workspaceId||!(canvas.data.nodes as Array<{id:string;config?:Record<string,unknown>}>|undefined)?.some(node=>node.id===row.nodeId&&node.config?.channel==='iam'))throw new Error('Choose an in-app Canvas message in the current workspace.');
   if(canvas.updatedAt!==row.revision)throw new Error('A message changed in another editor. Reload before saving priorities.');
  }
 }
 workspaceTransaction(()=>{for(const row of rows){if(row.type==='Campaign'){const c=getCampaign(row.id)!;upsertCampaign({...c,config:{...c.config,delivery:{...(c.config.delivery as object??{}),iamPriority:row.priority,iamOrder:row.order}}});}else{const canvas=getResource(row.canvasId!)!,nodes=canvas.data.nodes as Array<{id:string;config?:Record<string,unknown>}>;updateResource(canvas.id,{data:{...canvas.data,nodes:nodes.map(n=>n.id===row.nodeId?{...n,config:{...n.config,delivery:{...(n.config?.delivery as object??{}),iamPriority:row.priority,iamOrder:row.order}}}:n)}});}}});
 return Response.json({saved:true});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update priorities.'},{status:409});}}
