import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync,mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return nextResolve(url.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.MESSAGE_DELIVERY_ENABLED='false';
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'email-policy-')),'test.sqlite');
const store=await import('../lib/braze-store.ts');
const {emailVariantSendingIssues,compileWorkspaceEmail}=await import('../lib/email-runtime.ts');
const {variantDraft}=await import('../lib/campaign-shared.ts');
function setPolicy({listed=false,bcc=false}={}){const record=store.getEmailPreferences(),prefs=structuredClone(record.data);prefs.sending.requireListedAddresses=listed;prefs.sending.requireBcc=bcc;prefs.sending.bcc=[{id:'archive',address:'archive@example.test'}];prefs.sending.defaultBccId='archive';store.saveEmailPreferences(prefs,record.updatedAt);return prefs;}
function campaign(id,sending={}){const p=store.getEmailPreferences().data,sender=p.sending.senders[0],good={fromAddress:`${sender.localPart}@${sender.domain}`,bcc:'workspace_default'};return {id,name:id,channel:'email',schedule:'One time',subject:'Primary',body:'<p>Primary</p>',config:{controlGroup:0,variantSplits:[50,50],emailSending:good,variants:[{id:'a',name:'Primary',subject:'Primary',body:'<p>Primary</p>',sending:good},{id:'b',name:'Secondary',subject:'Secondary',body:'<p>Secondary</p>',sending:{...good,...sending}}]}};}
test('upsert rejects an unlisted identity on a secondary variant with the variant name',()=>{setPolicy({listed:true});assert.throws(()=>store.upsertCampaign(campaign('email-policy-save',{fromAddress:'unlisted@example.test'})),/Secondary: From address/);assert.equal(store.getCampaign('email-policy-save'),null);});
test('required BCC cannot be disabled on a secondary variant',()=>{setPolicy({listed:true,bcc:true});assert.throws(()=>store.upsertCampaign(campaign('email-policy-bcc',{bcc:'No BCC address'})),/Secondary: Choose a listed BCC/);});
test('new isolated secondary variants inherit workspace defaults rather than primary sending configuration',()=>{const prefs=setPolicy({listed:true,bcc:true}),message=campaign('email-policy-default');delete message.config.variants[1].sending;const saved=store.upsertCampaign(message);assert.deepEqual(emailVariantSendingIssues(saved,prefs),[]);const compiled=compileWorkspaceEmail(variantDraft(saved,1),prefs,{profile:{},unsubscribeUrl:'https://example.test/out',optInUrl:'https://example.test/in'});assert.equal(compiled.bcc,'archive@example.test');assert.equal(compiled.from,`${prefs.sending.senders[0].localPart}@${prefs.sending.senders[0].domain}`);});
test('launch revalidates every existing variation after workspace policy becomes stricter',async()=>{setPolicy();const saved=store.upsertCampaign(campaign('email-policy-launch',{fromAddress:'unlisted@example.test'}));setPolicy({listed:true});await assert.rejects(()=>store.launchCampaign(saved.id),/Secondary: From address/);assert.equal(store.getCampaign(saved.id).status,'Draft');});
test('multichannel launch also checks every embedded email variation',async()=>{setPolicy({listed:true});const child=campaign('embedded-email',{fromAddress:'unlisted@example.test'}),parent=store.upsertCampaign({id:'email-policy-combined',name:'Combined',channel:'multichannel',schedule:'One time',config:{controlGroup:0,channelValues:{channels:['Email']},multichannelMessages:{email:child}}});await assert.rejects(()=>store.launchCampaign(parent.id),/Secondary: From address/);});
