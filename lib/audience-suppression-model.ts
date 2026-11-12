import {audienceConfigurationIssues,type AudienceGroup} from './campaign-shared.ts';

export type AudienceSuppressionResource={id:string;name:string;status:string;data:Record<string,unknown>};
export type SuppressionContext={workspaceId?:string;channel:string;tags?:unknown};

/** Validate saved rules too: an inactive draft may be empty, an active list may not. */
export function audienceSuppressionIssues(status:string,data:Record<string,unknown>):string[]{
 const issues:string[]=[];
 if(!['Active','Inactive','Archived'].includes(status))issues.push('Choose a valid suppression list status.');
 const tags=data.exceptionTags;
 if(tags!==undefined&&(!Array.isArray(tags)||tags.some(tag=>typeof tag!=='string'||!tag.trim())))issues.push('Choose valid exception tags.');
 const groups=data.audienceGroups;
 if(groups!==undefined){
  if(!Array.isArray(groups)||groups.some(group=>!group||typeof group!=='object'||typeof group.exclude!=='boolean'||!Array.isArray(group.rules)))issues.push('Choose valid suppression filter groups.');
  else issues.push(...audienceConfigurationIssues({channel:'push',config:{audienceGroups:groups}}));
 }
 if(status==='Active'&&(!Array.isArray(groups)||!groups.some(group=>Array.isArray(group?.rules)&&group.rules.length)))issues.push('Add at least one filter before activating this suppression list.');
 return [...new Set(issues)];
}

/** The caller uses the same scoped audience evaluator as Campaign and Canvas. */
export function matchingAudienceSuppressions<T extends AudienceSuppressionResource>(rows:T[],context:SuppressionContext,matches:(groups:AudienceGroup[],data:Record<string,unknown>)=>boolean):T[]{
 if(context.channel==='feature')return [];
 const tags=new Set(Array.isArray(context.tags)?context.tags.filter((tag):tag is string=>typeof tag==='string'):[]);
 return rows.filter(row=>{
  if(row.status!=='Active'||String(row.data.workspaceId??'local')!==(context.workspaceId??'local'))return false;
  if(Array.isArray(row.data.exceptionTags)&&row.data.exceptionTags.some(tag=>tags.has(String(tag))))return false;
  if(audienceSuppressionIssues(row.status,row.data).length)return false;
  return matches(row.data.audienceGroups as AudienceGroup[],row.data);
 });
}
