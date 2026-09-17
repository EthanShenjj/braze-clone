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
  segments: "/audience/segments",
  "landing-pages": "/messaging/landing-pages",
  "search-users": "/audience/search-users",
  "subscription-group-management": "/users/subscription_groups/6aa75e37db69160082adb7ae?locale=en",
  "email-preference-centers": "/users/subscription_groups/preference_centers/6aa75e37db69160082adb7ae?locale=en",
  catalogs: "/dashboard/catalogs/6aa75e37db69160082adb7ae?locale=en",
  "content-calendar": "/messaging/content-calendar",
  "messaging-diagnostics": "/messaging/diagnostics",
};

const pagesByPath = new Map(Object.entries(routes).map(([page, route]) => [route.split("?")[0], page]));

export function routeForPage(page: string) {
  return routes[page] ?? `/${page}`;
}

export function pageFromPath(pathname: string) {
  if (/^\/engagement\/campaigns\/cmp_[^/]+$/.test(pathname)) return "campaigns";
  if (/^\/engagement\/predictions\/[^/]+\/[^/]+$/.test(pathname)) return "catalogs";
  if (/^\/(?:content|dashboard)\/catalogs\//.test(pathname)) return "catalogs";
  if (/^\/users\/subscription_groups\/preference_centers\//.test(pathname)) return "email-preference-centers";
  if (/^\/users\/subscription_groups\//.test(pathname)) return "subscription-group-management";
  return pagesByPath.get(pathname) ?? pathname.split("/").filter(Boolean).at(-1) ?? "campaigns";
}

export function pageKeyForDrawerItem(label: string) {
  return label.toLowerCase().replace(/[\s/]+/g, "-");
}
