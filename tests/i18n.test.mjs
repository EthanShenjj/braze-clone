import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, formatNumber, normalizeLocale, translate, withLocale } from "../lib/i18n.ts";

test("normalizes supported and unsupported locales", () => {
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeLocale("fr"), "en");
  assert.equal(normalizeLocale(null), "en");
});

test("translates interface copy and keeps business data unchanged", () => {
  assert.equal(translate("zh-CN", "Campaigns"), "营销活动");
  assert.equal(translate("zh-CN", "Global Control Group Settings"), "全局控制组设置");
  assert.equal(translate("zh-CN", "Sample_Catalog"), "Sample_Catalog");
  assert.equal(translate("en", "Campaigns"), "Campaigns");
});

test("preserves route state while replacing locale", () => {
  assert.equal(withLocale("/dashboard/catalogs/demo?name=Sample_Catalog&page=2", "zh-CN"), "/dashboard/catalogs/demo?name=Sample_Catalog&page=2&locale=zh-CN");
  assert.equal(withLocale("/engagement/campaigns?locale=en&status=active", "ja"), "/engagement/campaigns?locale=ja&status=active");
});

test("formats numbers and dates with the selected locale", () => {
  assert.equal(formatNumber("en", 1234567), "1,234,567");
  assert.equal(formatNumber("zh-CN", 1234567), "1,234,567");
  assert.match(formatDate("zh-CN", "2026-09-20T00:00:00.000Z", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }), /2026年9月20日/);
});
