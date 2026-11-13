import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasOptimizerPreviewDraft,canvasOptimizerPreviewSelection} from '../lib/canvas-optimizer-preview-model.ts';
const node={id:'optimizer',kind:'optimizer',label:'Optimizer',x:0,y:0,config:{channel:'email',message:"{% message_component 'Body Content' %}",emailSending:{fromName:"{% message_component 'Sender Name' %}"},optimizerComponents:[{id:'body',type:'Body Content',variants:[{id:'a',value:'Hello {{first_name}}'},{id:'b',value:'Member {{tier}}'}]},{id:'sender',type:'Sender Name',variants:[{id:'a',value:'Team {{country}}'},{id:'b',value:'Support'}]}]}};
test('optimizer test send reconstruction uses stored authored IDs and retains raw Liquid for single compilation',()=>{
 const before=structuredClone(node),draft=canvasOptimizerPreviewDraft(node,{body:'a',sender:'b'});
 assert.equal(draft.body,'Hello {{first_name}}');assert.equal(draft.config.emailSending.fromName,'Support');assert.deepEqual(node,before);
});
test('optimizer reconstruction rejects missing, foreign and blank authored variant selections',()=>{
 assert.throws(()=>canvasOptimizerPreviewDraft(node,{body:'a'}),/every/);
 assert.throws(()=>canvasOptimizerPreviewDraft(node,{body:'foreign',sender:'b'}),/no longer available/);
 const blank=structuredClone(node);blank.config.optimizerComponents[0].variants.push({id:'empty',value:''});assert.throws(()=>canvasOptimizerPreviewDraft(blank,{body:'empty',sender:'b'}),/no longer available/);
});
test('automatic optimizer preview selects only existing authored variants without observations or generation',()=>{
 const selection=canvasOptimizerPreviewSelection(node,'canvas','test-user'),draft=canvasOptimizerPreviewDraft(node,selection);
 assert.ok(['Hello {{first_name}}','Member {{tier}}'].includes(draft.body));assert.ok(['Team {{country}}','Support'].includes(draft.config.emailSending.fromName));assert.deepEqual(canvasOptimizerPreviewSelection(node,'canvas','test-user'),selection);
});
