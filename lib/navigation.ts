const campaignList = "/engagement/campaigns/campaigns?start=0&limit=12&sortby=last_edited&sortdir=-1&display=list";

const routes: Record<string, string> = {
  campaigns: campaignList,
  canvas: "/engagement/canvas",
  "getting-started": "/home",
  performance: "/analytics/performance-overview",
  agents: "/agent-console",
  messaging: "/messaging",
  audience: "/audience",
  content: "/content",
  analytics: "/analytics",
  partners: "/partner-integrations",
  data: "/data-settings",
  settings: "/settings",
  segments: "/engagement/segmenter/segmenter/local",
  "segment-insights": "/engagement/segmenter/segment_insights/local",
  "segment-extensions": "/engagement/segment_cohorts/segment_cohorts/local",
  "suppression-lists": "/engagement/suppression_lists/local",
  "manage-audience": "/users/manage_audience/local",
  "import-users": "/users/user_import/local",
  locations: "/engagement/locations/local",
  "tag-management": "/app_settings/app_settings/tags/local",
  "landing-pages": "/messaging/landing-pages",
  "search-users": "/users/user_search/user-search/local",
  "global-control-group": "/engagement/global_message_settings/global-control-settings/6aa75e37db69160082adb7ae",
  "subscription-group-management": "/users/subscription_groups/6aa75e37db69160082adb7ae?locale=en",
  "email-preference-centers": "/users/subscription_groups/preference_centers/6aa75e37db69160082adb7ae?locale=en",
  catalogs: "/dashboard/catalogs/6aa75e37db69160082adb7ae?locale=en",
  "content-calendar": "/messaging/content-calendar",
  "messaging-diagnostics": "/messaging/diagnostics",
  "email-preferences": "/app_settings/app_settings/email_settings/sending_configuration/6ad0b98fe4b4110085216601?locale=en",
};

const pagesByPath = new Map(Object.entries(routes).map(([page, route]) => [route.split("?")[0], page]));

export function routeForPage(page: string) {
  return routes[page] ?? `/${page}`;
}

export function pageFromPath(pathname: string) {
  if (/^\/engagement\/global_message_settings\/global-message-settings(?:\/[^/]+)?\/?$/.test(pathname)) return "frequency-capping-rules";
  if (/^\/engagement\/segmenter\/segment_insights(?:\/|$)/.test(pathname)) return "segment-insights";
  if (/^\/engagement\/segmenter\/(?:segmenter|edit)(?:\/|$)/.test(pathname) || pathname === "/audience/segments") return "segments";
  if (/^\/engagement\/segment_cohorts\//.test(pathname)) return "segment-extensions";
  if (/^\/engagement\/suppression_lists\//.test(pathname)) return "suppression-lists";
  if (/^\/engagement\/locations\//.test(pathname)) return "locations";
  if (/^\/users\/manage_audience\//.test(pathname)) return "manage-audience";
  if (/^\/users\/user_import\//.test(pathname)) return "import-users";
  if (/^\/users\/user_search\//.test(pathname) || pathname === "/audience/search-users") return "search-users";
  if (/^\/app_settings\/app_settings\/tags(?:\/[^/]+)?\/?$/.test(pathname)) return "tag-management";
  if (/^\/engagement\/global_message_settings\/global-control-settings(?:\/[^/]+)?\/?$/.test(pathname)) return "global-control-group";
  if (/^\/app_settings\/app_settings\/email_settings(?:\/|$)/.test(pathname)) return "email-preferences";
  if (/^\/engagement\/campaigns\/cmp_[^/]+$/.test(pathname)) return "campaigns";
  if (/^\/engagement\/canvas\/[^/]+$/.test(pathname)) return "canvas";
  if (/^\/engagement\/predictions\/[^/]+\/[^/]+$/.test(pathname)) return "catalogs";
  if (/^\/(?:content|dashboard)\/catalogs\//.test(pathname)) return "catalogs";
  if (/^\/users\/subscription_groups\/preference_centers\//.test(pathname)) return "email-preference-centers";
  if (/^\/users\/subscription_groups\//.test(pathname)) return "subscription-group-management";
  return pagesByPath.get(pathname) ?? pathname.split("/").filter(Boolean).at(-1) ?? "campaigns";
}

export function pageKeyForDrawerItem(label: string) {
  return label.toLowerCase().replace(/[\s/]+/g, "-");
}
