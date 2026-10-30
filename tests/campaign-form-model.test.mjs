import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import { resolveCampaignTiming, resolveConversionEvents, conversionCatalog, conversionConfigurationIssues, campaignTriggerCatalog, triggerEventName, campaignScheduleSummary, reentryDays, delayMinutes, audienceFilterCatalog, otherAudienceFilters } from '../lib/campaign-form-model.ts';
import { nextScheduledTime, nextAllowedDeliveryTime, deliveryScheduleIssues, triggerMatches, isWithinCampaignDuration } from '../lib/campaign-scheduling.ts';
const base={channel:'email',schedule:'One time',config:{}};

test('unconfigured timing is immediately sent in the form, summary, scheduler and validation',()=>{
 const at=new Date('2030-05-02T12:30:00Z'),draft={...base,config:{delivery:{schemaVersion:3}}};
 assert.equal(resolveCampaignTiming(draft),'now');
 assert.match(campaignScheduleSummary(draft),/as soon as Campaign is launched/);
 assert.equal(nextScheduledTime(draft,at),at);
 assert.deepEqual(deliveryScheduleIssues(draft),[]);
});
test('explicit designated and intelligent schedules retain their meaning',()=>{
 for(const timing of ['designated','intelligent'])assert.equal(resolveCampaignTiming({...base,config:{delivery:{timing}}}),timing);
 assert.equal(resolveCampaignTiming({...base,config:{delivery:{timing:'legacy-unknown'}}}),'now');
});
test('legacy purchase conversion normalizes consistently without mutating the draft',()=>{
 const legacy={...base,conversion:'Make Purchase'};
 assert.deepEqual(resolveConversionEvents(legacy),[{type:'Makes Purchase',app:'',deadline:3,unit:'Days'}]);
 assert.deepEqual(conversionConfigurationIssues(legacy),[]);
 assert.equal(legacy.conversion,'Make Purchase');
});
test('saved conversion definitions take precedence and preserve parameters',()=>{
 const draft={...base,conversion:'Make Purchase',config:{conversionEvents:[{type:'Performs Custom Event',app:'app_ios',deadline:12,unit:'Hours',eventName:'upgrade',properties:[{key:'plan',value:'pro'}]}]}};
 assert.deepEqual(resolveConversionEvents(draft),draft.config.conversionEvents);
 assert.deepEqual(conversionConfigurationIssues(draft),[]);
});
test('all nine source conversion categories and saved legacy types are accepted',()=>{
 assert.equal(conversionCatalog.length,9);
 for(const type of [...conversionCatalog.map(c=>c.type),'Makes Purchase','Opens Email','Clicks Email'])assert.deepEqual(conversionConfigurationIssues({...base,config:{conversionEvents:[{type,eventName:'custom',app:'',deadline:3,unit:'Days'}]}}),[]);
 assert.ok(conversionConfigurationIssues({...base,config:{conversionEvents:[]}}).length);
 assert.match(conversionConfigurationIssues({...base,config:{conversionEvents:[{type:'Performs Custom Event',app:'',deadline:0,unit:'Months'}]}}).join(' '),/custom conversion event.*positive conversion deadline/);
});
test('all-apps legacy label becomes the empty app selector value',()=>{
 assert.equal(resolveConversionEvents({...base,config:{conversionEvents:[{type:'Start Session',app:'Users from all apps',deadline:3,unit:'Days'}]}})[0].app,'');
 assert.equal(resolveConversionEvents({...base,conversion:'Start Session'})[0].type,'Starts Session');
});
test('custom Intelligent Timing fallback controls scheduling without best-hour profile data',()=>{
 const draft={...base,config:{delivery:{schemaVersion:3,timing:'intelligent',startDate:'2030-05-03',sendTime:'10:00',timezone:'UTC',intelligentFallback:'custom',intelligentFallbackTime:'15:45'}}};
 assert.equal(nextScheduledTime(draft,new Date('2030-05-02')).toISOString(),'2030-05-03T15:45:00.000Z');
 assert.equal(nextScheduledTime(draft,new Date('2030-05-02'),{best_send_hour:8}).toISOString(),'2030-05-03T08:00:00.000Z');
 assert.equal(nextScheduledTime(draft,new Date('2030-05-02'),{best_send_hour:'invalid'}).toISOString(),'2030-05-03T15:45:00.000Z');
});
test('local Intelligent Timing fallback honors profile timezone',()=>{
 const draft={...base,config:{delivery:{timing:'intelligent',startDate:'2030-05-03',localTime:true,intelligentFallback:'custom',intelligentFallbackTime:'09:30'}}};
 assert.equal(nextScheduledTime(draft,new Date('2030-05-02'),{timezone:'Asia/Shanghai'}).toISOString(),'2030-05-03T01:30:00.000Z');
});
test('quiet-hour preview and queued delivery resume at the exact local end minute',()=>{
 const delivery={quietHours:true,quietStart:'22:00',quietEnd:'08:00'};
 assert.equal(nextAllowedDeliveryTime(new Date('2030-05-02T23:07:00Z'),delivery,'UTC').toISOString(),'2030-05-03T08:00:00.000Z');
 assert.equal(nextAllowedDeliveryTime(new Date('2030-05-02T15:07:00Z'),delivery,'Asia/Shanghai').toISOString(),'2030-05-03T00:00:00.000Z');
});
test('trigger catalog maps recorded canonical events instead of silently never matching',()=>{
 assert.equal(campaignTriggerCatalog.length,22);
 for(const type of ['View Product','Update Cart','Start Checkout','Place Order','Cancel Order','Refund Order','Upgrade App','Send Inbound SMS','Enter Location']) {
  const name=triggerEventName(type);
  assert.notEqual(name,type);
  assert.equal(triggerMatches({id:'t',type},{name}),true);
  assert.equal(triggerMatches({id:'t',type},{name:'unrelated'}),false);
 }
 assert.equal(triggerMatches({id:'t',type:'View Product',filtersEnabled:true,filterGroups:[{match:'all',conditions:[{property:'sku',operator:'equals',value:'a'}]}]},{name:'ecommerce.product_viewed',properties:{sku:'b'}}),false);
});
test('ordinary trigger labels match all22 options captured from the live source',()=>{
 const source=readFileSync(new URL('../docs/implementation/campaigns-followup-2026-10-30/source-email-trigger-options.ax.txt',import.meta.url),'utf8');
 const labels=[...source.matchAll(/Value: (.*), ID: react-select-22-option-\d+-\d+/g)].map(match=>match[1]);
 assert.equal(labels.length,22);assert.deepEqual(campaignTriggerCatalog.map(entry=>entry.type),labels);
 for(const entry of campaignTriggerCatalog){const name=entry.type==='Perform Custom Event'?'tracked_event':entry.type==='Interact With Campaign'?'clicked':entry.event;assert.equal(triggerMatches({id:'source',type:entry.type,eventName:'tracked_event'},{name}),true,entry.type);}
});
test('delay and reentry unit selectors persist the execution engine units',()=>{
 assert.equal(delayMinutes(2,'hours'),120);
 assert.equal(delayMinutes(30,'seconds'),.5);
 assert.equal(delayMinutes(2,'days'),2880);
 assert.equal(reentryDays(3,'Hours'),.125);
 assert.equal(reentryDays(2,'Weeks'),14);
});
test('campaign duration respects a non-UTC company timezone and exclusive end',()=>{
 const draft={...base,config:{delivery:{startDate:'2030-05-03',sendTime:'09:00',timezone:'Asia/Shanghai',endEnabled:true,endTime:'2030-05-03T18:00'}}};
 assert.equal(isWithinCampaignDuration(draft,new Date('2030-05-03T00:59:59Z')),false);
 assert.equal(isWithinCampaignDuration(draft,new Date('2030-05-03T01:00:00Z')),true);
 assert.equal(isWithinCampaignDuration(draft,new Date('2030-05-03T10:00:00Z')),false);
});
test('invalid action schedules, trigger filters, reentry and end times yield actionable issues',()=>{
 const draft={...base,schedule:'Action-based',config:{delivery:{schemaVersion:3,iamTriggers:[{id:'a',type:'Perform Custom Event',eventName:'',filtersEnabled:true,filterGroups:[]}],delayMode:'delay',delayMinutes:0,reeligible:true,reentryDays:0,endEnabled:true,endTime:'invalid'}}};
 const issues=deliveryScheduleIssues(draft).join(' ');
 assert.match(issues,/custom event/);assert.match(issues,/trigger property filters/);assert.match(issues,/delay greater/);assert.match(issues,/start date and time/);assert.match(issues,/end time/);assert.match(issues,/re-eligibility/);
});
test('source audience categories remain discoverable with explicit supported identifiers',()=>{
 assert.equal(audienceFilterCatalog.length,16);
 assert.equal(otherAudienceFilters.length,6);
 assert.equal(otherAudienceFilters.find(f=>f.label==='External User ID').field,'id');
 assert.ok(audienceFilterCatalog.find(c=>c.name==='Channel subscription behavior').fields.some(f=>f.children?.some(child=>child.field==='emailSubscriptionStatus')));
});
test('hierarchical filter names and descriptions match the complete saved source catalogs',()=>{
 const directory=new URL('../docs/implementation/campaigns-followup-2026-10-30/',import.meta.url);
 const sourceChoices=file=>{const lines=readFileSync(new URL(file,directory),'utf8').split('\n'),choices=[];for(const [index,line] of lines.entries()){if(!/ID: react-select-26-option-\d+-\d+/.test(line))continue;const indent=line.match(/^\t*/)[0].length,text=[];for(const child of lines.slice(index+1)){if(child.match(/^\t*/)[0].length<=indent)break;const value=child.match(/\d+ text (.*)$/);if(value)text.push(value[1]);}choices.push({label:text[0],description:text[1]??''});}return choices;};
 const main=sourceChoices('source-filter-catalog.ax.txt');assert.deepEqual(audienceFilterCatalog.map(category=>({label:category.name,description:category.description})),main.slice(0,16));assert.deepEqual(otherAudienceFilters.map(({label,description})=>({label,description})),main.slice(16));
 const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 for(const category of audienceFilterCatalog){const file=`source-filters-${slug(category.name)}.ax.txt`;if(!readdirSync(directory).includes(file))continue;assert.deepEqual(category.fields.map(({label,description=''})=>({label,description})),sourceChoices(file),file);
  for(const branch of category.fields.filter(choice=>choice.children)){const nested=category.name==='Channel subscription behavior'?`source-filters-subscription-${slug(branch.label)}.ax.txt`:category.name==='Devices'?'source-filters-devices-advertising.ax.txt':`source-filters-${slug(category.name)}-${slug(branch.label)}.ax.txt`;assert.deepEqual(branch.children.map(({label,description=''})=>({label,description})),sourceChoices(nested),nested);}
 }
});

test('Feature and API editors do not validate hidden legacy delivery settings',async()=>{
 const {campaignValidationIssues}=await import('../lib/campaign-validation.ts');
 for(const channel of ['feature','api']){
  const draft={name:'Legacy special Campaign',channel,subject:channel==='feature'?'saved_flag':'',body:'{}',schedule:'One time',config:{delivery:{schemaVersion:3,timing:'designated',reeligible:true,reentryDays:0,startDate:'',sendTime:''}}};
  assert.ok(!campaignValidationIssues(draft).some(issue=>/start date|re-eligibility|end time/.test(issue)));
 }
});

test('API campaigns can track zero optional conversions without inventing a default',()=>{const draft={channel:'api',config:{conversionEvents:[]}};assert.deepEqual(resolveConversionEvents(draft),[]);assert.deepEqual(conversionConfigurationIssues(draft),[]);});
