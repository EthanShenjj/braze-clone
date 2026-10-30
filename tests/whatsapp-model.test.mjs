import assert from "node:assert/strict";
import test from "node:test";

import {
  createWhatsAppVariant,
  renderWhatsAppVariant,
  validateWhatsAppCampaign,
} from "../lib/whatsapp-model.ts";

test("the default WhatsApp template variant is launch-ready", () => {
  const campaign = { config: { whatsappVariants: [createWhatsAppVariant()] } };
  assert.deepEqual(validateWhatsAppCampaign(campaign), []);
});

test("template variables require either a value or a fallback", () => {
  const variant = createWhatsAppVariant();
  variant.variables[0] = { ...variant.variables[0], value: "", fallback: "" };
  const issues = validateWhatsAppCampaign({ config: { whatsappVariants: [variant] } });
  assert.ok(issues.some(issue => issue.includes("First name")));
});

test("response authoring does not fabricate recipient conversation eligibility", () => {
  const variant = { ...createWhatsAppVariant(), mode: "response", conversationWindowOpen: false };
  const issues = validateWhatsAppCampaign({ config: { whatsappVariants: [variant] } });
  assert.ok(!issues.some(issue => issue.includes("conversation window")));
});

test("template preview resolves mapped values and fallbacks", () => {
  const variant = createWhatsAppVariant();
  variant.variables = variant.variables.map(variable => variable.key === "1"
    ? { ...variable, value: "Ari" }
    : { ...variable, value: "", fallback: "FALLBACK20" });
  assert.match(renderWhatsAppVariant(variant), /Hi Ari/);
  assert.match(renderWhatsAppVariant(variant), /FALLBACK20/);
});

test("unknown templates cannot fall back to approved sample content for validation", () => {
  const variant = { ...createWhatsAppVariant(), templateId: 'missing-template' };
  assert.match(validateWhatsAppCampaign({ config: { whatsappVariants: [variant] } }).join(' '), /Select an approved template/);
});
test("all required template variables are validated even if removed from saved mappings", () => {
  const variant = { ...createWhatsAppVariant(), variables: [] };
  assert.match(validateWhatsAppCampaign({ config: { whatsappVariants: [variant] } }).join(' '), /First name/);
});
test("custom templates render their own content and respect pending status", async () => {
  const { validateWhatsAppTemplate, whatsAppTemplateVariables, prepareWhatsAppMessage } = await import('../lib/whatsapp-model.ts');
  const template = { id: 'custom_shipping', name: 'shipping_update', language: 'English (US)', category: 'Utility', status: 'Pending', headerType: 'text', headerText: 'Shipping update', body: 'Hi {{1}}, order {{2}} is shipped.', footer: 'Thanks', variables: [{ key: '1', label: 'Name', example: 'Alex', fallback: '' }, { key: '2', label: 'Order', example: 'A123', fallback: '' }], button: { type: 'quick_reply', label: 'OK' } };
  const variant = { ...createWhatsAppVariant(), templateId: template.id, headerType: 'text', variables: template.variables.map(v => ({...v, value: v.example})) };
  const config = { whatsappVariants: [variant], whatsappCustomTemplates: [template] };
  assert.match(renderWhatsAppVariant(variant, [template]), /order A123 is shipped/);
  assert.match(validateWhatsAppCampaign({ config }).join(' '), /not approved/);
  config.whatsappCustomTemplates = [{...template, status: 'Approved'}];
  assert.deepEqual(validateWhatsAppCampaign({ config }), []);
  assert.equal(prepareWhatsAppMessage(variant, config.whatsappCustomTemplates).headerText, 'Shipping update');
  assert.deepEqual(whatsAppTemplateVariables('{{2}} {{1}} {{2}}'), ['1','2']);
  assert.match(validateWhatsAppTemplate({...template, name: 'Bad Name'}).join(' '), /lowercase/);
  assert.match(validateWhatsAppTemplate({...template, body:'Hi {{1}} {{3}}'}).join(' '), /sequential/);
});
test("response option labels reject blanks, duplicates and overlong labels", () => {
  const variant = { ...createWhatsAppVariant(), mode: 'response', conversationWindowOpen: true, responseLayout: 'quick_reply', quickReplies: ['A','A'] };
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[variant]}}).join(' '), /unique/);
  variant.quickReplies = [''];
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[variant]}}).join(' '), /1–20/);
  variant.quickReplies = ['a'.repeat(21)];
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[variant]}}).join(' '), /1–20/);
});
test("test payloads render Liquid values with recipient fallbacks and preserve URL variables", async () => {
  const { prepareWhatsAppMessage } = await import('../lib/whatsapp-model.ts');
  const variant = createWhatsAppVariant();
  variant.variables[0] = {...variant.variables[0], value:'{{${first_name}}}', fallback:'friend'};
  const message = prepareWhatsAppMessage(variant, [], {first_name:'Alex'});
  assert.match(message.message, /Hi Alex/);
  assert.equal(message.buttons[0].url, 'https://example.com/offers/Alex');
  assert.match(prepareWhatsAppMessage(variant).message, /Hi friend/);
});
test("malformed persisted variants are normalized without crashing the composer", async () => {
  const { normalizeWhatsAppVariants } = await import('../lib/whatsapp-model.ts');
  assert.equal(normalizeWhatsAppVariants({config:{whatsappVariants:[null]}}).length, 1);
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[{variables:null}]}}).join(' '), /First name/);
});

test("carousel payloads render each card and validate counts and button types", async () => {
  const { prepareWhatsAppMessage } = await import('../lib/whatsapp-model.ts');
  const v = {...createWhatsAppVariant(), mode:'response', responseLayout:'carousel', conversationWindowOpen:true, carouselCards:[1,2].map(i=>({id:String(i),body:'Hi {{${first_name}}}',mediaUrl:'https://example.com/image.png',buttons:[{label:'View',url:'https://example.com/{{${user_id}}}'}]})),carouselButtonType:'website'};
  assert.deepEqual(validateWhatsAppCampaign({config:{whatsappVariants:[v]}}),[]);
  const payload = prepareWhatsAppMessage(v,[],{first_name:'Alex',user_id:'u1'});
  assert.equal(payload.carouselCards[0].body,'Hi Alex');
  assert.equal(payload.carouselCards[1].buttons[0].url,'https://example.com/u1');
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[{...v,carouselCards:v.carouselCards.slice(0,1)}]}}).join(' '),/2 and 10/);
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[{...v,carouselCards:[{...v.carouselCards[0],mediaUrl:'file:///private/test'},v.carouselCards[1]]}]}}).join(' '),/HTTPS/);
});
test("response headers, footers and labels are resolved per recipient", async () => {
  const { prepareWhatsAppMessage } = await import('../lib/whatsapp-model.ts');
  const v={...createWhatsAppVariant(),mode:'response',responseLayout:'quick_reply',conversationWindowOpen:true,responseHeaderType:'text',responseHeaderText:'Hi {{${first_name}}}',responseFooter:'Reply {{${country}}}',quickReplies:['{{${choice}}}']};
  const payload=prepareWhatsAppMessage(v,[],{first_name:'Alex',country:'US',choice:'Help'});
  assert.equal(payload.headerText,'Hi Alex');assert.equal(payload.footer,'Reply US');assert.equal(payload.buttons[0].label,'Help');
  assert.throws(()=>prepareWhatsAppMessage(v,[],{choice:'a'.repeat(21)}),/1–20/);
});
test("source templates retain both quick replies and local media URLs", async () => {
  const { prepareWhatsAppMessage, whatsappTemplates }=await import('../lib/whatsapp-model.ts');
  const t=whatsappTemplates.find(t=>t.id==='abandoned_onboarding');
  const v={...createWhatsAppVariant(),templateId:t.id,language:t.language,headerUrl:'/api/whatsapp/media/res_demo',variables:t.variables.map(v=>({...v,value:'Alex'}))};
  assert.deepEqual(validateWhatsAppCampaign({config:{whatsappVariants:[v]}}),[]);
  const payload=prepareWhatsAppMessage(v);
  assert.deepEqual(payload.buttons.map(b=>b.label),['Finish now','Remind me later']);
  assert.equal(payload.mediaUrl,'/api/whatsapp/media/res_demo');
});
test("unconfigured layouts and unavailable provider assets cannot launch", () => {
  const v={...createWhatsAppVariant(),mode:'response',conversationWindowOpen:true};
  for(const [layout,pattern] of [['flow',/No Flows/],['product',/Meta catalog/]])assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[{...v,responseLayout:layout}]}}).join(' '),pattern);
  assert.match(validateWhatsAppCampaign({config:{whatsappSetupStage:'type',whatsappVariants:[v]}}).join(' '),/Select a WhatsApp message type/);
  assert.match(validateWhatsAppCampaign({config:{whatsappVariants:[{...v,responseBody:'a'.repeat(4097)}]}}).join(' '),/4,096/);
});
