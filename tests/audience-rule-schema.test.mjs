import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceFilterCatalog,otherAudienceFilters } from '../lib/campaign-filter-catalog.ts';
import { audienceKeywordCategories,audienceReceivedField,audienceRuleDefinition,createAudienceRule,audienceLocaleOptions,audienceMultiValues } from '../lib/audience-rule-schema.ts';

const leaves=rows=>rows.flatMap(row=>row.children?.length?leaves(row.children):[row]);
test('every static catalog condition is selectable and no resource becomes a condition type',()=>{
 assert.equal(audienceFilterCatalog.length,16);
 for(const row of leaves([...audienceFilterCatalog.flatMap(category=>category.fields),...otherAudienceFilters])){
  assert.ok(row.field,`${row.label} has a real field`);
  assert.equal(row.unavailable,undefined);
  assert.equal(row.requiresAttribute,undefined);
  assert.equal(row.dynamic,undefined);
  const definition=audienceRuleDefinition(row.field);
  assert.equal(definition.label,row.label);
  assert.ok(definition.operators.length);
  assert.equal(createAudienceRule(row.field,'test').field,row.field);
 }
 assert.deepEqual(audienceFilterCatalog[0].fields.map(row=>[row.label,row.field]),[
  ['Segment Membership','membership:segment'],['Braze Segment Extensions','membership:extension'],['Updated/Imported from CSV','membership:csv']]);
});
test('SMS exposes the current source conditions rather than a generic attribute',()=>{
 const sms=audienceFilterCatalog.find(category=>category.name==='Retargeting').fields.find(choice=>choice.label==='SMS');
 assert.equal(sms.field,undefined);
 assert.deepEqual(sms.children.map(choice=>[choice.label,choice.field]),[
  ['Invalid Phone Number','attr:invalid_phone_number'],['Phone Number','attr:phone'],['Last Sent Specific Inbound Keyword Category','inbound_sms_keyword_last']]);
 assert.equal(audienceRuleDefinition('inbound_sms_keyword_last').kind,'date');
 assert.equal(createAudienceRule('inbound_sms_keyword_last','keyword').value,'');
 assert.deepEqual(audienceKeywordCategories,[{id:'opt_in',label:'Opt-in'},{id:'opt_out',label:'Opt-out'},{id:'help',label:'Help'}]);
});
test('membership comparisons express included semantics without an editable boolean value',()=>{
 for(const field of ['membership:segment','membership:extension','membership:csv','cohort:amplitude','segment:legacy']){
  assert.deepEqual(audienceRuleDefinition(field).operators,[{id:'equals',label:'Included'},{id:'not_equals',label:'Not included'}]);
  assert.equal(createAudienceRule(field,'member').value,'true');
 }
});
test('Session Count uses the source count comparison, label and default',()=>{
 const definition=audienceRuleDefinition('session_count');
 assert.deepEqual(definition.operators.map(option=>option.label),['exactly','more than','less than']);
 assert.equal(definition.valueLabel,'Session Count');
 assert.equal(createAudienceRule('session_count','session').value,'1');
});
test('campaign received condition uses Received boolean semantics over a real receipt count',()=>{
 assert.equal(audienceReceivedField('receipt_count:delivered:'),true);
 assert.equal(audienceReceivedField('receipt_count:engaged:'),false);
 assert.equal(createAudienceRule('receipt_count:engaged:','engaged').tagInteraction,'');
 assert.equal(createAudienceRule('canvas_receipt_count:engaged','canvas-engaged').tagInteraction,'');
 assert.deepEqual(audienceRuleDefinition('receipt_count:delivered:').operators,[{id:'greater_than',label:'true'},{id:'equals',label:'false'}]);
 const rule=createAudienceRule('receipt_count:delivered:campaign','received');
 assert.equal(rule.operator,'greater_than');
 assert.equal(rule.value,'0');
});
test('source verified Country options have 250 stable codes and the exact six comparisons',()=>{
 const country=audienceRuleDefinition('country');
 assert.equal(country.kind,'enum');
 assert.deepEqual(country.operators.map(option=>option.label),['is','is not','is not blank','is blank','is any of','is none of']);
 const options=audienceLocaleOptions('country');
 assert.equal(options.length,250);
 assert.equal(new Set(options.map(option=>option.id)).size,250);
 assert.deepEqual(options.slice(0,4).map(option=>option.label),['Afghanistan','Aland Islands','Albania','Algeria']);
 assert.equal(options.find(option=>option.id==='US')?.label,'United States');
});
test('source verified age and date conditions have their own comparisons and defaults',()=>{
 assert.deepEqual(audienceRuleDefinition('age').operators.map(option=>option.label),['exactly','older than','younger than']);
 assert.equal(createAudienceRule('age','a').value,'18');
 assert.deepEqual(audienceRuleDefinition('created_at').operators.map(option=>option.label),['after','less than','before','more than']);
 assert.match(createAudienceRule('created_at','d').value,/^\d{4}-\d{2}-\d{2}$/);
});
test('resource conditions retain semantic types even before any resources are selected',()=>{
 const types={
  'membership:csv':'boolean','cohort:decisioning_studio_agent':'boolean','push_app_enabled':'boolean','canvas_entered':'boolean',landing_form:'boolean',
  'receipt_count:delivered:':'number','feature_variant::':'number','receipt_alias_any:':'number','canvas_receipt_count:engaged':'number','survey_submitted:canvas':'number',
  'canvas_receipt_last:delivered':'date','session_app_first:':'date',location_recent:'geo',message_open_likelihood:'enum',
 };
 for(const [field,kind] of Object.entries(types))assert.equal(audienceRuleDefinition(field).kind,kind,field);
 assert.equal(audienceRuleDefinition('receipt_count:delivered:campaign-123').label,'Received Message from Campaign');
 assert.equal(audienceRuleDefinition('session_app_first:app-123').label,'First Used Specific App');
 assert.equal(audienceRuleDefinition('feature_variant:flag-123:variant-123').label,'Received Feature Flag Variant');
 assert.equal(audienceRuleDefinition('attr:score','number').kind,'number');
 assert.equal(audienceRuleDefinition('attr:last_order','date').kind,'date');
});
test('multivalues preserve embedded commas and roundtrip structured selections',()=>{
 const values=['United States','Bonaire, Sint Eustatius, and Saba','a"b'];
 assert.deepEqual(audienceMultiValues(JSON.stringify(values)),values);
 assert.deepEqual(audienceMultiValues('US'),['US']);
 assert.deepEqual(audienceMultiValues(''),[]);
});
