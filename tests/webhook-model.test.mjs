import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWebhookVariant,
  normalizeWebhookVariants,
  redactHeaders,
  renderWebhookText,
  validateWebhookVariant,
} from "../lib/webhook-model.ts";

test("normalizes legacy webhook campaign values", () => {
  const variants = normalizeWebhookVariants({ body: '{"id":"static"}', config: { channelValues: { method: "PUT", url: "https://example.com/hook", headers: "Content-Type: application/json\nX-Team: growth" } } });
  assert.equal(variants.length, 1);
  assert.equal(variants[0].method, "PUT");
  assert.equal(variants[0].headers[1].key, "X-Team");
});

test("renders personalization defaults and translations", () => {
  const source = "{% translation greeting %}Hello{% endtranslation %}, {{${first_name} | default: 'there'}}";
  assert.equal(renderWebhookText(source, { first_name: "Ada" }, "zh-CN", { "zh-CN": { greeting: "你好" } }), "你好, Ada");
  assert.equal(renderWebhookText(source, {}, "en", {}), "Hello, there");
});

test("validates URL ports, defaults, GET bodies, and rendered JSON", () => {
  const valid = { ...defaultWebhookVariant(), url: "https://example.com/users/{{${user_id} | default: 'unknown'}}", body: '{"name":"{{${first_name} | default: \'there\'}}"}' };
  assert.deepEqual(validateWebhookVariant(valid), []);
  const invalid = { ...valid, method: "GET", url: "https://example.com:8443/{{${user_id}}}", body: "not allowed" };
  const issues = validateWebhookVariant(invalid);
  assert.ok(issues.some(issue => issue.includes("default value")));
  assert.ok(issues.some(issue => issue.includes("port 80 or 443")));
  assert.ok(issues.some(issue => issue.includes("GET webhooks")));
});

test("redacts authorization and token headers", () => {
  const headers = redactHeaders([{ id: "1", key: "Authorization", value: "Bearer secret" }, { id: "2", key: "Content-Type", value: "application/json" }]);
  assert.equal(headers[0].value, "••••••••");
  assert.equal(headers[1].value, "application/json");
});
