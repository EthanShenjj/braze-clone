import {isCanvasGraph,type CanvasGraph} from './canvas-model.ts';
import type {CanvasWizardConfig} from './canvas-wizard-model.ts';

export type CanvasViewScope={workspaceId:string;canvasId:string};
export type CanvasChangeDocument={name:string;description:string;tags:string[];graph:CanvasGraph;wizard:CanvasWizardConfig};
export type CanvasViewedSnapshot=CanvasViewScope&{version:1;viewedAt:string;document:CanvasChangeDocument};
export type CanvasChangeField={path:string;before?:unknown;after?:unknown};
export type CanvasViewChange={id:string;category:'step'|'connection'|'variant'|'settings'|'details';kind:'added'|'removed'|'modified';label:string;path:string;before?:unknown;after?:unknown;fields?:CanvasChangeField[]};
export type CanvasViewStorage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
const maxSnapshotSize=2_000_000;
const object=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
function validDocument(value:unknown):value is CanvasChangeDocument{
 const document=object(value),wizard=object(document?.wizard);
 return Boolean(document&&typeof document.name==='string'&&typeof document.description==='string'&&Array.isArray(document.tags)&&document.tags.every(tag=>typeof tag==='string')&&isCanvasGraph(document.graph)&&wizard&&object(wizard.entry)&&object(wizard.audience)&&object(wizard.send)&&Array.isArray(wizard.conversionEvents));
}
function validSnapshot(value:unknown,scope:CanvasViewScope):value is CanvasViewedSnapshot{
 const snapshot=object(value);return Boolean(snapshot&&snapshot.version===1&&snapshot.workspaceId===scope.workspaceId&&snapshot.canvasId===scope.canvasId&&typeof snapshot.viewedAt==='string'&&Number.isFinite(Date.parse(snapshot.viewedAt))&&validDocument(snapshot.document));
}
/** This preference key is separate from all draft/graph storage. */
export function canvasViewSnapshotKey(scope:CanvasViewScope){return `braze.canvas-viewed.v1:${encodeURIComponent(scope.workspaceId)}:${encodeURIComponent(scope.canvasId)}`;}
export function createCanvasViewSnapshot(scope:CanvasViewScope,current:CanvasChangeDocument,viewedAt=new Date().toISOString()):CanvasViewedSnapshot|null{
 try{if(!scope.workspaceId||!scope.canvasId||!validDocument(current)||!Number.isFinite(Date.parse(viewedAt)))return null;const serialized=JSON.stringify({version:1,...scope,viewedAt,document:current});return serialized.length<=maxSnapshotSize?JSON.parse(serialized) as CanvasViewedSnapshot:null;}catch{return null;}
}
export function readCanvasViewSnapshot(storage:CanvasViewStorage|null|undefined,scope:CanvasViewScope):CanvasViewedSnapshot|null{
 try{const raw=storage?.getItem(canvasViewSnapshotKey(scope));if(!raw||raw.length>maxSnapshotSize)return null;const value:unknown=JSON.parse(raw);return validSnapshot(value,scope)?value:null;}catch{return null;}
}
export function writeCanvasViewSnapshot(storage:CanvasViewStorage|null|undefined,snapshot:CanvasViewedSnapshot|null):boolean{
 try{if(!storage||!snapshot||!validSnapshot(snapshot,snapshot))return false;const serialized=JSON.stringify(snapshot);if(serialized.length>maxSnapshotSize)return false;storage.setItem(canvasViewSnapshotKey(snapshot),serialized);return true;}catch{return false;}
}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 const record=object(value);return record?Object.fromEntries(Object.keys(record).filter(key=>record[key]!==undefined).sort().map(key=>[key,canonical(record[key])])):value;
}
const equal=(before:unknown,after:unknown)=>JSON.stringify(canonical(before))===JSON.stringify(canonical(after));
function fields(before:unknown,after:unknown,path=''):CanvasChangeField[]{
 if(equal(before,after))return[];
 const previous=object(before),current=object(after);
 if(previous&&current)return [...new Set([...Object.keys(previous),...Object.keys(current)])].sort().flatMap(key=>fields(previous[key],current[key],path?`${path}.${key}`:key));
 return[{path,before,after}];
}
/** Counts actual changed items. No previous scoped snapshot means no known changes. */
export function canvasChangesSinceViewed(scope:CanvasViewScope,previous:CanvasViewedSnapshot|null,current:CanvasChangeDocument):CanvasViewChange[]{
 try{
  if(!previous||!validSnapshot(previous,scope)||!validDocument(current))return[];
  const before=previous.document,changes:CanvasViewChange[]=[];
  const keyed=(category:'step'|'variant',path:string,oldRows:Array<{id:string;label?:string;name?:string}>,newRows:Array<{id:string;label?:string;name?:string}>)=>{
   const oldMap=new Map(oldRows.map(row=>[row.id,row])),newMap=new Map(newRows.map(row=>[row.id,row]));
   for(const id of [...new Set([...oldMap.keys(),...newMap.keys()])].sort()){
    const old=oldMap.get(id),next=newMap.get(id);if(equal(old,next))continue;
    const kind=old===undefined?'added':next===undefined?'removed':'modified',row=next??old!,name=row.label??row.name??id;
    changes.push({id:`${category}:${id}`,category,kind,label:`${kind==='added'?'Added':kind==='removed'?'Removed':'Updated'} ${category} “${name}”`,path:`${path}.${id}`,before:old,after:next,...(old&&next?{fields:fields(old,next)}:{})});
   }
  };
  keyed('step','graph.nodes',before.graph.nodes,current.graph.nodes);
  const oldEdges=new Map(before.graph.edges.map(edge=>[JSON.stringify(edge),edge])),newEdges=new Map(current.graph.edges.map(edge=>[JSON.stringify(edge),edge]));
  for(const id of [...new Set([...oldEdges.keys(),...newEdges.keys()])].sort()){
   const old=oldEdges.get(id),next=newEdges.get(id);if(old&&next)continue;const edge=next??old!,kind=old?'removed':'added',label=(nodeId:string)=>current.graph.nodes.find(node=>node.id===nodeId)?.label??before.graph.nodes.find(node=>node.id===nodeId)?.label??nodeId;
   changes.push({id:`connection:${id}`,category:'connection',kind,label:`${old?'Removed':'Added'} connection: ${label(edge[0])} → ${label(edge[1])}`,path:'graph.edges',before:old,after:next});
  }
  keyed('variant','graph.variants',before.graph.variants??[],current.graph.variants??[]);
  for(const field of fields(before.wizard,current.wizard,'wizard'))changes.push({id:field.path,category:'settings',kind:'modified',label:`Updated ${field.path.replace(/^wizard\./,'').replaceAll('.',' / ')}`,path:field.path,before:field.before,after:field.after});
  for(const key of ['name','description','tags'] as const){const old=key==='tags'?[...before.tags].sort():before[key],next=key==='tags'?[...current.tags].sort():current[key];if(!equal(old,next))changes.push({id:`details:${key}`,category:'details',kind:'modified',label:`Updated Canvas ${key}`,path:key,before:old,after:next});}
  return changes;
 }catch{return[];}
}
