import test from 'node:test';
import assert from 'node:assert/strict';
import { blankUnlayerDesign, htmlUnlayerDesign, initialUnlayerDesign, isUnlayerDesign, unlayerSavePatch, preservePrimaryEmailDesign } from '../lib/unlayer-template.ts';
const content = design => design.body.rows[0].columns[0].contents;
test('new designs and loaded designs have independent mutable data', () => {
 const first=blankUnlayerDesign(), second=blankUnlayerDesign();
 content(first).push({type:'html',values:{html:'first'}});
 assert.equal(content(second).length,0);
 const loaded=initialUnlayerDesign({emailUnlayerJson:JSON.stringify(first)},'fallback');
 assert.equal(loaded.imported,false); assert.deepEqual(loaded.design,first);
 content(loaded.design)[0].values.html='changed';assert.equal(content(first)[0].values.html,'first');
});
test('legacy HTML preserves Liquid and head CSS without nesting complete documents', () => {
 const html='<!doctype html><HTML><HEAD><style>.name{color:red}</style></HEAD><BODY><p class="name">Hello {{${first_name}}}</p><a href="{{${unsubscribe_url}}}">Leave</a></BODY></HTML>';
 const original={emailEditorEngine:'beefree',emailBeefreeJson:{page:{rows:[]}}};
 const result=initialUnlayerDesign(original,html);assert.equal(result.imported,true);
 const fragment=content(result.design)[0].values.html;
 assert.match(fragment,/<style>\.name/);assert.ok(fragment.includes('{{${first_name}}}'));assert.ok(fragment.includes('{{${unsubscribe_url}}}'));
 assert.doesNotMatch(fragment,/<\/?(?:html|head|body)\b/i);assert.deepEqual(original,{emailEditorEngine:'beefree',emailBeefreeJson:{page:{rows:[]}}});
 assert.equal(content(htmlUnlayerDesign('<p>fragment</p>'))[0].values.html,'<p>fragment</p>');
});
test('invalid saved designs and legacy designs without HTML cannot silently overwrite content', () => {
 for(const design of ['{broken',{}, {counters:{},body:{rows:[{}],values:{}}}, {...blankUnlayerDesign(),counters:{row:NaN}}]) assert.throws(()=>initialUnlayerDesign({emailUnlayerJson:design},'existing HTML'),/invalid/);
 assert.throws(()=>initialUnlayerDesign({emailBeefreeJson:{page:{}}}),/no exported HTML/);
 assert.equal(isUnlayerDesign(blankUnlayerDesign()),true);
});
test('save export keeps the original design and settings, and rejects partial SDK exports', () => {
 const config={emailBeefreeJson:{page:{}},emailSending:{replyTo:'reply@example.test'},emailUnlayerMigration:{originalHtml:'old'}};
 const design=htmlUnlayerDesign('<h1>Welcome {{${first_name}}}</h1>');
 const result=unlayerSavePatch(config,'Subject',{design,html:'<html>Welcome {{${first_name}}}</html>'});
 assert.equal(result.config.emailEditorEngine,'unlayer');assert.equal(result.config.emailEditorMode,'drag');assert.equal(result.config.emailUnlayerJson,design);assert.ok(result.body.includes('{{${first_name}}}'));
 assert.deepEqual(result.config.emailBeefreeJson,config.emailBeefreeJson);assert.deepEqual(result.config.emailSending,config.emailSending);assert.deepEqual(result.config.emailUnlayerMigration,config.emailUnlayerMigration);
 assert.equal(config.emailEditorEngine,undefined);
 for(const exported of [{design:null,html:'html'},{design,html:''},{design,html:null}]) assert.throws(()=>unlayerSavePatch(config,'Subject',exported),/incomplete export/);
});
test('saving variant 2 cannot replace the primary mirrored design or leak its engine into primary', () => {
 const base={emailEditorEngine:'beefree',emailBeefreeJson:{primary:true},emailSending:{replyTo:'primary@example.test'},other:'original'};
 const patch={emailEditorEngine:'unlayer',emailUnlayerJson:blankUnlayerDesign(),emailSending:{replyTo:'variant2@example.test'},other:'updated'};
 const secondary=preservePrimaryEmailDesign(base,patch,1);
 assert.equal(secondary.emailEditorEngine,'beefree');assert.deepEqual(secondary.emailBeefreeJson,base.emailBeefreeJson);assert.deepEqual(secondary.emailSending,base.emailSending);assert.equal(secondary.emailUnlayerJson,undefined);assert.equal(secondary.other,'updated');
 assert.equal(preservePrimaryEmailDesign(base,patch,0).emailEditorEngine,'unlayer');assert.equal(patch.emailEditorEngine,'unlayer');
});
