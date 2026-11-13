import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasProfileRuntimeEvent,canvasMessageRuntimeEvent,canvasProfileRuntimeChanges} from '../lib/canvas-event-model.ts';

const base={id:'event-1',workspaceId:'workspace-1',userId:'user-1',at:'2026-11-12T10:00:00.000Z'};
test('profile activity normalization preserves actual scope and commerce facts without inventing a different custom event',()=>{
 assert.deepEqual(canvasProfileRuntimeEvent({...base,name:'session_start',properties:{app_id:'ios',workspaceId:'forged',userId:'forged'}}),{...base,kind:'session',name:'session_start',appId:'ios',properties:{app_id:'ios',workspaceId:'forged',userId:'forged'}});
 const cases=[['Start Session',{},'session'],['app_upgraded',{},'app_upgrade'],['Upgrade App',{},'app_upgrade'],['purchase',{},'purchase'],['product-id',{productId:'product-1'},'purchase'],['ecommerce.order_placed',{},'custom'],['delivery_completed',{},'custom']];
 for(const [name,extra,kind] of cases){const event=canvasProfileRuntimeEvent({...base,name,...extra});assert.equal(event.kind,kind);assert.equal(event.name,name);}
 assert.deepEqual(canvasProfileRuntimeEvent({...base,name:'purchase',productId:'p1',price:12,quantity:2,currency:'USD',properties:{price:99,category:'books'}}),{...base,kind:'purchase',name:'purchase',properties:{price:12,category:'books',productId:'p1',quantity:2,currency:'USD'}});
});

test('explicit inbound, landing and location facts require their recorded routing fields instead of guessed defaults',()=>{
 const cases=[
  [{kind:'landing_page',landingPageId:'landing-1',interaction:'survey'},'landing_page',{landingPageId:'landing-1',interaction:'survey'}],
  [{kind:'landing_page',interaction:'survey'},'custom',{}],
  [{kind:'inbound',channel:'whatsapp',subscription_group_id:'wa-1',body:'Help',flow_id:'flow-1',contact:true},'inbound',{channel:'whatsapp',subscriptionGroupId:'wa-1',body:'Help',flowId:'flow-1',contact:true}],
  [{kind:'inbound',channel:'unknown',body:'Help'},'custom',{}],
  [{kind:'location',latitude:31.2,longitude:121.5},'location',{latitude:31.2,longitude:121.5}],
  [{kind:'location',latitude:31.2},'custom',{}],
  [{latitude:31.2,longitude:121.5},'custom',{}],
  [{kind:'geofence',geofence_set_id:'set-1',transition:'exit'},'geofence',{geofenceSetId:'set-1',geofenceTransition:'exit'}],
  [{kind:'geofence',geofence_set_id:'set-1'},'custom',{}],
 ];
 for(const [properties,kind,fields] of cases){const event=canvasProfileRuntimeEvent({...base,name:'external-event',properties});assert.equal(event.kind,kind);for(const [key,value] of Object.entries(fields))assert.deepEqual(event[key],value);}
 const sms=canvasProfileRuntimeEvent({...base,name:'inbound_sms',properties:{subscriptionGroupId:'sms-1',keyword_category:'opt_in',body:'YES'}});
 assert.equal(sms.kind,'inbound');assert.equal(sms.channel,'sms');assert.equal(sms.keywordCategory,'opt_in');assert.equal(sms.subscriptionGroupId,'sms-1');
});

const message={...base,campaignId:'campaign-1',channel:'email',event:'clicked'};
test('message normalization excludes preparation, provider acceptance and marked test activity instead of claiming a receipt',()=>{
 for(const event of ['accepted','available','prepared','queued','failed','sent','carrier_sent','unknown'])assert.equal(canvasMessageRuntimeEvent({...message,event}),null,event);
 for(const data of [{test:true},{seed:true},{filtered:'true'},{attributes:{test:1}},{attributes:{simulated:true}},{properties:{bot:true}}])assert.equal(canvasMessageRuntimeEvent({...message,data}),null);
 assert.equal(canvasMessageRuntimeEvent({...message,event:'delivered',data:{delivery:{status:'accepted'}}}),null);
 assert.equal(canvasMessageRuntimeEvent({...message,event:'delivered'})?.interaction,'delivered_email');
 assert.equal(canvasMessageRuntimeEvent({...message,channel:'unknown',event:'opened'}),null);
});

test('message receipts retain authoritative scope, nested targets, machine-open information and the most specific catalog interaction',()=>{
 const scoped=canvasMessageRuntimeEvent({...message,canvasId:'canvas-1',nodeId:'step-1',data:{workspaceId:'forged',userId:'forged',canvasId:'other',nodeId:'other',attributes:{alias:'offer',button_id:1,page_id:'story-1'}}});
 assert.equal(scoped?.workspaceId,'workspace-1');assert.equal(scoped?.userId,'user-1');assert.equal(scoped?.canvasId,'canvas-1');assert.equal(scoped?.stepId,'step-1');assert.equal(scoped?.alias,'offer');assert.equal(scoped?.buttonId,'1');assert.equal(scoped?.pageId,'story-1');assert.equal(scoped?.interaction,'clicked_alias_email');
 const cases=[
  ['email','opened',{},'opened_email'],['email','opened',{attributes:{machine_open:true}},'opened_email_machine'],['email','opened',{machine:false},'opened_email_other'],
  ['push','opened',{},'opened_push'],['push','clicked',{buttonId:'action-1'},'clicked_push_button'],['push','clicked',{attributes:{storyPageId:'page-1'}},'clicked_push_story_page'],
  ['iam','clicked',{button_id:1},'clicked_iam_button_1'],['iam','clicked',{buttonId:'2'},'clicked_iam_button_2'],['iam','clicked',{},'clicked_iam'],
  ['iam','impression',{},'viewed_iam'],['content','impressed',{},'viewed_content_card'],['banner','impression',{},'viewed_banner'],
  ['content','clicked',{},'clicked_content_card'],['banner','clicked',{},'clicked_banner'],['content','dismissed',{},'dismissed_content_card'],['banner','dismissed',{},'dismissed_banner'],
  ['iam','delivered',{sdkEvent:'impression',sdkMessageId:'sdk-1'},'viewed_iam'],['sms','delivered',{},'delivered_sms'],['push','delivered',{},'delivered_push'],['webhook','delivered',{},'delivered_webhook'],
  ['sms','clicked',{},'clicked_sms_link'],['whatsapp','clicked',{},'clicked_whatsapp_link'],['line','clicked',{},'clicked_line_link'],['iam','survey_submitted',{},'submitted_iam_survey'],['email','control',{},'control'],
 ];
 for(const [channel,event,data,want] of cases)assert.equal(canvasMessageRuntimeEvent({...message,channel,event,data})?.interaction,want,JSON.stringify({channel,event,data}));
 const inbound=canvasMessageRuntimeEvent({...message,channel:'sms',event:'replied',data:{attributes:{subscription_group_id:'sms-1',keyword_category:'opt_out',body:'STOP'}}});
 assert.equal(inbound?.kind,'inbound');assert.equal(inbound?.subscriptionGroupId,'sms-1');assert.equal(inbound?.keywordCategory,'opt_out');assert.equal(inbound?.body,'STOP');
 const conversion=canvasMessageRuntimeEvent({...message,event:'conversion',canvasId:'canvas-1'});
 assert.equal(conversion?.kind,'conversion');assert.equal(conversion?.canvasId,'canvas-1');assert.equal(conversion?.interaction,'conversion');
});

test('profile changes detect nested edits and removals while preserving source scope and stable derived event identities',()=>{
 const before={id:'old-id',firstName:'Sam',email:'',workspaceId:'old',attributes:{workspace_id:'old',tier:'silver',address:{city:'SF',country:'US'},deleted:'gone',items:[1,2],same:{a:1,b:2}}};
 const after={id:'new-id',firstName:'Samuel',email:'sam@example.test',workspaceId:'new',attributes:{workspace_id:'new',tier:'gold',address:{city:'NY',country:'US'},items:[2,1],same:{b:2,a:1}}};
 const events=canvasProfileRuntimeChanges(before,after,base),attributes=events.filter(event=>event.kind==='attribute');
 assert.deepEqual(attributes.map(event=>event.attribute),['address','address.city','deleted','email','first_name','items','tier']);
 assert.deepEqual(attributes.find(event=>event.attribute==='address.city')?.previousValue,'SF');assert.deepEqual(attributes.find(event=>event.attribute==='address.city')?.value,'NY');
 const removed=attributes.find(event=>event.attribute==='deleted');assert.equal(removed?.previousValue,'gone');assert.equal(removed?.value,undefined);assert.equal(removed?.properties.removed,true);
 assert.equal(events.filter(event=>event.kind==='email_added').length,1);
 for(const event of events){assert.equal(event.workspaceId,'workspace-1');assert.equal(event.userId,'user-1');}
 assert.equal(new Set(events.map(event=>event.id)).size,events.length);
 assert.deepEqual(canvasProfileRuntimeChanges(before,after,base).map(event=>event.id),events.map(event=>event.id));
 assert.deepEqual(canvasProfileRuntimeChanges(after,after,base),[]);
});

test('profile subscription facts require actual valid state transitions and preserve their explicit update source',()=>{
 const before={emailSubscriptionStatus:'subscribed',attributes:{push_subscription_status:'subscribed',subscriptionGroups:{sms1:{channel:'SMS',state:'subscribed'}}}};
 const after={emailSubscriptionStatus:'opted_in',attributes:{push_subscription_status:'unsubscribed',subscriptionGroups:{sms1:{channel:'SMS',state:'unsubscribed'}}}};
 const events=canvasProfileRuntimeChanges(before,after,{...base,updateSource:'REST API'});
 assert.deepEqual(events.filter(event=>event.kind==='subscription').map(event=>({type:event.subscriptionType,state:event.subscriptionState,source:event.updateSource})),[{type:'email',state:'opted_in',source:'REST API'},{type:'push',state:'unsubscribed',source:'REST API'}]);
 assert.deepEqual(events.filter(event=>event.kind==='subscription_group').map(event=>({group:event.subscriptionGroupId,type:event.subscriptionType,state:event.subscriptionState,source:event.updateSource})),[{group:'sms1',type:'sms',state:'unsubscribed',source:'REST API'}]);
 assert.equal(canvasProfileRuntimeChanges({subscribed:true},{subscribed:false},base).find(event=>event.kind==='subscription')?.subscriptionState,'unsubscribed');
 assert.equal(canvasProfileRuntimeChanges({emailSubscriptionStatus:'subscribed'},{emailSubscriptionStatus:'invalid'},base).filter(event=>event.kind==='subscription').length,0);
});
