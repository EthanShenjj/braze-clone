import test from 'node:test';
import assert from 'node:assert/strict';
import { grapesImport, htmlToGrapesMjml, emailRowLayouts, grapesRowMarkup } from '../lib/email-grapes-template.ts';
import { preservePrimaryEmailDesign } from '../lib/unlayer-template.ts';

test('vendor migrations preserve Liquid, CSS, and original exported HTML without loading a stale Grapes project', () => {
 const html='<!doctype html><HTML><HEAD><style>.x{color:red}</style></HEAD><BODY><p class="x">Hello {{${first_name}}}</p><a href="{{${unsubscribe_url}}}">Leave</a></BODY></HTML>';
 const config={emailEditorEngine:'unlayer',emailUnlayerJson:{body:{}},emailGrapesProject:{old:true},emailMjml:'stale'};
 const result=grapesImport(config,html);
 assert.equal(result.imported,true); assert.equal(result.error,'');
 assert.match(result.mjml,/<mj-raw><style>\.x/);assert.ok(result.mjml.includes('{{${first_name}}}'));assert.ok(result.mjml.includes('{{${unsubscribe_url}}}'));
 assert.doesNotMatch(result.mjml,/<(?:html|head|body)\b/i);assert.equal(config.emailMjml,'stale');assert.deepEqual(config.emailUnlayerJson,{body:{}});
 assert.ok(htmlToGrapesMjml('<p>fragment</p>').includes('<mj-raw><p>fragment</p></mj-raw>'));
});
test('Grapes projects and legacy native rows are never replaced by a generated HTML preview', () => {
 for(const config of [{emailEditorEngine:'grapesjs-mjml',emailMjml:'saved'}, {emailRows:[{cells:[]}]}, {emailGrapesProject:{pages:[]}}]) assert.equal(grapesImport(config,'preview HTML').imported,false);
});
test('vendor JSON without exported HTML blocks migration instead of creating an empty design', () => {
 for(const config of [{emailEditorEngine:'unlayer',emailUnlayerJson:{}},{emailEditorEngine:'beefree',emailBeefreeJson:{}}]) assert.match(grapesImport(config).error,/no exported HTML/);
 assert.equal(grapesImport().error,'');
});
test('every row preset keeps its width total and malformed widths are rejected', () => {
 for(const widths of emailRowLayouts) { const mjml=grapesRowMarkup(widths); assert.equal(widths.reduce((a,b)=>a+b,0),100);assert.equal([...mjml.matchAll(/<mj-column /g)].length,widths.length); }
 for(const widths of [[],[40,40],[0,100],[NaN,100]]) assert.throws(()=>grapesRowMarkup(widths));
});
test('saving a second variant cannot overwrite the primary Grapes design or migration archive', () => {
 const primary={emailGrapesProject:{primary:true},emailGrapesSchemaVersion:1,emailGrapesMigration:{originalHtml:'primary'},emailMjml:'primary'};
 const patch={emailGrapesProject:{second:true},emailGrapesSchemaVersion:2,emailGrapesMigration:{originalHtml:'second'},emailMjml:'second'};
 assert.deepEqual(preservePrimaryEmailDesign(primary,patch,1),primary);
 assert.deepEqual(preservePrimaryEmailDesign(primary,patch,0),patch);
});
