import {configuredAudienceUsers,listResources,listPreferenceCenters} from '@/lib/braze-store';
export const runtime='nodejs';
export function GET(request:Request){
 const workspaceId=new URL(request.url).searchParams.get('workspaceId')??'local',users=configuredAudienceUsers({channel:'push',config:{workspaceId}}),attributes=new Set<string>(),nested:Record<string,string[]>={},events:Record<string,string[]>={};
 const walk=(value:unknown,path='',depth=0):string[]=>{if(depth>8||value===null||typeof value!=='object')return path?[path]:[];const entries=Array.isArray(value)?value.map((item,index)=>[String(index),item] as const):Object.entries(value);return entries.flatMap(([key,item])=>walk(item,Array.isArray(value)?path+'['+key+']':path?path+'.'+key:key,depth+1));};
 for(const user of users)for(const [name,value]of Object.entries(user.attributes)){if(['workspaceId','workspace_id'].includes(name))continue;attributes.add(name);if(value&&typeof value==='object')nested[name]=[...new Set([...(nested[name]??[]),...walk(value)])].sort();}
 const scoped=(type:string)=>listResources(type).filter(row=>row.status!=='Archived'&&String(row.data.workspaceId??'local')===workspaceId);
 for(const event of scoped('user-events')){const properties=event.data.properties&&typeof event.data.properties==='object'?event.data.properties:{};events[event.name]=[...new Set([...(events[event.name]??[]),...Object.keys(properties)])].sort();}
 return Response.json({attributes:[...attributes].sort(),nested,events,contentBlocks:scoped('content-blocks').map(row=>({id:row.id,name:row.name,value:row.name})),preferenceCenters:listPreferenceCenters(workspaceId).filter(row=>row.status==='Active'&&row.publishedVersion!==null).map(row=>({id:row.id,name:row.name,value:row.id})),landingPages:scoped('landing-pages').filter(row=>row.status==='Published').map(row=>({id:row.id,name:row.name,value:row.id}))},{headers:{'Cache-Control':'no-store'}});
}
