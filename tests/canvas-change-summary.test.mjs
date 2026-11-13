import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasViewSnapshotKey,createCanvasViewSnapshot,readCanvasViewSnapshot,writeCanvasViewSnapshot,canvasChangesSinceViewed} from '../lib/canvas-change-summary-model.ts';
import {defaultCanvasWizard} from '../lib/canvas-wizard-model.ts';
const scope={workspaceId:'workspace-a',canvasId:'canvas-a'};
const node=(id,kind,label=id)=>({id,kind,label,x:0,y:0,...(kind==='message'?{config:{channel:'email',message:'Hello'}}:{})});
const current=()=>({name:'Original',description:'Description',tags:['news','promo'],graph:{nodes:[node('entry','entry','Entry'),node('email','message','Email')],edges:[['entry','email']],variants:[{id:'a',name:'A',weight:100}]},wizard:structuredClone(defaultCanvasWizard)});
const memory=()=>{const rows=new Map();return{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};};
test('a first view has zero changes and creating the preference snapshot never changes Canvas data',()=>{
 const document=current(),before=structuredClone(document);
 assert.deepEqual(canvasChangesSinceViewed(scope,null,document),[]);
 const snapshot=createCanvasViewSnapshot(scope,document,'2026-11-12T00:00:00Z');assert.equal(snapshot.viewedAt,'2026-11-12T00:00:00Z');assert.deepEqual(document,before);
 document.graph.nodes[1].config.message='Updated';assert.equal(snapshot.document.graph.nodes[1].config.message,'Hello');
});
test('view history isolates workspace and Canvas before using a saved snapshot',()=>{
 const storage=memory(),snapshot=createCanvasViewSnapshot(scope,current(),'2026-11-12T00:00:00Z');
 assert.equal(writeCanvasViewSnapshot(storage,snapshot),true);assert.equal(readCanvasViewSnapshot(storage,scope).document.name,'Original');
 assert.equal(readCanvasViewSnapshot(storage,{...scope,workspaceId:'workspace-b'}),null);assert.equal(readCanvasViewSnapshot(storage,{...scope,canvasId:'canvas-b'}),null);
 storage.setItem(canvasViewSnapshotKey({...scope,canvasId:'canvas-b'}),JSON.stringify(snapshot));assert.equal(readCanvasViewSnapshot(storage,{...scope,canvasId:'canvas-b'}),null);
 assert.deepEqual(canvasChangesSinceViewed({...scope,workspaceId:'workspace-b'},snapshot,{...current(),name:'Other'}),[]);
});
test('real step, connection, variant, wizard, and metadata changes produce a literal diff count',()=>{
 const before=createCanvasViewSnapshot(scope,current(),'2026-11-12T00:00:00Z'),after=current();after.name='Updated';after.graph.nodes=[{...after.graph.nodes[0],label:'Audience'},node('sms','message','SMS')];after.graph.edges=[['entry','sms']];after.graph.variants=[{id:'a',name:'A',weight:75},{id:'b',name:'B',weight:25}];after.wizard.send.rateEnabled=true;
 const changes=canvasChangesSinceViewed(scope,before,after);assert.equal(changes.length,9);
 assert.deepEqual(Object.fromEntries(['step','connection','variant','settings','details'].map(category=>[category,changes.filter(change=>change.category===category).length])),{step:3,connection:2,variant:2,settings:1,details:1});
 assert.equal(changes.find(change=>change.path==='graph.nodes.email').kind,'removed');assert.equal(changes.find(change=>change.path==='graph.nodes.sms').kind,'added');
 assert.deepEqual(changes.find(change=>change.path==='graph.nodes.entry').fields,[{path:'label',before:'Entry',after:'Audience'}]);assert.equal(changes.find(change=>change.path==='wizard.send.rateEnabled').after,true);
});
test('equivalent key, graph-list and tag ordering creates no fabricated changes',()=>{
 const document=current();document.graph.nodes.push(node('delay','delay','Delay'));document.graph.edges.push(['email','delay']);
 const before=createCanvasViewSnapshot(scope,document),after=structuredClone(document);after.tags.reverse();after.graph.nodes.reverse();after.graph.edges.reverse();after.graph.nodes.find(node=>node.id==='email').config={message:'Hello',channel:'email'};
 assert.deepEqual(canvasChangesSinceViewed(scope,before,after),[]);
});
test('malformed, oversized or unavailable browser storage safely falls back to no history',()=>{
 const storage=memory();for(const value of ['{bad',JSON.stringify({version:0}),JSON.stringify({...createCanvasViewSnapshot(scope,current()),document:{name:'Invalid'}}),'x'.repeat(2_100_000)]){storage.setItem(canvasViewSnapshotKey(scope),value);assert.equal(readCanvasViewSnapshot(storage,scope),null);}
 const denied={getItem(){throw Error('Storage denied');},setItem(){throw Error('Storage denied');}};
 assert.equal(readCanvasViewSnapshot(denied,scope),null);assert.equal(writeCanvasViewSnapshot(denied,createCanvasViewSnapshot(scope,current())),false);assert.equal(readCanvasViewSnapshot(null,scope),null);
});
