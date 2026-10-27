import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareInAppPreview } from '../lib/in-app-runtime.ts';
import { defaultPage, defaultGlobal } from '../lib/in-app-model.ts';
const fixture=()=>({id:'v',name:'Test',accessibilityLanguage:'en',global:{...defaultGlobal},pages:[defaultPage()],keyValuePairs:[]});
test('preview renders every page, accessibility, buttons and metadata with the selected profile',()=>{
 const value=fixture();value.pages[0].title='Hi {{${first_name} | upcase}}';value.pages.push({...defaultPage(1),body:'{{custom_attribute.${tier} | default: "guest"}}'});value.accessibilityLanguageLiquid='{{${language} | default: "en"}}';value.keyValuePairs=[{id:'a',key:'user',value:'{{${user_id}}}'}];
 const result=prepareInAppPreview(value,{first_name:'Alex',tier:'gold',language:'zh-CN',user_id:'u_42'});
 assert.equal(result.pages[0].title,'Hi ALEX');assert.equal(result.pages[1].body,'gold');assert.equal(result.accessibilityLanguage,'zh-CN');assert.equal(result.keyValuePairs[0].value,'u_42');assert.match(value.pages[0].title,/first_name/);
});
test('an invalid Liquid expression on a later page fails the whole message',()=>{
 const value=fixture();value.pages.push({...defaultPage(1),body:'{% if something %}unterminated'});assert.throws(()=>prepareInAppPreview(value,{}),/not closed|endif/i);
});
test('Liquid syntax is handled by the actual engine including conditions and filters',()=>{
 const value=fixture();value.pages[0].body='{% if ${country} == "US" %}Welcome {{${first_name}}}{% else %}Hello{% endif %}';assert.equal(prepareInAppPreview(value,{country:'US',first_name:'Ari'}).pages[0].body,'Welcome Ari');
});
test('duplicate keys created by Liquid fail before preparing a test',()=>{
 const value=fixture();value.keyValuePairs=[{id:'a',key:'{{${key}}}',value:'1'},{id:'b',key:'same',value:'2'}];assert.throws(()=>prepareInAppPreview(value,{key:'same'}),/unique/);
});
test('custom HTML keeps supported styles and removes active scripts, handlers and unsafe URLs',()=>{
 const value=fixture();value.customCode=true;value.customHtml='<style>.offer{color:red}</style><p onclick="bad()">{{${first_name}}}</p><script>alert(1)</script><a href="javascript:bad()">Go</a>';
 const html=prepareInAppPreview(value,{first_name:'Ari'}).customHtml;assert.match(html,/color:red/);assert.match(html,/Ari/);assert.doesNotMatch(html,/<script|onclick|javascript:/);
});
test('Liquid destinations are checked again after rendering',()=>{
 const value=fixture();value.pages[0].buttons=[{id:'go',text:'Go',behavior:'web_url',href:'{{${destination}}}',style:'primary'}];assert.throws(()=>prepareInAppPreview(value,{destination:'javascript:bad()'}),/HTTP/);assert.equal(prepareInAppPreview(value,{destination:'https://example.com'}).pages[0].buttons[0].href,'https://example.com');
});
test('snapshot validation parses Liquid without requiring runtime attribute values',async()=>{
 const {validateInAppSnapshot}=await import('../lib/in-app-runtime.ts');const value=fixture();value.pages[0].buttons=[{id:'x',text:'Go',behavior:'web_url',href:'{{${destination}}}',style:'primary'}];assert.doesNotThrow(()=>validateInAppSnapshot(value));value.pages[0].body='{% if true %}';assert.throws(()=>validateInAppSnapshot(value),/not closed|endif/i);
});
test('multi-page HTML conversion preserves quoted Liquid filters and renders them before HTML parsing',async()=>{
 const {compileInAppHtml}=await import('../lib/in-app-model.ts');const value=fixture();value.pages[0].title="{{${first_name} | default: 'friend'}}";value.accessibilityLanguageLiquid="{{${language} | default: 'en'}}";value.customHtml=compileInAppHtml(value);value.customCode=true;
 assert.match(value.customHtml,/default: 'friend'/);const result=prepareInAppPreview(value,{});assert.match(result.customHtml,/friend/);assert.match(result.customHtml,/lang="en"/);
});
