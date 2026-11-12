"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { campaignInteractions, findCampaignInteraction } from "@/lib/tag-interactions";
import type { AudienceRule } from "@/lib/campaign-shared";
import type { CampaignFormCapabilities } from "@/lib/campaign-audience-model";
import { audienceKeywordCategories, audienceReceivedField, audienceMembershipField, audienceMultiValues, audienceRuleDefinition, type AudienceOption } from "@/lib/audience-rule-schema";
import { MessageField } from "./message-controls";
import TagSingleSelect from "./tag-single-select";
import TaggedReceiptFilter from "./tagged-receipt-filter";
import AudienceDatePicker from "./audience-date-picker";
import styles from "./audience-rule-editor.module.css";

type Resource={id:string;name:string};
export type AudienceRuleEditorProps={rule:AudienceRule;capabilities:CampaignFormCapabilities|null;change:(patch:Partial<AudienceRule>)=>void;workspaceId?:string};

function ChoiceField({label,value,options,change,empty,optional=false,placeholder="Select...",anyLabel="Any"}:{label:string;value:string;options:AudienceOption[];change:(value:string)=>void;empty?:string;optional?:boolean;placeholder?:string;anyLabel?:string|null}){
 const [touched,setTouched]=useState(false),missing=Boolean(value&&!options.some(option=>option.id===value));
 return <MessageField label={label}><TagSingleSelect label={label} searchable value={value} options={[...(optional&&anyLabel?[{id:'',label:anyLabel}]:[]),...(missing?[{id:value,label:`Unavailable selection (${value})`}]:[]),...options]} change={change} placeholder={placeholder} blur={()=>setTouched(true)} invalid={missing||touched&&!value&&!optional}/>{optional&&anyLabel===null&&value&&<button type="button" className={styles.clear} aria-label={`Clear ${label}`} onClick={()=>change('')}>Clear</button>}{missing&&<small className={styles.error}>The selected item is no longer available.</small>}{!options.length&&<small className={styles.hint}>{empty??'No options are available in this workspace.'}</small>}{touched&&!value&&!optional&&<small className={styles.error}>Field required</small>}</MessageField>;
}
function MultiSelect({label,values,options,change}:{label:string;values:string[];options:AudienceOption[];change:(next:string[])=>void}){
 const id=useId(),root=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0),[above,setAbove]=useState(false);
 const visible=options.filter(option=>option.label.toLowerCase().includes(query.toLowerCase())),index=Math.min(active,Math.max(0,visible.length-1));
 const toggle=(value:string)=>change(values.includes(value)?values.filter(item=>item!==value):[...values,value]);
 const show=()=>{const rect=root.current?.getBoundingClientRect();setAbove(Boolean(rect&&window.innerHeight-rect.bottom<280&&rect.top>280));setOpen(true);};
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery('');}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 useEffect(()=>{if(open)root.current?.querySelector('[data-multi-active="true"]')?.scrollIntoView({block:'nearest'});},[active,open]);
 return <div ref={root} className={styles.multiPicker} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}><div className={styles.multiInput}><input className={styles.valueInput} role="combobox" aria-label={`Add ${label}`} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open&&visible.length?`${id}-${index}`:undefined} placeholder="Select..." value={query} onFocus={show} onChange={event=>{setQuery(event.target.value);setActive(0);show();}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);setQuery('');}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open)show();else setActive(current=>visible.length?(current+(event.key==='ArrowDown'?1:-1)+visible.length)%visible.length:0);}
  else if(event.key==='Enter'){event.preventDefault();if(!open)show();else if(visible[index])toggle(visible[index].id);}
  else if(event.key==='Home'&&open){event.preventDefault();setActive(0);}
  else if(event.key==='End'&&open){event.preventDefault();setActive(Math.max(0,visible.length-1));}
  else if(event.key==='Tab')setOpen(false);
 }}/><button type="button" aria-label={`Toggle ${label}`} onMouseDown={event=>event.preventDefault()} onClick={()=>open?setOpen(false):show()}>⌄</button></div>{open&&<div id={id} role="listbox" aria-label={`${label} options`} aria-multiselectable className={`${styles.multiOptions} ${above?styles.above:''}`}>{visible.map((option,position)=><button key={option.id} id={`${id}-${position}`} type="button" role="option" aria-selected={values.includes(option.id)} data-multi-active={index===position} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>setActive(position)} onClick={()=>toggle(option.id)}><span className={styles.check} aria-hidden>{values.includes(option.id)?'✓':''}</span>{option.label}</button>)}{!visible.length&&<p>No options found</p>}</div>}</div>;
}
function MultiValue({label,value,options,change}:{label:string;value:string;options?:AudienceOption[];change:(value:string)=>void}){
 const [entry,setEntry]=useState(''),values=audienceMultiValues(value);
 const add=(next:string)=>{if(next.trim()&&!values.includes(next.trim()))change(JSON.stringify([...values,next.trim()]));setEntry('');};
 return <div className={styles.multi}><span className={styles.fieldLabel}>{label}</span><div className={styles.chips}>{values.map(item=><button key={item} type="button" aria-label={`Remove ${options?.find(option=>option.id===item)?.label??item}`} onClick={()=>change(JSON.stringify(values.filter(v=>v!==item)))}>{options?.find(option=>option.id===item)?.label??item}<span aria-hidden> ×</span></button>)}</div>{options?<MultiSelect label={label} values={values} options={options} change={next=>change(JSON.stringify(next))}/>:<div className={styles.addValue}><input className={styles.valueInput} aria-label={`Add ${label}`} value={entry} placeholder="Enter a value" onChange={event=>setEntry(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'||event.key===','){event.preventDefault();add(entry);}}}/><button type="button" onClick={()=>add(entry)} disabled={!entry.trim()}>Add</button></div>}</div>;
}

/** Shared by Campaign and Canvas; resource identity is persisted separately from comparison values. */
export default function AudienceRuleEditor({rule,capabilities,change}:AudienceRuleEditorProps){
 const attribute=rule.field.startsWith('attr:')?rule.field.slice(5):'',definition=audienceRuleDefinition(rule.field,capabilities?.attributeTypes?.[attribute]);
 const params=rule.params??{},parts=rule.field.split(':'),prefix=parts[0],membership=audienceMembershipField(rule.field),received=audienceReceivedField(rule.field);
 const setParam=(key:string,value:string|number|boolean,reset:Record<string,string|number|boolean>={})=>change({params:{...params,...reset,[key]:value}});
 const resources=(rows:Resource[]|undefined)=>(rows??[]).map(row=>({id:row.id,label:row.name}));
 const resource=(label:string,value:string,rows:Resource[]|undefined,onChange:(value:string)=>void,optional=false,presentation?:{placeholder?:string;anyLabel?:string|null})=><ChoiceField key={label} label={label} value={value} options={resources(rows)} change={onChange} optional={optional} {...presentation} empty={`No ${label.toLowerCase()} options are available in this workspace.`}/>;
 const fields:ReactNode[]=[];
 if(prefix==='membership'){
  const kind=parts[1],key=kind==='segment'?'segmentId':kind==='extension'?'extensionId':'importId',label=kind==='segment'?'Segment':kind==='extension'?'Segment Extension':'CSV import';
  fields.push(resource(label,String(params[key]??''),kind==='segment'?capabilities?.segments:kind==='extension'?capabilities?.extensions:capabilities?.csvImports,value=>setParam(key,value)));
 }
 if(prefix==='segment')fields.push(resource('Segment',parts.slice(1).join(':'),capabilities?.segments,value=>change({field:`segment:${value}`})));
 if(['receipt_count','receipt_last','receipt_variant','feature_variant'].includes(prefix)){
  const campaignId=['receipt_variant','feature_variant'].includes(prefix)?parts[1]:parts.slice(2).join(':'),campaign=capabilities?.campaigns.find(item=>item.id===campaignId),selectedInteraction=rule.field.startsWith('receipt_count:engaged:')?findCampaignInteraction(rule.tagInteraction):undefined,matchingCampaigns=selectedInteraction?capabilities?.campaigns.filter(item=>item.channel===selectedInteraction.channel):capabilities?.campaigns;
  fields.push(resource(prefix==='feature_variant'?'Feature Flag Experiment':'Campaign',campaignId,prefix==='feature_variant'?capabilities?.campaigns.filter(item=>item.channel==='feature'):matchingCampaigns,value=>change({field:['receipt_variant','feature_variant'].includes(prefix)?`${prefix}:${value}:`:`${prefix}:${parts[1]}:${value}`,params:{...params,buttonId:'',pageId:''}}),rule.field.startsWith('receipt_count:engaged:'),rule.field.startsWith('receipt_count:engaged:')?{placeholder:'Search for Campaign',anyLabel:null}:undefined));
  if(['receipt_variant','feature_variant'].includes(prefix))fields.push(resource('Campaign Variant',parts.slice(2).join(':'),campaign?.variants,value=>change({field:`${prefix}:${campaignId}:${value}`})));
 }
 if(['receipt_alias','receipt_alias_any'].includes(prefix)){
  if(prefix==='receipt_alias')fields.push(resource('Campaign',String(params.campaignId??''),capabilities?.campaigns,value=>setParam('campaignId',value)));
  fields.push(<ChoiceField key="alias" label="Link Alias" value={parts.slice(1).join(':')} options={(capabilities?.linkAliases??[]).map(alias=>({id:alias.name,label:alias.name}))} change={value=>change({field:`${prefix}:${value}`})}/>);
 }
 if(['session_app_count','session_app_first','session_app_last'].includes(prefix))fields.push(resource('App',parts.slice(1).join(':'),capabilities?.apps,value=>change({field:`${prefix}:${value}`})));
 if(prefix==='session_recent')fields.push(<MessageField key="window" label="In the last (days)"><input className={styles.valueInput} aria-label="In the last (days)" type="number" min={1} max={30} value={parts[1]} onChange={event=>change({field:`session_recent:${event.target.value}`})}/></MessageField>);
 if(prefix==='subscription_group')fields.push(resource('Subscription Group',parts.slice(1).join(':'),capabilities?.subscriptionGroups,value=>change({field:`subscription_group:${value}`})));
 if(prefix==='feature_enabled')fields.push(resource('Feature Flag',parts.slice(1).join(':'),capabilities?.featureFlags,value=>change({field:`feature_enabled:${value}`})));
 if(rule.field==='push_app_enabled'||rule.field==='attr:app_id'||rule.field==='attr:live_activity_push_to_start')fields.push(resource('App',String(params.appId??(rule.field==='attr:app_id'?rule.value:'')),capabilities?.apps,value=>rule.field==='attr:app_id'?change({value}):setParam('appId',value)));
 if(rule.field==='inbound_sms_keyword_last'){
  fields.push(resource('Subscription group',String(params.subscriptionGroupId??''),capabilities?.smsSubscriptionGroups,value=>setParam('subscriptionGroupId',value,{category:''})));
  if(params.subscriptionGroupId)fields.push(resource('Keyword category',String(params.category??''),audienceKeywordCategories.map(category=>({id:category.id,name:category.label})),value=>setParam('category',value)));
 }
 const canvasCondition=['canvas_receipt_count','canvas_receipt_last','canvas_alias','canvas_entered'].includes(prefix)||rule.field==='survey_submitted:canvas';
 if(canvasCondition){
  const canvasId=String(params[rule.field==='survey_submitted:canvas'?'resourceId':'canvasId']??''),canvas=capabilities?.canvases?.find(item=>item.id===canvasId);
  fields.push(resource('Canvas',canvasId,capabilities?.canvases,value=>setParam(rule.field==='survey_submitted:canvas'?'resourceId':'canvasId',value,{stepId:'',variantId:'',buttonId:'',pageId:''})));
  if(prefix!=='canvas_entered'&&!(prefix==='canvas_receipt_count'&&parts[1]==='control'))fields.push(resource('Canvas Step',String(params.stepId??''),canvas?.steps,value=>setParam('stepId',value,{buttonId:'',pageId:''})));
  if(prefix==='canvas_entered'||prefix==='canvas_receipt_count')fields.push(resource('Canvas Variation',String(params.variantId??''),canvas?.variants,value=>setParam('variantId',value),true));
  if(prefix==='canvas_alias')fields.push(<ChoiceField key="canvas-alias" label="Link Alias" value={String(params.alias??'')} options={(capabilities?.linkAliases??[]).map(alias=>({id:alias.name,label:alias.name}))} change={value=>setParam('alias',value)}/>);
 }
 if(rule.field==='landing_form'||rule.field==='survey_submitted:landing')fields.push(resource('Landing Page',String(params.resourceId??''),capabilities?.landingPages,value=>setParam('resourceId',value)));
 if(rule.field==='survey_submitted:campaign')fields.push(resource('Campaign',String(params.resourceId??''),capabilities?.campaigns,value=>setParam('resourceId',value)));
 if(prefix==='survey_submitted')fields.push(resource('Survey',String(params.surveyId??''),capabilities?.surveys,value=>setParam('surveyId',value),true));
 if(prefix==='cohort')fields.push(resource('Cohort',String(params.cohortId??''),capabilities?.cohorts?.filter(cohort=>cohort.provider.toLowerCase().replaceAll(' ','_')===parts[1]),value=>setParam('cohortId',value)));
 if(rule.field==='message_open_likelihood')fields.push(<ChoiceField key="channel" label="Channel" value={String(params.channel??'')} options={[{id:'email',label:'Email'},{id:'push',label:'Push'}]} change={value=>setParam('channel',value)}/>);
 if(rule.field.startsWith('receipt_tag_count:')||rule.field.startsWith('receipt_tag_last:'))return <TaggedReceiptFilter rule={rule} tags={capabilities?.tags??[]} change={change}/>;
 if(rule.field.startsWith('receipt_count:engaged:')||rule.field==='canvas_receipt_count:engaged'){
  const interaction=findCampaignInteraction(rule.tagInteraction);
  if(interaction?.selector){
   const campaigns=capabilities?.campaigns.filter(campaign=>campaign.channel===interaction.channel),campaignId=parts.slice(2).join(':'),scoped=campaignId?campaigns?.filter(campaign=>campaign.id===campaignId):campaigns;
   const button=interaction.selector==='button',canvas=capabilities?.canvases?.find(canvas=>canvas.id===params.canvasId),canvasSource=params.stepId?canvas?.steps.find(step=>step.id===params.stepId):canvas,targets=prefix==='receipt_count'?(scoped??[]).flatMap(campaign=>(button?campaign.buttons:campaign.pages)??[]):(button?canvasSource?.buttons:canvasSource?.pages)??[],rows=[...new Map(targets.map(row=>[row.id,row])).values()];
   fields.push(resource(button?'Button':'Page',String(params[button?'buttonId':'pageId']??''),rows,value=>setParam(button?'buttonId':'pageId',value),true,{placeholder:button?'Search for Button':'Search for Page',anyLabel:null}));
  }
  return <section className={styles.editor} aria-label={definition.label}><h4>{definition.label}</h4><ChoiceField label="Interaction" value={rule.tagInteraction??''} options={campaignInteractions.map(item=>({id:item.id,label:item.label}))} change={value=>{const next=findCampaignInteraction(value),campaignId=parts.slice(2).join(':'),selected=capabilities?.campaigns.find(campaign=>campaign.id===campaignId);change({tagInteraction:value,operator:'greater_than',value:'0',...(prefix==='receipt_count'&&selected&&selected.channel!==next?.channel?{field:'receipt_count:engaged:'}:{}),params:{...params,buttonId:'',pageId:''}});}}/>{interaction&&<div className={styles.comparison}><MessageField label="Performed interaction"><TagSingleSelect label="Performed interaction" value={rule.operator==='equals'&&rule.value==='0'?'false':'true'} options={[{id:'true',label:'true'},{id:'false',label:'false'}]} change={value=>change({operator:value==='true'?'greater_than':'equals',value:'0'})}/></MessageField><div className={styles.resources}>{fields}</div></div>}</section>;
 }
 const relative=['less_than_ago','more_than_ago'].includes(rule.operator),between=['between','not_between'].includes(rule.operator),multi=['is_any_of','is_none_of'].includes(rule.operator),exists=['exists','not_exists'].includes(rule.operator);
 const options=definition.options??(definition.kind==='boolean'?[{id:'true',label:'true'},{id:'false',label:'false'}]:undefined),knownValues=capabilities?.attributeValues?.[attribute];
 const comparisonValue=membership&&rule.value==='false'?(rule.operator==='not_equals'?'equals':'not_equals'):rule.operator;
 const compareOptions=membership?definition.operators:definition.operators.some(option=>option.id===rule.operator)?definition.operators:[...definition.operators,{id:rule.operator,label:rule.operator.replaceAll('_',' ')}];
 const compare=<MessageField label="Comparison"><TagSingleSelect label="Comparison" value={comparisonValue} options={compareOptions} change={value=>{
  const at=new Date(),today=`${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`;
  const operator=value as AudienceRule['operator'],nextMulti=['is_any_of','is_none_of'].includes(value),wasMulti=['is_any_of','is_none_of'].includes(rule.operator),nextRelative=['less_than_ago','more_than_ago'].includes(value);
  if(membership){change({operator,value:'true'});return;}
  change({operator,value:nextMulti&&!wasMulti?JSON.stringify(rule.value?[rule.value]:[]):!nextMulti&&wasMulti?audienceMultiValues(rule.value)[0]??'':nextRelative!==relative?(nextRelative?'1':rule.field==='inbound_sms_keyword_last'?'':today):rule.value,value2:undefined,timeUnit:nextRelative?rule.timeUnit??'days':undefined});
 }}/></MessageField>;
 let valueControl:ReactNode=null;
 if(!received&&!membership&&!exists&&definition.kind!=='geo'&&rule.field!=='attr:app_id'){
  if(multi)valueControl=<MultiValue label={definition.kind==='enum'?definition.label:'Values'} value={rule.value} options={options} change={value=>change({value})}/>;
  else if(relative)valueControl=<div className={styles.grid}><MessageField label="Time period"><input className={styles.valueInput} aria-label="Time period" type="number" min={0} value={rule.value} onChange={event=>change({value:event.target.value})}/></MessageField><MessageField label="Time unit"><TagSingleSelect label="Time unit" value={rule.timeUnit??''} options={['hours','days','weeks'].map(id=>({id,label:id}))} change={value=>change({timeUnit:value as AudienceRule['timeUnit']})}/></MessageField><span className={styles.ago}>ago</span></div>;
  else if(options)valueControl=<ChoiceField label={definition.kind==='boolean'?'Value':definition.label} value={rule.value} options={options} change={value=>change({value})}/>;
  else if(definition.kind==='date')valueControl=<div className={between?styles.grid:undefined}><MessageField label={between?'From':'Date'}><AudienceDatePicker label={between?'From':'Date'} value={rule.value} change={value=>change({value})}/>{rule.field==='inbound_sms_keyword_last'&&!rule.value&&<small className={styles.error}>Field required</small>}</MessageField>{between&&<MessageField label="To"><AudienceDatePicker label="To" value={rule.value2??''} change={value2=>change({value2})}/></MessageField>}</div>;
  else valueControl=<div className={between?styles.grid:undefined}><MessageField label={between?'From':definition.kind==='number'?definition.valueLabel??'Number':'Value'}><input className={styles.valueInput} aria-label={between?'From':definition.kind==='number'?definition.valueLabel??'Number':'Value'} type={definition.kind==='number'?'number':'text'} step={definition.kind==='number'?'any':undefined} value={rule.value} placeholder={definition.kind==='number'?'0':undefined} list={knownValues?.length?`audience-values-${rule.id}`:undefined} onChange={event=>change({value:event.target.value})}/>{knownValues?.length?<datalist id={`audience-values-${rule.id}`}>{knownValues.map(value=><option key={value} value={value}/>)}</datalist>:null}</MessageField>{between&&<MessageField label="To"><input className={styles.valueInput} aria-label="To" type="number" step="any" value={rule.value2??''} onChange={event=>change({value2:event.target.value})}/></MessageField>}</div>;
 }
 return <section className={styles.editor} aria-label={definition.label}><h4>{definition.label}</h4><div className={styles.resources}>{!membership&&!received&&fields}</div>{received?<div className={styles.comparison}><MessageField label="Received"><TagSingleSelect label="Received" value={rule.operator==='equals'&&rule.value==='0'?'false':'true'} options={[{id:'true',label:'true'},{id:'false',label:'false'}]} change={value=>change({operator:value==='true'?'greater_than':'equals',value:'0'})}/></MessageField><div className={styles.resources}>{fields}</div></div>:membership?<div className={styles.comparison}>{compare}<div className={styles.resources}>{fields}</div></div>:(rule.field!=='inbound_sms_keyword_last'||Boolean(params.subscriptionGroupId&&params.category))&&<div className={styles.comparison}>{compare}{valueControl}</div>}{definition.kind==='geo'&&<><div className={styles.grid}><MessageField label="Latitude"><input className={styles.valueInput} aria-label="Latitude" type="number" step="any" min={-90} max={90} value={String(params.latitude??'')} onChange={event=>setParam('latitude',event.target.value)}/></MessageField><MessageField label="Longitude"><input className={styles.valueInput} aria-label="Longitude" type="number" step="any" min={-180} max={180} value={String(params.longitude??'')} onChange={event=>setParam('longitude',event.target.value)}/></MessageField></div><div className={styles.grid}><MessageField label="Radius"><input className={styles.valueInput} aria-label="Radius" type="number" min={0.01} step="any" value={String(params.radius??'')} onChange={event=>setParam('radius',event.target.value)}/></MessageField><MessageField label="Distance unit"><TagSingleSelect label="Distance unit" value={String(params.unit??'')} options={[{id:'miles',label:'miles'},{id:'km',label:'kilometers'}]} change={value=>setParam('unit',value)}/></MessageField></div></>}{definition.kind==='date'&&relative&&<p className={styles.hint}>Compared with the time the audience is evaluated.</p>}{rule.operator==='matches_regex'&&<p className={styles.hint}>Enter a regular expression, without surrounding slashes.</p>}</section>;
}
