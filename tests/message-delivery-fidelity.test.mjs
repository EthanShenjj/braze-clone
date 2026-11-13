import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};return next(specifier,context);}});
const {dispatchPreparedMessage}=await import('../lib/message-delivery.ts');
const draft={channel:'email',config:{}};
process.env.RESEND_API_KEY='test-only';process.env.MESSAGE_DELIVERY_ENABLED='true';
test('native delivery rejects unsupported IP pools instead of silently dropping routing',async()=>{await assert.rejects(dispatchPreparedMessage(draft,'test@example.com',{ipPool:'dedicated-pool'}),/supports IP-pool routing/);});
test('native delivery rejects unsupported extras and unverified URL attachments',async()=>{await assert.rejects(dispatchPreparedMessage(draft,'test@example.com',{extras:{segment:'A'}}),/supports email metadata/);await assert.rejects(dispatchPreparedMessage(draft,'test@example.com',{attachmentResolutionRequired:true}),/size has not been verified/);});
test('verified native message forwards display name, headers and attachment bytes',async()=>{const original=globalThis.fetch;let payload;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(options.body);return new Response(JSON.stringify({id:'accepted-test'}),{status:200});};try{const result=await dispatchPreparedMessage(draft,'test@example.com',{from:'qa@example.com',fromName:'QA, Team',subject:'Subject',html:'<p>Hello</p>',headers:{'X-Example':'test'},attachments:[{name:'brief.txt',content:'SGVsbG8='}]});assert.equal(result.status,'accepted');assert.equal(result.delivered,false);assert.equal(payload.from,'"QA, Team" <qa@example.com>');assert.deepEqual(payload.attachments,[{filename:'brief.txt',content:'SGVsbG8='}]);assert.deepEqual(payload.headers,{'X-Example':'test'});}finally{globalThis.fetch=original;}});
test('durable dispatch identity reaches Resend and gateway idempotency headers',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(_url,options)=>{assert.equal(options.headers['Idempotency-Key'],'canvas-job-1');return Response.json({id:'provider-1',status:'accepted'});};
 try{await dispatchPreparedMessage({...draft,config:{runtimeDispatchId:'canvas-job-1'}},'test@example.com',{from:'qa@example.com',subject:'Hello',html:'Hello'});delete process.env.RESEND_API_KEY;process.env.MESSAGE_DELIVERY_ENDPOINT='https://example.test/messages';process.env.MESSAGE_DELIVERY_API_KEY='test-only';await dispatchPreparedMessage({channel:'push',config:{runtimeDispatchId:'canvas-job-1'}},'device-1',{body:'Hello'});}
 finally{globalThis.fetch=original;process.env.RESEND_API_KEY='test-only';delete process.env.MESSAGE_DELIVERY_ENDPOINT;delete process.env.MESSAGE_DELIVERY_API_KEY;}
});
test('LINE uses a stable UUID per durable dispatch and duplicate acceptance stays accepted',async()=>{
 const original=globalThis.fetch,keys=[];process.env.LINE_CHANNEL_ACCESS_TOKEN='test-only';
 globalThis.fetch=async(_url,options)=>{keys.push(options.headers['X-Line-Retry-Key']);return new Response('{}',{status:keys.length===2?409:200,headers:keys.length===2?{'x-line-accepted-request-id':'line-accepted'}:{'x-line-request-id':'line-accepted'}});};
 try{const line={channel:'line',config:{runtimeDispatchId:'canvas-line-job-1'}},recipient='U'+'a'.repeat(32);await dispatchPreparedMessage(line,recipient,{messages:[{type:'text',text:'Hello'}]});const repeated=await dispatchPreparedMessage(line,recipient,{messages:[{type:'text',text:'Hello'}]});assert.match(keys[0],/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);assert.equal(keys[0],keys[1]);assert.equal(repeated.status,'accepted');assert.equal(repeated.delivered,false);}
 finally{globalThis.fetch=original;delete process.env.LINE_CHANNEL_ACCESS_TOKEN;}
});
