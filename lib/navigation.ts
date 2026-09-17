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
  catalogs: "/content/catalogs",
  "content-calendar": "/messaging/content-calendar",
  "messaging-diagnostics": "/messaging/diagnostics",
};

const pagesByPath = new Map(Object.entries(routes).map(([page, route]) => [route.split("?")[0], page]));

export function routeForPage(page: string) {
  return routes[page] ?? `/${page}`;
}

export function pageFromPath(pathname: string) {
  if (/^\/engagement\/campaigns\/cmp_[^/]+$/.test(pathname)) return "campaigns";
  return pagesByPath.get(pathname) ?? pathname.split("/").filter(Boolean).at(-1) ?? "campaigns";
}

export function pageKeyForDrawerItem(label: string) {
  return label.toLowerCase().replace(/[\s/]+/g, "-");
}
