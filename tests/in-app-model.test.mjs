import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPage, defaultGlobal, variantsFor, pageButtons, appendTemplatePages, deleteInAppPage, validateInAppVariant, compileInAppHtml } from '../lib/in-app-model.ts';
const variant = () => ({ id:'v', name:'Welcome', sendTo:'Both Mobile Apps & Web Browsers', accessibilityLanguage:'en', global:{...defaultGlobal}, pages:[defaultPage()] });
test('an explicitly empty button list stays empty after legacy migration', () => {
  assert.equal(pageButtons({...defaultPage(),buttons:[]}).length,0);
  assert.equal(pageButtons(defaultPage()).length,1);
});
test('copying a multi-page template remaps all internal links without mutating its source', () => {
  const first={...defaultPage(),id:'a',buttons:[{id:'go',text:'Next',behavior:'page',href:'b',style:'primary'}]};
  const second={...defaultPage(1),id:'b',buttons:[{id:'back',text:'Back',behavior:'page',href:'a',style:'secondary'}]};
  const output=appendTemplatePages([], [first,second], 'copy');
  assert.equal(output[0].buttons[0].href,output[1].id);
  assert.equal(output[1].buttons[0].href,output[0].id);
  output[0].title='Changed'; assert.notEqual(first.title,'Changed');
});
test('page limit accepts ten pages and rejects adding eleven atomically', () => {
  const pages=Array.from({length:9},(_,i)=>defaultPage(i));
  assert.equal(appendTemplatePages(pages,[defaultPage()], 'last').length,10);
  assert.throws(()=>appendTemplatePages([...pages,defaultPage(10)],[defaultPage()], 'overflow'),/10 pages/);
  assert.equal(pages.length,9);
});
test('deleting a page repairs incoming links and preserves unrelated actions', () => {
  const value=variant();value.pages[0].buttons=[{id:'go',text:'Next',behavior:'page',href:'b',style:'primary'}];value.pages.push({...defaultPage(1),id:'b'});
  const output=deleteInAppPage(value.pages,'b');
  assert.equal(output[0].buttons[0].behavior,'dismiss');assert.equal(output[0].buttons[0].href,'');
  assert.throws(()=>deleteInAppPage(output,output[0].id),/at least one/);
});
test('validation checks every page, destination and metadata key', () => {
  const value=variant();value.pages.push({...defaultPage(1),buttons:[{id:'x',text:'Next',behavior:'page',href:'missing',style:'primary'}]});value.keyValuePairs=[{id:'1',key:'source',value:'a'},{id:'2',key:'source',value:'b'}];
  assert.match(validateInAppVariant(value).join(' '),/destination page/);assert.match(validateInAppVariant(value).join(' '),/Duplicate key/);
  value.pages[1].buttons=[];value.keyValuePairs=[];assert.deepEqual(validateInAppVariant(value),[]);
});
test('malformed snapshots and nonfinite styles are rejected',()=>{
  for(const invalid of [null,[],{}, {pages:[]}])assert.ok(validateInAppVariant(invalid).length);
  const value=variant();value.global.maxWidth=Infinity;assert.match(validateInAppVariant(value).join(' '),/maxWidth/);
});
test('custom HTML conversion preserves all page navigation and escapes text',()=>{
  const value=variant();value.pages.push({...defaultPage(1),id:'next'});value.pages[0].title='<script>bad()</script>';value.pages[0].buttons=[{id:'go',text:'Go',behavior:'page',href:'next',style:'primary'}];
  const html=compileInAppHtml(value);assert.match(html,/id="page-1"/);assert.match(html,/href="#page-1"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>bad/);assert.match(html,/appboy:\/\/close/);
});
test('legacy campaign content and platform survive migration',()=>{
  const [value]=variantsFor({subject:'Subject',body:'Copy',config:{channelValues:{sendTo:'Web Browsers'}}});assert.equal(value.pages[0].title,'Subject');assert.equal(value.sendTo,'Web Browsers');assert.deepEqual(validateInAppVariant(value),[]);
});
