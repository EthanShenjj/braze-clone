import type { AudienceGroup, AudienceRule, MessageDraft } from './campaign-shared.ts';
import { createAudienceRule } from './audience-rule-schema.ts';

export type SegmentOptions = { appIds:string[]; analyticsTracking:boolean; groupOperator:'AND'|'OR' };
export type SegmentWorkspaceDraft = { name:string; description:string; tags:string[]; audienceGroups:AudienceGroup[]; segmentOptions:SegmentOptions; apiIdentifier:string };
export function newSegmentGroup(exclude=false):AudienceGroup {
  return {id:crypto.randomUUID(),name:exclude?'Exclusion group':'Filter group',operator:'OR',exclude,rules:[]};
}
export function segmentWorkspaceDraft(resource?:{name:string;description:string;data:Record<string,unknown>}):SegmentWorkspaceDraft {
  const data=resource?.data??{},options=(data.segmentOptions??{}) as Partial<SegmentOptions>;
  const groups=Array.isArray(data.audienceGroups)?structuredClone(data.audienceGroups) as AudienceGroup[]:Array.isArray(data.filters)&&data.filters.length?[{id:crypto.randomUUID(),name:'Filter group',operator:'AND' as const,exclude:false,rules:(data.filters as Array<Omit<AudienceRule,'id'>&{attribute?:string}>).map(filter=>({...filter,id:crypto.randomUUID(),field:filter.field==='attribute'&&filter.attribute?`attr:${filter.attribute}`:filter.field,operator:!filter.operator||String(filter.operator)==='is'?'equals':String(filter.operator)==='is_not'?'not_equals':filter.operator,value:['subscribed','reachable'].includes(filter.field)&&['1','0'].includes(String(filter.value))?String(filter.value)==='1'?'true':'false':String(filter.value??'')}))}]:[newSegmentGroup()];
  return {name:resource?.name??'',description:resource?.description??'',tags:Array.isArray(data.tags)?data.tags.filter((tag):tag is string=>typeof tag==='string'):[],audienceGroups:groups.length?groups:[newSegmentGroup()],segmentOptions:{appIds:Array.isArray(options.appIds)?options.appIds.filter(id=>typeof id==='string'):[],analyticsTracking:options.analyticsTracking===true,groupOperator:options.groupOperator==='OR'?'OR':'AND'},apiIdentifier:typeof data.apiIdentifier==='string'?data.apiIdentifier:''};
}
export function segmentWorkspaceSnapshot(draft:SegmentWorkspaceDraft,workspaceId='local'):MessageDraft {
  return {channel:'push',audience:'All Users',config:{workspaceId,audienceGroups:draft.audienceGroups.filter(group=>group.rules.length),segmentOptions:draft.segmentOptions}};
}
export function segmentWorkspaceData(draft:SegmentWorkspaceDraft,previous:Record<string,unknown>={},workspaceId='local'):Record<string,unknown> {
  return {...previous,workspaceId,tags:draft.tags,audienceGroups:draft.audienceGroups.filter(group=>group.rules.length),segmentOptions:draft.segmentOptions,filters:[],apiIdentifier:draft.apiIdentifier||crypto.randomUUID()};
}
export function duplicateSegmentRule(rule:AudienceRule):AudienceRule {return {...structuredClone(rule),id:crypto.randomUUID()};}
export function addSegmentRule(group:AudienceGroup,field:string):AudienceGroup {return {...group,rules:[...group.rules,createAudienceRule(field)]};}
