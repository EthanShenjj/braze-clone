import test from 'node:test';
import assert from 'node:assert/strict';
import {audiencePathContext,audienceWorkspaceId} from '../lib/audience-navigation.ts';
const ws='6af4374c46d3080087f1c5d2';
test('observed native Segment editor restores identity and workspace in source order',()=>{assert.deepEqual(audiencePathContext(`/engagement/segmenter/edit/seg_new/${ws}`),{page:'segments',segmentId:'seg_new',workspaceId:ws});assert.equal(audiencePathContext(`/engagement/segmenter/segment_insights/${ws}`).workspaceId,ws);});
test('observed subscription details and Preference New resolve without inventing edit paths',()=>{assert.deepEqual(audiencePathContext(`/users/subscription_groups/sg_sms/${ws}`),{page:'subscription-group-management',groupId:'sg_sms',workspaceId:ws});assert.deepEqual(audiencePathContext(`/users/subscription_groups/preference_centers/${ws}/new`),{page:'email-preference-centers',workspaceId:ws,preferenceNew:true});assert.deepEqual(audiencePathContext(`/users/subscription_groups/preference_centers/${ws}/pc_unknown`),{});});
test('native list routes preserve actual scopes while existing clone local route stays local',()=>{for(const path of [`/engagement/segmenter/segmenter/${ws}`,`/users/subscription_groups/subscription_groups/${ws}`,`/users/user_search/user-search/${ws}`,`/users/user_import/${ws}`])assert.equal(audiencePathContext(path).workspaceId,ws);assert.equal(audiencePathContext('/users/subscription_groups/preference_centers/6aa75e37db69160082adb7ae').workspaceId,'local');assert.equal(audienceWorkspaceId('/audience/segments',new URLSearchParams()),'local');});
test('explicit query workspace overrides native scope and unknown paths are ignored',()=>{assert.equal(audienceWorkspaceId(`/users/user_import/${ws}`,new URLSearchParams('workspace=remote')),'remote');assert.equal(audienceWorkspaceId(`/users/user_import/${ws}`,new URLSearchParams('workspaceId=other')),'other');assert.deepEqual(audiencePathContext('/settings/unobserved/anything'),{});assert.equal(audiencePathContext(`/engagement/locations/create_location_set/${ws}`).locationNew,true);});

test('observed Global Control Group path preserves workspace',()=>{assert.deepEqual(audiencePathContext(`/engagement/global_message_settings/global-control-settings/${ws}`),{page:'global-control-group',workspaceId:ws});});

test('frequency settings keep the same workspace when navigating from native paths to sidebar pages',()=>{
 const path=`/engagement/global_message_settings/global-message-settings/${ws}`;
 assert.deepEqual(audiencePathContext(path),{page:'frequency-capping-rules',workspaceId:ws});
 assert.equal(audienceWorkspaceId(path,new URLSearchParams()),ws);
 assert.equal(audienceWorkspaceId('/frequency-capping-rules',new URLSearchParams(`workspace=${ws}`)),ws);
 assert.equal(audienceWorkspaceId(path,new URLSearchParams('workspace=local&workspaceId=other')),'local');
 assert.equal(audienceWorkspaceId('/engagement/global_message_settings/global-message-settings/6aa75e37db69160082adb7ae',new URLSearchParams()),'local');
});
