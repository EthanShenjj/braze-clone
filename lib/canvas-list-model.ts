import type { CanvasRecord } from './braze-store';

export const canvasStatuses = ['All Statuses', 'Draft', 'Active', 'Stopped', 'Archived', 'Idle'] as const;
export type CanvasListFilters = {
 experience:string; createdBy:string; lastEditedBy:string; dateField:string; from:string; to:string;
 targetSegment:string; expiredInteractions:boolean; optimized:boolean; complexTargeting:boolean;
};
export const emptyCanvasListFilters:CanvasListFilters={experience:'',createdBy:'',lastEditedBy:'',dateField:'',from:'',to:'',targetSegment:'',expiredInteractions:false,optimized:false,complexTargeting:false};
export function canvasListMatches(item:CanvasRecord,filters:CanvasListFilters){
 if(filters.experience&&item.experience!==filters.experience||filters.createdBy&&item.createdBy!==filters.createdBy||filters.lastEditedBy&&item.lastEditedBy!==filters.lastEditedBy)return false;
 if(filters.targetSegment&&!item.wizard.audience.segmentIds.includes(filters.targetSegment)&&item.targetSegment!==filters.targetSegment)return false;
 if(filters.expiredInteractions&&!item.expiredInteractionData||filters.optimized&&!item.optimizedWithAI||filters.complexTargeting&&!item.exceedsTargetingComplexity)return false;
 const date=(filters.dateField==='createdAt'?item.createdAt:item.updatedAt).slice(0,10);
 return !(filters.dateField&&(filters.from&&date<filters.from||filters.to&&date>filters.to));
}
export function canvasRelativeEdited(value:string,at=new Date(),locale='en'){
 const delta=Math.max(0,at.getTime()-new Date(value).getTime()),minutes=Math.floor(delta/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 if(!Number.isFinite(delta))return '—';
 if(locale==='en'&&days<7)return minutes<1?'Just now':minutes<60?`${minutes} minute${minutes===1?'':'s'} ago`:hours<24?`${hours} hour${hours===1?'':'s'} ago`:`${days} day${days===1?'':'s'} ago`;
 return new Date(value).toLocaleDateString(locale==='zh-CN'?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric'});
}
