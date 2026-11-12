import { audienceConfigurationIssues } from './campaign-shared.ts';
import { segmentWorkspaceSnapshot, type SegmentWorkspaceDraft } from './segment-workspace-model.ts';
export function parseSegmentOperatorProposal(response:unknown):{message:string;draft:SegmentWorkspaceDraft} {
 const raw=response as {choices?:Array<{message?:{content?:unknown}}>};let value=raw?.choices?.[0]?.message?.content??response;
 if(typeof value==='string'){try{value=JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw new Error('Operator did not return valid segment JSON.');}}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Operator must return a segment proposal.');
 const proposal=value as Record<string,unknown>,segment=proposal.segment as Record<string,unknown>;
 if(!segment||typeof segment!=='object'||typeof segment.name!=='string'||!segment.name.trim()||segment.name.length>200||typeof segment.description!=='string'||segment.description.length>5000||!Array.isArray(segment.audienceGroups)||segment.audienceGroups.length>30)throw new Error('Operator must provide a segment name, description and valid filter groups.');
 const options=segment.segmentOptions as Record<string,unknown>|undefined;
 if(options&&(!Array.isArray(options.appIds)||options.appIds.some(id=>typeof id!=='string')||typeof options.analyticsTracking!=='boolean'||!['AND','OR'].includes(String(options.groupOperator))))throw new Error('Operator returned invalid targeting options.');
 const draft:SegmentWorkspaceDraft={name:segment.name.trim(),description:segment.description,tags:[],apiIdentifier:'',audienceGroups:segment.audienceGroups as SegmentWorkspaceDraft['audienceGroups'],segmentOptions:options as SegmentWorkspaceDraft['segmentOptions']??{appIds:[],analyticsTracking:false,groupOperator:'AND'}};
 const issues=audienceConfigurationIssues(segmentWorkspaceSnapshot(draft));if(issues.length)throw new Error(issues.join(' '));
 return {message:typeof proposal.message==='string'?proposal.message.slice(0,5000):'Review the suggested segment filters.',draft};
}
