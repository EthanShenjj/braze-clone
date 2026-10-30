import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsAppVariant, normalizeWhatsAppVariants, whatsAppComposeStage, whatsAppResponseEligibility, latestWhatsAppInbound, validateWhatsAppCampaign } from '../lib/whatsapp-model.ts';
const clock = '2026-10-30T12:00:00.000Z';
const draft = variant => ({config:{subscriptionGroupId:'wa-group',whatsappVariants:[variant]}});
test('new WhatsApp setup follows subscription, type, layout, editor and remains independent of credentials',()=>{
 const fresh=createWhatsAppVariant();assert.equal(whatsAppComposeStage({}), 'subscription');
 assert.equal(whatsAppComposeStage(draft(fresh)),'type');
 const response={...fresh,mode:'response',messageTypeChosen:true};assert.equal(whatsAppComposeStage(draft(response)),'layout');
 assert.equal(whatsAppComposeStage(draft({...response,responseLayoutChosen:true})),'editor');
 assert.equal(whatsAppComposeStage(draft({...fresh,messageTypeChosen:true})),'editor');
});
test('saved legacy content remains selected and editable without rewriting template or response data',()=>{
 const saved={...createWhatsAppVariant(),mode:'response',responseLayout:'text',responseBody:'Saved content',responseTranslations:{ja:'保存'},conversationWindowOpen:true};delete saved.messageTypeChosen;delete saved.responseLayoutChosen;
 const normalized=normalizeWhatsAppVariants(draft(saved))[0];assert.equal(whatsAppComposeStage(draft(normalized)),'editor');assert.equal(normalized.responseBody,'Saved content');assert.equal(normalized.responseTranslations.ja,'保存');assert.equal(normalized.conversationWindowOpen,true);
 const reselect={...draft(normalized),config:{...draft(normalized).config,whatsappSetupStage:'type'}};assert.equal(whatsAppComposeStage(reselect),'type');assert.equal(normalizeWhatsAppVariants(reselect)[0].responseBody,'Saved content');
});
test('response delivery requires stored inbound activity strictly inside 24 hours',()=>{
 assert.equal(whatsAppResponseEligibility('response',undefined,clock).eligible,false);
 assert.equal(whatsAppResponseEligibility('response','2026-10-29T12:00:00.000Z',clock).eligible,false);
 assert.equal(whatsAppResponseEligibility('response','2026-10-29T12:00:00.001Z',clock).eligible,true);
 assert.equal(whatsAppResponseEligibility('response','2026-10-30T12:00:00.001Z',clock).eligible,false);
 assert.equal(whatsAppResponseEligibility('response','invalid',clock).eligible,false);
 assert.equal(whatsAppResponseEligibility('template',undefined,clock).eligible,true);
});
test('legacy open-window flag and unrelated outbound events cannot open a response window',()=>{
 const attrs={conversationWindowOpen:true};const events=[{name:'sent_whatsapp',data:{createdAt:clock}}];assert.equal(latestWhatsAppInbound(attrs,events,clock),undefined);
 assert.equal(whatsAppResponseEligibility('response',latestWhatsAppInbound(attrs,events,clock),clock).eligible,false);
});
test('latest stored inbound event or explicit profile activity wins, future events are rejected',()=>{
 const attrs={whatsapp_last_inbound_at:'2026-10-30T10:00:00Z'};const events=[{name:'inbound_whatsapp',data:{createdAt:'2026-10-30T11:00:00Z'}},{name:'inbound_whatsapp',data:{createdAt:'2026-10-31T11:00:00Z'}}];assert.equal(latestWhatsAppInbound(attrs,events,clock),'2026-10-30T11:00:00Z');
 assert.equal(latestWhatsAppInbound({last_whatsapp_inbound_at:'2026-10-30T11:30:00Z'},events,clock),'2026-10-30T11:30:00Z');
});
test('actual saved business account references validate without a sample-account whitelist',()=>{
 const variant={...createWhatsAppVariant(),businessAccount:'actual-waba-reference',mode:'response',responseLayoutChosen:true,conversationWindowOpen:false};assert.deepEqual(validateWhatsAppCampaign(draft(variant)),[]);
 assert.match(validateWhatsAppCampaign(draft({...variant,businessAccount:''})).join(' '),/Business Account/);
});
