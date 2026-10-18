import { test } from "node:test";
import { equal } from "node:assert/strict";
import { pageFromPath, pageKeyForDrawerItem, routeForPage } from "../lib/navigation.ts";

test("every Messaging drawer item resolves to its own route and page", () => {
  for (const label of ["Canvas", "Campaigns", "Feature Flags", "Landing Pages", "Surveys", "Banners", "Content Calendar", "Messaging Diagnostics"]) {
    const key = pageKeyForDrawerItem(label);
    const pathname = routeForPage(key).split("?")[0];
    equal(pageFromPath(pathname), key, label);
  }
});

test("Canvas templates do not resolve to the Canvas editor", () => {
  equal(pageFromPath(routeForPage("canvas-templates")), "canvas-templates");
});

test("known deep links restore their intended page", () => {
  equal(pageFromPath("/engagement/campaigns/cmp_example"), "campaigns");
  equal(pageFromPath("/analytics/performance-overview"), "performance");
  equal(pageFromPath("/agent-console"), "agents");
  equal(pageFromPath("/messaging/diagnostics"), "messaging-diagnostics");
  equal(pageFromPath("/dashboard/catalogs/6aa75e3e337509005eebb467/6aa75e37db69160082adb7ae"), "catalogs");
  equal(pageFromPath("/dashboard/catalogs/6aa75e3e337509005eebb467/selection/Gaming/6aa75e37db69160082adb7ae"), "catalogs");
  equal(pageFromPath("/engagement/predictions/res_example/6aa75e37db69160082adb7ae"), "catalogs");
  equal(pageFromPath("/users/subscription_groups/6aa75e37db69160082adb7ae"), "subscription-group-management");
  equal(pageFromPath("/users/subscription_groups/preference_centers/6aa75e37db69160082adb7ae"), "email-preference-centers");
  equal(pageFromPath("/engagement/global_message_settings/global-control-settings/6aa75e37db69160082adb7ae"), "global-control-group");
  equal(pageFromPath("/email-preferences"), "email-preferences");
  equal(pageFromPath(routeForPage("email-preferences").split("?")[0]), "email-preferences");
  for (const tab of ["sending_configuration", "subscription_pages_and_footers", "drag_and_drop_email", "link_aliasing", "bot_filtering", "ip_warming"]) {
    equal(pageFromPath(`/app_settings/app_settings/email_settings/${tab}/6ad0b98fe4b4110085216601`), "email-preferences");
  }
});
