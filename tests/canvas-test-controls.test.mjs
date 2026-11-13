import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';
const {default:Toolbar}=loadComponent('app/ui/canvas-build-toolbar.tsx');
const {default:TestDialog}=loadComponent('app/ui/canvas-test-dialog.tsx');
const {defaultCanvasWizard}=loadComponent('lib/canvas-wizard-model.ts');
const props={graph:{nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},{id:'message',kind:'message',label:'Message',x:1,y:1,config:{channel:'email',message:'Welcome'}}],edges:[['entry','message']]},wizard:defaultCanvasWizard,workspaceId:'local',busy:false,onSave(){},onContinue(){},zoom:1,onZoom(){},simple:false,onSimple(){},fullscreen:false,onFullscreen(){},changeBrief(){}};
test('saved Canvas exposes the enabled journey test while unsaved Canvas explains the prerequisite',()=>{
 const saved=renderToStaticMarkup(React.createElement(Toolbar,{...props,canvasId:'saved'})),unsaved=renderToStaticMarkup(React.createElement(Toolbar,props));
 assert.doesNotMatch(saved.match(/<button[^>]*>Test Canvas<\/button>/)?.[0]??'',/disabled/);
 assert.match(unsaved.match(/<button[^>]*>Test Canvas<\/button>/)?.[0]??'',/disabled/);
});
test('journey testing starts as a preview with no selected user and no send consent',()=>{
 const html=renderToStaticMarkup(React.createElement(TestDialog,{canvasId:'saved',workspaceId:'local',graph:props.graph,close(){}}));
 assert.match(html,/Select a test user/);assert.match(html,/<button[^>]*disabled[^>]*>Run preview<\/button>/);assert.doesNotMatch(html.match(/<input type="checkbox"[^>]*>/)?.[0]??'',/checked/);
});
