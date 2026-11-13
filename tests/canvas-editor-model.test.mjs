import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasEditorSmsUpdate} from '../lib/canvas-editor-model.ts';
import {variantDraft} from '../lib/campaign-shared.ts';
import {compileSmsSnapshot} from '../lib/sms-composer-model.ts';

// Catch stale legacy `values` overriding edits that MessageVariants stores in config.
test('editing an SMS variant persists MMS values, SMS subscription group and unrelated optimizer settings',()=>{
  const draft={channel:'sms',body:'First SMS',config:{optimizationEvent:'clicks',subscriptionGroupId:'old_group',channelValues:{messageType:'SMS'},smsVariants:[{id:'a',name:'First',body:'First SMS',values:{messageType:'SMS'}},{id:'b',name:'Second',body:'Before',values:{messageType:'SMS'}}]}};
  const patch=canvasEditorSmsUpdate(draft,{config:{...draft.config,subscriptionGroupId:'sms_marketing',previewVariantId:'b',smsVariants:[draft.config.smsVariants[0],{...draft.config.smsVariants[1],body:'Changed MMS',config:{channelValues:{messageType:'MMS',mediaUrl:'https://example.com/photo.png',appendStop:false}}}]}});
  const saved={...draft,...patch},selected=variantDraft(saved,1);
  assert.equal(saved.body,'First SMS');
  assert.equal(saved.config.optimizationEvent,'clicks');
  assert.equal(saved.config.subscriptionGroupId,'sms_marketing');
  assert.equal(saved.config.channelValues.messageType,'SMS');
  assert.equal(selected.body,'Changed MMS');
  assert.equal(selected.config.channelValues.messageType,'MMS');
  const compiled=compileSmsSnapshot({message:selected.body,subscriptionGroupId:selected.config.subscriptionGroupId,values:selected.config.channelValues});
  assert.equal(compiled.message,'Changed MMS');
  assert.equal(compiled.mediaUrl,'https://example.com/photo.png');
  assert.equal(draft.config.smsVariants[1].body,'Before');
});

test('legacy SMS variants inherit their primary MMS settings when selecting a variant',()=>{
  const draft={channel:'sms',body:'Image caption',config:{subscriptionGroupId:'sms_marketing',channelValues:{messageType:'MMS',mediaUrl:'https://example.com/inherited.png',appendStop:false},smsVariants:[{id:'a',name:'First',body:'Image caption'},{id:'b',name:'Second',body:'Second caption'}]}};
  const patch=canvasEditorSmsUpdate(draft,{config:{...draft.config,previewVariantId:'b'}});
  const selected=variantDraft({...draft,...patch},1);
  const compiled=compileSmsSnapshot({message:selected.body,subscriptionGroupId:selected.config.subscriptionGroupId,values:selected.config.channelValues});
  assert.equal(compiled.type,'MMS');
  assert.equal(compiled.mediaUrl,'https://example.com/inherited.png');
  assert.equal(compiled.message,'Second caption');
});

test('SMS subscription group remains shared across variants and saved variants do not embed their siblings',()=>{
  const draft={channel:'sms',body:'First',config:{subscriptionGroupId:'old_sms',smsVariants:[{id:'a',name:'First',body:'First',config:{subscriptionGroupId:'old_sms',channelValues:{messageType:'SMS'}}},{id:'b',name:'Second',body:'Second'}]}};
  const patch=canvasEditorSmsUpdate(draft,{config:{...draft.config,subscriptionGroupId:'new_sms',smsVariants:[draft.config.smsVariants[0],{...draft.config.smsVariants[1],config:{subscriptionGroupId:'new_sms',smsVariants:draft.config.smsVariants,channelValues:{messageType:'SMS'}}}]}});
  const saved={...draft,...patch};
  assert.equal(variantDraft(saved,0).config.subscriptionGroupId,'new_sms');
  assert.equal(variantDraft(saved,1).config.subscriptionGroupId,'new_sms');
  assert.equal(saved.config.smsVariants[1].config.smsVariants,undefined);
});
