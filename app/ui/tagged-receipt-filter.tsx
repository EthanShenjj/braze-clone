"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import type { AudienceRule } from "@/lib/campaign-shared";
import type { CampaignFormCapabilities } from "@/lib/campaign-audience-model";
import { findTagInteraction, taggedInteractions } from "@/lib/tag-interactions";
import AudienceDatePicker from "./audience-date-picker";
import { MessageField } from "./message-controls";
import controls from "./campaign-editors.module.css";
import styles from "./tagged-receipt-filter.module.css";
import TagSingleSelect from "./tag-single-select";

export default function TaggedReceiptFilter({rule,tags,change}:{rule:AudienceRule;tags:NonNullable<CampaignFormCapabilities["tags"]>;change:(patch:Partial<AudienceRule>)=>void}) {
  const [kind,event,...parts]=rule.field.split(":"),tagId=parts.join(":"),prefix=`${kind}:${event}:`;
  const title=kind==="receipt_tag_last"?"Last Received Message from Campaign or Canvas With Tag":event==="engaged"?"Clicked/Opened Campaign or Canvas With Tag":"Received Message from Campaign or Canvas with Tag";
  const missing=Boolean(tagId&&!tags.some(tag=>tag.id===tagId));
  const last=kind==="receipt_tag_last",engaged=event==="engaged",interaction=findTagInteraction(rule.tagInteraction),relative=["less_than_ago","more_than_ago"].includes(rule.operator);
  const [touched,setTouched]=useState<Record<string,boolean>>({});
  const touch=(name:string)=>setTouched(current=>({...current,[name]:true}));
  const required=(name:string,empty:boolean)=>touched[name]&&empty?<small className={styles.error}>Field required</small>:null;
  const tagSelect=<MessageField label={last?"Tag":title}><TagSingleSelect label={last?"Tag":title} invalid={Boolean(touched.tag&&(!tagId||missing))} value={tagId} blur={()=>touch("tag")} change={value=>change({field:`${prefix}${value}`})} searchable options={[...(missing?[{id:tagId,label:"Unavailable tag"}]:[]),...tags.map(tag=>({id:tag.id,label:tag.path??tag.name}))]}/>{required("tag",!tagId)}{missing&&<small className={styles.error}>The selected tag is no longer available.</small>}</MessageField>;
  return <section className={styles.editor} aria-label={title}>
    <h4>{title}</h4>
    {last?<>
      {tagSelect}
      {tagId&&<>
        <MessageField label="Comparison"><TagSingleSelect label="Comparison" value={relative?rule.operator:rule.operator==="less_than"?"less_than":"greater_than"} change={value=>{const operator=value as AudienceRule["operator"];setTouched({});change({operator,value:"",timeUnit:undefined});}} options={[{id:"greater_than",label:"after"},{id:"less_than_ago",label:"less than"},{id:"less_than",label:"before"},{id:"more_than_ago",label:"more than"}]}/></MessageField>
        {relative?<div className={controls.grid}><MessageField label="Time period"><input aria-label="Time period" aria-invalid={touched.period&&!rule.value.trim()} type="number" min="0" value={rule.value} onBlur={()=>touch("period")} onChange={event=>change({value:event.target.value})}/>{required("period",!rule.value.trim())}</MessageField><MessageField label="Time unit"><TagSingleSelect label="Time unit" invalid={Boolean(touched.unit&&!rule.timeUnit)} value={rule.timeUnit??""} blur={()=>touch("unit")} change={value=>change({timeUnit:value as AudienceRule["timeUnit"]})} options={["hours","days","weeks"].map(unit=>({id:unit,label:unit}))}/>{required("unit",!rule.timeUnit)}</MessageField></div>:<MessageField label="Date"><div onBlur={()=>touch("date")}><AudienceDatePicker value={rule.value} change={value=>change({value})} label="Date"/></div>{required("date",!rule.value.trim())}</MessageField>}
      </>}
    </>:engaged?<>
      <MessageField label="Interaction"><TagSingleSelect label="Interaction" placeholder="Select interaction" invalid={Boolean(touched.interaction&&!interaction)} value={rule.tagInteraction??""} blur={()=>touch("interaction")} change={value=>change({tagInteraction:value,operator:"greater_than",value:"0"})} searchable options={taggedInteractions.map(interaction=>({id:interaction.id,label:interaction.label}))}/>{required("interaction",!interaction)}</MessageField>
      {interaction&&<div className={controls.grid}><MessageField label="Performed interaction"><TagSingleSelect label="Performed interaction" value={rule.operator==="equals"&&rule.value==="0"?"false":"true"} change={value=>change({operator:value==="false"?"equals":"greater_than",value:"0"})} options={[{id:"true",label:"true"},{id:"false",label:"false"}]}/></MessageField>{tagSelect}</div>}
    </>:<div className={controls.grid}>
      <MessageField label="Comparison"><TagSingleSelect label="Comparison" value={rule.operator==="equals"&&rule.value==="0"?"has not":"has"} change={value=>change({operator:value==="has not"?"equals":"greater_than",value:"0"})} options={[{id:"has",label:"has"},{id:"has not",label:"has not"}]}/></MessageField>
      {tagSelect}
    </div>}
    <p className={styles.info}><Info size={16} aria-hidden/><span>Some tags may include messaging with expired interaction data. <a href="https://www.braze.com/docs/en/messaging_interaction_data/#retargeting-by-tag" target="_blank" rel="noreferrer" aria-label="Learn about retargeting by tag">↗</a></span></p>
  </section>;
}
