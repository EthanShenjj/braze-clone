import test from 'node:test';
import assert from 'node:assert/strict';
import {audienceSuppressionIssues,matchingAudienceSuppressions} from '../lib/audience-suppression-model.ts';
const groups=[{id:'g',operator:'AND',exclude:false,rules:[{id:'r',field:'country',operator:'equals',value:'US'}]}];
const row=(patch={})=>({id:'suppression',name:'Unengaged',status:'Active',data:{audienceGroups:groups,...patch}});
test('empty draft saves but activation requires a valid filter',()=>{
 assert.deepEqual(audienceSuppressionIssues('Inactive',{}),[]);
 assert.match(audienceSuppressionIssues('Active',{})[0],/at least one/);
 assert.deepEqual(audienceSuppressionIssues('Active',row().data),[]);
 assert.ok(audienceSuppressionIssues('Active',{audienceGroups:[{...groups[0],rules:[{...groups[0].rules[0],operator:'invalid'}]}]}).length);
});
test('suppression requires current workspace, active status and live membership',()=>{
 const rows=[row(),{...row(),id:'inactive',status:'Inactive'},{...row({workspaceId:'remote'}),id:'remote'}];
 assert.deepEqual(matchingAudienceSuppressions(rows,{channel:'email'},()=>true).map(row=>row.id),['suppression']);
 assert.equal(matchingAudienceSuppressions(rows,{channel:'email'},()=>false).length,0);
 assert.deepEqual(matchingAudienceSuppressions(rows,{channel:'email',workspaceId:'remote'},()=>true).map(row=>row.id),['remote']);
});
test('exception tags exempt only matching messages and feature flags are exempt',()=>{
 const rows=[row({exceptionTags:['Shipping confirmation']})];
 assert.equal(matchingAudienceSuppressions(rows,{channel:'push',tags:['Shipping confirmation']},()=>true).length,0);
 assert.equal(matchingAudienceSuppressions(rows,{channel:'sms',tags:['Marketing']},()=>true).length,1);
 assert.equal(matchingAudienceSuppressions(rows,{channel:'feature'},()=>true).length,0);
});
