'use client';
import {useEffect,useState} from 'react';
import {audienceCalculationSnapshot,campaignChannelNames,intelligentTimingRequirements,type DeliveryTimePreview} from '@/lib/campaign-audience-model';
import {multichannelChannels,type MessageDraft} from '@/lib/campaign-shared';
import {MessageField} from './message-controls';
import controls from './campaign-editors.module.css';
import styles from './campaign-forms.module.css';
export default function CampaignIntelligentPreview({draft}:{draft:MessageDraft}){
 const [channel,setChannel]=useState(draft.channel),[preview,setPreview]=useState<DeliveryTimePreview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
 const values=(draft.config?.channelValues??{}) as Record<string,unknown>,labels=Array.isArray(values.channels)?values.channels as string[]:[],available=['multichannel','operator'].includes(draft.channel)?labels.map(label=>(multichannelChannels as Record<string,string>)[label]).filter(Boolean):[draft.channel],selected=available.includes(channel)?channel:available[0]??draft.channel;
 const snapshot=audienceCalculationSnapshot(draft),delivery=(draft.config?.delivery??{}) as Record<string,unknown>,requirements=intelligentTimingRequirements(draft);
 const children=(draft.config?.multichannelMessages??{}) as Record<string,MessageDraft>,body={campaign:{...snapshot,config:{...snapshot.config,delivery,subscriptionGroupId:['multichannel','operator'].includes(draft.channel)?children[selected]?.config?.subscriptionGroupId:snapshot.config?.subscriptionGroupId}},channel:selected},signature=JSON.stringify(body);
 useEffect(()=>{
  const controller=new AbortController();setPreview(null);setError('');if(requirements.length)return()=>controller.abort();
  const timer=setTimeout(async()=>{setLoading(true);try{const response=await fetch('/api/campaigns/delivery-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:signature,signal:controller.signal}),payload=await response.json();if(!response.ok)throw new Error(payload.error??'Could not preview delivery times.');setPreview(payload);}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Could not preview delivery times.');}finally{if(!controller.signal.aborted)setLoading(false);}},200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[signature,refresh,requirements.join('|')]);
 const max=Math.max(1,...(preview?.bins.map(bin=>bin.users)??[]));
 return <section><h3>Preview of Delivery Times For</h3><div className={styles.narrow}><MessageField label="Delivery channel"><select value={selected} onChange={event=>setChannel(event.target.value)}>{available.map(value=><option value={value} key={value}>{campaignChannelNames[value]??value}</option>)}</select></MessageField></div>
 {requirements.length?<div className={styles.prerequisites}><p>The following are requirements to generate the preview:</p><ul>{requirements.map(requirement=><li key={requirement}>{requirement}</li>)}</ul></div>:loading?<p role="status">Calculating delivery times…</p>:preview?<>
 <figure aria-label={`Delivery times in UTC for ${preview.reachable} reachable users`}><figcaption>Delivery times (UTC)</figcaption>{preview.bins.length?<div className={styles.previewBars} role="img" aria-label={preview.bins.map(bin=>`${new Date(bin.at).toUTCString()}: ${bin.users} users`).join('; ')}>{preview.bins.map(bin=><div className={styles.previewBar} title={`${new Date(bin.at).toUTCString()}: ${bin.users} users`} key={bin.at} style={{height:`${Math.max(3,bin.users/max*140)}px`}}><span>{bin.users}</span></div>)}</div>:<p>No reachable users match this audience.</p>}<p className={styles.previewLegend}>{preview.withOptimalTime.toLocaleString()} users with an optimal time · {preview.usingFallback.toLocaleString()} using fallback</p></figure>
 <details><summary>View delivery time counts</summary><table className={styles.table}><thead><tr><th>Time (UTC)</th><th>Reachable users</th></tr></thead><tbody>{preview.bins.map(bin=><tr key={bin.at}><td>{new Date(bin.at).toUTCString()}</td><td>{bin.users.toLocaleString()}</td></tr>)}</tbody></table></details>
 <div className={styles.summary}><strong>Fallback: </strong>{preview.fallbackTime} in the user&apos;s local time zone{preview.fallbackSource==='default'&&<p>Not enough activity is available to determine a popular time. The default delivery time applies.</p>}</div><button className={controls.button} onClick={()=>setRefresh(value=>value+1)}>Refresh delivery preview</button>
 </>:null}{error&&<p role="alert" className={styles.validation}>{error}</p>}</section>;
}
