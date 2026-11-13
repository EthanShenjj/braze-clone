import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';

const {CampaignMessageEditor}=loadComponent('app/ui/campaign-message-editor.tsx');
const {default:CanvasChannelEditor,CanvasEditorPreview}=loadComponent('app/ui/canvas-channel-editor.tsx');
const sms={id:'canvas_optimizer_sms',name:'SMS Optimizer',channel:'sms',body:'Primary SMS',config:{workspaceId:'local',subscriptionGroupId:'sg_sms',smsVariants:[{id:'sms_a',name:'Primary',body:'Primary SMS'},{id:'sms_b',name:'Second',body:'Second SMS',values:{messageType:'MMS',mediaUrl:'https://example.com/image.png'}}],previewVariantId:'sms_b'}};

// A wrong editor branch must fail on the actual controls visible to the user.
test('SMS renders the real MMS composer and selected variant instead of LINE',()=>{
  const html=renderToStaticMarkup(React.createElement(CampaignMessageEditor,{draft:sms,update:()=>{}}));
  assert.match(html,/SMS\/MMS\/RCS Composer/);
  assert.match(html,/Subscription Group/);
  assert.match(html,/<textarea[^>]*>Second SMS<\/textarea>/);
  assert.match(html,/Image URL|Media URL|Image\/GIF|Media/);
  assert.doesNotMatch(html,/LINE subscription group|LINE Composer/);
});

test('stored SMS Optimizer keeps its setup tabs and real SMS composer together',()=>{
  const node={id:'optimizer_sms',kind:'optimizer',label:'SMS Optimizer',x:0,y:0,config:{...sms.config,channel:'sms',message:sms.body}};
  const html=renderToStaticMarkup(React.createElement(CanvasChannelEditor,{node,canvasId:'canvas_one',workspaceId:'local',locale:'en',connected:true,onDone:()=>{},onChannel:()=>{}}));
  for(const text of ['Content Optimizer setup','Messaging channels','Delivery settings','Content Optimizer settings','Agentic Standards results','SMS/MMS/RCS Composer','Contact Card Generator','Second SMS'])assert.ok(html.includes(text),`${text} should render`);
  assert.match(html,/<button[^>]*>Done<\/button>/);
  assert.match(html,/id="sms-message-optimizer_sms"/);
  assert.doesNotMatch(html,/LINE subscription group|LINE Composer/);
});

// Catch previewing the primary mirror instead of the variant the user requested.
test('Canvas test preview renders the requested push variant including its own platform values',()=>{
  const draft={channel:'push',subject:'Stale primary title',body:'Stale primary body',config:{previewVariantId:'a',messageVariants:[{id:'a',name:'First',subject:'Title A',body:'Body A'},{id:'b',name:'Second',subject:'Title B',body:'Body B',config:{channelValues:{platforms:['Android']}}}]}};
  const html=renderToStaticMarkup(React.createElement(CanvasEditorPreview,{draft,variantId:'b'}));
  assert.match(html,/Title B/);
  assert.match(html,/Body B/);
  assert.match(html,/Android/);
  assert.doesNotMatch(html,/Stale primary|Title A|Body A/);
});

test('Canvas preview falls back to the current selected variant when no request ID is provided',()=>{
  const html=renderToStaticMarkup(React.createElement(CanvasEditorPreview,{draft:sms}));
  assert.match(html,/Second SMS/);
  assert.match(html,/https:\/\/example.com\/image.png/);
  assert.doesNotMatch(html,/Primary SMS/);
});
