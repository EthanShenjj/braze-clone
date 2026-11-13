"use client";
import {useEffect,useState} from 'react';
import type {CanvasStepTrigger} from '@/lib/canvas-step-model';
import type {CampaignFormCapabilities} from '@/lib/campaign-audience-model';
import {canvasRecommendedEvents,canvasTriggerIssues} from '@/lib/canvas-action-model';
import CanvasActionTriggerFields from './canvas-action-trigger-fields';
import styles from './canvas-entry-trigger-details.module.css';
type Props={workspaceId:string;types:string[];details:CanvasStepTrigger[];scope?:'entry'|'exit';onChange:(details:CanvasStepTrigger[])=>void};

function selectedDetails(types:string[],details:CanvasStepTrigger[]):CanvasStepTrigger[]{
  return types.map(type=>details.find(trigger=>trigger.type===type)??{
    id:`entry_trigger_${encodeURIComponent(type)}`,type,
    ...(canvasRecommendedEvents[type]?{eventName:canvasRecommendedEvents[type]}:{}),
    ...(type==='Update Subscription Group Status'?{subscriptionType:'email'}:{}),
  });
}

export function CanvasEntryTriggerDetailRows({types,details,onChange,capabilities,scope='entry'}:Omit<Props,'workspaceId'>&{capabilities:CampaignFormCapabilities|null}){
  const selected=selectedDetails(types,details);
  if(!selected.length)return null;
  return <div className={styles.details}>{selected.map(trigger=><section className={styles.trigger} aria-label={`${trigger.type} ${scope} trigger`} key={trigger.id}>
    <h4>{trigger.type}</h4>
    <CanvasActionTriggerFields trigger={trigger} capabilities={capabilities} graph={{nodes:[],edges:[]}} nodeId="entry" canvasId="" change={patch=>onChange(selected.map(row=>row.id===trigger.id?{...row,...patch,id:row.id,type:row.type}:row))}/>
    {canvasTriggerIssues(trigger).map(issue=><p role="alert" className={styles.error} key={issue}>{issue}</p>)}
  </section>)}</div>;
}

export default function CanvasEntryTriggerDetails({workspaceId,types,details,onChange,scope='entry'}:Props){
  const [capabilities,setCapabilities]=useState<CampaignFormCapabilities|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setCapabilities(null);setError('');
    fetch(`/api/campaigns/form-capabilities?workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error('Could not load trigger options for this workspace.');
      return response.json();
    }).then(value=>{if(!controller.signal.aborted)setCapabilities(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Could not load trigger options.');});
    return()=>controller.abort();
  },[workspaceId]);
  if(!types.length)return null;
  return <>{error&&<p role="alert" className={styles.error}>{error}</p>}<CanvasEntryTriggerDetailRows types={types} details={details} onChange={onChange} capabilities={capabilities} scope={scope}/></>;
}
