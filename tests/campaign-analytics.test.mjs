import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyticsDateRange, analyticsVariantRows, campaignMetrics, historicalCampaignMetrics, campaignClickDetails, filteredCampaignChanges, analyticsCsv, defaultCampaignMonitoring, campaignMonitoringIssues, realCampaignEvents } from '../lib/campaign-analytics-model.ts';
let nextId=0;
const event=(event_type,user_id='u1',data={},created_at='2026-10-29T10:00:00Z')=>({id:`e${nextId++}`,event_type,user_id,data,created_at});
const campaign={id:'cmp',name:'Campaign',channel:'email',config:{controlGroup:0,variantSplits:[60,40],variants:[{id:'a',name:'A'},{id:'b',name:'B'}]}};
test('delivery metrics exclude tests, simulations, bots, filtered clicks and provider acceptance',()=>{
 const counts=campaignMetrics([event('delivered'),event('delivered','u2',{test:true}),event('delivered','u3',{simulated:true}),event('test_prepared','u4'),event('accepted','u5'),event('prepared','u6'),event('bot_clicked'),event('clicked','u1',{attributes:{filtered:true}}),event('clicked','u1',{attributes:{bot:true}})]);
 assert.equal(counts.recipients,1);assert.equal(counts.impressions,1);assert.equal(counts.clicks,0);assert.equal(counts.conversionRate,0);
});
test('unique users and event counts differ; duplicated input row IDs are counted once',()=>{
 const click=event('clicked');const counts=campaignMetrics([event('delivered'),event('delivered'),event('delivered','u2'),click,click,event('clicked'),event('conversion'),event('conversion')]);
 assert.equal(counts.impressions,3);assert.equal(counts.uniqueImpressions,2);assert.equal(counts.clicks,2);assert.equal(counts.uniqueClicks,1);assert.equal(counts.primaryConversions,1);assert.equal(counts.conversionRate,50);
});
test('conversion index and revenue currencies remain independent without summing mixed currencies',()=>{
 const rows=[event('delivered'),event('conversion','u1',{conversionIndex:0,revenue:10,currency:'USD'}),event('conversion','u1',{conversionIndex:1,revenue:5,currency:'EUR'}),event('conversion','u2',{attributes:{conversionIndex:0,revenue:7,currency:'EUR'}})];
 assert.deepEqual(campaignMetrics(rows).revenueByCurrency,{USD:10,EUR:7});assert.deepEqual(campaignMetrics(rows,1).revenueByCurrency,{EUR:5});assert.equal(campaignMetrics(rows,1).primaryConversions,1);assert.equal(campaignMetrics([]).conversionRate,null);
});
test('variant rows keep configured splits and visibly retain unattributed events',()=>{
 const rows=analyticsVariantRows(campaign,[event('delivered','u1',{variantId:'a'}),event('delivered','u2',{attributes:{variantId:'b'}}),event('delivered','u3'),event('clicked','u3',{variantId:'retired'})]);
 assert.deepEqual(rows.map(row=>[row.id,row.weight,row.metrics.recipients]),[['a',60,1],['b',40,1],['__unattributed__',0,1]]);assert.equal(rows[2].metrics.clicks,1);
});
test('date range validates real dates, order, leap years and inclusive 366-day boundary',()=>{
 assert.deepEqual(analyticsDateRange('2024-02-28','2024-03-01'),['2024-02-28','2024-02-29','2024-03-01']);
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-10-30','2026-10-29'],['bad','2026-10-29'],['2024-01-01','2025-01-01']])assert.deepEqual(analyticsDateRange(from,to),[]);
 assert.equal(analyticsDateRange('2024-01-01','2024-12-31').length,366);
});
test('history uses UTC dates, filters variants, preserves empty days and excludes events out of range',()=>{
 const rows=[event('delivered','u1',{variantId:'a'},'2026-10-28T23:30:00-02:00'),event('delivered','u2',{variantId:'b'},'2026-10-29T12:00:00Z'),event('delivered','u3',{variantId:'a'},'2026-10-30T00:00:00Z'),event('delivered','u4',{variantId:'a'},'invalid')];
 assert.deepEqual(historicalCampaignMetrics(rows,'2026-10-28','2026-10-29','a').map(row=>[row.date,row.impressions]),[['2026-10-28',0],['2026-10-29',1]]);
});
test('click details use nested tracking alias, count repeat clicks and ignore simulated rows',()=>{
 const rows=[event('clicked','u1',{attributes:{alias:'Buy',variantId:'a'}}),event('clicked','u1',{alias:'Buy',variantId:'a'}),event('clicked','u2',{alias:'Buy',variantId:'a'}),event('clicked','u3',{alias:'Other',variantId:'b'}),event('clicked','u4',{alias:'Buy',variantId:'a',simulated:true})];
 assert.deepEqual(campaignClickDetails(rows,'a'),[{target:'Buy',clicks:3,uniqueUsers:2}]);
});
test('change filters intersect category and user, sort newest first and do not mutate input',()=>{
 const changes=[{id:'1',category:'Content',user:'Ada',createdAt:'2026-10-28',action:'edit'},{id:'2',category:'Audience',user:'Ada',createdAt:'2026-10-29',action:'edit'},{id:'3',category:'Content',user:'Ben',createdAt:'2026-10-30',action:'edit'}];
 assert.deepEqual(filteredCampaignChanges(changes,'Content','Ada').map(row=>row.id),['1']);assert.deepEqual(filteredCampaignChanges(changes).map(row=>row.id),['3','2','1']);assert.equal(changes[0].id,'1');
});
test('monitoring requires enabled criteria, whole thresholds, duration/channel and coherent limits',()=>{
 const value={...defaultCampaignMonitoring(),lowerEnabled:true,lowerThreshold:2};assert.deepEqual(campaignMonitoringIssues(value),[]);assert.ok(campaignMonitoringIssues(defaultCampaignMonitoring()).length);
 for(const patch of [{lowerThreshold:-1},{lowerThreshold:1.5},{lowerThreshold:NaN},{lowerDuration:0},{channels:[]},{channels:['SMS']},{upperEnabled:true,upperDuration:60,upperThreshold:1}])assert.ok(campaignMonitoringIssues({...value,...patch}).length);
 assert.deepEqual(campaignMonitoringIssues({...value,upperEnabled:true,upperDuration:1440,upperThreshold:1}),[]);
});
test('CSV correctly quotes commas/newlines and prevents formulas in user controlled text',()=>{
 const csv=analyticsCsv([['Target','Clicks'],['=HYPERLINK("bad")',2],['a,b\nc',1]]);assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);assert.match(csv,/"a,b\nc"/);assert.ok(csv.includes('\r\n'));
});
test('production filter accepts provider receipts and treats nested test flags consistently',()=>{
 const real=event('delivered','u1',{external:true,attributes:{test:false}});assert.deepEqual(realCampaignEvents([real,event('delivered','u2',{attributes:{test:true}})]),[real]);
});
test('unconfigured monitoring starts blank with both channels off, while saved zero thresholds survive', async()=>{
 const {initialCampaignMonitoringForm,campaignMonitoringPayload}=await import('../lib/campaign-analytics-model.ts');
 const blank=initialCampaignMonitoringForm(defaultCampaignMonitoring());
 assert.ok(Number.isNaN(blank.lowerDuration));assert.ok(Number.isNaN(blank.upperThreshold));assert.deepEqual(blank.channels,[]);
 const enabled={...blank,lowerEnabled:true,lowerDuration:60,lowerThreshold:0,channels:['Email']};
 assert.deepEqual(campaignMonitoringIssues(enabled),[]);
 const payload=campaignMonitoringPayload(enabled);assert.equal(payload.lowerThreshold,0);assert.ok(Number.isFinite(payload.upperThreshold));
 const restored=initialCampaignMonitoringForm({...payload,configured:true});assert.equal(restored.lowerThreshold,0);assert.ok(Number.isNaN(restored.upperThreshold));assert.ok(Number.isNaN(restored.upperDuration));
 const missing={...blank,lowerEnabled:true,channels:['Email']};assert.ok(campaignMonitoringIssues(missing).length>=2);
});
