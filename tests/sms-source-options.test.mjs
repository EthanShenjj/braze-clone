import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {smsDefaultAttributes,smsDeviceAttributes,smsCampaignAttributes,smsProperties,smsWhatsAppProperties} from '../lib/sms-composer-model.ts';
import {smsLanguages} from '../lib/sms-model.ts';
test('SMS option lists equal the independently captured Braze menus, including order',()=>{
 // DOM snapshots quote the entire role token when a label contains Liquid syntax.
 const options=file=>[...readFileSync(new URL('../docs/audits/sms-restoration-2026-11-12/'+file+'.dom.txt',import.meta.url),'utf8').matchAll(/^\s*- '?option "([^"]+)"/gm)].map(match=>match[1]);
 for(const [file,actual]of [
  ['source-options-default-attributes',smsDefaultAttributes],
  ['source-options-most-recent-device-attributes',smsDeviceAttributes],
  ['source-campaign-attribute-options',smsCampaignAttributes],
  ['source-options-sms-properties',smsProperties],
  ['source-options-whatsapp-properties',smsWhatsAppProperties],
  ['source-language-options',['Select all languages',...smsLanguages.map(([,label])=>label)]],
 ])assert.deepEqual(actual,options(file),file);
});
