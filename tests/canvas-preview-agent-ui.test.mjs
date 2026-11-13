import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';
const {CanvasAgentTestChoices}=loadComponent('app/ui/canvas-test-dialog.tsx');
const nodes=[{id:'agent',kind:'agent',label:'Review cart',x:0,y:0,config:{outputType:'Number'}}];
test('Agent test controls default to authored fallback and require an explicit execution choice',()=>{
 const html=renderToStaticMarkup(React.createElement(CanvasAgentTestChoices,{nodes,choices:{},change:()=>{}}));
 assert.match(html,/Use fallback output/);assert.match(html,/Run the Agent/);assert.match(html,/Fallback output \(JSON\)/);assert.match(html,/Number/);assert.doesNotMatch(html,/Test context/);
});
test('opting in to Agent execution exposes explicit test context and invocation information',()=>{
 const html=renderToStaticMarkup(React.createElement(CanvasAgentTestChoices,{nodes,choices:{agent:{execute:true,fallback:'',context:'cart items'}},change:()=>{}}));
 assert.match(html,/Test context/);assert.match(html,/cart items/);assert.match(html,/invocation limit/);assert.doesNotMatch(html,/Fallback output \(JSON\)/);
});
