import test from 'node:test';
import assert from 'node:assert/strict';
import { smsMetrics, smsPreview, smsLanguageSnippet, smsIssues } from '../lib/sms-model.ts';

test('GSM basic, extension, accented and empty messages use correct encoding and boundaries', () => {
  assert.deepEqual(smsMetrics(''), { characters: 0, units: 0, encoding: 'GSM-7', segments: 0 });
  assert.equal(smsMetrics('é£à').encoding, 'GSM-7');
  assert.equal(smsMetrics('a'.repeat(160)).segments, 1);
  assert.equal(smsMetrics('a'.repeat(161)).segments, 2);
  assert.equal(smsMetrics('^'.repeat(80)).segments, 1);
  assert.equal(smsMetrics('^'.repeat(81)).segments, 2);
  assert.equal(smsMetrics('^'.repeat(153)).segments, 3); // escape sequences cannot be split
});
test('Unicode counts UTF-16 units without splitting emoji across multipart segments', () => {
  assert.equal(smsMetrics('中'.repeat(70)).segments, 1);
  assert.equal(smsMetrics('中'.repeat(71)).segments, 2);
  assert.equal(smsMetrics('😀'.repeat(35)).segments, 1);
  assert.equal(smsMetrics('😀'.repeat(36)).segments, 2);
  assert.equal(smsMetrics('😀'.repeat(67)).segments, 3);
  assert.equal(smsMetrics('`').encoding, 'UCS-2');
});
test('personalization, language branching and link shortening reflect the rendered user', () => {
  const source = "Hi {{${first_name} | default: 'friend'}} https://example.com/offers";
  assert.equal(smsPreview(source, {}, false), 'Hi friend https://example.com/offers');
  assert.equal(smsPreview(source, { first_name: 'Alex' }), 'Hi Alex https://brz.ai/XXXXXXXX');
  const snippet = smsLanguageSnippet(['en', 'zh']).replace("'en' %}\n\n", "'en' %}\nHello\n").replace("'zh' %}\n\n", "'zh' %}\n你好\n");
  assert.equal(smsPreview(snippet, { language: 'zh' }).trim(), '你好');
  assert.equal(smsPreview('See https://example.com/sale. Thanks!'), 'See https://brz.ai/XXXXXXXX. Thanks!');
  assert.throws(() => smsPreview('{% if %}broken'));
});
test('required SMS fields are validated', () => {
  assert.equal(smsIssues('', '').length, 2);
  assert.equal(smsIssues('Hello', 'sg_sms_alerts').length, 0);
  assert.equal(smsIssues('a'.repeat(20001), 'sg_sms_alerts').length, 1);
});
