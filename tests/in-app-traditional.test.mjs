import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGlobal, defaultPage, validateInAppVariant, variantsFor } from '../lib/in-app-model.ts';
import { createTraditionalVariant, changeTraditionalType, describeInAppAction } from '../lib/in-app-traditional.ts';
import { prepareInAppPreview, validateInAppSnapshot } from '../lib/in-app-runtime.ts';
const original=()=>({id:'source',name:'Original',sendTo:'Web Browsers',accessibilityLanguage:'en',global:{...defaultGlobal},pages:[{...defaultPage(),buttons:[{id:'go',text:'Next',behavior:'page',href:'second',style:'primary'}]},{...defaultPage(1),id:'second'}]});
const fixture=()=>createTraditionalVariant(original(),'native','Variant 2');
test('traditional variant preserves its source graph and repairs copied page navigation',()=>{
 const source=original(),v=createTraditionalVariant(source,'new','Variant 2');
 assert.equal(v.pages.length,1);assert.equal(source.pages.length,2);assert.equal(source.pages[0].buttons[0].href,'second');assert.equal(v.pages[0].buttons[0].behavior,'dismiss');
 v.global.backgroundColor='#abcdef';assert.notEqual(source.global.backgroundColor,v.global.backgroundColor);assert.deepEqual(validateInAppVariant(v),[]);
 assert.equal(variantsFor({config:{iamVariants:[v]}})[0].traditional.messageType,'Modal');
});
test('all five traditional types switch with consistent native layout and custom HTML flags',()=>{
 for(const type of ['Modal','Full Screen','Slideup','Custom HTML','Email Capture Form']) {
  const v=changeTraditionalType(fixture(),type);v.pages[0].imageUrl='/braze-iam/onboarding-1.png';assert.deepEqual(validateInAppVariant(v),[],type);assert.equal(v.customCode,type==='Custom HTML');
  assert.equal(v.global.displayType,type==='Slideup'?'Slideup':type==='Full Screen'?'Full screen':'Modal');
 }
});
test('traditional invariants reject multipage, three buttons, invalid close delay and missing image',()=>{
 const v=fixture();v.pages.push({...defaultPage(1)});v.pages[0].buttons=Array.from({length:3},(_,i)=>({id:String(i),text:'x',behavior:'dismiss',href:'',style:'primary'}));v.traditional.closeAfterSeconds=61;v.traditional.layout='Image only';
 const errors=validateInAppVariant(v).join(' ');for(const expected of [/one page/,/two buttons/,/60 seconds/,/image-only/])assert.match(errors,expected);
});
test('SDK action configuration validates required payloads and actual Liquid before test preparation',()=>{
 const v=fixture();v.pages[0].buttons=[{id:'event',text:'Continue',behavior:'log_event',href:'',style:'primary'}];assert.match(validateInAppVariant(v).join(' '),/event name/);
 v.pages[0].buttons[0].eventName='click_{{${country}}}';v.traditional.bodyAction={id:'body',text:'Body',behavior:'set_attribute',href:'',style:'primary',attributeName:'tier',attributeValue:'{{custom_attribute.${tier}}}'};
 const rendered=prepareInAppPreview(v,{country:'US',tier:'gold'});assert.equal(rendered.pages[0].buttons[0].eventName,'click_US');assert.equal(rendered.traditional.bodyAction.attributeValue,'gold');assert.match(describeInAppAction(rendered.traditional.bodyAction),/tier = gold/);
 v.traditional.bodyAction.attributeValue='{% if true %}';assert.throws(()=>validateInAppSnapshot(v),/not closed|endif/);
});
test('traditional terms links and body destinations are revalidated after Liquid rendering',()=>{
 const v=fixture();v.traditional.termsUrl='{{${terms}}}';assert.throws(()=>prepareInAppPreview(v,{terms:'javascript:bad()'}),/terms URL/);
 v.traditional.termsUrl='';v.traditional.bodyAction={id:'body',text:'Body',behavior:'web_url',href:'{{${url}}}',style:'primary'};assert.throws(()=>prepareInAppPreview(v,{url:'data:text/html,x'}),/HTTP/);
});
test('custom HTML requires a dismiss control and preview strips active scripts',()=>{
 const v=changeTraditionalType(fixture(),'Custom HTML');v.customHtml='<p>Hello</p>';assert.match(validateInAppVariant(v).join(' '),/dismiss control/);
 v.customHtml='<a href="appboy://close">Close</a><script>bad()</script>';assert.doesNotMatch(prepareInAppPreview(v,{}).customHtml,/<script/);
});
test('unknown on-click behaviors cannot be persisted as working actions',()=>{
 const v=fixture();v.pages[0].buttons[0].behavior='unknown';assert.match(validateInAppVariant(v).join(' '),/valid on-click/);
});

test('email capture replaces native buttons with one submit control and preserves its text mode',()=>{
 const v=fixture();v.traditional.layout='Image only';const capture=changeTraditionalType(v,'Email Capture Form');
 assert.equal(capture.traditional.layout,'Image & text');assert.equal(capture.pages[0].buttons.length,1);assert.equal(capture.pages[0].buttons[0].text,'Subscribe');
 const slideup=changeTraditionalType(v,'Slideup');assert.equal(slideup.traditional.layout,'Image & text');
});
test('creating a traditional variant retains effective first-page colors without sharing mutable state',()=>{
 const source=original();source.pages[0].styleOverrides={textColor:'#abcdef',buttonColor:'#123456',backgroundColor:'#101828'};
 const native=createTraditionalVariant(source,'native','Native');assert.equal(native.global.textColor,'#abcdef');assert.equal(native.traditional.headerColor,'#abcdef');assert.equal(native.traditional.buttonDesigns[0].background,'#123456');
 native.traditional.buttonDesigns[0].background='#ffffff';assert.equal(source.pages[0].styleOverrides.buttonColor,'#123456');
});
