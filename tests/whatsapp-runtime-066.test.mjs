import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
 if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return nextResolve(url.href+'.ts',context);}
 return nextResolve(specifier,context);
}});
process.env.MESSAGE_DELIVERY_ENABLED='false';
process.env.BRAZE_DATABASE_PATH=join(mkdtempSync(join(tmpdir(),'whatsapp-066-')),'test.sqlite');
const store=await import('../lib/braze-store.ts');
const {createWhatsAppVariant}=await import('../lib/whatsapp-model.ts');
const variant={...createWhatsAppVariant(),messageTypeChosen:true,mode:'response',responseLayout:'text',responseLayoutChosen:true,responseBody:'Reply {{${first_name}}}',conversationWindowOpen:true};
store.applyProfileRows([{external_id:'wa066_user',email:'wa066@example.test',first_name:'Stored',attributes:{phone:'+12025550123'}}]);
store.setSubscriptionMember('sg_whatsapp_updates','wa066_user','subscribed');
const campaign=id=>store.upsertCampaign({id,name:id,channel:'whatsapp',body:variant.responseBody,config:{subscriptionGroupId:'sg_whatsapp_updates',whatsappVariants:[variant],controlGroup:0}});
const events=id=>{const db=new DatabaseSync(process.env.BRAZE_DATABASE_PATH);try{return db.prepare('SELECT event_type,data_json FROM message_events WHERE campaign_id=? AND user_id=? ORDER BY created_at DESC').all(id,'wa066_user').map(row=>({type:row.event_type,data:JSON.parse(row.data_json)}));}finally{db.close();}};
test('preview override cannot fabricate stored recipient eligibility and standalone tests never deliver',()=>{
 const c=campaign('wa066_test');const result=store.prepareWhatsAppTest({campaignId:c.id,config:c.config,variantId:variant.id,recipients:['wa066_user'],override:true,profile:{first_name:'Override',whatsapp_last_inbound_at:new Date().toISOString(),conversationWindowOpen:true}});
 assert.equal(result.capability.delivered,false);assert.equal(result.tests[0].conversationEligibility.eligible,false);assert.match(result.tests[0].message,/Override/);assert.equal(events(c.id)[0].type,'test_prepared');
});
test('production campaign rejects response delivery despite a saved simulated-open flag',async()=>{
 const c=campaign('wa066_blocked');const result=await store.launchCampaign(c.id,undefined,undefined,'wa066_user');assert.equal(result.run.delivered,0);assert.equal(result.run.failed,1);assert.equal(events(c.id)[0].type,'failed');assert.match(events(c.id)[0].data.error,/inbound WhatsApp message timestamp/);
});
test('stored inbound event opens eligibility and disabled delivery remains prepared only',async()=>{
 store.trackProfileEvent({userId:'wa066_user',name:'inbound_whatsapp',createdAt:new Date(Date.now()-60000).toISOString()});const c=campaign('wa066_eligible');const result=await store.launchCampaign(c.id,undefined,undefined,'wa066_user');assert.equal(result.run.delivered,0);const event=events(c.id)[0];assert.equal(event.data.conversationEligibility.eligible,true);assert.equal(event.type,'prepared');assert.match(event.data.message.message,/Stored/);
});
