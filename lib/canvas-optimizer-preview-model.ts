import type {CanvasNode} from './canvas-model.ts';
import type {MessageDraft} from './campaign-shared.ts';
import {canvasOptimizerComponents,canvasOptimizerIssues} from './canvas-builder-model.ts';
import {canvasAssignedVariant} from './canvas-runtime-model.ts';

function components(node:CanvasNode){
 const rows=canvasOptimizerComponents(node.config??{}),issues=canvasOptimizerIssues(node.config??{});
 if(node.kind!=='optimizer'||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some(row=>!row.id||new Set(row.variants.map(variant=>variant.id)).size!==row.variants.length||row.variants.some(variant=>!variant.id)))issues.push('Use unique authored component and variant IDs.');
 if(issues.length)throw Error(issues.join(' '));
 return rows;
}
export function canvasOptimizerPreviewSelection(node:CanvasNode,canvasId:string,userId:string):Record<string,string>{
 return Object.fromEntries(components(node).map(component=>{
  const variant=canvasAssignedVariant(`${canvasId}:${node.id}:${component.id}`,userId,component.variants.filter(variant=>variant.value.trim()).map(variant=>({id:variant.id,name:variant.id,weight:1})));
  if(!variant)throw Error('Choose an authored variant for every optimizer component.');
  return [component.id,variant.id];
 }));
}
export function canvasOptimizerPreviewValues(node:CanvasNode,selections:Record<string,string>):Record<string,string>{
 const rows=components(node);
 if(!selections||typeof selections!=='object'||Array.isArray(selections)||Object.keys(selections).length!==rows.length)throw Error('Choose one authored variant for every optimizer component.');
 return Object.fromEntries(rows.map(component=>{
  const variant=component.variants.find(variant=>variant.id===selections[component.id]&&variant.value.trim());
  if(!variant)throw Error('The selected optimizer component variant is no longer available.');
  return [component.type,variant.value];
 }));
}
/** Rebuild only from stored authored values and selection IDs, retaining raw Liquid for one later compilation. */
export function canvasOptimizerPreviewDraft(node:CanvasNode,selections:Record<string,string>):MessageDraft{
 const values=canvasOptimizerPreviewValues(node,selections);
 const replace=(source:string)=>source.replace(/\{%\s*message_component\s+(['"])(.*?)\1\s*%\}/g,(_match,_quote,type)=>{
  if(!Object.hasOwn(values,type))throw Error(`Add an authored ${type} component before previewing this message.`);
  return values[type];
 });
 const walk=(value:unknown,depth=0):unknown=>{
  if(depth>20)throw Error('Message configuration exceeds the supported nesting depth.');
  if(typeof value==='string')return replace(value);
  if(Array.isArray(value))return value.map(item=>walk(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='optimizerComponents'?structuredClone(item):walk(item,depth+1)]));
  return value;
 };
 const config=walk(node.config??{}) as Record<string,unknown>;
 return {channel:String(config.channel??''),subject:String(config.subject??''),body:String(config.message??''),config};
}
