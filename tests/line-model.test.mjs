import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateLineCampaign, compileLineMessages } from '../lib/line-model.ts';
test('LINE image-only stacks validate without a text body', () => {
  const c={config:{channelValues:{lineMessages:[{type:'Image',imageUrl:'https://example.com/p.png'}]}}};
  assert.deepEqual(validateLineCampaign(c),[]);
  assert.equal(compileLineMessages(c)[0].type,'image');
});
test('LINE rejects malformed flex and renders personalized structured payloads', () => {
  assert.ok(validateLineCampaign({config:{channelValues:{lineMessages:[{type:'Flex message',flexJson:'{'}]}}}).length);
  const c={config:{channelValues:{lineMessages:[{type:'Text',text:'Hello {{${first_name}}}'},{type:'Flex message',flexJson:JSON.stringify({type:'bubble',body:{type:'box',contents:[{type:'text',text:'{{${first_name}}}'}]}})}]}}};
  const messages=compileLineMessages(c,{first_name:'Ada'});
  assert.equal(messages[0].text,'Hello Ada');
  assert.equal(messages[1].contents.body.contents[0].text,'Ada');
});
