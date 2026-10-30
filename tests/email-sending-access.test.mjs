import { test } from 'node:test';
import { deepEqual, equal } from 'node:assert/strict';
import { emailSendingCapabilities } from '../lib/email-sending-access.ts';

test('limited campaigns retain listed reply/BCC choice while identities and custom reply are readonly', () => {
  deepEqual(emailSendingCapabilities(undefined), {from:false,ipPool:false,replyTo:true,bcc:true,customReplyTo:false});
  deepEqual(emailSendingCapabilities({access:'limited'}), emailSendingCapabilities(undefined));
});
test('full access and field-specific capabilities resolve independently', () => {
  deepEqual(emailSendingCapabilities({access:'full'}), {from:true,ipPool:true,replyTo:true,bcc:true,customReplyTo:true});
  deepEqual(emailSendingCapabilities({emailSendingCapabilities:{from:true,bcc:false}}), {from:true,ipPool:false,replyTo:true,bcc:false,customReplyTo:false});
  equal(emailSendingCapabilities({access:'full',emailSendingCapabilities:{ipPool:false,from:'true'}}).ipPool,false);
});
test('listed-address policy and disabled reply editing cannot be bypassed by custom-reply capability', () => {
  equal(emailSendingCapabilities({access:'full',emailSendingCapabilities:{customReplyTo:true}},true).customReplyTo,false);
  equal(emailSendingCapabilities({access:'full',emailSendingCapabilities:{replyTo:false,customReplyTo:true}}).customReplyTo,false);
});
