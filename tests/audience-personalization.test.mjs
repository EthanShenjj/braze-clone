import test from 'node:test';
import assert from 'node:assert/strict';
import {audiencePersonalizationTypes,audienceDefaultAttributes,audienceDeviceAttributes,audienceSmsProperties,audiencePersonalizationSnippet} from '../lib/audience-personalization-model.ts';
import {renderBrazeLiquid} from '../lib/email-liquid.ts';
test('source personalization choices and generated SMS/default/nested snippets render their actual context',()=>{
 assert.equal(audiencePersonalizationTypes.length,10);assert.equal(audienceDefaultAttributes.length,19);assert.equal(audienceDeviceAttributes.length,14);assert.equal(audienceSmsProperties.length,3);
 assert.equal(renderBrazeLiquid(audiencePersonalizationSnippet('Default Attributes','first_name'),{first_name:'Ada'}),'Ada');
 assert.equal(renderBrazeLiquid(audiencePersonalizationSnippet('Default Attributes','first_name',"O'Reilly"),{}),"O'Reilly");
 assert.equal(renderBrazeLiquid(audiencePersonalizationSnippet('Nested Custom Attributes','profile','','address.city'),{attributes:{profile:{address:{city:'London'}}}}),'London');
 const inbound=audiencePersonalizationSnippet('SMS Properties','inbound_message_body');assert.equal(inbound,'{{sms.${inbound_message_body}}}');assert.equal(renderBrazeLiquid(inbound,{}, {sms:{inbound_message_body:'START'}}),'START');
 assert.equal(renderBrazeLiquid(audiencePersonalizationSnippet('Most Recent Device Attributes','model'),{}, {most_recently_used_device:{model:'Known device'}}),'Known device');
 assert.equal(renderBrazeLiquid('{{sms.subscribed_state.${known_group}}}',{}, {sms:{subscribed_state:{known_group:'subscribed'}}}),'subscribed');
});
