import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignStepIssues} from '../lib/campaign-progress.ts';
import {campaignValidationIssues} from '../lib/campaign-validation.ts';
const valid={name:'Valid message',channel:'push',subject:'Title',body:'Content',schedule:'One time',conversion:'Start Session',config:{controlGroup:0,channelValues:{platforms:['iOS']}}};
test('badge validation assigns content, schedule, allocation and conversions to their actual steps',()=>{
 const draft={...valid,config:{...valid.config,delivery:{schemaVersion:3,timing:'designated',startDate:'',sendTime:''},controlGroup:20,variantSplits:[10],conversionEvents:[{type:'Performs Custom Event',deadline:3,unit:'Days',eventName:''}]}};
 const before=JSON.stringify(draft),issues=campaignStepIssues(draft);
 assert.deepEqual(issues[0],[]);assert.ok(issues[1].length);assert.ok(issues[2].length);assert.ok(issues[3].length);assert.ok(issues[4].length);assert.equal(JSON.stringify(draft),before);
 assert.ok(campaignStepIssues({...valid,body:''})[0].some(issue=>/message content/.test(issue)));
});
test('multichannel Compose and Review ignore obsolete child-only later-step state but validate actual content',()=>{
 const draft={...valid,channel:'multichannel',config:{channelValues:{channels:['Push notification'],rule:'Send all channels at once'},multichannelMessages:{push:{...valid,config:{...valid.config,delivery:{schemaVersion:3,timing:'designated',startDate:'',sendTime:''},audienceGroups:[{id:'broken',operator:'AND',exclude:false,rules:[]}],controlGroup:20,variantSplits:[10],conversionEvents:[]}}}}};
 const before=JSON.stringify(draft);assert.ok(campaignStepIssues(draft).every(issues=>!issues.length));assert.equal(JSON.stringify(draft),before);
 draft.config.multichannelMessages.push.body='';assert.ok(campaignStepIssues(draft)[0].length);assert.ok(campaignStepIssues(draft)[4].length);
});
test('multichannel launch validation checks shared parent conversions',()=>{
 const draft={...valid,channel:'multichannel',config:{conversionEvents:[],channelValues:{channels:['Push notification'],rule:'Send all channels at once'},multichannelMessages:{push:valid}}};
 assert.deepEqual(campaignStepIssues(draft)[0],[]);assert.ok(campaignStepIssues(draft)[3].length);assert.ok(campaignValidationIssues(draft).some(issue=>/conversion events/.test(issue)));
});
test('Audience badge and launch reject values the actual SQL evaluator cannot execute',()=>{
 for(const patch of [{limitVolume:true,maxUsers:0},{rateLimitEnabled:true,rateLimit:-1},{audienceSegmentOperator:'INVALID'},{audienceGroups:[{id:'g',operator:'AND',exclude:false,rules:[{id:'r',field:'purchase_total',operator:'greater_than',value:'invalid-number'}]}]}]){
  const draft={...valid,config:{...valid.config,...patch}},issues=campaignStepIssues(draft);
  assert.deepEqual(issues[0],[]);assert.ok(issues[2].length);assert.ok(issues[4].length);
 }
});
test('Feature and API badges skip hidden ordinary schedule fields',()=>{
 for(const channel of ['feature','api'])assert.deepEqual(campaignStepIssues({...valid,channel,body:'{}',config:{delivery:{schemaVersion:3,timing:'designated',startDate:'',sendTime:'',reeligible:true,reentryDays:0}}})[1],[]);
});
test('IAM schema-v2 schedule errors do not contaminate Compose validation',()=>{
 const draft={...valid,channel:'iam',config:{delivery:{schemaVersion:2,iamTriggers:[{id:'t',type:'Perform Custom Event',eventName:''}],startDate:'',sendTime:''}}};
 const issues=campaignStepIssues(draft);assert.deepEqual(issues[0],[]);assert.ok(issues[1].length);
});

test('Compose flags an explicitly empty secondary email subject or body',()=>{
 const draft={name:'Email variants',channel:'email',subject:'Primary subject',body:'Primary content',config:{variants:[{id:'a',name:'A',subject:'Primary subject',body:'Primary content'},{id:'b',name:'B',subject:'',body:''}]}};
 const issues=campaignStepIssues(draft)[0];assert.ok(issues.some(issue=>/B:.*subject/.test(issue)));assert.ok(issues.some(issue=>/B:.*message content/.test(issue)));
});
