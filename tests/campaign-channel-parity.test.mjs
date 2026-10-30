import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignValidationIssues } from '../lib/campaign-validation.ts';
import { allocation, allocationIssues, pickVariant, variantDraft, matchesAudienceGroups } from '../lib/campaign-shared.ts';
import { compileSms,contactVcard,compilePush } from '../lib/channel-message-model.ts';
import { inAppTemplates } from '../lib/in-app-templates.ts';
import { validateInAppVariant,defaultGlobal } from '../lib/in-app-model.ts';
import { compileLineMessages,validateLineCampaign } from '../lib/line-model.ts';
import { compileWorkspaceEmail,buildEmailMime } from '../lib/email-runtime.ts';
import { defaultEmailPreferences } from '../lib/email-preferences.ts';
import { nextScheduledTime,zonedDateTime,triggerMatches } from '../lib/campaign-scheduling.ts';

const base=(channel,values={})=>({name:'Parity test',channel,body:'Hello',subject:'Title',schedule:'One time',config:{channelValues:values}});
test('the seven audit validation probes are rejected by the shared validator',()=>{
 const sms=base('sms');sms.body='a'.repeat(1601);
 const cases=[sms,base('banner',{destinationUrl:'broken'}),base('push',{destination:'broken',ttl:-10}),base('content',{imageUrl:'broken',destinationUrl:'broken',expires:true}),base('line'),base('multichannel',{channels:['In-app message'],channelContent:{'In-app message':'Hello'}}),{...base('email'),config:{variants:[{id:'a',name:'A'},{id:'b',name:'B'}],controlGroup:0,variantSplits:[5,5]}}];
 for(const draft of cases)assert.ok(campaignValidationIssues(draft).length,`${draft.channel} must reject the audit probe`);
});
test('weighted variants preserve content and per-channel configuration',()=>{
 const c={...base('push'),config:{controlGroup:10,variantSplits:[9,81],messageVariants:[{id:'a',name:'A',body:'Alpha',config:{channelValues:{ttl:10}}},{id:'b',name:'B',body:'Bravo',config:{channelValues:{ttl:20}}}]}};
 assert.deepEqual(allocationIssues(c),[]);assert.equal(pickVariant(c,.099),0);assert.equal(pickVariant(c,.1),1);assert.equal(variantDraft(c,1).body,'Bravo');assert.equal(variantDraft(c,1).config.channelValues.ttl,20);
 assert.ok(allocationIssues({...c,config:{...c.config,variantSplits:[9,80]}}).length);
});
test('LINE launch validation checks edited message variants instead of legacy root content',()=>{
 const c={...base('line'),config:{subscriptionGroupId:'line_group',messageVariants:[{id:'a',name:'A',body:'',config:{channelValues:{lineMessages:[{type:'Text',text:''}]}}}]}};
 assert.match(campaignValidationIssues(c).join(' '),/1–5,000 text characters/);
 c.config.messageVariants[0].config.channelValues.lineMessages[0].text='Valid LINE message';
 assert.deepEqual(campaignValidationIssues(c),[]);
});
test('push validation rejects an empty secondary variant and permits a silent notification',()=>{
 const c={...base('push'),config:{messageVariants:[{id:'a',name:'A',subject:'A',body:'Hello'},{id:'b',name:'B',subject:'B',body:''}]}};
 assert.match(campaignValidationIssues(c).join(' '),/B: Add push message content/);
 c.config.messageVariants[1].body='Second message';assert.deepEqual(campaignValidationIssues(c),[]);
 assert.deepEqual(campaignValidationIssues({...base('push',{silent:true}),subject:'',body:''}),[]);
});
test('Banner launch validation checks destinations and event names inside edited blocks',()=>{
 const action={type:'url',url:'broken'},c=base('banner',{placement:'home',rows:[{cells:[[{type:'Button',text:'Open',action}]]}]});
 assert.match(campaignValidationIssues(c).join(' '),/Banner block destination URL/);
 action.url='https://example.com';assert.deepEqual(campaignValidationIssues(c),[]);
 action.type='log_event';action.name='';assert.match(campaignValidationIssues(c).join(' '),/name for the Banner block action/);
 action.name='banner_clicked';assert.deepEqual(campaignValidationIssues(c),[]);
});
test('AND, OR and exclusion groups evaluate actual conditions',()=>{
 const rules=[{id:'country',field:'country',operator:'equals',value:'US'},{id:'plan',field:'attr:plan',operator:'equals',value:'pro'}],user={country:'US',attributes:{plan:'free'}};
 assert.equal(matchesAudienceGroups(user,[{id:'g',operator:'AND',exclude:false,rules}]),false);
 assert.equal(matchesAudienceGroups(user,[{id:'g',operator:'OR',exclude:false,rules}]),true);
 assert.equal(matchesAudienceGroups(user,[{id:'g',operator:'OR',exclude:true,rules}]),false);
});
test('all fourteen IAM catalog entries contain valid usable page definitions',()=>{
 assert.equal(inAppTemplates.length,14);
 for(const template of inAppTemplates){assert.ok(template.pages?.length,template.name);const variant={id:template.id,name:template.name,sendTo:'Web Browsers',pages:template.pages,global:{...defaultGlobal,...template.global},accessibilityLanguage:'en'};assert.deepEqual(validateInAppVariant(variant),[],template.name);}
});
test('SMS metrics and maximum length apply after personalization and opt-out text',()=>{
 const c={...base('sms'),body:'Hi {{${first_name}}}',config:{subscriptionGroupId:'group',channelValues:{appendStop:true}}};
 const result=compileSms(c,{first_name:'Ada'});assert.equal(result.message,'Hi Ada\n\nReply STOP to opt-out.');assert.equal(result.metrics.characters,result.message.length);
 assert.throws(()=>compileSms({...c,body:'a'.repeat(1590)}),/1,600/);
 const media=compileSms({...c,body:'',config:{channelValues:{messageType:'MMS',mediaUrl:'https://example.com/img.png',appendStop:false}}});assert.equal(media.mediaUrl,'https://example.com/img.png');
});
test('vCard output escapes field separators and cannot inject a new property',()=>{const v=contactVcard({firstName:'Ada',lastName:'Example',organization:'Org\nTEL:bad',phone:'+15550001111',email:'test@example.com'});assert.match(v,/BEGIN:VCARD\r\nVERSION:3.0/);assert.match(v,/ORG:Org\\nTEL:bad/);assert.ok(!v.includes('\r\nTEL:bad'));assert.ok(v.endsWith('END:VCARD\r\n'));});
test('push rendering resolves language and independent platform content',()=>{const c={...base('push'),config:{channelValues:{platforms:['iOS','Web'],sameForAll:false,platformContent:{Web:{title:'Web title'}},contentByLanguage:{es:{title:'Hola {{${first_name}}}',message:'Oferta'}}}}};assert.equal(compilePush(c,{first_name:'Ada',language:'es'}).platforms[0].title,'Hola Ada');assert.equal(compilePush(c,{language:'en'}).platforms[1].title,'Web title');});
test('LINE supports ten cards, three actions and bounded rich-message click areas',()=>{
 const action={type:'uri',label:'Open',uri:'https://example.com'},cards=Array.from({length:10},(_,i)=>({title:`Card ${i}`,description:'Details',url:'https://example.com',actions:[action,{type:'message',label:'Reply',text:'Hello'}, {type:'postback',label:'Pick',data:'id=1'}]}));
 const c={config:{channelValues:{lineMessages:[{type:'Carousel',cards}]}}};assert.deepEqual(validateLineCampaign(c),[]);assert.equal(compileLineMessages(c)[0].template.columns.length,10);assert.equal(compileLineMessages(c)[0].template.columns[0].actions.length,3);
 const rich={config:{channelValues:{lineMessages:[{type:'Rich message',imageUrl:'https://example.com/img.png',areas:[{x:0,y:0,width:1040,height:1040,action}]}]}}};assert.deepEqual(validateLineCampaign(rich),[]);assert.equal(compileLineMessages(rich)[0].type,'imagemap');rich.config.channelValues.lineMessages[0].areas[0].width=1041;assert.ok(validateLineCampaign(rich).length);
});
test('email MIME includes independent plaintext, AMP and binary attachments',()=>{
 const c={body:'<h1>Hello</h1>',subject:'Hello',config:{emailPlainTextCustomized:true,emailPlainText:'Independent plain version',emailAmp:'<html amp4email>AMP</html>'}},context={profile:{},unsubscribeUrl:'https://example.com/unsub',optInUrl:'https://example.com/optin',attachments:[{name:'offer.pdf',mime:'application/pdf',content:Buffer.from('pdf contents').toString('base64'),size:12}]};
 const result=compileWorkspaceEmail(c,defaultEmailPreferences(),context);assert.equal(result.text,'Independent plain version');assert.match(result.mime,/multipart\/mixed/);assert.match(result.mime,/text\/x-amp-html/);assert.match(result.mime,/offer.pdf/);assert.match(result.mime,/cGRmIGNvbnRlbnRz/);
});
test('time-zone scheduling handles UTC, user local time and recurring dates',()=>{
 assert.equal(zonedDateTime('2026-10-28','10:00','Asia/Shanghai').toISOString(),'2026-10-28T02:00:00.000Z');
 const c={...base('email'),config:{delivery:{timing:'designated',frequency:'Daily',startDate:'2026-10-28',sendTime:'10:00',timezone:'UTC'}}};assert.equal(nextScheduledTime(c,new Date('2026-10-28T11:00:00Z')).toISOString(),'2026-10-29T10:00:00.000Z');
});
test('action triggers honor custom event names and property filter groups',()=>{const trigger={id:'event',type:'Perform Custom Event',eventName:'purchase',filtersEnabled:true,filterGroups:[{id:'g',match:'all',conditions:[{id:'p',property:'value',operator:'greater_than',value:'10',valueType:'number'}]}]};assert.equal(triggerMatches(trigger,{name:'purchase',properties:{value:20}}),true);assert.equal(triggerMatches(trigger,{name:'purchase',properties:{value:5}}),false);assert.equal(triggerMatches(trigger,{name:'view',properties:{value:20}}),false);});
