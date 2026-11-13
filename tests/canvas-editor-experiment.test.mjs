import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';

const {default:CanvasExperimentSettings}=loadComponent('app/ui/canvas-editor-experiment-settings.tsx');
const {default:CanvasStepEditor}=loadComponent('app/ui/canvas-step-editor.tsx');
const paths=[{id:'a',name:'Path 1',weight:70,nextNodeId:'one'},{id:'b',name:'Path 2',weight:30,nextNodeId:'two'}];
const conversionEvents=[{id:'paid_order',type:'Performs Custom Event',eventName:'Paid order',appScope:'all',deadline:3,unit:'Days'}];
function elements(node){return Array.isArray(node)?node.flatMap(elements):React.isValidElement(node)?[node,...elements(node.props.children)]:[];}
function control(config,label,change,entryOnce=true){const tree=CanvasExperimentSettings({config,entryOnce,conversionEvents,change});return elements(tree).find(element=>element.props['aria-label']===label);}

test('Winning Path renders configured conversion goals, engagement metrics and explicit fallback choices',()=>{
  const html=renderToStaticMarkup(React.createElement(CanvasExperimentSettings,{config:{paths,winningPath:true,conversionEvent:'paid_order'},entryOnce:false,conversionEvents,change:()=>{}}));
  assert.match(html,/<option value="paid_order" selected="">Paid order/);
  assert.match(html,/<option value="opens">Opens<\/option>/);
  assert.match(html,/<option value="clicks">Clicks<\/option>/);
  assert.match(html,/<input(?=[^>]*value="best")(?=[^>]*checked="")/);
  assert.match(html,/value="mix"/);
  assert.match(html,/first user enters/i);
});

test('selecting the mix fallback saves the runtime fallback without inventing a winner',()=>{
  let patch;
  control({paths,winningPath:true},'Keep the path distribution',value=>{patch=value;},false).props.onChange();
  assert.deepEqual(patch,{winningPathFallback:'mix'});
});

test('selecting a configured conversion goal saves its Canvas goal ID',()=>{
  let patch;
  control({paths,winningPath:true},'Winning Path conversion event',value=>{patch=value;},false).props.onChange({target:{value:'paid_order'}});
  assert.deepEqual(patch,{conversionEvent:'paid_order',winningPathMetric:'conversion',winningPathConversionEventId:'paid_order'});
});

test('a one-time Winning Path reserves Delay Group weight and preserves experimental path ratios',()=>{
  let patch;
  control({paths,winningPath:false},'Winning Path',value=>{patch=value;}).props.onChange({target:{checked:true}});
  assert.equal(patch.winningPath,true);
  assert.equal(patch.experimentWindowDays,7,'the displayed default window must also be saved for execution');
  assert.equal(patch.winningPathFallback,'best');
  assert.equal(patch.winningPathDelayWeight,80);
  assert.deepEqual(patch.paths,[{id:'a',name:'Path 1',weight:14,nextNodeId:'one'},{id:'b',name:'Path 2',weight:6,nextNodeId:'two'}]);
  assert.equal(patch.paths.some(path=>path.id==='delay_group'),false);
});

test('editing Delay Group weight rescales experimental paths to keep all groups at 100 percent',()=>{
  let patch;
  control({paths:[{...paths[0],weight:14},{...paths[1],weight:6}],winningPath:true,winningPathDelayWeight:80},'Delay Group percentage',value=>{patch=value;}).props.onChange({target:{value:'40'}});
  assert.equal(patch.winningPathDelayWeight,40);
  assert.deepEqual(patch.paths.map(path=>path.weight),[42,18]);
});

test('turning Winning Path off releases the holdout allocation back to ordinary paths',()=>{
  let patch;
  control({paths:[{...paths[0],weight:14},{...paths[1],weight:6}],winningPath:true,winningPathDelayWeight:80},'Winning Path',value=>{patch=value;}).props.onChange({target:{checked:false}});
  assert.equal(patch.winningPath,false);
  assert.equal(patch.winningPathDelayWeight,undefined);
  assert.deepEqual(patch.paths.map(path=>path.weight),[70,30]);
});

test('hourly experiment windows are persisted through the existing days-based runtime contract',()=>{
  let patch;
  const input=control({paths,winningPath:true,experimentWindowDays:.5,experimentWindowUnit:'Hours'},'Experiment window',value=>{patch=value;},false);
  assert.equal(input.props.value,12);
  input.props.onChange({target:{value:'48'}});
  assert.deepEqual(patch,{experimentWindowDays:2});
});

test('one-time Winning Path cannot add a fourth experiment path or a second control group',()=>{
  const config={winningPath:true,winningPathDelayWeight:80,paths:[{id:'a',name:'Path 1',weight:10},{id:'b',name:'Path 2',weight:5},{id:'control',name:'Control Group',weight:5,exit:true}]};
  const tree=CanvasExperimentSettings({config,entryOnce:true,conversionEvents,change:()=>{}});
  const buttons=elements(tree).filter(element=>element.type==='button');
  assert.equal(buttons.find(element=>element.props.children==='Add a Path').props.disabled,true);
  assert.equal(buttons.find(element=>element.props.children==='Add a Control Group').props.disabled,true);
});

test('reopening an experiment after switching to recurring entry removes Delay Group and restores full allocation',()=>{
  const node={id:'experiment',kind:'experiment_paths',label:'Experiment',x:0,y:0,config:{winningPath:true,winningPathDelayWeight:80,paths:[{...paths[0],weight:14},{...paths[1],weight:6}]}};
  const html=renderToStaticMarkup(React.createElement(CanvasStepEditor,{node,graph:{nodes:[node],edges:[]},workspaceId:'local',entryOnce:false,conversionEvents,connected:true,onDone:()=>{}}));
  assert.match(html,/aria-label="Path 1 percentage"[^>]*value="70"/);
  assert.match(html,/aria-label="Path 2 percentage"[^>]*value="30"/);
  assert.doesNotMatch(html,/aria-label="Delay Group percentage"/);
});
