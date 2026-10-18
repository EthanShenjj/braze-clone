import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { defaultEmailPreferences, emailPreferenceCampaignDefaults, normalizeEmailPreferences, validateEmailPreferences } from "../lib/email-preferences.ts";

test("workspace defaults pass validation and do not share mutable theme objects", () => {
  const settings = defaultEmailPreferences();
  deepEqual(validateEmailPreferences(settings), []);
  settings.editor.headers[0].fontSize = 42;
  equal(defaultEmailPreferences().editor.headers[0].fontSize, 34);
});
test("migrates legacy From fields and keeps explicit false values", () => {
  const settings = normalizeEmailPreferences({ defaultFromName: "Store", defaultFromAddress: "news@store.test", sending: undefined, removeBotClicks: false });
  equal(settings.sending.senders[0].displayName, "Store");
  equal(settings.sending.senders[0].localPart, "news");
  equal(settings.sending.senders[0].domain, "store.test");
  equal(settings.removeBotClicks, false);
  equal(normalizeEmailPreferences({ sending: { inlineCss: false } }).sending.inlineCss, false);
});
test("older block themes acquire independent button and mobile padding defaults", () => {
  const settings = normalizeEmailPreferences({ editor: { button: { radius: 4 }, icon: { mobileFontSize: 16 } } });
  deepEqual(settings.editor.button.innerPadding, { top: 5, right: 10, bottom: 5, left: 10 });
  equal(settings.editor.button.radius, 4);
  equal(settings.editor.icon.mobileFontSize, 16);
  deepEqual(validateEmailPreferences(settings), []);
  settings.editor.icon.mobilePadding.top = 30;
  equal(defaultEmailPreferences().editor.icon.mobilePadding.top, 10);
  settings.editor.icon.mobileAlign = "invalid";
  ok(validateEmailPreferences(settings).some(message => message.includes("mobileAlign")));
});
test("rejects malformed API payloads without crashing", () => {
  for (const input of [null, [], {}, { sending: { senders: "bad" } }]) ok(validateEmailPreferences(input).length);
  const settings = defaultEmailPreferences();
  settings.removeBotClicks = "false";
  ok(validateEmailPreferences(settings).some(message => message.includes("removeBotClicks")));
});
test("BCC requirement needs an existing default address", () => {
  const settings = defaultEmailPreferences();
  settings.sending.requireBcc = true;
  ok(validateEmailPreferences(settings).some(message => message.includes("default BCC")));
  settings.sending.bcc = [{ id: "bcc", address: "archive@example.test" }];
  settings.sending.defaultBccId = "bcc";
  deepEqual(validateEmailPreferences(settings), []);
  settings.sending.defaultBccId = "missing";
  ok(validateEmailPreferences(settings).some(message => message.includes("existing default")));
});
test("custom unsubscribe validates HTTPS and accepts Liquid email addresses", () => {
  const settings = defaultEmailPreferences();
  settings.sending.unsubscribeMode = "custom";
  settings.sending.unsubscribeUrl = "http://example.test/unsubscribe";
  ok(validateEmailPreferences(settings).some(message => message.includes("https://")));
  settings.sending.unsubscribeUrl = "https://example.test/unsubscribe?user={{${user_id}}}";
  settings.sending.bcc = [{ id: "dynamic", address: "{{custom_attribute.${support_agent}}}" }];
  deepEqual(validateEmailPreferences(settings), []);
});
test("footer validates unsubscribe link and HTML byte size", () => {
  const settings = defaultEmailPreferences();
  settings.pages.footer = { enabled: true, html: "<p>Missing unsubscribe</p>" };
  ok(validateEmailPreferences(settings).some(message => message.includes("unsubscribe URL")));
  settings.pages.footer.html = '<a href="{{${unsubscribe_url}}}">Unsubscribe</a>';
  deepEqual(validateEmailPreferences(settings), []);
  settings.pages.footer.html += "邮".repeat(35000);
  ok(validateEmailPreferences(settings).some(message => message.includes("100 KB")));
});
test("rejects invalid theme colors, widths and numeric types", () => {
  const settings = defaultEmailPreferences();
  settings.editor.canvasBg = "red";
  settings.editor.contentWidth = 200;
  settings.editor.paragraph.fontSize = NaN;
  ok(validateEmailPreferences(settings).length >= 1);
  settings.editor.paragraph.fontSize = 14;
  const errors = validateEmailPreferences(settings);
  ok(errors.some(message => message.includes("six-digit hex")));
  ok(errors.some(message => message.includes("320 and 800")));
});
test("new campaign defaults include the saved identity and global theme", () => {
  const settings = defaultEmailPreferences();
  settings.sending.senders[0].displayName = "Store";
  settings.sending.replyTo = [{ id: "reply", address: "support@example.test" }];
  settings.sending.defaultReplyToId = "reply";
  settings.editor.contentWidth = 720;
  const config = emailPreferenceCampaignDefaults(settings);
  equal(config.emailSending.fromName, "Store");
  equal(config.emailSending.replyTo, "support@example.test");
  equal(config.emailStyle.contentWidth, 720);
  equal(config.emailBlockTheme.headers[0].fontSize, 34);
});
