"use client";
import {X} from 'lucide-react';
import type {CanvasNode} from '@/lib/canvas-model';
import type {CanvasPath} from '@/lib/canvas-step-model';
import type {CanvasConversionFields} from '@/lib/canvas-conversion-model';
import styles from './canvas-step-editor.module.css';
import settings from './canvas-editor-experiment-settings.module.css';
type Config=NonNullable<CanvasNode['config']>;
type Props={config:Config;entryOnce:boolean;conversionEvents:CanvasConversionFields[];change:(patch:Partial<Config>)=>void};

function scalePaths(paths:CanvasPath[],total:number):CanvasPath[]{
  const sum=paths.reduce((sum,path)=>sum+Math.max(0,Number(path.weight)||0),0),target=Math.round(total*100);
  let remaining=target;
  return paths.map((path,index)=>{
    const weight=index===paths.length-1?remaining:Math.min(remaining,Math.round(target*(sum?Math.max(0,Number(path.weight)||0)/sum:1/paths.length)));
    remaining-=weight;
    return {...path,weight:weight/100};
  });
}
const delayWeight=(value:unknown)=>Number.isFinite(Number(value))?Math.min(100,Math.max(0,Number(value))):80;

/** Keep the synthetic holdout separate from connected experiment paths. */
export function normalizeCanvasExperimentConfig(config:Config,entryOnce:boolean):Config{
  const paths=Array.isArray(config.paths)?config.paths as CanvasPath[]:[],winning=config.winningPath===true;
  if(winning&&config.experimentWindowDays===undefined)config={...config,experimentWindowDays:7};
  const fallback=config.winningPathFallback==='mix'?'mix':'best';
  if(winning&&entryOnce&&paths.length<=3){
    // Braze's documented one-time example reserves 80%, with 10% in each of two paths.
    const weight=config.winningPathDelayWeight===undefined?80:delayWeight(config.winningPathDelayWeight);
    return {...config,winningPathFallback:fallback,winningPathDelayWeight:weight,paths:scalePaths(paths,100-weight)};
  }
  return {...config,...(winning?{winningPathFallback:fallback}:{}),...(config.winningPathDelayWeight!==undefined?{winningPathDelayWeight:undefined,paths:scalePaths(paths,100)}:{})};
}

export default function CanvasExperimentSettings({config,entryOnce,conversionEvents,change}:Props){
  const paths=(Array.isArray(config.paths)?config.paths:[]) as CanvasPath[],winning=config.winningPath===true;
  const hasDelay=winning&&entryOnce&&paths.length<=3,delay=hasDelay?delayWeight(config.winningPathDelayWeight??80):0,maxPaths=winning&&entryOnce?3:4;
  const patchPath=(id:string,patch:Partial<CanvasPath>)=>change({paths:paths.map(path=>path.id===id?{...path,...patch}:path)});
  const goals=[...conversionEvents.map(event=>({id:event.id,label:event.eventName?`${event.eventName} · ${event.type}`:event.type})),{id:'opens',label:'Opens'},{id:'clicks',label:'Clicks'}];
  const metric=String(config.winningPathMetric??''),goal=['opens','clicks'].includes(metric)?metric:String(config.winningPathConversionEventId??config.conversionEvent??conversionEvents[0]?.id??''),unit=config.experimentWindowUnit==='Hours'?'Hours':'Days',days=Number(config.experimentWindowDays??7);
  const goalConfig=(value:string)=>({conversionEvent:value,winningPathMetric:['opens','clicks'].includes(value)?value:'conversion',winningPathConversionEventId:['opens','clicks'].includes(value)?undefined:value});
  const toggle=(enabled:boolean)=>change(normalizeCanvasExperimentConfig({...config,winningPath:enabled,...(goal?goalConfig(goal):{}),winningPathFallback:config.winningPathFallback??'best'},entryOnce));
  return <>
    <h3>Path distribution</h3><p>Users in your audience are randomly distributed across these paths.</p>
    {paths.map(path=><div className={styles.pathRow} key={path.id}><label><input aria-label={`${path.name} percentage`} type="number" min={0} max={100} value={path.weight??0} onChange={event=>patchPath(path.id,{weight:Number(event.target.value)})}/>%</label><input aria-label={`${path.name} name`} value={path.name} onChange={event=>patchPath(path.id,{name:event.target.value})}/><button aria-label={`Remove ${path.name}`} disabled={paths.length<=2} onClick={()=>change({paths:scalePaths(paths.filter(row=>row.id!==path.id),100-delay)})}><X size={16}/></button></div>)}
    {hasDelay&&<div className={settings.delayGroup}><label><input aria-label="Delay Group percentage" type="number" min={0} max={100} value={delay} onChange={event=>{const weight=delayWeight(event.target.value);change({winningPathDelayWeight:weight,paths:scalePaths(paths,100-weight)});}}/>%</label><strong>Delay Group</strong><p>Hold these users until the experiment window ends, then continue them through the selected outcome.</p></div>}
    <div className={styles.actions}><button className={styles.link} disabled={paths.length>=maxPaths} onClick={()=>change({paths:[...paths,{id:crypto.randomUUID(),name:`Path ${paths.length+1}`,weight:0}]})}>Add a Path</button><button className={styles.link} disabled={paths.length>=maxPaths||paths.some(path=>path.id==='control')} onClick={()=>change({paths:[...paths,{id:'control',name:'Control Group',weight:0,exit:true}]})}>Add a Control Group</button><button className={styles.link} onClick={()=>change({paths:scalePaths(paths.map(path=>({...path,weight:1})),100-delay)})}>Distribute Paths Evenly</button></div>
    <p>Total: {Math.round((paths.reduce((sum,path)=>sum+Number(path.weight??0),0)+delay)*100)/100}%</p>
    <h3>Distribute subsequent users to Winning Path</h3>
    <label className={styles.check}><input aria-label="Winning Path" type="checkbox" checked={winning} disabled={!winning&&entryOnce&&paths.length>3} onChange={event=>toggle(event.target.checked)}/>Winning Path</label>
    {entryOnce&&paths.length>3&&<p className={styles.error} role="alert">One-time entry supports up to three experiment paths when Winning Path is enabled. Remove a path to reserve the Delay Group.</p>}
    {winning&&<section className={settings.winning} aria-label="Winning Path settings"><p>After the experiment window, use the chosen conversion metric to determine the best-performing path.</p>
      <div className={styles.row}><label className={styles.field}>Winning Path conversion<select className={settings.select} aria-label="Winning Path conversion event" value={goal} onChange={event=>change(goalConfig(event.target.value))}><option value="">Select a conversion event</option>{goal&&!goals.some(option=>option.id===goal)&&<option value={goal} disabled>Unavailable conversion event</option>}{goals.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label className={styles.field}>Experiment Window<input aria-label="Experiment window" type="number" min={0.01} step="any" value={unit==='Hours'?days*24:days} onChange={event=>change({experimentWindowDays:Number(event.target.value)/(unit==='Hours'?24:1)})}/></label>
      <label className={styles.field}>Window unit<select className={settings.select} aria-label="Experiment window unit" value={unit} onChange={event=>change({experimentWindowUnit:event.target.value})}><option>Hours</option><option>Days</option></select></label></div>
      <p className={styles.hint}>The window starts when the first user enters this experiment step.</p>
      {['opens','clicks'].includes(goal)&&<p className={settings.engagement}>Count engagement from the first Message step in each path. A path that starts with another step does not contribute opens or clicks.</p>}
      <fieldset className={settings.fallback}><legend>If there is no statistically significant winner</legend><label className={styles.radio}><input type="radio" name="winning-path-fallback" value="best" checked={config.winningPathFallback!=='mix'} onChange={()=>change({winningPathFallback:'best'})}/>Send future users to the best-performing path</label><label className={styles.radio}><input aria-label="Keep the path distribution" type="radio" name="winning-path-fallback" value="mix" checked={config.winningPathFallback==='mix'} onChange={()=>change({winningPathFallback:'mix'})}/>Keep the path distribution for future users</label></fieldset>
      <p className={styles.hint}>If paths have the same conversion rate, the path listed first wins.</p>
    </section>}
    <label className={styles.check}><input type="checkbox" checked={Boolean(config.randomizedPaths)} onChange={event=>change({randomizedPaths:event.target.checked})}/>Randomized Paths</label><p>Randomize path assignments each time a user re-enters this experiment. Otherwise, keep the user&apos;s previous assignment.</p>
  </>;
}
