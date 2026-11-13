import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasStepIssues} from '../lib/canvas-step-model.ts';
import {canvasWizardIssues,defaultCanvasWizard,normalizeCanvasWizard} from '../lib/canvas-wizard-model.ts';
const node=(kind,config)=>({id:'step',kind,label:'Step',x:0,y:0,config});
test('Action Paths rejects evaluation windows beyond the documented 31 days',()=>{
 const config={evaluationValue:32,evaluationUnit:'Days',paths:[{id:'everyone_else',name:'Everyone Else'}]};
 assert.match(canvasStepIssues(node('action_paths',config)).join(' '),/31 days/);
 assert.doesNotMatch(canvasStepIssues(node('action_paths',{...config,evaluationValue:31})).join(' '),/31 days/);
});
test('Winning Path validates its conversion reference and reserves one-time Delay Group capacity',()=>{
 const wizard=structuredClone(defaultCanvasWizard);wizard.entry={...wizard.entry,type:'scheduled',timing:'immediate',frequency:'Once'};
 const paths=Array.from({length:4},(_,i)=>({id:'p'+i,name:'Path '+i,weight:25,exit:true})),experiment=node('experiment_paths',{winningPath:true,experimentWindowDays:7,winningPathMetric:'conversion',winningPathConversionEventId:'foreign',paths}),graph={nodes:[{id:'entry',kind:'entry',label:'Entry',x:0,y:0},experiment],edges:[['entry','step']]};
 const errors=canvasWizardIssues(wizard,graph).map(issue=>issue.detail).join(' ');assert.match(errors,/three experiment paths/i);assert.match(errors,/conversion event.*Canvas/i);
});
test('typed exception details survive normalization and reject incomplete trigger configuration',()=>{
 const config=structuredClone(defaultCanvasWizard);config.audience.exceptions=['Perform Custom Event'];config.audience.exceptionDetails=[{id:'checkout',type:'Perform Custom Event',eventName:''}];
 const normalized=normalizeCanvasWizard(config);assert.notEqual(normalized.audience.exceptionDetails,config.audience.exceptionDetails);
 assert.ok(canvasWizardIssues(normalized,{nodes:[],edges:[]}).some(issue=>issue.title==='Incomplete exit trigger'));
 assert.deepEqual(normalizeCanvasWizard({entry:{triggerDetails:'invalid'},audience:{exceptionDetails:'invalid'}}).audience.exceptionDetails,[]);
});
