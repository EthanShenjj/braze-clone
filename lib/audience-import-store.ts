import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { applyProfileRows, configuredAudienceUsers, createResource, getUser, listResources, trackProfileEvent, workspaceTransaction, type UserRecord } from './braze-store';
import { audienceImportLimits, parseAudienceCsv, prepareAudienceRows, type AudienceImportIdentity, type AudienceImportKind, type AudiencePreparedRow } from './audience-import-model';
export class AudienceImportError extends Error{constructor(message:string,public status=400){super(message);}}
const scope=(user:UserRecord)=>String(user.attributes.workspaceId??user.attributes.workspace_id??'local');
export function audienceImportHistory(workspaceId='local'){return listResources('import-users').filter(row=>String(row.data.workspaceId??'local')===workspaceId);}
export function runAudienceImport(input:{csv:string;fileName:string;kind:AudienceImportKind;requestId?:string},workspaceId='local') {
 if(!['attributes','events','recommended'].includes(input.kind)||typeof input.csv!=='string'||typeof input.fileName!=='string'||!input.fileName.trim()||input.fileName.length>300)throw new AudienceImportError('Provide a CSV file and supported import type.');
 if(Buffer.byteLength(input.csv,'utf8')>audienceImportLimits.bytes)throw new AudienceImportError('Maximum file size is 1MB.');
 const csv=parseAudienceCsv(input.csv,audienceImportLimits.rows,audienceImportLimits.columns),prepared=prepareAudienceRows(csv,input.kind),signature=createHash('sha256').update(JSON.stringify({kind:input.kind,csv:input.csv,fileName:input.fileName})).digest('hex');
 if(input.requestId!==undefined&&(typeof input.requestId!=='string'||input.requestId.length>100))throw new AudienceImportError('Invalid import request.');
 const previous=input.requestId?audienceImportHistory(workspaceId).find(row=>row.data.requestId===input.requestId):undefined;
 if(previous){if(previous.data.signature!==signature)throw new AudienceImportError('This import request has already been used for another file.',409);return previous;}
 return workspaceTransaction(()=>{
  if(audienceImportHistory(workspaceId).length>=audienceImportLimits.files)throw new AudienceImportError('Free trial environments have a limit of 25 files.');
  const users=configuredAudienceUsers({channel:'push',config:{workspaceId}}),newProfiles=new Map<string,Record<string,unknown>>(),resolved: Array<{row:AudiencePreparedRow;id:string}>=[],seenAttributes=new Set<string>();
  const unique=(matches:UserRecord[],label:string)=>{if(matches.length>1)throw new AudienceImportError(`More than one user matches ${label}. Use an external_id or braze_id instead.`);return matches[0]?.id;};
  const resolve=(identity:AudienceImportIdentity):string=>{
   if(identity.externalId){const existing=getUser(identity.externalId);if(existing&&scope(existing)!==workspaceId)throw new AudienceImportError('This user ID belongs to another workspace; use a distinct ID.');return identity.externalId;}
   if(identity.brazeId){const exact=getUser(identity.brazeId);if(exact&&scope(exact)!==workspaceId)throw new AudienceImportError('This Braze ID belongs to another workspace.');const found=exact?.id??unique(users.filter(user=>user.attributes.braze_id===identity.brazeId),'this Braze ID');if(!found)throw new AudienceImportError('The Braze ID was not found in this workspace.');return found;}
   const key=identity.aliasName?`alias:${identity.aliasLabel}:${identity.aliasName}`:identity.email?`email:${identity.email.toLowerCase()}`:`phone:${identity.phone}`;
   const planned=[...newProfiles].find(([,profile])=>profile.__importIdentity===key)?.[0];if(planned)return planned;
   const found=identity.aliasName?unique(users.filter(user=>user.attributes.user_alias_name===identity.aliasName&&user.attributes.user_alias_label===identity.aliasLabel||Array.isArray(user.attributes.aliases)&&user.attributes.aliases.some((alias:unknown)=>Boolean(alias&&typeof alias==='object'&&(alias as Record<string,unknown>).alias_name===identity.aliasName&&(alias as Record<string,unknown>).alias_label===identity.aliasLabel))),'this alias'):identity.email?unique(users.filter(user=>user.email.toLowerCase()===identity.email!.toLowerCase()),'this email'):unique(users.filter(user=>String(user.attributes.phone??user.attributes.phone_number??'').replace(/[^\d+]/g,'')===identity.phone!.replace(/[^\d+]/g,'')),'this phone');
   if(found)return found;const id=`imp_${randomUUID()}`;newProfiles.set(id,{__importIdentity:key,external_id:id,attributes:{external_id:'',braze_id:id,...(identity.aliasName?{user_alias_name:identity.aliasName,user_alias_label:identity.aliasLabel,aliases:[{alias_name:identity.aliasName,alias_label:identity.aliasLabel}]}:{}),...(identity.phone?{phone:identity.phone}:{})},...(identity.email?{email:identity.email}:{})});return id;
  };
  for(const row of prepared){const id=resolve(row.identity);if(input.kind==='attributes'&&seenAttributes.has(id))throw new AudienceImportError('A user appears more than once in this file.');seenAttributes.add(id);resolved.push({row,id});if(!getUser(id)&&!newProfiles.has(id))newProfiles.set(id,{external_id:id});}
  if(users.length+newProfiles.size>audienceImportLimits.profiles&&newProfiles.size)throw new AudienceImportError('Free trial environments have a limit of 250 user profiles.');
  const rowsToApply=input.kind==='attributes'?resolved.map(({row,id})=>{const base=newProfiles.get(id)??{external_id:id};const {__importIdentity:_,...profile}=base;return{...profile,...row.profile,external_id:id};}):[...newProfiles.values()].map(({__importIdentity:_,...profile})=>profile);
  const changes=rowsToApply.length?applyProfileRows(rowsToApply,workspaceId):{created:0,updated:0,processed:0};let events=0;
  if(input.kind!=='attributes'){
   const grouped:Array<{id:string;row:AudiencePreparedRow;properties:Record<string,unknown>}>=[];let last:typeof grouped[number]|undefined;
   for(const {id,row} of resolved){const properties={...row.properties};if(input.kind==='recommended'&&row.name!=='ecommerce.product_viewed'){
     const itemKeys=['product_id','product_name','variant_id','image_url','product_url','quantity','price'],item=Object.fromEntries(itemKeys.filter(key=>properties[key]!==undefined).map(key=>[key,properties[key]]));for(const key of itemKeys)delete properties[key];
     if(properties.total_value!==undefined)properties.total_price=properties.total_value;
     const same=last&&last.id===id&&last.row.name===row.name&&last.row.time===row.time&&(!properties.order_id||properties.order_id===last.properties.order_id);
     if(same&&last){if(Object.keys(item).length)(last.properties.products as unknown[]).push(item);continue;}
     if(Object.keys(item).length)properties.products=[item];else properties.products=[];
   }
   last={id,row,properties};grouped.push(last);}
   for(const item of grouped){trackProfileEvent({userId:item.id,name:item.row.name!,createdAt:item.row.time!,properties:item.properties});events++;}
  }
  const ids=[...new Set(resolved.map(row=>row.id))];return createResource({type:'import-users',name:input.fileName.trim(),status:'Completed',description:`${input.kind==='attributes'?'User attributes':input.kind==='events'?'Custom events':'eCommerce recommended events'} CSV import`,data:{workspaceId,version:1,fileName:input.fileName.trim(),kind:input.kind,type:input.kind==='attributes'?'Attributes':input.kind==='events'?'Custom events':'Recommended events',uploader:'Local user',completed:true,targetingAvailability:'Available',header:csv.headers,count:csv.rows.length,records:csv.rows.length,created:changes.created,updated:changes.updated,events,imported:csv.rows.length,skipped:0,userIds:ids,requestId:input.requestId??randomUUID(),signature,completedAt:new Date().toISOString()}});
 });
}
