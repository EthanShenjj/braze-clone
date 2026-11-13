import type {DatabaseSync} from 'node:sqlite';

export type CanvasWorkspaceRateSnapshot={workspaceId:string;at:string;enabled:boolean;resourceId:string|null;maxPerMinute:number|null;maxPerDay:number|null;minute:number;day:number;pending:number;remainingPerMinute:number|null;remainingPerDay:number|null;limited:boolean};
type Row=Record<string,unknown>;
type IdKind='provider'|'job'|'frequency'|'dispatch'|'sdk';
type Identifiers=Record<IdKind,Set<string>>;
type Dispatch={firstAt:number;ids:Identifiers;tokens:Set<string>;types:Set<string>;excluded:boolean;fallback:string|null};
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const parse=(value:unknown):Row=>{try{return object(JSON.parse(String(value??'{}')));}catch{return{};}};
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):null;
const scopeOf=(data:Row)=>String(data.workspaceId??data.workspace_id??'local');
function workspaceSettings(db:DatabaseSync,workspaceId:string){return(db.prepare("SELECT id,data_json FROM resources WHERE type='messaging-rate-limits' AND lower(status)='active' ORDER BY updated_at DESC,id DESC").all() as Row[]).map(row=>({id:String(row.id),data:parse(row.data_json)})).find(row=>scopeOf(row.data)===workspaceId);}
const idKinds:IdKind[]=['provider','job','frequency','dispatch','sdk'];
const emptyIds=():Identifiers=>({provider:new Set(),job:new Set(),frequency:new Set(),dispatch:new Set(),sdk:new Set()});
const overlaps=(left:Set<string>,right:Set<string>)=>[...left].some(value=>right.has(value));
function compatible(left:Identifiers,right:Identifiers){
 if(left.provider.size&&right.provider.size)return overlaps(left.provider,right.provider);
 for(const kind of ['job','frequency','dispatch','sdk'] as const)if(left[kind].size&&right[kind].size&&!overlaps(left[kind],right[kind]))return false;
 return true;
}
function metadata(data:Row){const attributes=object(data.attributes);return[data,attributes,object(data.delivery),object(attributes.delivery)];}
function excluded(data:Row){
 const marked=(value:unknown)=>value===true||value===1||value==='true'||value==='1';
 return metadata(data).some(source=>['test','seed','simulated'].some(key=>marked(source[key]))||['mode','kind'].some(key=>['test','seed','preview','simulated'].includes(String(source[key]??'').toLowerCase()))||['prepared','available','sdk_available'].includes(String(source.status??'').toLowerCase()));
}
function identifiers(data:Row){
 const result=emptyIds();for(const source of metadata(data))for(const [kind,keys] of Object.entries({provider:['providerId','providerID','provider_id','providerMessageId','provider_message_id'],job:['jobId'],frequency:['frequencyDispatchId'],dispatch:['dispatchId'],sdk:['sdkMessageId']}) as Array<[IdKind,string[]]>)for(const key of keys){const value=text(source[key]);if(value)result[kind].add(value);}
 return result;
}
function eventWorkspace(row:Row,data:Row){
 const campaign=row.campaign_config_json!==null&&row.campaign_config_json!==undefined?scopeOf(parse(row.campaign_config_json)):null,canvas=row.owner_resource_type==='canvas'?scopeOf(parse(row.resource_data_json)):null;
 if(campaign&&canvas&&campaign!==canvas)return null;
 const owner=campaign??canvas,attributes=object(data.attributes),declared=text(data.workspaceId??data.workspace_id??attributes.workspaceId??attributes.workspace_id);
 // Conflicting ownership is ambiguous and must not charge either workspace.
 if(declared&&owner&&declared!==owner)return null;return declared??owner;
}
function dispatchCounts(db:DatabaseSync,workspaceId:string,at:number){
 const rows=db.prepare("SELECT e.*,c.config_json AS campaign_config_json,r.type AS owner_resource_type,r.data_json AS resource_data_json FROM message_events e LEFT JOIN campaigns c ON c.id=e.campaign_id LEFT JOIN resources r ON r.id=e.campaign_id AND r.type='canvas' WHERE e.event_type IN ('accepted','delivered') AND julianday(e.created_at)<=julianday(?) ORDER BY julianday(e.created_at),e.id").iterate(new Date(at).toISOString());
 const groups=new Set<Dispatch>(),byToken=new Map<string,Set<Dispatch>>(),legacy=new Map<string,Dispatch[]>();
 const index=(group:Dispatch)=>{for(const token of group.tokens){const list=byToken.get(token)??new Set<Dispatch>();list.add(group);byToken.set(token,list);}};
 const merge=(target:Dispatch,source:Dispatch)=>{if(target===source)return;target.firstAt=Math.min(target.firstAt,source.firstAt);target.excluded||=source.excluded;for(const kind of idKinds)for(const id of source.ids[kind])target.ids[kind].add(id);for(const type of source.types)target.types.add(type);for(const token of source.tokens){target.tokens.add(token);byToken.get(token)?.delete(source);}groups.delete(source);index(target);};
 for(const raw of rows){
  const row=raw as Row,data=parse(row.data_json),time=Date.parse(String(row.created_at));if(!Number.isFinite(time)||time>at||eventWorkspace(row,data)!==workspaceId)continue;
  const ids=identifiers(data),base=JSON.stringify([workspaceId,row.campaign_id,String(row.channel).toLowerCase(),row.user_id]),tokens=new Set(idKinds.flatMap(kind=>[...ids[kind]].map(id=>JSON.stringify([base,kind,id])))),type=String(row.event_type),sources=metadata(data),find=(key:string)=>sources.map(source=>text(source[key])).find(Boolean)??null,run=find('canvasRunId')??find('runId'),node=find('nodeId')??find('canvasNodeId'),isCanvas=row.owner_resource_type==='canvas'||Boolean(find('canvasRunId')),fallback=!tokens.size&&run&&text(row.user_id)&&(!isCanvas||node)?JSON.stringify([base,run,node]):null;
  const candidates=[...new Set([...tokens].flatMap(token=>[...byToken.get(token)??[]]))].filter(group=>compatible(group.ids,ids));
  let group:Dispatch|undefined=candidates.find(candidate=>overlaps(candidate.ids.provider,ids.provider))??candidates[0];
  if(!group&&fallback)group=legacy.get(fallback)?.find(candidate=>!candidate.types.has(type)&&candidate.types.size===1);
  if(!group){group={firstAt:time,ids:emptyIds(),tokens:new Set(),types:new Set(),excluded:false,fallback};groups.add(group);if(fallback)legacy.set(fallback,[...legacy.get(fallback)??[],group]);}
  for(const candidate of candidates)if(candidate!==group&&compatible(group.ids,candidate.ids))merge(group,candidate);
  group.firstAt=Math.min(group.firstAt,time);group.types.add(type);group.excluded||=excluded(data);for(const kind of idKinds)for(const id of ids[kind])group.ids[kind].add(id);for(const token of tokens)group.tokens.add(token);index(group);
 }
 let minute=0,day=0;for(const group of groups){if(group.excluded)continue;if(group.firstAt>at-60000)minute++;if(group.firstAt>at-86400000)day++;}return{minute,day};
}
/** Rolling workspace ceilings over actual dispatch facts; this snapshot never reserves or sends. */
export function canvasWorkspaceRateSnapshot(db:DatabaseSync,workspaceId:string,timestamp:string,pending=0):CanvasWorkspaceRateSnapshot{
 const at=Date.parse(timestamp);if(!workspaceId||!Number.isFinite(at))throw Error('Choose a workspace and valid rate-limit time.');if(!Number.isInteger(pending)||pending<0)throw Error('Pending message count must be a nonnegative integer.');
 const settings=workspaceSettings(db,workspaceId),enabled=settings?.data.enforce===true;
 const limit=(key:string)=>{const raw=settings?.data[key];if(raw===undefined||raw===null||raw==='')return null;const value=Number(raw);if(!Number.isSafeInteger(value)||value<=0){if(enabled)throw Error('Configure positive whole-number workspace messaging rate limits.');return null;}return value;},maxPerMinute=limit('maxPerMinute'),maxPerDay=limit('maxPerDay');
 if(enabled&&maxPerMinute===null&&maxPerDay===null)throw Error('Configure a positive workspace messaging rate limit before enabling it.');
 const counts=dispatchCounts(db,workspaceId,at),remainingPerMinute=maxPerMinute===null?null:Math.max(0,maxPerMinute-counts.minute-pending),remainingPerDay=maxPerDay===null?null:Math.max(0,maxPerDay-counts.day-pending);
 return{workspaceId,at:new Date(at).toISOString(),enabled,resourceId:settings?.id??null,maxPerMinute,maxPerDay,...counts,pending,remainingPerMinute,remainingPerDay,limited:enabled&&(remainingPerMinute===0||remainingPerDay===0)};
}
/** Disabled workspaces bypass delivery-log scans on the dispatch path. */
export function canvasWorkspaceRateLimited(db:DatabaseSync,workspaceId:string,timestamp:string,pending=0){if(workspaceSettings(db,workspaceId)?.data.enforce!==true)return false;return canvasWorkspaceRateSnapshot(db,workspaceId,timestamp,pending).limited;}
