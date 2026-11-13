import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';

const {default:CanvasEntryTriggerDetails,CanvasEntryTriggerDetailRows}=loadComponent('app/ui/canvas-entry-trigger-details.tsx');
const {default:CanvasActionTriggerFields}=loadComponent('app/ui/canvas-action-trigger-fields.tsx');
function elements(node){return Array.isArray(node)?node.flatMap(elements):React.isValidElement(node)?[node,...elements(node.props.children)]:[];}

test('selected entry types render the shared detailed trigger fields and keep entry-only types',()=>{
  const html=renderToStaticMarkup(React.createElement(CanvasEntryTriggerDetails,{workspaceId:'local',types:['Perform Custom Event','Start Session','Perform Back in Stock Event','Perform Price Drop Event','Perform Exception Event For Campaign'],details:[{id:'session',type:'Start Session',specificApp:true}],onChange:()=>{}}));
  for(const text of ['Custom event name','Start session in a specific app','Perform Back in Stock Event','Perform Price Drop Event','Perform Exception Event For Campaign'])assert.ok(html.includes(text),`${text} should render`);
  assert.doesNotMatch(html,/Select Trigger|Add Trigger/);
});

test('changing one entry trigger preserves other selected trigger details and drops removed types',()=>{
  const details=[{id:'custom',type:'Perform Custom Event',eventName:'Before',propertiesEnabled:true,propertyFilters:[]},{id:'session',type:'Start Session',specificApp:true,appId:'app_ios'},{id:'extra',type:'Perform Price Drop Event'},{id:'removed',type:'Add an Email Address'}];
  let saved;
  const tree=CanvasEntryTriggerDetailRows({types:['Perform Custom Event','Start Session','Perform Price Drop Event'],details,capabilities:null,onChange:value=>{saved=value;}});
  const fields=elements(tree).filter(element=>element.type===CanvasActionTriggerFields);
  fields.find(element=>element.props.trigger.type==='Perform Custom Event').props.change({eventName:'Paid order'});
  assert.deepEqual(saved,[{id:'custom',type:'Perform Custom Event',eventName:'Paid order',propertiesEnabled:true,propertyFilters:[]},{id:'session',type:'Start Session',specificApp:true,appId:'app_ios'},{id:'extra',type:'Perform Price Drop Event'}]);
  assert.equal(details[0].eventName,'Before');
});

test('editing a selected entry type also preserves fieldless newly selected types',()=>{
  let saved;
  const tree=CanvasEntryTriggerDetailRows({types:['Start Session','Perform Back in Stock Event'],details:[],capabilities:null,onChange:value=>{saved=value;}});
  const field=elements(tree).find(element=>element.type===CanvasActionTriggerFields&&element.props.trigger.type==='Start Session');
  field.props.change({specificApp:true,appId:'app_android'});
  assert.equal(saved.length,2);
  assert.equal(saved[0].specificApp,true);
  assert.equal(saved[0].appId,'app_android');
  assert.equal(saved[1].type,'Perform Back in Stock Event');
  assert.ok(saved[1].id);
});
test('exit exceptions expose the actual custom-event fields and preserve their narrowed event name',()=>{
 const details=[{id:'exit_checkout',type:'Perform Custom Event',eventName:'checkout'}],html=renderToStaticMarkup(React.createElement(CanvasEntryTriggerDetailRows,{capabilities:{events:['checkout'],campaigns:[],canvases:[]},scope:'exit',types:['Perform Custom Event'],details,onChange:()=>{}}));
 assert.match(html,/Perform Custom Event exit trigger/);assert.match(html,/Custom event name/);assert.match(html,/checkout/);
});
