import test from 'node:test';
import assert from 'node:assert/strict';
import {smsPersonalizationTypes,smsCampaignAttributes,smsWhatsAppProperties,smsPersonalizationSnippet,normalizeSmsSnapshot,compileSmsSnapshot,smsProfile,smsComposeEstimate,smsCapabilityIssues,splitSmsRecipients} from '../lib/sms-composer-model.ts';
import {canvasSmsDeliveryTime,popularCanvasSmsTime} from '../lib/canvas-sms-runtime.ts';
const snapshot=(message,values={})=>({message,subscriptionGroupId:'sms-group',values});
test('SMS personalizations retain all sixteen captured types and their namespaces',()=>{
 assert.equal(smsPersonalizationTypes.length,16);
 assert.equal(smsPersonalizationSnippet('API Trigger Properties','offer','friend'),"{{api_trigger_properties.${offer} | default: 'friend'}}");
 assert.equal(smsPersonalizationSnippet('Nested Custom Attributes','account','',{path:'orders[0].name'}),'{{custom_attribute.${account}.orders[0].name}}');
 assert.equal(smsPersonalizationSnippet('SMS Properties','inbound_message_body'),'{{sms.${inbound_message_body}}}');
 assert.equal(smsPersonalizationSnippet('Catalog Items','Products','',{itemIds:'one, two'}),'{% catalog_items "Products" "one" "two" %}');
 assert.equal(smsPersonalizationSnippet('Message Extras','source','',{value:'sms'}),'{% message_extras :key source :value sms %}');
});
test('compose, test and delivery share opt-out, personalization, short links and encoding',()=>{
 const draft=snapshot("Hi {{${first_name}}} https://example.com/offers.");
 const result=compileSmsSnapshot(draft,{first_name:'Ada'},()=> 'https://brz.ai/XXXXXXXX');
 assert.equal(result.message,'Hi Ada https://brz.ai/XXXXXXXX.');assert.doesNotMatch(result.message,/STOP/);
 const legacy=compileSmsSnapshot({...draft,values:{appendStop:true,stopText:'Reply STOP to leave.'}},{first_name:'Ada'});
 assert.match(legacy.message,/Reply STOP to leave\.$/);
 assert.equal(compileSmsSnapshot(snapshot('😀'.repeat(40))).metrics.encoding,'UCS-2');
 assert.throws(()=>compileSmsSnapshot(snapshot('{{${long}}}'),{long:'a'.repeat(1601)}),/after personalization/);
});
test('resource snippets render with the selected workspace context and preserve extras',()=>{
 const source="{{content_blocks.${greeting}}} {{campaign.${name}}} {{sms.${inbound_message_body}}} {% message_extras :key flow :value welcome %}";
 const result=compileSmsSnapshot(snapshot(source),{first_name:'Ada'},undefined,{content_blocks:{greeting:'Hi {{${first_name}}}'},campaign:{name:'Launch'},sms:{inbound_message_body:'YES'}});
 assert.equal(result.message.trim(),'Hi Ada Launch YES');assert.deepEqual(result.extras,{flow:'welcome'});
 assert.throws(()=>compileSmsSnapshot(snapshot('{{content_blocks.${missing}}}')),/unavailable/);
 assert.throws(()=>compileSmsSnapshot(snapshot('{{content_blocks.${loop}}}'),{},undefined,{content_blocks:{loop:'{{content_blocks.${loop}}}'}}),/circular/);
 const catalog=compileSmsSnapshot(snapshot('{% catalog_items "Products" "sku1" %}{{items[0].name}}'),{},undefined,{__catalogs:{Products:[{id:'sku1',name:'Shoes'}]}});assert.equal(catalog.message,'Shoes');
});
test('rich messages require group capability and snapshot rejects malformed settings',()=>{
 assert.match(smsCapabilityIssues(snapshot('Hello',{messageType:'MMS',mediaUrl:'https://example.com/image.png'}),{id:'sms-group',name:'SMS',channel:'SMS',capabilities:{sms:true}}).join(' '),/does not support MMS/);
 assert.deepEqual(smsCapabilityIssues(snapshot('',{messageType:'MMS',mediaUrl:'https://example.com/image.png'}),{id:'sms-group',name:'MMS',channel:'SMS',capabilities:{mms:true}}),[]);
 assert.throws(()=>normalizeSmsSnapshot({message:'Hi',subscriptionGroupId:'g',values:[]}),/settings/);
 assert.equal(smsProfile({id:'u',firstName:'Ada',email:'a@example.com',country:'US',attributes:{phone:'+12025550101'}}).phone_number,'+12025550101');
 assert.deepEqual(splitSmsRecipients(['one\ntwo','three;four']),['one','two','three','four']);
});
test('Canvas Intelligent Timing honors local optimal hour, custom fallback and next local day',()=>{
 assert.equal(canvasSmsDeliveryTime({intelligentTiming:true,timingFallback:'custom',timingTime:'15:30'},'2026-11-12T00:00:00.000Z',{timezone:'Asia/Shanghai'}),'2026-11-12T07:30:00.000Z');
 assert.equal(canvasSmsDeliveryTime({intelligentTiming:true,timingFallback:'custom',timingTime:'15:30'},'2026-11-12T08:00:00.000Z',{timezone:'Asia/Shanghai'}),'2026-11-13T07:30:00.000Z');
 assert.equal(canvasSmsDeliveryTime({intelligentTiming:true,timingFallback:'custom',timingTime:'15:30'},'2026-11-12T00:00:00.000Z',{timezone:'Asia/Shanghai',best_send_hour:10}),'2026-11-12T02:00:00.000Z');
 assert.equal(canvasSmsDeliveryTime({},'2026-11-12T08:00:00.000Z',{}),'2026-11-12T08:00:00.000Z');
 assert.throws(()=>canvasSmsDeliveryTime({intelligentTiming:true,timingFallback:'custom',timingTime:'25:30'},'2026-11-12T08:00:00.000Z',{}),/fallback/);
});
test('popular fallback considers only the supplied workspace profiles',()=>{
 const profiles=[{id:'a',attributes:{timezone:'UTC'}},{id:'b',attributes:{best_send_hour:8}}];
 assert.equal(popularCanvasSmsTime(profiles,[{userId:'other-workspace',at:'2026-11-12T20:00:00Z'},{userId:'a',at:'2026-11-12T09:00:00Z'}]),'09:00');
 assert.equal(popularCanvasSmsTime(profiles,[]),'08:00');
});

test('source compose estimate excludes Liquid and matches the captured 158-character example',()=>{
 const source="Thanks for being a loyal customer, {{${first_name} | default: 'aficionado'}}! Your reward for being so loyal? Early access to our limited edition sale: https://www.braze.com/\n\nReply STOP to opt-out.";
 const estimate=smsComposeEstimate(source);assert.equal(estimate.characters,158);assert.equal(estimate.segments,1);assert.equal(estimate.dynamic,true);assert.equal(compileSmsSnapshot(snapshot(source)).metrics.segments,2);
});

test('modern and legacy Intelligent Timing settings produce the same due time',()=>{
 const at='2026-11-12T00:00:00.000Z',profile={timezone:'Asia/Shanghai'};assert.equal(canvasSmsDeliveryTime({intelligentTiming:true,intelligentFallback:'custom',intelligentFallbackTime:'15:30'},at,profile),canvasSmsDeliveryTime({intelligentTiming:true,timingFallback:'custom',timingTime:'15:30'},at,profile));
});

test('captured Campaign and WhatsApp property lists and namespace match Braze',()=>{
 assert.deepEqual(smsCampaignAttributes,['name','api_id','message_name','message_api_id','dispatch_id']);assert.equal(smsWhatsAppProperties.length,10);assert.equal(smsWhatsAppProperties.includes('inbound_phone_number'),false);assert.equal(smsPersonalizationSnippet('WhatsApp Properties','inbound_flow_response'),'{{whats_app.${inbound_flow_response}}}');
 const rendered=compileSmsSnapshot(snapshot('{{whats_app.${inbound_profile_name}}}'),{},undefined,{whats_app:{inbound_profile_name:'Ada'}});assert.equal(rendered.message,'Ada');
});

test('switching an MMS draft back to SMS does not send its retained media attachment',()=>{
 const result=compileSmsSnapshot(snapshot('Text only',{messageType:'SMS',mediaUrl:'https://example.test/contact.vcf',mediaType:'vcard'}));assert.equal(result.type,'SMS');assert.equal(result.mediaUrl,'');assert.equal(result.message,'Text only');
});

test('empty language branches cannot send a blank SMS or an MMS without media',()=>{
 assert.throws(()=>compileSmsSnapshot(snapshot("{% if ${language} == 'en' %}{% else %}{% endif %}"),{language:'en'}),/rendered SMS message is empty/);
 assert.throws(()=>compileSmsSnapshot(snapshot('Caption',{messageType:'MMS',mediaUrl:'{{${image}}}'}),{}),/rendered MMS media is empty/);
});
