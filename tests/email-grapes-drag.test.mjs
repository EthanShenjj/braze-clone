import test from 'node:test';
import assert from 'node:assert/strict';
import { beginPaletteDrag } from '../app/ui/email-grapes-drag.ts';

// A geometry-only DOM harness; browser integration is validated separately.
function harness() {
 const listeners=new Map(), inserted=[], selected=[], marker={style:{},setAttribute(){},remove(){this.removed=true;}};
 const hit={}, rect=(left,top,width,height)=>({left,top,width,height,bottom:top+height});
 const first={getEl:()=>({getBoundingClientRect:()=>rect(40,30,600,50)})},second={getEl:()=>({getBoundingClientRect:()=>rect(40,80,600,100)})};
 const column={get:()=> 'mj-column',getEl:()=>({contains:node=>node===hit,getBoundingClientRect:()=>rect(40,30,600,200)}),components:()=>({models:[first,second]}),append:(content,options)=>{inserted.push({content,options});return [first];}};
 const body={onAll:callback=>callback(column),components:()=>({models:[]}),getEl:()=>({getBoundingClientRect:()=>rect(40,0,600,400)}),append:(content,options)=>{inserted.push({content,options,row:true});return [first];}};
 const frame={style:{pointerEvents:'auto'},getBoundingClientRect:()=>rect(250,100,700,500)};
 const document={body:{style:{cursor:'default'},append(){}},createElement:()=>marker,addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)};
 let hitCoords;
 const editor={Blocks:{get:()=>({getContent:()=>'<mj-spacer height="60px" />'})},Canvas:{getFrameEl:()=>frame,getDocument:()=>({elementFromPoint:(x,y)=>{hitCoords={x,y}; return hit;}})},getWrapper:()=>({findType:()=>[body]}),select:component=>selected.push(component)};
 const originalDocument=globalThis.document,originalWindow=globalThis.window;
 globalThis.document=document;globalThis.window={addEventListener(){},removeEventListener(){}};
 let dirty=0;
 return {editor,frame,listeners,inserted,selected,marker,start:(id='braze-spacer')=>beginPaletteDrag(editor,id,{button:0,clientX:1200,clientY:300},()=>dirty++),move:(x,y)=>listeners.get('pointermove')?.({clientX:x,clientY:y,preventDefault(){}}),up:()=>listeners.get('pointerup')?.(),getCoords:()=>hitCoords,getDirty:()=>dirty,restore:()=>{globalThis.document=originalDocument;globalThis.window=originalWindow;}};
}

test('palette drop translates outer coordinates into iframe coordinates and inserts at the right sibling',()=>{
 const h=harness();try{h.start();h.move(600,210);assert.deepEqual(h.getCoords(),{x:350,y:110});h.up();assert.equal(h.inserted.length,1);assert.equal(h.inserted[0].options.at,1);assert.equal(h.getDirty(),1);assert.equal(h.frame.style.pointerEvents,'auto');assert.equal(h.listeners.size,0);}finally{h.restore();}
});
test('a drop above the first block inserts at index zero',()=>{
 const h=harness();try{h.start();h.move(600,140);h.up();assert.equal(h.inserted[0].options.at,0);}finally{h.restore();}
});
test('row tiles insert at body level instead of inside a column',()=>{
 const h=harness();try{h.start('braze-row-1');h.move(600,210);h.up();assert.equal(h.inserted[0].row,true);}finally{h.restore();}
});
test('clicks, outside drops, and Escape do not insert or leave pointer listeners behind',()=>{
 for(const scenario of ['click','outside','escape']) {const h=harness();try{h.start();if(scenario==='outside') h.move(1100,600);if(scenario==='escape'){h.move(600,210);h.listeners.get('keydown')?.({key:'Escape'});}else h.up();assert.equal(h.inserted.length,0);assert.equal(h.getDirty(),0);assert.equal(h.frame.style.pointerEvents,'auto');assert.equal(h.listeners.size,0);}finally{h.restore();}}
});
