import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentWorkspaceDraft,segmentWorkspaceData,segmentWorkspaceSnapshot,duplicateSegmentRule,newSegmentGroup} from '../lib/segment-workspace-model.ts';

test('legacy filters migrate to one AND group without silently changing targeting',()=>{
 const legacy={name:'US',description:'Legacy saved segment',data:{filters:[{field:'country',operator:'equals',value:'US'}],tags:['Region']}};
 const draft=segmentWorkspaceDraft(legacy);
 assert.equal(draft.audienceGroups[0].operator,'AND');
 assert.equal(draft.audienceGroups[0].rules[0].value,'US');
 assert.deepEqual(draft.tags,['Region']);
 assert.deepEqual(draft.segmentOptions,{appIds:[],analyticsTracking:false,groupOperator:'AND'});
});
test('complex groups, exclusions, app targeting and tracked options survive save/reload',()=>{
 const draft=segmentWorkspaceDraft();draft.name='Purchasers';draft.audienceGroups=[{id:'include',operator:'OR',exclude:false,rules:[{id:'range',field:'purchase_total',operator:'between',value:'10',value2:'90',params:{currency:'USD'}}]},{id:'exclude',operator:'AND',exclude:true,rules:[{id:'recent',field:'last_session_at',operator:'less_than_ago',value:'7',timeUnit:'days'}]}];draft.segmentOptions={appIds:['ios','__no_apps__'],analyticsTracking:true,groupOperator:'OR'};
 const saved=segmentWorkspaceData(draft,{unknownOption:'preserved'},'isolated');
 assert.equal(saved.unknownOption,'preserved');assert.equal(saved.workspaceId,'isolated');assert.deepEqual(saved.filters,[]);
 const reload=segmentWorkspaceDraft({name:draft.name,description:draft.description,data:saved});
 assert.deepEqual(reload.audienceGroups,draft.audienceGroups);assert.deepEqual(reload.segmentOptions,draft.segmentOptions);
 assert.equal(reload.apiIdentifier,saved.apiIdentifier);
 const preview=segmentWorkspaceSnapshot(reload,'isolated');assert.deepEqual(preview.config.audienceGroups,saved.audienceGroups);assert.deepEqual(preview.config.segmentOptions,saved.segmentOptions);
});
test('new segments target all users until filters are added and omit empty editor groups',()=>{
 const draft=segmentWorkspaceDraft();assert.equal(draft.audienceGroups[0].rules.length,0);draft.audienceGroups.push(newSegmentGroup(true));
 assert.deepEqual(segmentWorkspaceSnapshot(draft).config.audienceGroups,[]);assert.deepEqual(segmentWorkspaceData(draft).audienceGroups,[]);
});
test('duplicating complex rules creates independent parameters and a distinct identity',()=>{
 const rule={id:'original',field:'event_count:purchase',operator:'greater_than',value:'2',params:{currency:'USD'}};
 const duplicate=duplicateSegmentRule(rule);assert.notEqual(duplicate.id,rule.id);duplicate.params.currency='EUR';assert.equal(rule.params.currency,'USD');
});
test('seeded sample segments migrate missing operators, attributes and boolean values faithfully',()=>{
 const bool=segmentWorkspaceDraft({name:'Subscribed',description:'',data:{filters:[{field:'subscribed',value:1}]}});assert.equal(bool.audienceGroups[0].rules[0].operator,'equals');assert.equal(bool.audienceGroups[0].rules[0].value,'true');
 const attribute=segmentWorkspaceDraft({name:'Pro',description:'',data:{filters:[{field:'attribute',attribute:'plan',value:'pro'}]}});assert.equal(attribute.audienceGroups[0].rules[0].field,'attr:plan');assert.equal(attribute.audienceGroups[0].rules[0].value,'pro');
});
