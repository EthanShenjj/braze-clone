import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { apiCampaignChannels, apiCampaignIssues, apiCampaignReceiptExample, apiCampaignSendExample, featureExperimentIssues, featureExperimentPatch, normalizeApiCampaign, normalizeFeatureExperiment, parseFeatureProperties, specialUuid, updateFeaturePercentages } from '../lib/special-campaign-model.ts';
import { evaluateFlag } from '../lib/workspace-modules.ts';
const makeIds=()=>{let id=0;return ()=>`12345678-1234-4123-8123-${String(++id).padStart(12,'0')}`;};
const flag={id:'resource',name:'New Checkout',status:'Active',data:{flagId:'new_checkout',enabled:true,rollout:0,properties:{color:'blue',nested:{key:true}},rules:[]}};
const experiment={flagId:'new_checkout',variants:[{id:'a',name:'A',percentage:40,properties:{color:'red'}},{id:'b',name:'B',percentage:60,properties:{color:'green'}}]};
test('API channel catalog contains nine distinct entries with separate push platforms',()=>{
 assert.equal(apiCampaignChannels.length,9);assert.equal(new Set(apiCampaignChannels.map(row=>row.key)).size,9);
 for(const key of ['android_push','apple_push','kindle_push','web_push'])assert.ok(apiCampaignChannels.some(row=>row.key===key));
});
test('new API campaigns generate UUID identifiers once and retain them on JSON roundtrip',()=>{
 const initial=normalizeApiCampaign({channel:'api'},makeIds());assert.ok(specialUuid(initial.identifier));assert.ok(specialUuid(initial.variations[0].id));
 const campaign=JSON.parse(JSON.stringify({channel:'api',config:{apiIdentifier:initial.identifier,apiMessageVariations:initial.variations}}));assert.deepEqual(normalizeApiCampaign(campaign,()=>{throw Error('must not regenerate');}),initial);
});
test('API variations preserve legacy identities and metadata rather than regenerating external references',()=>{
 const value=normalizeApiCampaign({channel:'api',config:{apiIdentifier:'12345678-1234-4123-8123-000000000001',apiMessageVariations:[{id:'email-3740',name:'Original',channel:'email',metadata:{retained:true}}]}},()=>{throw Error('must retain ID');});
 assert.equal(value.variations[0].id,'email-3740');assert.deepEqual(value.variations[0].metadata,{retained:true});
});
test('reference and real local receipt JSON preserve the chosen variation and do not pretend to send',()=>{
 const variation={id:'variation',channel:'android_push',name:'A'};
 assert.deepEqual(apiCampaignSendExample('campaign',variation),{campaign_id:'campaign',external_user_ids:['EXTERNAL_USER_ID'],messages:{android_push:{message_variation_id:'variation'}}});
 assert.deepEqual(apiCampaignReceiptExample(variation),{userId:'EXTERNAL_USER_ID',event:'delivered',attributes:{variantId:'variation',channel:'android_push'}});
 assert.doesNotThrow(()=>JSON.parse(JSON.stringify(apiCampaignSendExample('campaign',variation))));
});
test('API validation accepts source zero-minute re-entry and rejects duplicate IDs/bad limits',()=>{
 const draft={channel:'api',name:'API',config:{delivery:{reeligible:true,reentryValue:0}}},variation={id:'v',channel:'email',name:'A'};
 assert.deepEqual(apiCampaignIssues(draft,[variation]),[]);assert.ok(apiCampaignIssues(draft,[variation,variation]).length);assert.ok(apiCampaignIssues({...draft,config:{rateLimitEnabled:true,rateLimit:0}},[variation]).length);
});
test('legacy feature flag/body properties migrate without altering unrelated config',()=>{
 const draft={channel:'feature',subject:'new_checkout',body:'{"color":"red"}',config:{retained:{yes:true}}};
 const normalized=normalizeFeatureExperiment(draft,makeIds());assert.equal(normalized.flagId,'new_checkout');assert.deepEqual(normalized.variants[0].properties,{color:'red'});assert.equal(normalized.variants[0].percentage,100);
 assert.deepEqual(featureExperimentPatch(draft,normalized).config.retained,{yes:true});
});
test('an unselected one-variant draft can be represented and saved, but readiness remains invalid',()=>{
 const draft={channel:'feature',name:'Draft',config:{}},normalized=normalizeFeatureExperiment(draft,makeIds()),patch=featureExperimentPatch(draft,normalized);
 assert.equal(patch.subject,'');assert.equal(patch.config.featureExperiment.variants.length,1);assert.ok(featureExperimentIssues(normalized,[]).some(issue=>issue.includes('Feature Flag')));assert.ok(featureExperimentIssues(normalized,[]).some(issue=>issue.includes('2 and 8')));
});
test('property JSON constraints match the actual flag property object contract',()=>{
 assert.deepEqual(parseFeatureProperties('{"enabled":true,"price":10,"nested":{"x":[1,2]}}'),{enabled:true,price:10,nested:{x:[1,2]}});
 for(const source of ['[]','null','"value"','{bad',JSON.stringify({long:'x'.repeat(10001)})])assert.throws(()=>parseFeatureProperties(source));
});
test('feature readiness checks flag availability/global rollout, IDs, names and distribution',()=>{
 assert.deepEqual(featureExperimentIssues(experiment,[flag]),[]);
 assert.ok(featureExperimentIssues(experiment,[{...flag,status:'Archived'}]).length);assert.ok(featureExperimentIssues(experiment,[{...flag,data:{...flag.data,rollout:10}}]).length);
 assert.ok(featureExperimentIssues({...experiment,variants:[experiment.variants[0],experiment.variants[0]]},[flag]).length);
 assert.ok(featureExperimentIssues({...experiment,variants:experiment.variants.map(row=>({...row,percentage:10}))},[flag]).length);
});
test('canonical feature config roundtrips and mirrors treatment percentages with a separate control group',()=>{
 const draft={channel:'feature',name:'Experiment',config:{controlGroup:20,channelValues:{keep:'value'},tags:['tag']}},patch=featureExperimentPatch(draft,experiment);
 assert.deepEqual(patch.config.variantSplits,[32,48]);assert.equal(patch.config.controlGroup,20);assert.equal(patch.config.channelValues.keep,'value');assert.equal(patch.config.channelValues.rollout,100);assert.equal(patch.schedule,'One time');
 assert.deepEqual(normalizeFeatureExperiment(JSON.parse(JSON.stringify({...draft,...patch}))),experiment);
 assert.deepEqual(updateFeaturePercentages(experiment,[25,75]).variants.map(row=>row.percentage),[25,75]);
});
test('flag properties are merged for experiment assignments without mutating the flag resource',()=>{
 const before=JSON.stringify(flag),resolved=evaluateFlag(flag.data,{id:'user1'});assert.equal(resolved.enabled,false);
 const merged={...resolved.properties,...experiment.variants[0].properties};assert.equal(merged.color,'red');assert.deepEqual(merged.nested,{key:true});assert.equal(JSON.stringify(flag),before);
});
test('multiple legacy feature variants migrate without losing identities, property overrides or treatment ratios',()=>{
 const draft={channel:'feature',subject:'new_checkout',body:'{"color":"primary"}',config:{controlGroup:20,variantSplits:[32,48],messageVariants:[{id:'old-a',name:'Original A',body:'{"color":"red"}',metadata:{keep:true}},{id:'old-b',name:'Original B',body:'{"color":"green"}'}]}};
 const value=normalizeFeatureExperiment(draft,()=>{throw Error('must retain existing variants');});assert.deepEqual(value.variants.map(row=>[row.id,row.percentage,row.properties.color]),[['old-a',40,'red'],['old-b',60,'green']]);assert.deepEqual(value.variants[0].metadata,{keep:true});
});
