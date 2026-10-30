import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { gmailPromotionHead, normalizeGmailPromotion, applyGmailPromotion, emailCustomHeaders, emailExtras, emailAttachmentIssue } from '../lib/email-fidelity-model.ts';
import { compileWorkspaceEmail } from '../lib/email-runtime.ts';
import { defaultEmailPreferences } from '../lib/email-preferences.ts';
import { variantDraft } from '../lib/campaign-shared.ts';
const context={profile:{first_name:'Ada'},unsubscribeUrl:'https://example.test/out',optInUrl:'https://example.test/in'};
const annotations=html=>JSON.parse(html.match(/data-braze-gmail-promotion="true">\s*([\s\S]*?)<\/script>/)?.[1]??'[]');
test('Gmail setup emits all enabled annotations, including deal and multiple promotion cards',()=>{
 const promotion={companyLogo:'https://example.test/logo.png',subject:'Spring sale',image:'https://example.test/main.jpg',offer:'20% off',code:'SAVE',starts:'2026-10-30T09:00',ends:'2026-10-31T09:00',dealEnabled:true,dealUrl:'https://example.test/deal',dealPrice:'20',dealCurrency:'USD',cardsEnabled:true,cards:[{image:'https://example.test/card.jpg',url:'https://example.test/item',headline:'Item',price:'10',currency:'EUR'}]};
 const result=annotations(gmailPromotionHead(promotion));
 assert.equal(result.length,6);assert.equal(result.find(row=>row['@type']==='DiscountOffer').discountCode,'SAVE');assert.equal(result[4].priceCurrency,'USD');assert.equal(result[5].position,1);assert.equal(result[5].priceCurrency,'EUR');
});
test('Gmail disabled switches omit dormant offer and cards without losing their stored values',()=>{
 const value=normalizeGmailPromotion({offer:'20% off',code:'SAVE',discountEnabled:false,dealEnabled:false,dealUrl:'https://example.test',cardsEnabled:false,cards:[{image:'https://example.test/a.jpg'}]});
 assert.equal(gmailPromotionHead(value),'');assert.equal(JSON.parse(JSON.stringify(value)).code,'SAVE');
});
test('Gmail annotations escape script termination and replacement remains idempotent',()=>{
 const setup={subject:'</script><img src=x onerror=alert(1)>'};
 const first=applyGmailPromotion('<html><head><title>Mail</title></head><body>Hello</body></html>',setup);
 const second=applyGmailPromotion(first,setup);assert.equal(second,first);assert.equal((first.match(/<script /g)??[]).length,1);assert.equal(annotations(first)[0].subjectLine,setup.subject);assert.ok(first.indexOf('data-braze-gmail')<first.indexOf('</head>'));
 assert.equal(applyGmailPromotion(first,{}).includes('data-braze-gmail'),false);
});
test('header validation rejects duplicate names, line breaks and delivery header overrides',()=>{
 assert.throws(()=>emailCustomHeaders([{key:'X-Tag',value:'a'},{key:'x-tag',value:'b'}]),/Duplicate/);
 for(const key of ['Subject','Content-Type','List-Unsubscribe','bad\r\nBcc'])assert.throws(()=>emailCustomHeaders([{key,value:'x'}]),/valid custom header/);
 assert.throws(()=>emailCustomHeaders([{key:'X-Safe',value:'x\nBcc: evil@test'}]),/line breaks/);
 assert.deepEqual(emailCustomHeaders([{key:'',value:''}]),{});
});
test('extras preserve literal keys, render values, and reject duplicate and empty keys',()=>{
 const extras=emailExtras([{key:'__proto__',value:'Ada'},{key:'customer',value:'raw'}],value=>value.toUpperCase());assert.equal(extras.customer,'RAW');assert.ok(Object.hasOwn(extras,'__proto__'));assert.equal(Object.getPrototypeOf(extras),Object.prototype);
 assert.throws(()=>emailExtras([{key:'',value:'x'}]),/unique/);assert.throws(()=>emailExtras([{key:'x',value:'a'},{key:'x',value:'b'}]),/unique/);
});
test('headers, extras, reply-to, preheader whitespace and annotation Liquid reach compiled message',()=>{
 const result=compileWorkspaceEmail({subject:'Hello',body:'<html><head></head><body>Mail</body></html>',config:{emailGmailPromotion:{subject:'For {{${first_name}}}'},emailSending:{headers:[{key:'X-User',value:'{{${first_name}}}'}],extras:[{key:'customer',value:'{{${first_name}}}'}],fromName:'Our Team',ipPool:'Transactional',replyTo:'reply@example.test',preheader:'For {{${first_name}}}',whitespace:true}}},defaultEmailPreferences(),context);
 assert.equal(result.headers['X-User'],'Ada');assert.equal(result.extras.customer,'Ada');assert.equal(result.replyTo,'reply@example.test');assert.equal(result.ipPool,'Transactional');assert.equal(result.fromName,'Our Team');assert.ok(result.mime.includes('X-User: Ada'));assert.match(result.html,/For Ada/);assert.match(result.html,/data-email-preheader/);assert.match(result.html,/&zwnj;/);assert.equal(annotations(result.html)[0].subjectLine,'For Ada');
});
test('attachment size is enforced by actual base64 bytes as well as metadata',()=>{
 assert.equal(emailAttachmentIssue({name:'test.pdf',content:Buffer.alloc(2*1024*1024).toString('base64')}),'');
 assert.match(emailAttachmentIssue({name:'test.pdf',size:1,content:Buffer.alloc(2*1024*1024+1).toString('base64')}),/2 MB/);
 assert.match(emailAttachmentIssue({name:'test.pdf',url:'https://example.test/a',size:2*1024*1024+1}),/2 MB/);
 assert.match(emailAttachmentIssue({name:'test.pdf',url:'javascript:bad'}),/HTTPS/);
 assert.throws(()=>compileWorkspaceEmail({config:{emailAttachments:[{name:'big.pdf',url:'https://example.test/a',size:2*1024*1024+1}]}},defaultEmailPreferences(),context),/2 MB/);
});
test('serialized variant settings compile independently after reopening',()=>{
 const campaign=JSON.parse(JSON.stringify({channel:'email',body:'primary',config:{variants:[{id:'a',name:'A',body:'A',config:{emailGmailPromotion:{subject:'Promo A'},emailSending:{headers:[{key:'X-Variant',value:'A'}],extras:[{key:'variant',value:'A'}]}}},{id:'b',name:'B',body:'B',config:{emailGmailPromotion:{subject:'Promo B'},emailSending:{headers:[{key:'X-Variant',value:'B'}],extras:[{key:'variant',value:'B'}]}}}]}}));
 for(const [index,name] of ['A','B'].entries()){const result=compileWorkspaceEmail(variantDraft(campaign,index),defaultEmailPreferences(),context);assert.equal(result.headers['X-Variant'],name);assert.equal(result.extras.variant,name);assert.equal(annotations(result.html)[0].subjectLine,`Promo ${name}`);}
});
