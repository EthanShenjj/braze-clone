import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {compilePush,compileContentCard,channelConfigurationIssues} from '../lib/channel-message-model.ts';
import {creativeHtml} from '../lib/creative-model.ts';
import {renderBrazeLiquid} from '../lib/email-liquid.ts';
import {defaultGlobal,defaultPage,validateInAppVariant} from '../lib/in-app-model.ts';
import {traditionalDefaults,traditionalAppearance} from '../lib/in-app-traditional.ts';
import {prepareInAppPreview} from '../lib/in-app-runtime.ts';
import {createWhatsAppVariant,normalizeWhatsAppVariants,prepareWhatsAppMessage} from '../lib/whatsapp-model.ts';
import {normalizeWebhookVariants} from '../lib/webhook-model.ts';
const draft=(channel,values={})=>({channel,subject:'Hello {{${first_name}}}',body:'Message',config:{channelValues:values}});

test('push platform payloads preserve advanced settings and resolve notification IDs',()=>{
 const v={platforms:['iOS','Android'],badgeEnabled:false,badge:7,relevanceScore:.8,contentAvailable:true,mutableContent:true,notificationGroup:'updates',expirationEnabled:true,expiration:'2026-11-01T00:00:00Z',androidChannel:'offers',androidNotificationId:'{{${user_id}}}',androidVisibility:'Public',androidPriority:'High',androidIconColorEnabled:true,androidIconColor:'#ffffff',androidSound:'ding',ttl:3600};
 const result=compilePush(draft('push',v),{first_name:'Ada',user_id:'42'}),ios=result.platforms[0].payload,android=result.platforms[1].payload;
 assert.equal(result.platforms[0].title,'Hello Ada');assert.equal(ios.aps.badge,undefined);assert.equal(ios.aps['content-available'],1);assert.equal(ios.aps['relevance-score'],.8);assert.equal(ios.aps.category,'updates');assert.equal(ios.headers['apns-expiration'],Date.parse(v.expiration)/1000);assert.equal(android.notification.tag,'42');assert.equal(android.notification.channel_id,'offers');assert.equal(android.ttl,3600);assert.equal(android.notification.color,'#ffffff');
});
test('invalid relevance and enabled missing expiration cannot launch',()=>{
 assert.match(channelConfigurationIssues(draft('push',{relevanceScore:2,expirationEnabled:true})).join(' '),/relevance score.*expiration/);
});
test('content cards resolve translations, accessibility and independent platform destinations',()=>{
 const values={separatePlatformActions:true,platformActions:{iOS:{behavior:'Deep link into app',url:'myapp://offer'},Android:{behavior:'None'}},contentByLanguage:{ja:{title:'こんにちは {{${first_name}}}',message:'特典'}},accessibilityLanguageLiquid:'{{${language}}}',pinned:true};
 const ios=compileContentCard(draft('content',values),{platform:'iOS',language:'ja',first_name:'Ada'}),android=compileContentCard(draft('content',values),{platform:'Android'});
 assert.equal(ios.title,'こんにちは Ada');assert.equal(ios.destinationUrl,'myapp://offer');assert.equal(ios.accessibilityLanguage,'ja');assert.equal(ios.pinned,true);assert.equal(android.destinationUrl,'');assert.equal(android.clickAction,'None');
});
test('new card action defaults to None while legacy destinations remain reversible',()=>{
 const empty=draft('content');assert.equal(compileContentCard(empty).clickAction,'None');const legacy=draft('content',{destinationUrl:'https://example.com'});assert.equal(compileContentCard(legacy).destinationUrl,'https://example.com');legacy.config.channelValues.clickAction='None';assert.equal(compileContentCard(legacy).destinationUrl,'');
});
test('Banner localized text renders for recipients and retains its English fallback',()=>{
 const rows=[{id:'r',background:'#fff',padding:0,cells:[[{id:'b',type:'Title',text:'Welcome',translations:{ja:{text:'ようこそ'}}}]]}],html=creativeHtml(rows);
 assert.match(renderBrazeLiquid(html,{language:'ja'}),/ようこそ/);assert.doesNotMatch(renderBrazeLiquid(html,{language:'ja'}),/>Welcome</);assert.match(renderBrazeLiquid(html,{language:'en'}),/>Welcome</);
});
test('Banner capture/subscription blocks invoke connected SDK user setters',()=>{
 const blocks=['Email Capture','Phone Capture','Manage Subscriptions'].map((type,i)=>({id:String(i),type,text:type})),html=creativeHtml([{id:'r',background:'#fff',padding:0,cells:[blocks]}]);
 assert.match(html,/type="email"/);assert.match(html,/type="tel"/);assert.match(html,/data-braze-subscription="email"/);
 let handler,flushes=0;const calls=[];vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{addEventListener:(_type,fn)=>handler=fn},window:{braze:{getUser:()=>({setEmail:value=>calls.push(['email',value]),setPhoneNumber:value=>calls.push(['phone',value]),setEmailNotificationSubscriptionType:value=>calls.push(['subscription',value])}),requestImmediateDataFlush:()=>flushes++}}});
 for(const [dataset,value] of [[{brazeCapture:'email'},'a@example.com'],[{brazeCapture:'phone'},'+15550000000'],[{brazeSubscription:'email'},'unsubscribed']]){const output={textContent:''};handler({preventDefault(){},target:{dataset,querySelector:selector=>selector==='output'?output:{value}}});assert.match(output.textContent,/saved/);}
 assert.deepEqual(calls,[['email','a@example.com'],['phone','+15550000000'],['subscription','unsubscribed']]);assert.equal(flushes,3);
});
const native=()=>({id:'v',name:'Native',editorMode:'traditional',sendTo:'Mobile Apps',pages:[{...defaultPage(),buttons:[{id:'b',text:'Open',behavior:'dismiss',href:'',style:'primary',platformActions:{Android:{id:'b',text:'Open',behavior:'web_url',href:'https://example.com/{{${user_id}}}',style:'primary'},iOS:{id:'b',text:'Open',behavior:'deep_link',href:'myapp://offer',style:'primary'}}}]}],global:{...defaultGlobal},traditional:{...traditionalDefaults(),darkModeEnabled:true,darkStyle:{global:{backgroundColor:'#111111',textColor:'#ffffff'},traditional:{headerColor:'#ffffff'}}},accessibilityLanguage:'en'});
test('IAM runtime selects platform behavior and dark appearance without modifying saved light style',()=>{
 const v=native(),dark=prepareInAppPreview(v,{platform:'Android',colorScheme:'dark',user_id:'42'}),light=prepareInAppPreview(v,{platform:'iOS'});
 assert.equal(dark.pages[0].buttons[0].href,'https://example.com/42');assert.equal(dark.global.backgroundColor,'#111111');assert.equal(dark.traditional.headerColor,'#ffffff');assert.equal(light.pages[0].buttons[0].href,'myapp://offer');assert.equal(v.global.backgroundColor,defaultGlobal.backgroundColor);assert.equal(traditionalAppearance(v,'light'),v);
});
test('IAM rejects an invalid platform-specific URL before persistence',()=>{const v=native();v.pages[0].buttons[0].platformActions.Android.href='javascript:bad';assert.match(validateInAppVariant(v).join(' '),/HTTP or HTTPS/);});
test('WhatsApp persisted response translations and URL preview reach prepared provider message',()=>{
 const v={...createWhatsAppVariant(),mode:'response',responseLayout:'text',responseLayoutChosen:true,urlPreview:true,responseLanguages:['en','es'],responseTranslations:{es:'Hola {{${first_name}}}'}};
 const normalized=normalizeWhatsAppVariants({config:{whatsappVariants:[v]}})[0],prepared=prepareWhatsAppMessage(normalized,[],{language:'es',first_name:'Ada'});assert.equal(prepared.message,'Hola Ada');assert.equal(prepared.urlPreview,true);assert.deepEqual(normalized.responseLanguages,['en','es']);assert.equal(normalized.responseLayoutChosen,true);
});
test('webhook managed credential references survive normalization without exposing secrets',()=>{const normalized=normalizeWebhookVariants({config:{channelValues:{webhookVariants:[{id:'v',name:'V',url:'https://example.com',credentialId:'cred_1'}]}}})[0];assert.equal(normalized.credentialId,'cred_1');assert.equal(JSON.stringify(normalized).includes('credentialEnv'),false);});

test('fresh WhatsApp setup requires layout selection while legacy response drafts retain their chosen layout',()=>{assert.equal(createWhatsAppVariant().responseLayoutChosen,false);const fresh=normalizeWhatsAppVariants({config:{whatsappVariants:[createWhatsAppVariant()]}})[0];assert.equal(fresh.responseLayoutChosen,false);const legacy={...createWhatsAppVariant()};delete legacy.responseLayoutChosen;assert.equal(normalizeWhatsAppVariants({config:{whatsappVariants:[legacy]}})[0].responseLayoutChosen,true);});

test('IAM dark styles are validated before persistence',()=>{const v=native();v.traditional.darkStyle.traditional.headerOpacity=120;assert.match(validateInAppVariant(v).join(' '),/Dark mode.*header opacity/);});

test('Copywriter channel text responses and existing email contract share the configured provider',async()=>{
 const {POST}=await import('../app/api/messages/assist/route.ts'),previousFetch=globalThis.fetch,previousEndpoint=process.env.WORKSPACE_AI_ENDPOINT,previousKey=process.env.WORKSPACE_AI_API_KEY;process.env.WORKSPACE_AI_ENDPOINT='https://ai.example.test';process.env.WORKSPACE_AI_API_KEY='test-key';const instructions=[];
 try{globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body);instructions.push(body.messages[0].content);return Response.json(body.messages[0].content.includes('text string')?{text:'Updated message'}:{subject:'Email title',html:'<p>Email</p>'});};
 const text=await POST(new Request('https://local.test/api/messages/assist',{method:'POST',body:JSON.stringify({channel:'line',prompt:'Write a welcome'})}));assert.deepEqual(await text.json(),{text:'Updated message'});const email=await POST(new Request('https://local.test/api/messages/assist',{method:'POST',body:JSON.stringify({prompt:'Write an email'})}));assert.deepEqual(await email.json(),{subject:'Email title',html:'<p>Email</p>'});assert.match(instructions[0],/line/);assert.match(instructions[1],/subject and html/);
 }finally{globalThis.fetch=previousFetch;if(previousEndpoint===undefined)delete process.env.WORKSPACE_AI_ENDPOINT;else process.env.WORKSPACE_AI_ENDPOINT=previousEndpoint;if(previousKey===undefined)delete process.env.WORKSPACE_AI_API_KEY;else process.env.WORKSPACE_AI_API_KEY=previousKey;}
});
