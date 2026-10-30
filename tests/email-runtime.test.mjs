import { test } from 'node:test';
import { equal, ok, deepEqual, throws } from 'node:assert/strict';
import { defaultEmailPreferences, validateEmailPreferences } from '../lib/email-preferences.ts';
import { compileWorkspaceEmail, emailSendingIssues, isBotClick } from '../lib/email-runtime.ts';
import { renderBrazeLiquid } from '../lib/email-liquid.ts';
import { resolveLiquidPreview } from '../lib/email-editor-model.ts';
const context = { profile: { first_name: 'Ada', country: 'GB', favorite: 'Books' }, kind: 'test', unsubscribeUrl: 'https://mail.example.test/unsubscribe', optInUrl: 'https://mail.example.test/optin', pixelUrl: 'https://mail.example.test/pixel' };
test('conditional HTTPS Liquid validates all literal branches and resolves at compilation', () => {
 const prefs=defaultEmailPreferences();prefs.sending.unsubscribeMode='custom'; prefs.sending.unsubscribeUrl="{% if ${country} == 'GB' %}https://gb.example.test/out{% else %}https://us.example.test/out{% endif %}";
 deepEqual(validateEmailPreferences(prefs),[]);
 const output=compileWorkspaceEmail({body:'Hello'},prefs,context);equal(output.headers['List-Unsubscribe'],'<https://gb.example.test/out>');
 prefs.sending.unsubscribeUrl="{% if true %}https://safe.test/{% else %}javascript:bad{% endif %}";ok(validateEmailPreferences(prefs).length);
});
test('footer, personalized plaintext, TEST/SEED prefixes, CSS inlining, headers and pixel placement',()=>{
 const prefs=defaultEmailPreferences();prefs.sending.prefixTestSubject=true;prefs.sending.movePixelToTop=true;prefs.pages.footer={enabled:true,html:'<footer>Hello {{${first_name}}}<a href="{{${unsubscribe_url}}}">Unsubscribe</a></footer>',plainText:'Bye {{${first_name}}}'};
 const output=compileWorkspaceEmail({subject:'Hello {{${first_name}}}',body:'<html><head><style>.offer{color:red}</style></head><body><p class="offer">Offer</p>{{${email_footer}}}</body></html>'},prefs,context);
 equal(output.subject,'[TEST] Hello Ada');ok(output.html.includes('color: red'));ok(output.html.indexOf('data-open-tracking')<output.html.indexOf('class="offer"'));ok(output.html.includes(context.unsubscribeUrl));ok(output.text.includes('Bye Ada'));ok(!output.text.includes('Unsubscribe'));ok(output.mime.includes('multipart/alternative'));ok(output.mime.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'));equal(output.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 equal(compileWorkspaceEmail({subject:'Hello'},prefs,{...context,kind:'seed'}).subject,'[SEED] Hello');
 const raw=compileWorkspaceEmail({body:'<style>.x{color:red}</style><p class="x">X</p>',config:{emailCssInlining:false,emailSending:{unsubscribe:'Do not include',openTracking:false}}},prefs,context);deepEqual(raw.headers,{});ok(!raw.html.includes('style="color: red"'));ok(!raw.html.includes('data-open-tracking'));
});
test('address and BCC policies reject unlisted values while allowing configured defaults',()=>{
 const prefs=defaultEmailPreferences();prefs.sending.requireListedAddresses=true;prefs.sending.requireBcc=true;prefs.sending.bcc=[{id:'b',address:'archive@example.test'}];prefs.sending.defaultBccId='b';
 equal(emailSendingIssues({config:{emailSending:{fromAddress:'other@example.test',bcc:'No BCC address'}}},prefs).length,2);
 deepEqual(emailSendingIssues({config:{emailSending:{fromAddress:'braze@mta-a348.bftmail.com',bcc:'archive@example.test'}}},prefs),[]);
});
test('Liquid supports custom attributes, branching and filters; catalog loops use correctly sorted values',()=>{
 equal(renderBrazeLiquid("{% if custom_attribute.${favorite} == 'Books' %}{{${first_name} | upcase}}{% else %}Other{% endif %}",context.profile),'ADA');
 const ws={catalogItems:{books:[{id:'1',name:'One',fields:{price:100}},{id:'2',name:'Two',fields:{price:9}}]},catalogSelections:{books:[{name:'cheap',filters:[],randomSort:false,sortField:'price',sortDirection:'ascending',resultLimit:1}]}};
 equal(resolveLiquidPreview('{% catalog_selection_items books cheap %}{% for item in items %}{{item.name}}:{{item.price}}{% endfor %}',{},'en',ws),'Two:9');
});
test('bot classifications include explicit flags and security scanners',()=>{
 ok(isBotClick({bot:true}));ok(isBotClick({userAgent:'Proofpoint URL scanner'}));equal(isBotClick({userAgent:'Mozilla/5.0 Safari/605'}),false);
});

test('rendered header line breaks are rejected before producing a MIME message',()=>{
 throws(()=>compileWorkspaceEmail({subject:'Hello {{${first_name}}}'},defaultEmailPreferences(),{...context,profile:{first_name:'Ada\r\nBcc: attacker@example.test'}}),/line breaks/);
});

test('localized subject and preheader use exact/region/base locale fallbacks before Liquid rendering',()=>{
 const message={subject:'Default {{${first_name}}}',body:'<html><body>Body</body></html>',config:{emailSending:{preheader:'Default preview',subjectTranslations:{'zh-CN':'你好 {{${first_name}}}',ko:'안녕 {{${first_name}}}'},preheaderTranslations:{'zh-CN':'预览 {{${first_name}}}',ko:''}}}};
 const chinese=compileWorkspaceEmail(message,defaultEmailPreferences(),{...context,profile:{first_name:'Ada',language:'zh_CN'}});equal(chinese.subject,'你好 Ada');ok(chinese.html.includes('预览 Ada'));
 equal(compileWorkspaceEmail(message,defaultEmailPreferences(),{...context,profile:{first_name:'Ada',language:'zh'}}).subject,'你好 Ada');
 const korean=compileWorkspaceEmail(message,defaultEmailPreferences(),{...context,profile:{first_name:'Ada',language:'ko-KR'}});equal(korean.subject,'안녕 Ada');ok(korean.html.includes('Default preview'));
 equal(compileWorkspaceEmail(message,defaultEmailPreferences(),{...context,profile:{first_name:'Ada',language:'fr'}}).subject,'Default Ada');
});
test('GA parameters resolve Liquid, preserve query/fragments, and reach tracking destinations before rewriting',()=>{
 const seen=[];const result=compileWorkspaceEmail({body:'<a data-link-alias="buy" href="https://example.test/p?item=1&amp;utm_source=old#offer">Buy</a><a href="mailto:help@example.test">Help</a><img src="https://example.test/image.png">',config:{emailSending:{gaEnabled:true,utmSource:'newsletter',utmMedium:'email',utmCampaign:'offer {{${first_name}}}'}}},defaultEmailPreferences(),{...context,trackLink:(url,alias)=>{seen.push({url,alias});return 'https://tracking.test/click?token=x&channel=email';}});
 const destination=new URL(seen[0].url);equal(destination.searchParams.get('item'),'1');equal(destination.searchParams.get('utm_source'),'newsletter');equal(destination.searchParams.getAll('utm_source').length,1);equal(destination.searchParams.get('utm_campaign'),'offer Ada');equal(destination.hash,'#offer');equal(seen[0].alias,'buy');ok(result.html.includes('https://tracking.test/click'));ok(result.html.includes('mailto:help@example.test'));ok(!result.html.includes('image.png?utm'));equal(result.aliases[0].url,seen[0].url);
});
test('GA can work independently of click tracking and disabling GA leaves links untouched',()=>{
 const body='<a data-link-alias="buy" href="https://example.test/p">Buy</a>';
 const enabled=compileWorkspaceEmail({body,config:{emailSending:{gaEnabled:true,utmSource:'news',clickTracking:false}}},defaultEmailPreferences(),{...context,trackLink:()=>{throw Error('tracking disabled');}});ok(enabled.html.includes('utm_source=news'));
 const disabled=compileWorkspaceEmail({body,config:{emailSending:{gaEnabled:false,utmSource:'news',clickTracking:false}}},defaultEmailPreferences(),context);ok(!disabled.html.includes('utm_source'));
});
test('workspace fallback metadata follows the explicitly selected listed identity',()=>{
 const preferences=defaultEmailPreferences();preferences.sending.senders.push({id:'second',displayName:'Support',localPart:'help',domain:'example.test',ipPool:'Support_Pool'});
 const compiled=compileWorkspaceEmail({config:{emailSending:{fromAddress:'help@example.test'}}},preferences,context);equal(compiled.fromName,'Support');equal(compiled.ipPool,'Support_Pool');
});
