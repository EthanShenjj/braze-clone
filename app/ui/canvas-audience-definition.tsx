"use client";
import {X} from 'lucide-react';
import type {AudienceGroup} from '@/lib/campaign-shared';
import type {CampaignFormCapabilities} from '@/lib/campaign-audience-model';
import {createAudienceRule} from '@/lib/audience-rule-schema';
import {CanvasSegmentPicker} from './canvas-segment-picker';
import {FilterCatalog} from './campaign-audience';
import AudienceRuleEditor from './audience-rule-editor';
import styles from './canvas-step-editor.module.css';
export default function CanvasAudienceDefinition({segmentIds,groups,change,capabilities,workspaceId,segmentsLabel="Additional Segments"}:{segmentIds:string[];groups:AudienceGroup[];change:(patch:{segmentIds?:string[];filterGroups?:AudienceGroup[]})=>void;capabilities:CampaignFormCapabilities|null;workspaceId:string;segmentsLabel?:string}){
 const all=groups.length?groups:[{id:'default',operator:'OR' as const,exclude:false,rules:[]}];
 const patch=(id:string,next:Partial<AudienceGroup>)=>change({filterGroups:all.map(group=>group.id===id?{...group,...next}:group)});
 return <><CanvasSegmentPicker label={segmentsLabel} segments={capabilities?.segments??[]} selected={segmentIds} onChange={segmentIds=>change({segmentIds})}/><h3>Additional Filters</h3>{all.map(group=><section className={styles.group} aria-label={group.exclude?'Exclusion group':'Filter group'} key={group.id}><div className={styles.groupHead}><strong>{group.exclude?'Exclusion group':'Filter group'}</strong><select aria-label="Filter group operator" value={group.operator} onChange={event=>patch(group.id,{operator:event.target.value as 'AND'|'OR'})}><option>OR</option><option>AND</option></select><button aria-label="Remove filter group" className={styles.link} disabled={!groups.length} onClick={()=>change({filterGroups:groups.filter(row=>row.id!==group.id)})}><X size={16}/></button></div>{group.rules.map(rule=><div className={styles.rule} key={rule.id}><AudienceRuleEditor rule={rule} capabilities={capabilities} workspaceId={workspaceId} change={next=>patch(group.id,{rules:group.rules.map(item=>item.id===rule.id?{...item,...next}:item)})}/><button className={styles.link} onClick={()=>patch(group.id,{rules:group.rules.filter(item=>item.id!==rule.id)})}>Remove filter</button></div>)}<FilterCatalog capabilities={capabilities} segments={capabilities?.segments?.map(row=>row.name)??[]} events={capabilities?.events??[]} attributes={capabilities?.attributes??[]} select={field=>patch(group.id,{rules:[...group.rules,createAudienceRule(field)]})}/></section>)}<div className={styles.actions}>{[false,true].map(exclude=><button className={styles.link} key={String(exclude)} onClick={()=>change({filterGroups:[...all,{id:crypto.randomUUID(),operator:'OR',exclude,rules:[]}]})}>＋ Add {exclude?'exclusion':'filter'} group</button>)}</div></>;
}

