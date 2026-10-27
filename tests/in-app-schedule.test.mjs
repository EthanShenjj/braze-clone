import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleTriggers, scheduleDelay, delayInMinutes, scheduleValidationIssues } from '../lib/in-app-schedule.ts';
const valid = () => ({ schemaVersion:2, iamTriggers:[{id:'event',type:'Perform Custom Event',eventName:'account_opened'}],startDate:'2026-10-27',sendTime:'09:00' });
test('legacy session settings migrate per trigger without reviving an explicitly empty list', () => {
 assert.deepEqual(scheduleTriggers({specificApp:true,appId:'mobile'})[0],{id:'session',type:'Start Session',specificApp:true,appId:'mobile'});
 assert.deepEqual(scheduleTriggers({iamTriggers:[]}),[]);
 const input={specificApp:true,appId:'old',iamTriggers:[{id:'a',type:'Start Session',specificApp:false,appId:'new'}]};
 assert.equal(scheduleTriggers(input)[0].specificApp,false);assert.equal(scheduleTriggers(input)[0].appId,'new');
});
test('delay units retain seconds precision and migrate old minutes', () => {
 assert.equal(delayInMinutes(30,'seconds'),.5);assert.equal(delayInMinutes(2,'hours'),120);
 assert.deepEqual(scheduleDelay({delayMinutes:5}),{mode:'delay',value:5,unit:'minutes'});
 assert.deepEqual(scheduleDelay({delayMinutes:0,delayMode:'delay',delayValue:0,delayUnit:'seconds'}),{mode:'delay',value:0,unit:'seconds'});
});
test('incomplete triggers and property groups cannot pass launch validation', () => {
 assert.deepEqual(scheduleValidationIssues(valid()),[]);
 assert.match(scheduleValidationIssues({...valid(),iamTriggers:[]}).join(' '),/at least one trigger/);
 assert.match(scheduleValidationIssues({...valid(),iamTriggers:[{id:'a',type:'Perform Custom Event'}]}).join(' '),/custom event/);
 assert.match(scheduleValidationIssues({...valid(),iamTriggers:[{id:'a',type:'Start Session',specificApp:true}]}).join(' '),/Choose an app/);
 const trigger={...valid().iamTriggers[0],filtersEnabled:true,filterGroups:[{id:'g',match:'any',conditions:[]}]};
 assert.match(scheduleValidationIssues({...valid(),iamTriggers:[trigger]}).join(' '),/each filter group/);
 trigger.filterGroups[0].conditions=[{id:'c',property:'balance',operator:'gt',value:'invalid',valueType:'number'}];
 assert.match(scheduleValidationIssues({...valid(),iamTriggers:[trigger]}).join(' '),/valid number/);
 trigger.filterGroups[0].conditions[0].value='500';assert.deepEqual(scheduleValidationIssues({...valid(),iamTriggers:[trigger]}),[]);
});
test('disabled filters preserve draft conditions without affecting validation', () => {
 assert.deepEqual(scheduleValidationIssues({...valid(),iamTriggers:[{...valid().iamTriggers[0],filtersEnabled:false,filterGroups:[{conditions:[]}]}]}),[]);
});
test('duration and delay reject invalid execution intervals', () => {
 assert.match(scheduleValidationIssues({...valid(),endEnabled:true,endTime:'2026-10-26T23:00'}).join(' '),/end time after/);
 assert.match(scheduleValidationIssues({...valid(),delayMode:'delay',delayValue:0,delayUnit:'seconds'}).join(' '),/greater than zero/);
 assert.deepEqual(scheduleValidationIssues({...valid(),endEnabled:true,endTime:'2026-10-28T09:00',delayMode:'delay',delayValue:30,delayUnit:'seconds'}),[]);
});
