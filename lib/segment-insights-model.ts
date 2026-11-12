export const segmentInsightColumns=[
 {key:'userSize',label:'User size',sourceKey:'total_app_users'},
 {key:'sessionFrequency',label:'Sessions per day',sourceKey:'sessions_per_day'},
 {key:'timeSinceFirstSession',label:'Days since first session',sourceKey:'days_since_first_session'},
 {key:'timeSinceLastSession',label:'Days since last session',sourceKey:'days_since_last_session'},
 {key:'lifetimeRevenue',label:'Lifetime revenue in dollars',sourceKey:'revenue_in_dollars'},
 {key:'timeToFirstPurchase',label:'Days since first purchase',sourceKey:'days_to_first_purchase'},
 {key:'timeSinceLastPurchase',label:'Days since last purchase',sourceKey:'days_since_last_purchase'},
] as const;
export type SegmentInsightColumn=typeof segmentInsightColumns[number]['key'];
export type SegmentInsightMetrics={sessionFrequency:number|null;timeSinceFirstSession:number|null;timeSinceLastSession:number|null;lifetimeRevenue:number|null;ltvCurrency:string|null;timeToFirstPurchase:number|null;timeSinceLastPurchase:number|null};
export type SegmentInsightData={segment:{id:string;name:string};statistics:{matching:number;reachable:number;total:number};metrics:SegmentInsightMetrics;calculatedAt:string};
export type SegmentInsightComparison={baseline:SegmentInsightData;segments:SegmentInsightData[]};
export function segmentInsightSelection(values:string[]):string[]{return [...new Set(values.flatMap(value=>value.split(',')).map(value=>value.trim()).filter(Boolean))].slice(0,10);}
export function segmentInsightValue(row:SegmentInsightData,column:SegmentInsightColumn):number|null{return column==='userSize'?row.statistics.matching:row.metrics[column];}
export function sortSegmentInsights(rows:SegmentInsightData[],column:SegmentInsightColumn|null,descending=true):SegmentInsightData[]{if(!column)return [...rows];return [...rows].sort((a,b)=>{const left=segmentInsightValue(a,column),right=segmentInsightValue(b,column);if(left===null||!Number.isFinite(left))return right===null||!Number.isFinite(right)?0:1;if(right===null||!Number.isFinite(right))return-1;return (descending?-1:1)*(left-right);});}
export function segmentInsightLift(value:number|null,baseline:number|null):number|null{return value===null||baseline===null||!Number.isFinite(value)||!Number.isFinite(baseline)||baseline===0?null:(value-baseline)/Math.abs(baseline)*100;}
export function formatSegmentInsight(row:SegmentInsightData,column:SegmentInsightColumn,locale='en'):string{const value=segmentInsightValue(row,column);if(value===null||!Number.isFinite(value))return '—';if(column==='lifetimeRevenue'){if(!row.metrics.ltvCurrency)return '—';try{return new Intl.NumberFormat(locale,{style:'currency',currency:row.metrics.ltvCurrency,maximumFractionDigits:2}).format(value);}catch{return '—';}}return new Intl.NumberFormat(locale,{maximumFractionDigits:column==='userSize'?0:2}).format(value);}
