"use client";
import {useState} from 'react';
import {ChevronDown,Plus} from 'lucide-react';
import type {SmsValues} from '@/lib/channel-message-model';
import type {SmsSnapshot} from '@/lib/sms-composer-model';
import type {TestRequest} from './message-controls';
import SmsMessageComposer from './sms-message-composer';
import styles from './sms-editor.module.css';

type SmsCampaign={id:string;name:string;body?:string;config?:Record<string,unknown>};
type Variant={id:string;name:string;body:string;values?:SmsValues};
export default function SmsCampaignComposer({draft,update}:{draft:SmsCampaign;update:(patch:Partial<SmsCampaign>)=>void;openTest?:(request?:TestRequest)=>void}){
 const [selected,setSelected]=useState(0),[menu,setMenu]=useState(false),[renaming,setRenaming]=useState(false),[name,setName]=useState('');
 const base=(draft.config?.channelValues??{}) as SmsValues;
 const variants=Array.isArray(draft.config?.smsVariants)&&draft.config.smsVariants.length?draft.config.smsVariants as Variant[]:[{id:'sms_variant_1',name:draft.name||'Variant 1',body:draft.body??'',values:base}];
 const index=Math.min(selected,variants.length-1),current=variants[index],values={appendStop:false,...base,...current.values};
 const persist=(next:Variant[],subscriptionGroupId=String(draft.config?.subscriptionGroupId??''))=>update({body:next[0].body,config:{...draft.config,smsVariants:next,subscriptionGroupId,channelValues:{...base,...next[0].values}}});
 const change=(snapshot:SmsSnapshot)=>persist(variants.map((variant,i)=>i===index?{...variant,body:snapshot.message,values:snapshot.values}:variant),snapshot.subscriptionGroupId);
 const add=(copy=false)=>{if(variants.length>=8)return;const variant={id:crypto.randomUUID(),name:copy?`${current.name} copy`:`Variant ${variants.length+1}`,body:copy?current.body:'',values:structuredClone(values)};persist([...variants,variant]);setSelected(variants.length);setMenu(false);};
 return <section className={`${styles.card} ${styles.fidelity}`} aria-label="SMS/MMS/RCS Composer"><h2>SMS/MMS/RCS Composer</h2><div className={styles.variantSection}><h3>Variants</h3><div className={styles.variantTabs} role="tablist" aria-label="SMS variants">{variants.map((variant,i)=><button key={variant.id} role="tab" aria-selected={index===i} className={index===i?styles.selectedVariant:''} onClick={()=>{if(index===i)setMenu(!menu);else{setSelected(i);setMenu(false);}}}>{variant.name}{index===i&&<ChevronDown size={13}/>}</button>)}<button className={styles.addVariant} aria-label="Add variant" disabled={variants.length>=8} onClick={()=>add()}><Plus size={19}/></button></div>{menu&&<div className={styles.variantMenu} role="menu"><button role="menuitem" onClick={()=>{setName(current.name);setRenaming(true);setMenu(false);}}>Rename variant</button><button role="menuitem" disabled={variants.length>=8} onClick={()=>add(true)}>Duplicate variant</button><button role="menuitem" disabled={variants.length===1} onClick={()=>{persist(variants.filter((_,i)=>i!==index));setSelected(Math.max(0,index-1));setMenu(false);}}>Delete variant</button></div>}{renaming&&<div className={styles.rename}><label>Variant name<input value={name} onChange={event=>setName(event.target.value)}/></label><button disabled={!name.trim()} onClick={()=>{persist(variants.map((variant,i)=>i===index?{...variant,name:name.trim()}:variant));setRenaming(false);}}>Save</button><button onClick={()=>setRenaming(false)}>Cancel</button></div>}</div><SmsMessageComposer key={current.id} kind="campaign" ownerId={draft.id} workspaceId={String(draft.config?.workspaceId??'local')} snapshot={{message:current.body,subscriptionGroupId:String(draft.config?.subscriptionGroupId??''),values,variantId:current.id,variantName:current.name}} onChange={change}/></section>;
}
