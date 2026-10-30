import { allocation, campaignVariants, type MessageDraft } from './campaign-shared.ts';

export type AnalyticsCampaign = MessageDraft & { id: string; name: string; status?: string; sent?: number; edited?: string; audience?: string; conversion?: string; createdAt?: string };
export type CampaignAnalyticsEvent = { id: string; user_id: string; event_type: string; created_at: string; data?: Record<string, unknown> };
export type CampaignChange = { id: string; createdAt: string; user: string; category: string; action: string; before?: unknown; after?: unknown };
export type CampaignMonitoring = { lowerEnabled: boolean; lowerDuration: number; lowerThreshold: number; upperEnabled: boolean; upperDuration: number; upperThreshold: number; channels: Array<'Email' | 'Webhook'>; emptyFields?: Array<'lowerDuration'|'lowerThreshold'|'upperDuration'|'upperThreshold'>; configured?: boolean; localOnly?: boolean; evaluatedAt?: string; alerts?: unknown[] };
export type CampaignAnalyticsAudience = { matching: number; reachable: number; total: number; ltv?: number | null; breakdown?: Record<string, unknown>; [key: string]: unknown };
export type CampaignAnalyticsResponse = { campaign?: AnalyticsCampaign; events: CampaignAnalyticsEvent[]; changes: CampaignChange[]; audience: CampaignAnalyticsAudience; monitor?: CampaignMonitoring };
export const monitoringDurations = [1,5,15,30,60,180,360,720,1440] as const;
export function defaultCampaignMonitoring(): CampaignMonitoring { return { lowerEnabled:false,lowerDuration:60,lowerThreshold:0,upperEnabled:false,upperDuration:60,upperThreshold:1000,channels:['Email'] }; }
export function initialCampaignMonitoringForm(value: CampaignMonitoring): CampaignMonitoring {
  if(value.configured || value.lowerEnabled || value.upperEnabled) {const result={...value,channels:[...value.channels]};for(const side of ['lower','upper'] as const) if(!value[`${side}Enabled`])for(const field of ['Duration','Threshold'] as const)if(value.emptyFields?.includes(`${side}${field}`))result[`${side}${field}`]=NaN;return result;}
  return {...value,lowerDuration:NaN,lowerThreshold:NaN,upperDuration:NaN,upperThreshold:NaN,channels:[]};
}
export function campaignMonitoringPayload(value: CampaignMonitoring): CampaignMonitoring {
  const result={...value,channels:[...value.channels],emptyFields:[] as NonNullable<CampaignMonitoring['emptyFields']>},defaults=defaultCampaignMonitoring();
  for(const side of ['lower','upper'] as const) if(!result[`${side}Enabled`]) {
    for(const field of ['Duration','Threshold'] as const) if(!Number.isFinite(result[`${side}${field}`])) {result.emptyFields.push(`${side}${field}`);result[`${side}${field}`]=defaults[`${side}${field}`];}
  }
  return result;
}
export function campaignMonitoringIssues(value: CampaignMonitoring): string[] {
  const issues: string[]=[];
  if(!value.lowerEnabled&&!value.upperEnabled) issues.push('Enable at least one alert condition.');
  for(const side of ['lower','upper'] as const) if(value[`${side}Enabled`]) {
    if(!(monitoringDurations as readonly number[]).includes(value[`${side}Duration`]))issues.push('Choose a supported duration for each enabled condition.');
    if(!Number.isSafeInteger(value[`${side}Threshold`])||value[`${side}Threshold`]<0)issues.push('Thresholds must be nonnegative whole numbers.');
  }
  if(!value.channels.length||value.channels.some(channel=>!['Email','Webhook'].includes(channel)))issues.push('Choose Email or Webhook as a notification channel.');
  if(value.lowerEnabled&&value.upperEnabled&&value.lowerDuration===value.upperDuration&&value.lowerThreshold>=value.upperThreshold)issues.push('The lower threshold must be less than the upper threshold for the same duration.');
  return [...new Set(issues)];
}
export function analyticsEventData(event: CampaignAnalyticsEvent): Record<string,unknown> {
  const data=event.data??{},attributes=data.attributes&&typeof data.attributes==='object'?data.attributes as Record<string,unknown>:{};
  return {...attributes,...data};
}
/** Production receipts only: provider acceptance, preparation, tests and bots are not delivery. */
export function realCampaignEvents(events: CampaignAnalyticsEvent[]): CampaignAnalyticsEvent[] {
  const ids=new Set<string>();
  return events.filter(event=>{const data=analyticsEventData(event);if(data.test===true||data.simulated===true||data.filtered===true||data.bot===true||event.event_type.startsWith('test_')||event.event_type==='bot_clicked')return false;if(event.id&&ids.has(event.id))return false;ids.add(event.id);return true;});
}
export function analyticsVariantId(event: CampaignAnalyticsEvent): string { return String(analyticsEventData(event).variantId??analyticsEventData(event).variationId??''); }
export function conversionEventIndex(event: CampaignAnalyticsEvent): number { const index=Number(analyticsEventData(event).conversionIndex??0);return Number.isSafeInteger(index)&&index>=0?index:0; }
const impressionTypes=new Set(['delivered','impression','impressed']);
const recipientTypes=new Set(['sent','delivered','impression','impressed']);
const conversionTypes=new Set(['conversion','converted']);
export type CampaignMetrics = { recipients: number; uniqueImpressions: number; impressions: number; clicks: number; uniqueClicks: number; opens: number; primaryConversions: number; conversionRate: number | null; failed: number; sent: number; revenueByCurrency: Record<string,number> };
export type AnalyticsStatistic = 'impressions'|'uniqueImpressions'|'clicks'|'opens'|'primaryConversions'|'recipients'|'failed';
export const analyticsStatisticLabels: Record<AnalyticsStatistic,string> = {impressions:'Impressions',uniqueImpressions:'Unique Impressions',clicks:'Clicks',opens:'Opens',primaryConversions:'Primary Conversions',recipients:'Unique Recipients',failed:'Failures'};
export function campaignMetrics(events: CampaignAnalyticsEvent[], conversionIndex=0): CampaignMetrics {
  const rows=realCampaignEvents(events),users=(types:Set<string>)=>new Set(rows.filter(row=>types.has(row.event_type)&&row.user_id).map(row=>row.user_id)).size;
  const converted=rows.filter(row=>conversionTypes.has(row.event_type)&&conversionEventIndex(row)===conversionIndex),converters=new Set(converted.filter(row=>row.user_id).map(row=>row.user_id)).size;
  const recipients=users(recipientTypes),revenueByCurrency:Record<string,number>={};
  for(const row of converted){const data=analyticsEventData(row),revenue=Number(data.revenue??0);if(!Number.isFinite(revenue)||!revenue)continue;const currency=String(data.currency??'Unspecified').toUpperCase();Object.defineProperty(revenueByCurrency,currency,{value:(Object.hasOwn(revenueByCurrency,currency)?revenueByCurrency[currency]:0)+revenue,enumerable:true,configurable:true});}
  return {recipients,uniqueImpressions:users(impressionTypes),impressions:rows.filter(row=>impressionTypes.has(row.event_type)).length,clicks:rows.filter(row=>['clicked','click'].includes(row.event_type)).length,uniqueClicks:users(new Set(['clicked','click'])),opens:rows.filter(row=>['opened','open'].includes(row.event_type)).length,primaryConversions:converters,conversionRate:recipients?converters/recipients*100:null,failed:rows.filter(row=>['failed','bounced','unreachable'].includes(row.event_type)).length,sent:rows.filter(row=>row.event_type==='sent').length,revenueByCurrency};
}
export function analyticsVariantRows(campaign: AnalyticsCampaign, events: CampaignAnalyticsEvent[]) {
  const variants=campaignVariants(campaign),weights=allocation(campaign).weights;
  const rows=variants.map((variant,index)=>({id:variant.id,name:variant.name,letter:String.fromCharCode(65+index),weight:weights[index]??0,metrics:campaignMetrics(events.filter(row=>analyticsVariantId(row)===variant.id))}));
  const unknown=realCampaignEvents(events).filter(event=>!variants.some(variant=>variant.id===analyticsVariantId(event)));
  if(unknown.length)rows.push({id:'__unattributed__',name:'Unattributed events',letter:'—',weight:0,metrics:campaignMetrics(unknown)});
  return rows;
}
export function analyticsDateRange(from:string,to:string): string[] {
  const parse=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?Date.parse(value):NaN;
  const start=parse(from),end=parse(to);if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||end-start>365*86400000)return [];
  return Array.from({length:Math.floor((end-start)/86400000)+1},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
}
export function historicalCampaignMetrics(events:CampaignAnalyticsEvent[],from:string,to:string,variant='all') {
  const rows=realCampaignEvents(events).filter(row=>variant==='all'||analyticsVariantId(row)===variant);
  return analyticsDateRange(from,to).map(date=>({date,...campaignMetrics(rows.filter(row=>Number.isFinite(Date.parse(row.created_at))&&new Date(row.created_at).toISOString().slice(0,10)===date))}));
}
export function campaignClickDetails(events:CampaignAnalyticsEvent[],variant='all') {
  const groups=new Map<string,{target:string;count:number;users:Set<string>}>();
  for(const row of realCampaignEvents(events)){if(!['clicked','click'].includes(row.event_type)||(variant!=='all'&&analyticsVariantId(row)!==variant))continue;const data=analyticsEventData(row),target=String(data.alias??data.buttonId??data.actionId??data.url??data.target??'Body / unspecified target');const group=groups.get(target)??{target,count:0,users:new Set<string>()};group.count++;if(row.user_id)group.users.add(row.user_id);groups.set(target,group);}
  return [...groups.values()].map(row=>({target:row.target,clicks:row.count,uniqueUsers:row.users.size})).sort((a,b)=>b.clicks-a.clicks||a.target.localeCompare(b.target));
}
export function filteredCampaignChanges(rows:CampaignChange[],category='',user='') {return rows.filter(row=>(!category||row.category===category)&&(!user||row.user===user)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
/** Export literal text safely, including formulas in user-controlled names. */
export function analyticsCsv(rows:unknown[][]):string {return rows.map(row=>row.map(value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
