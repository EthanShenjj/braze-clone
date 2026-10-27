import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateFlag, transformPayload, validateModule } from '../lib/workspace-modules.ts';
import { customEventSummary, filteredEvents, messageSummary, revenueSummary } from '../lib/reporting-model.ts';
import { parseUserCsv } from '../lib/csv.ts';
test('CSV supports quoted commas and newlines and rejects duplicate identities', () => {
  const result = parseUserCsv('external_id,email,first_name\r\na,a@example.test,"Ada, A"\r\nb,b@example.test,"Ben\nB"');
  assert.equal(result.rows[0].first_name, 'Ada, A'); assert.equal(result.rows[1].first_name, 'Ben\nB');
  assert.throws(() => parseUserCsv('external_id,email\na,a@example.test\na,b@example.test'), /duplicate/);
  assert.throws(() => parseUserCsv('external_id,email\na,"unclosed'), /Unclosed/);
});
test('ordered rollout rules and stable assignments survive repeated evaluation', () => {
  const flag = { flagId: 'checkout', enabled: true, rollout: 0, rules: [{ id: 'us', rollout: 100, filters: [{ field: 'country', operator: 'equals', value: 'US' }] }], properties: { color: 'blue' } };
  assert.equal(evaluateFlag(flag, { id: '1', country: 'US' }).enabled, true);
  assert.equal(evaluateFlag(flag, { id: '2', country: 'DE' }).enabled, false);
  const percent = { ...flag, rules: [], rollout: 25 };
  const first = Array.from({ length: 1000 }, (_, i) => evaluateFlag(percent, { id: String(i) }).enabled);
  assert.deepEqual(first, Array.from({ length: 1000 }, (_, i) => evaluateFlag(percent, { id: String(i) }).enabled));
  assert.ok(first.filter(Boolean).length > 150 && first.filter(Boolean).length < 350);
});
test('transformations map nested data and reject prototype traversal or unidentified payloads', () => {
  const config = { userIdPath: 'user.id', mapping: { first_name: 'user.name', plan: 'account.plan' } };
  assert.deepEqual(transformPayload(config, { user: { id: 'ada', name: 'Ada' }, account: { plan: 'pro' } }), { external_id: 'ada', attributes: { first_name: 'Ada', plan: 'pro' } });
  assert.throws(() => transformPayload(config, { user: {} }), /user ID/);
  assert.throws(() => transformPayload({ ...config, mapping: { bad: '__proto__.x' } }, { user: { id: 'ada' } }), /Invalid source path/);
});
test('flag identifiers are immutable and published slugs are validated', () => {
  assert.throws(() => validateModule('feature-flags', { name: 'Flag', data: { flagId: 'new', rules: [], properties: {} } }, { data: { flagId: 'old' } }), /cannot be changed/);
  assert.throws(() => validateModule('landing-pages', { name: 'Landing', data: { slug: '../etc', title: 'Offer' } }), /URL slug/);
});
test('message filters isolate channels and unique conversion rates use user counts', () => {
  const base = { campaign_id: 'a', campaign_name: 'A', created_at: '2026-10-27T10:00:00Z' };
  const events = [
    { ...base, id: '1', user_id: '1', channel: 'email', event_type: 'delivered' },
    { ...base, id: '2', user_id: '2', channel: 'email', event_type: 'delivered' },
    { ...base, id: '3', user_id: '1', channel: 'email', event_type: 'conversion' },
    { ...base, id: '4', user_id: '1', channel: 'email', event_type: 'conversion' },
    { ...base, id: '5', user_id: '3', channel: 'push', event_type: 'delivered' },
  ];
  const filtered = filteredEvents(events, { from: '2026-10-27', to: '2026-10-27', channel: 'email', campaign: '' });
  const result = messageSummary(filtered);
  assert.equal(result.delivered, 2); assert.equal(result.conversions, 2); assert.equal(result.uniqueConversions, 1); assert.equal(result.conversionRate, 50);
});
test('revenue never mixes currencies or custom events with purchases', () => {
  const events = [
    { id: '1', name: 'purchase', data: { userId: 'a', productId: 'p', price: 10, quantity: 2, currency: 'USD', createdAt: '2026-10-27' } },
    { id: '2', name: 'purchase', data: { userId: 'a', productId: 'p', price: 500, quantity: 1, currency: 'EUR', createdAt: '2026-10-27' } },
    { id: '3', name: 'Viewed Product', data: { userId: 'a', createdAt: '2026-10-27' } },
  ];
  assert.equal(revenueSummary(events, '2026-10-01', '2026-10-31', 'USD').revenue, 20);
  assert.equal(revenueSummary(events, '2026-10-01', '2026-10-31', 'EUR').revenue, 500);
  assert.deepEqual(customEventSummary(events, '2026-10-01', '2026-10-31').map(r => r.name), ['Viewed Product']);
});
