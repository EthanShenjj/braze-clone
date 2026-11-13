import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';
const {default:Changes}=loadComponent('app/ui/canvas-change-summary.tsx'),{defaultCanvasWizard}=loadComponent('lib/canvas-wizard-model.ts');
test('a first rendered overview offers a zero-count change viewer without inventing history',()=>{
 const current={name:'Canvas',description:'',tags:[],graph:{nodes:[{id:'entry',label:'Entry',kind:'entry',x:0,y:0}],edges:[]},wizard:defaultCanvasWizard};
 const html=renderToStaticMarkup(React.createElement(Changes,{workspaceId:'local',canvasId:'a',current}));assert.match(html.replace(/<[^>]*>/g,''),/0 Changes Since Last Viewed/);assert.match(html,/aria-haspopup="dialog"/);assert.doesNotMatch(html,/disabled/);
});
