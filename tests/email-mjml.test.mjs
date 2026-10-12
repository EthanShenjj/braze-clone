import { test } from "node:test";
import { equal, match, doesNotMatch } from "node:assert/strict";
import { hasHtmlStyleVoidTags, normalizeMjmlDocument, normalizeXmlVoidTags } from "../lib/email-mjml.ts";

test("normalizes HTML void elements for the XML MJML parser", () => {
  const input = '<mj-text>First<br>Second<br class="gap">Third<img src="x.png"></mj-text>';
  const output = normalizeXmlVoidTags(input);

  equal(output, '<mj-text>First<br />Second<br class="gap" />Third<img src="x.png" /></mj-text>');
  equal(hasHtmlStyleVoidTags(input), true);
  equal(hasHtmlStyleVoidTags(output), false);
});

test("keeps already self-closing void elements stable", () => {
  const input = '<mj-text>First<br />Second<br class="gap" /></mj-text>';
  equal(normalizeXmlVoidTags(input), input);
});

test("repairs legacy MJML line breaks before compilation", () => {
  const input = '<mjml><mj-body><mj-section><mj-column><mj-text>one<br>two<br>three</mj-text></mj-column></mj-section></mj-body></mjml>';
  const output = normalizeMjmlDocument(input);

  match(output, /one<br \/>two<br \/>three/);
  doesNotMatch(output, /<br>/);
});
