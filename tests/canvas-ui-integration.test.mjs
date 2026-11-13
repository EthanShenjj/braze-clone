import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './canvas-editor-render-helper.mjs';
const wizardUI=loadComponent('app/ui/canvas-wizard.tsx'),liveUI=loadComponent('app/ui/live-canvas.tsx');
const {defaultCanvasWizard}=loadComponent('lib/canvas-wizard-model.ts');
const node=(id,kind,config={})=>({id,kind,label:id,x:0,y:0,config});
const graph={nodes:[node('entry','entry'),node('a','message',{channel:'email',message:'A'}),node('b','message',{channel:'email',message:'B'})],edges:[['entry','a']]};
const document=()=>({name:'Canvas',description:'',tags:[],wizard:structuredClone(defaultCanvasWizard)});
test('clean metadata and graphs do not issue save requests or change their revision',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('A clean Canvas must not issue a save request');};
 try{const current=document(),details=await wizardUI.persistCanvasWizardDetails({canvasId:'c',workspaceId:'w',current,baseline:JSON.stringify(current),updatedAt:'revision'});assert.equal(details.changed,false);assert.equal(details.record,null);
  const saved=await liveUI.persistCanvasGraph({canvasId:'c',workspaceId:'w',graph,savedGraph:JSON.stringify(graph),updatedAt:'revision'});assert.equal(saved.changed,false);assert.equal(saved.updatedAt,'revision');
 }finally{globalThis.fetch=old;}
});
test('dirty graph save sends its actual scoped graph and optimistic revision once',async()=>{
 const old=globalThis.fetch,requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json({updatedAt:'next'});};
 try{const result=await liveUI.persistCanvasGraph({canvasId:'canvas / id',workspaceId:'workspace',graph,savedGraph:'different',updatedAt:'revision'});assert.equal(result.updatedAt,'next');assert.equal(requests.length,1);assert.match(requests[0].url,/workspaceId=workspace/);assert.deepEqual(requests[0].body,{graph,updatedAt:'revision',workspaceId:'workspace'});
 }finally{globalThis.fetch=old;}
});
test('dirty metadata save persists real details and reports provider failure without marking it saved',async()=>{
 const old=globalThis.fetch,requests=[],current=document();current.name='Updated';globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json({id:'c',...current,updatedAt:'next'});};
 try{const result=await wizardUI.persistCanvasWizardDetails({canvasId:'c',workspaceId:'w',current,baseline:JSON.stringify(document()),updatedAt:'revision'});assert.equal(result.changed,true);assert.equal(result.record.name,'Updated');assert.equal(requests.length,1);assert.equal(requests[0].body.updatedAt,'revision');assert.equal(requests[0].body.workspaceId,'w');globalThis.fetch=async()=>Response.json({error:'Conflict'},{status:409});await assert.rejects(wizardUI.persistCanvasWizardDetails({canvasId:'c',workspaceId:'w',current,baseline:'different',updatedAt:'revision'}),/Conflict/);
 }finally{globalThis.fetch=old;}
});
test('footer keeps Forward before far-right Save and disables Save when clean or saving',()=>{
 const props={step:'basics',saving:false,dirty:false,go(){},save(){},stepper:React.createElement('nav',null,'Steps')};
 const clean=renderToStaticMarkup(React.createElement(wizardUI.CanvasWizardFooter,props)),dirty=renderToStaticMarkup(React.createElement(wizardUI.CanvasWizardFooter,{...props,dirty:true})),busy=renderToStaticMarkup(React.createElement(wizardUI.CanvasWizardFooter,{...props,dirty:true,saving:true}));
 assert.ok(clean.indexOf('aria-label="Forward"')<clean.indexOf('>Save<'));assert.match(clean,/<button[^>]*disabled[^>]*>Save<\/button>/);assert.doesNotMatch(dirty.match(/<button[^>]*>Save<\/button>/)?.[0]??'',/disabled/);assert.match(busy,/<button[^>]*disabled[^>]*>Saving…<\/button>/);
});
test('the real action entry form exposes saved event and property fields',()=>{
 const config={...structuredClone(defaultCanvasWizard.entry),type:'action',triggers:['Perform Custom Event'],triggerDetails:[{id:'checkout',type:'Perform Custom Event',eventName:'checkout',propertiesEnabled:true,propertyFilters:[]}]};
 const html=renderToStaticMarkup(React.createElement(wizardUI.EntryScheduleStep,{canvasId:'c',workspaceId:'w',config,onChange(){},onCopy(){}}));assert.match(html,/checkout/);assert.match(html,/Property|properties|Property Filters/);
});
test('entry variant targets select actual roots and preserve the other variant route',()=>{
 const base={...structuredClone(graph),variants:[{id:'one',name:'One',weight:50},{id:'two',name:'Two',weight:50}]};
 const mapped=liveUI.connectCanvasVariantRoot(base,'two','b'),entry=mapped.nodes.find(node=>node.kind==='entry');assert.deepEqual(entry.config.variantTargets,{one:'a',two:'b'});assert.deepEqual(mapped.edges,[['entry','a'],['entry','b']]);assert.equal(base.nodes[0].config.variantTargets,undefined);
 const visible=liveUI.canvasVariantView({...mapped,nodes:mapped.nodes.map(node=>node.id==='a'?{...node,config:{...node.config,variantId:'one'}}:node.id==='b'?{...node,config:{...node.config,variantId:'two'}}:node)},'two');assert.deepEqual(visible.nodes.map(node=>node.id),['entry','b']);assert.deepEqual(visible.edges,[['entry','b']]);
 const empty=liveUI.canvasVariantView({...mapped,nodes:mapped.nodes.map(node=>node.id==='entry'?{...node,config:{variantTargets:{one:'a'}}}:node)},'two');assert.equal(empty.edges.some(([from])=>from==='entry'),false);
 assert.deepEqual(liveUI.canvasMissingVariantRoutes({...mapped,nodes:mapped.nodes.map(node=>node.id==='entry'?{...node,config:{variantTargets:{one:'a'}}}:node)}),['Two']);
});
test('closing an unchanged message editor does not add default fields or create a graph change',()=>{
 const original=node('message','message',{channel:'email',message:'Welcome'}),returned={...original.config,workspaceId:'w',subject:''};
 assert.equal(liveUI.canvasEditedStep(original,original.label,returned,'w'),original);
 const changed=liveUI.canvasEditedStep(original,original.label,{...returned,message:'New'},'w');assert.equal(changed.config.message,'New');
});
