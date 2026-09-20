"use client";

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import emailStarterStyles from "./email-starter.module.css";
import emailEditorStyles from "./email-editor.module.css";
import brazeDndStyles from "./braze-dnd.module.css";
import brazeSendingStyles from "./braze-sending.module.css";
import pushStyles from "./push-editor.module.css";
import LiveCanvas from "./live-canvas";
import LiveUserSearch from "./live-user-search";
import CatalogWorkspace from "./catalog-workspace";
import { PreferenceCenterWorkspace, SubscriptionGroupWorkspace } from "./subscription-group-workspace";
import InAppCampaignCompose from "./in-app-message";
import { pageFromPath, pageKeyForDrawerItem, routeForPage } from "@/lib/navigation";
import { campaignValidationIssues } from "@/lib/campaign-validation";
import { localeNames, normalizeLocale, supportedLocales, translate, type Locale } from "@/lib/i18n";
import {
  Activity, Bell, Bot, Box, CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Code2, Copy, Database, Eye, FileCode2, Flag, Filter, Grid2X2, Image,
  LayoutDashboard, Languages, LineChart, List, LockKeyhole, Mail, MapPin, MessageCircle, MoreHorizontal,
  MousePointerClick, Plus, Search, Send, Settings, Share2, ShieldCheck, Smartphone,
  Sparkles, Tags, Trash2, Type, Users, Video, Webhook, X, Zap
} from "lucide-react";

type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
type CampaignStatus = "Draft" | "Active" | "Stopped";
type Campaign = { id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number; edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config?: Record<string, unknown> };
type EmailEditorMode = "operator" | "drag" | "html" | "template";
type EmailBlockKind = "Title" | "Paragraph" | "List" | "Button" | "Divider" | "Spacer" | "Image" | "Video" | "Social" | "HTML" | "Menu";
type EmailBlock = { id: string; kind: EmailBlockKind; text: string; style?: { fontSize?: number; align?: "left" | "center" | "right"; color?: string; bold?: boolean; italic?: boolean } };
type EmailSending = { preheader: string; whitespace: boolean; replyTo: string; bcc: string; unsubscribe: string; fromName?: string; fromAddress?: string; ipPool?: string };
type EmailVariant = { id: string; name: string; subject?: string; body?: string; editorMode?: EmailEditorMode; blocks?: EmailBlock[]; sending?: EmailSending; canvasBg?: string; contentWidth?: number };

const personalizationTokens = [
  { label: "First name", value: "{{${first_name} | default: 'there'}}", help: "User profile" },
  { label: "Last name", value: "{{${last_name}}}", help: "User profile" },
  { label: "Email address", value: "{{${email}}}", help: "User profile" },
  { label: "Language", value: "{{${language}}}", help: "User profile" },
  { label: "External user ID", value: "{{${user_id}}}", help: "User profile" },
  { label: "Current date", value: "{{${time_zone}}}", help: "Device / time" },
] as const;

function appendPersonalization(value: string, token: string) { return `${value}${value && !/\s$/.test(value) ? " " : ""}${token}`; }
function PersonalizationPicker({ onInsert, title = "Personalization" }: { onInsert: (token: string) => void; title?: string }) {
  return <div className={emailEditorStyles.personalizationPicker} role="dialog" aria-label={title}><div><b>{title}</b><small>Insert Liquid into the selected field.</small></div>{personalizationTokens.map(token => <button type="button" key={token.label} onClick={() => onInsert(token.value)}><span><b>{token.label}</b><small>{token.help}</small></span><code>{token.value}</code></button>)}</div>;
}

function emailVariants(campaign: Campaign): EmailVariant[] {
  const stored = campaign.config?.variants;
  return Array.isArray(stored) && stored.length ? stored as EmailVariant[] : [{ id: "var_1", name: "Variant 1" }];
}
function EmailVariantTabs({ variants, selected, onSelect, onAdd }: { variants: EmailVariant[]; selected: number; onSelect: (index: number) => void; onAdd: () => void }) {
  return <div className="variant-header"><h3>Variants</h3><div className="real-tabs">{variants.map((item, index) => <button key={item.id} className={className(selected === index && "selected")} onClick={() => onSelect(index)}>{item.name}</button>)}<button className="plus-tab" aria-label="Add variant" onClick={onAdd}><Plus size={16}/></button></div></div>;
}

const nav = [
  { group: "Quick links", items: [["Canvas", "canvas", Grid2X2], ["Campaigns", "campaigns", LayoutDashboard], ["Segments", "segments", Users]] },
  { group: "", items: [["Getting Started", "getting-started", Flag], ["Performance Overview", "performance", LineChart], ["Agent Console", "agents", Bot], ["Messaging", "messaging", MessageCircle], ["Audience", "audience", Users], ["Content", "content", Box], ["Analytics", "analytics", LineChart], ["Partner Integrations", "partners", Zap], ["Data Settings", "data", Database], ["Settings", "settings", Settings]] }
] as const;

const drawers: Record<string, string[]> = {
  messaging: ["Canvas", "Campaigns", "Feature Flags", "Landing Pages", "Surveys", "Banners", "Content Calendar", "Messaging Diagnostics"],
  audience: ["Segments", "Segment Extensions", "Global Control Group", "Suppression Lists", "Subscription Group Management", "Email Preference Centers", "Search Users", "Manage Audience", "Import Users", "Locations"],
  content: ["Media Library", "Banner Templates", "Canvas Templates", "Content Blocks", "Email Link Templates", "Email Templates", "In-App Message Templates", "Webhook Templates", "Content Calendar", "Promotion Codes", "Catalogs", "Brand Guidelines"],
  analytics: ["Report Builder", "Custom Events Report", "Global Control Group Report", "Query Builder", "Engagement Reports", "Revenue Report", "Segment Insights", "Dashboard Builder", "Email Performance", "Push Performance", "SMS/MMS/RCS Performance", "Conversions"],
  partners: ["Technology Partners", "Currents", "Data Sharing", "Solutions Partners"],
  data: ["Custom Attributes", "Custom Events", "Catalogs", "Import Users", "Promotion Codes", "Products", "Cloud Data Ingestion", "Data Transformation"],
  settings: ["App Settings", "APIs and Identifiers", "Message Activity Log", "Event User Log", "Internal Groups", "Exports Log", "Tag Management", "Email Preferences", "Frequency Capping Rules", "Push Settings", "Approval Workflow", "Localization Settings", "Banner Placements", "Brand Guidelines", "Messaging Rate Limits", "Billing", "User Management"],
  agents: ["Canvas Step Agents", "Data Agents", "Catalog Agents"]
};

const channelMeta: Record<Channel, { title: string; icon: typeof Mail; description: string }> = {
  operator: { title: "Create with Operator", icon: Sparkles, description: "Describe a goal and create a coordinated draft." },
  multichannel: { title: "Multichannel", icon: Grid2X2, description: "Coordinate messages across one or more channels." },
  email: { title: "Email", icon: Mail, description: "Design a personalized email message." },
  push: { title: "Push notification", icon: Bell, description: "Send mobile and web notifications." },
  iam: { title: "In-app message", icon: Smartphone, description: "Reach users while they are active." },
  content: { title: "Content Card", icon: Box, description: "Deliver durable content in an app feed." },
  banner: { title: "Banner", icon: LayoutDashboard, description: "Place persistent messages on your property." },
  sms: { title: "SMS/MMS/RCS", icon: MessageCircle, description: "Send messaging through a subscriber group." },
  webhook: { title: "Webhook", icon: Webhook, description: "Call an external service with campaign data." },
  whatsapp: { title: "WhatsApp", icon: MessageCircle, description: "Send an approved WhatsApp template." },
  line: { title: "LINE", icon: MessageCircle, description: "Send a message through LINE Official Account." },
  feature: { title: "Feature flag experiment", icon: Flag, description: "Roll out a remote feature setting." },
  api: { title: "API campaign", icon: Code2, description: "Track messages sent from an API." }
};

const seed: Campaign[] = [
  { id: "cmp_3d084f2b", name: "New Campaign - September 16, 2026", channel: "email", status: "Draft", schedule: "One time", sent: 0, edited: "Sep 16, 2026", subject: "Your September Offer | 20% Off", body: "Thanks for being with us. Use code SEPTEMBER20 to get 20% off.", audience: "All Users", conversion: "Make Purchase" },
  { id: "cmp_newsletter", name: "Newsletter Welcome", channel: "email", status: "Active", schedule: "Action-based", sent: 18420, edited: "Sep 15, 2026", subject: "Welcome to Braze", body: "Your latest offers are waiting.", audience: "New Users", conversion: "Start Session" },
  { id: "cmp_push_primer", name: "Push Primer", channel: "push", status: "Active", schedule: "Action-based", sent: 9321, edited: "Sep 13, 2026", audience: "All Users", conversion: "Make Purchase" },
  { id: "cmp_banner", name: "Referral Banner", channel: "banner", status: "Draft", schedule: "One time", sent: 0, edited: "Sep 13, 2026", audience: "Recent Purchasers", conversion: "Make Purchase" },
  { id: "cmp_iam", name: "Welcome Offer IAM", channel: "iam", status: "Active", schedule: "Action-based", sent: 4784, edited: "Sep 13, 2026", audience: "New Users", conversion: "Start Session" }
];

const className = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(" ");
const titleFrom = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, x => x.toUpperCase());
function audienceSummary(draft: Campaign) {
  const parts = [draft.audience && draft.audience !== "All Users" ? draft.audience : "", draft.config?.audienceCountry ? `Country is ${draft.config.audienceCountry}` : "", draft.config?.audienceExcludeCountry ? `Exclude country ${draft.config.audienceExcludeCountry}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No segments or filters selected";
}

export default function Dashboard() {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>(() => normalizeLocale(searchParams.get("locale")));
  const [page, setPage] = useState(() => pageFromPath(pathname));
  const [drawer, setDrawer] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [createAnchor, setCreateAnchor] = useState<CSSProperties | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [toast, setToast] = useState("");
  const [operatorOpen, setOperatorOpen] = useState(false);

  const refreshCampaigns = async () => {
    const response = await fetch(`/api/campaigns?${new URLSearchParams({ limit: "1000", status: "All", sort: "edited" })}`);
    if (response.ok) { const result = await response.json(); setCampaigns(result.data); }
  };
  useEffect(() => { void refreshCampaigns(); }, []);
  useEffect(() => { setPage(pageFromPath(pathname)); }, [pathname]);
  useEffect(() => { document.documentElement.lang = locale; window.localStorage.setItem("braze:locale", locale); }, [locale]);
  useEffect(() => {
    const campaignId = pathname.match(/\/engagement\/campaigns\/(cmp_[^/]+)$/)?.[1];
    if (!campaignId) return;
    const storedDraft = window.sessionStorage.getItem(`braze:draft:${campaignId}`);
    if (storedDraft) {
      try { setEditing(JSON.parse(storedDraft) as Campaign); } catch { window.sessionStorage.removeItem(`braze:draft:${campaignId}`); }
    }
    void fetch(`/api/campaigns/${campaignId}`).then(response => response.ok ? response.json() : null).then(record => {
      if (record) { setEditing(record); window.sessionStorage.removeItem(`braze:draft:${campaignId}`); }
      else if (!storedDraft) { setEditing(null); setToast("Campaign draft could not be found."); }
    });
  }, [pathname]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(id); }, [toast]);

  function openPage(key: string) {
    setCreateAnchor(null); setDrawer(null); setEditing(null); setPage(key); router.push(routeForPage(key));
  }
  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    const params = new URLSearchParams(searchParams.toString());
    params.set("locale", nextLocale);
    router.replace(`${pathname}?${params.toString()}`);
  }
  function openCampaignChannel(channel: Channel) {
    setCreateAnchor(null); setDrawer(null); setEditing(null); setPage("campaigns");
    router.push(`${routeForPage("campaigns")}&channel=${encodeURIComponent(channel)}`);
  }
  async function start(channel: Channel) {
    const id = `cmp_${Math.random().toString(36).slice(2, 10)}`;
    const item: Campaign = { id, name: `Untitled ${channelMeta[channel].title} Campaign`, channel, status: "Draft", schedule: "One time", sent: 0, edited: "Just now", audience: "All Users", conversion: "Make Purchase" };
    setCreateAnchor(null); setDrawer(null);
    window.sessionStorage.setItem(`braze:draft:${id}`, JSON.stringify(item));
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
    if (!response.ok) { setEditing(item); setToast("Draft is open, but could not be saved yet."); return; }
    const saved = await response.json() as Campaign;
    setCampaigns(current => [saved, ...current.filter(campaign => campaign.id !== saved.id)]);
    setEditing(saved);
    router.push(`/engagement/campaigns/${id}?step=compose`);
  }
  async function saveCampaign(next: Campaign, publish = false) {
    const savedResponse = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!savedResponse.ok) { setToast("Unable to save campaign."); return false; }
    const saved = await savedResponse.json() as Campaign;
    if (publish) {
      const launched = await fetch(`/api/campaigns/${saved.id}/launch`, { method: "POST" });
      if (!launched.ok) { setToast("Campaign saved, but launch validation failed."); return false; }
      const result = await launched.json(); setEditing(result.campaign); setToast(`Campaign launched for ${result.run.delivered.toLocaleString()} reachable users.`);
    } else { setEditing(saved); setToast("Draft saved."); }
    await refreshCampaigns();
    return true;
  }
  async function stopCampaign(id: string) {
    const response = await fetch(`/api/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Stopped" }) });
    if (response.ok) { await refreshCampaigns(); setToast("Campaign stopped."); }
  }
  async function archiveCampaign(id: string) {
    const response = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!response.ok) { setToast("Unable to archive campaign."); return false; }
    await refreshCampaigns(); setToast("Campaign archived."); return true;
  }
  async function duplicateCampaign(campaign: Campaign) {
    const copy: Campaign = { ...campaign, id: `cmp_${crypto.randomUUID().slice(0, 8)}`, name: `${campaign.name} (copy)`, status: "Draft", sent: 0, edited: "Just now" };
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(copy) });
    if (!response.ok) { setToast("Unable to duplicate campaign."); return; }
    const saved = await response.json() as Campaign;
    await refreshCampaigns(); openCampaign(saved);
  }
  function openCampaign(campaign: Campaign) { setEditing(campaign); router.push(`/engagement/campaigns/${campaign.id}?step=compose`); }

  return <div className={className("app-shell", compact && "compact")}> 
    <aside className="sidebar">
      <div className="brand-mark">b</div>
      <button className="workspace" onClick={() => setCompact(!compact)}><ChevronLeft size={16}/><span>Demo – Thinkingai</span></button>
      {nav.map(section => <div className="nav-section" key={section.group}>
        {section.group && <span className="nav-caption">{translate(locale, section.group)}</span>}
        {section.items.map(([label, key, Icon]) => <button key={key} className={className("nav-item", (page === key || drawer === key) && "active")} onClick={() => key in drawers ? setDrawer(drawer === key ? null : key) : openPage(key)}><Icon size={17}/><span>{translate(locale, label)}</span></button>)}
      </div>)}
      <div className="brand-word">braze</div>
    </aside>
    <main className="main-area">
      <div className="trial">◷ &nbsp;12 days left in your free trial. <button>Connect with sales</button></div>
      <header className="topbar"><button className="search-button" onClick={() => setToast("Workspace search is ready for this local demo.")}><Search size={16}/> {translate(locale, "Search workspace")} <kbd>⌘K</kbd></button><div className="top-actions"><label className="language-picker"><Languages size={16}/><select aria-label={translate(locale, "Language")} value={locale} onChange={event => changeLocale(event.target.value as Locale)}>{supportedLocales.map(value => <option value={value} key={value}>{localeNames[value]}</option>)}</select></label><CircleHelp size={18}/><Bell size={18}/><button className="profile">S</button><button className="operator-trigger" onClick={() => setOperatorOpen(!operatorOpen)}><Sparkles size={17}/></button></div></header>
      {page !== "catalogs" && <div className="page-tabs"><button className={className("page-tab", !editing && "selected")} onClick={() => openPage(editing ? "campaigns" : page)}>{editing ? translate(locale, "Campaigns") : translate(locale, page === "performance" ? "Performance Overview" : page === "agents" ? "Agent Console" : page === "partners" ? "Partner Integrations" : page === "data" ? "Data Settings" : titleFrom(page))}</button>{editing && <button className="page-tab selected">Edit '{editing.name}' <X size={14} onClick={() => openPage("campaigns")}/></button>}</div>}
      {editing ? <CampaignEditor key={editing.id} campaign={editing} onSave={saveCampaign} onClose={() => openPage("campaigns")} /> : <PageContent locale={locale} page={page} campaigns={campaigns} openPage={openPage} onEdit={openCampaign} onCreate={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setCreateAnchor({ position: "fixed", top: rect.bottom + 6, left: Math.max(16, rect.right - 325), zIndex: 61 }); }} onStop={stopCampaign} onArchive={archiveCampaign} onDuplicate={duplicateCampaign} notify={setToast} />}
    </main>
    {drawer && <NavigationDrawer name={titleFrom(drawer)} items={drawers[drawer]} activePage={page} close={() => setDrawer(null)} open={openPage} openCampaignChannel={openCampaignChannel} />}
    {createAnchor && <CreateMenu anchor={createAnchor} start={start} close={() => setCreateAnchor(null)} />}
    {operatorOpen && <Operator close={() => setOperatorOpen(false)} start={start} />}
    {toast && <div className="toast"><ShieldCheck size={18}/><span>{toast}</span><button onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>;
}

function NavigationDrawer({ name, items, activePage, close, open, openCampaignChannel }: { name: string; items: string[]; activePage: string; close: () => void; open: (page: string) => void; openCampaignChannel: (channel: Channel) => void }) {
  const [channelsOpen, setChannelsOpen] = useState(false);
  const channels: Channel[] = ["email", "push", "iam", "content", "banner", "sms", "webhook", "whatsapp", "line"];
  return <div className="drawer-backdrop" onMouseDown={close}><section className="nav-drawer" onMouseDown={e => e.stopPropagation()}><header><h2>{name}</h2><button type="button" aria-label="Close navigation" onClick={close}><X size={18}/></button></header><div className="drawer-list">{items.map((item, index) => { const key = pageKeyForDrawerItem(item); return <div key={item}><button type="button" aria-current={activePage === key ? "page" : undefined} onClick={() => open(key)}><span className="drawer-icon">{index % 3 === 0 ? <Grid2X2 size={18}/> : index % 3 === 1 ? <Activity size={18}/> : <Settings size={18}/>}</span><span><b>{item}</b><small>{drawerDescription(item)}</small></span><ChevronRight size={16}/></button>{name === "Messaging" && item === "Campaigns" && <div className="drawer-channel-group"><button type="button" className="drawer-channel-toggle" aria-expanded={channelsOpen} onClick={() => setChannelsOpen(!channelsOpen)}>View by channel <ChevronDown size={14} className={channelsOpen ? "open" : ""}/></button>{channelsOpen && <div className="drawer-channel-list">{channels.map(channel => <button type="button" key={channel} onClick={() => openCampaignChannel(channel)}>{channelMeta[channel].title}</button>)}</div>}</div>}</div>; })}</div></section></div>;
}

function drawerDescription(name: string) {
  const descriptions: Record<string, string> = { "Content Calendar": "View upcoming scheduled campaigns and related analytics", "Messaging Diagnostics": "Troubleshoot why messages did not send", "Segments": "Split your audience into targeted groups", "Catalogs": "Manage non-user data such as products", "Report Builder": "Build and save performance reports", "Email Preferences": "Manage sending and subscription settings" };
  return descriptions[name] || `Manage ${name.toLowerCase()} for this workspace`;
}

function CreateMenu({ anchor, start, close }: { anchor: CSSProperties; start: (channel: Channel) => void; close: () => void }) {
  const standard: Channel[] = ["email", "push", "iam", "content", "banner", "sms", "webhook", "whatsapp", "line"];
  return <div className="create-popover-layer" style={{ position: "fixed", inset: 0, zIndex: 60 }} onMouseDown={close}><section className="create-menu" style={anchor} onMouseDown={e => e.stopPropagation()}><button className="create-option operator-option" onClick={() => start("operator")}><Sparkles size={17}/><span><b>Create with Operator</b><small>Generate a coordinated campaign draft</small></span></button><p>MESSAGE ONE OR MORE CHANNELS</p><button className="create-option" onClick={() => start("multichannel")}><Grid2X2 size={17}/><span><b>Multichannel</b><small>Coordinate messages across channels</small></span></button><p>SINGLE CHANNEL</p>{standard.map(channel => { const meta = channelMeta[channel]; const Icon = meta.icon; return <button className="create-option" key={channel} onClick={() => start(channel)}><Icon size={17}/><span><b>{meta.title}</b><small>{channel === "iam" ? "1 / 200 active" : channel === "content" ? "0 / 500 active" : channel === "banner" ? "0 / 200 active" : ""}</small></span></button>; })}<p>FEATURE FLAGS</p><button className="create-option" onClick={() => start("feature")}><Flag size={17}/><span><b>Feature flag experiment</b><small>0 / 1 active</small></span></button><p>TRACK MESSAGES SENT VIA API</p><button className="create-option" onClick={() => start("api")}><Code2 size={17}/><span><b>API campaign</b></span></button></section></div>;
}

function Operator({ close, start }: { close: () => void; start: (channel: Channel) => void }) {
  const [prompt, setPrompt] = useState("");
  return <aside className="operator"><header><h2><Sparkles size={16}/> BrazeAI Operator™</h2><button onClick={close}><X size={17}/></button></header><div className="operator-chat">What kind of campaign would you like to create?</div><div className="operator-chat">I can choose channels, draft copy, and configure targeting for a local campaign draft.</div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ask Operator to create a campaign…"/><button className="primary" style={{marginTop:10,width:"100%"}} onClick={() => { start("operator"); }}>Generate campaign plan</button></aside>;
}

function PageContent({ locale, page, campaigns, openPage, onEdit, onCreate, onStop, onArchive, onDuplicate, notify }: { locale: Locale; page: string; campaigns: Campaign[]; openPage: (p: string) => void; onEdit: (c: Campaign) => void; onCreate: (event: ReactMouseEvent<HTMLButtonElement>) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void>; notify: (m: string) => void }) {
  if (page === "campaigns") return <CampaignList campaigns={campaigns} onEdit={onEdit} onCreate={onCreate} onStop={onStop} onArchive={onArchive} onDuplicate={onDuplicate}/>;
  if (page === "canvas") return <LiveCanvas notify={notify}/>;
  if (page === "getting-started") return <GettingStarted openPage={openPage}/>;
  if (page === "performance") return <Performance campaigns={campaigns}/>;
  if (page === "demo-lab") return <LiveDemoLab notify={notify}/>;
  if (["report-builder", "custom-events-report", "global-control-group-report", "query-builder", "engagement-reports", "revenue-report", "segment-insights", "dashboard-builder", "email-performance", "push-performance", "sms-mms-rcs-performance", "conversions"].includes(page)) return <LiveReportPage title={titleFrom(page)} />;
  if (page === "message-activity-log") return <ActivityLogPage />;
  if (page === "search-users") return <LiveUserSearch notify={notify}/>;
  if (page === "catalogs") return <CatalogWorkspace locale={locale} notify={notify}/>;
  if (page === "subscription-group-management") return <SubscriptionGroupWorkspace locale={locale} notify={notify}/>;
  if (page === "email-preference-centers") return <PreferenceCenterWorkspace locale={locale} notify={notify}/>;
  return <ModuleWorkspace key={page} title={titleFrom(page)} page={page} notify={notify} openPage={openPage}/>;
}

type CampaignListQuery = { search: string; status: string; channel: Channel | "all"; sort: "name" | "edited"; direction: 1 | -1; start: number; limit: number };

function readCampaignListQuery(params: URLSearchParams): CampaignListQuery {
  const status = params.get("columnFilters[status]") ?? "All";
  const channel = params.get("channel");
  return {
    search: params.get("globalFilter") ?? "",
    status: status === "active" ? "Active" : status === "draft" ? "Draft" : status === "stopped" ? "Stopped" : "All",
    channel: channel && channel in channelMeta ? channel as Channel : "all",
    sort: params.get("sortby") === "name" ? "name" : "edited",
    direction: params.get("sortdir") === "1" ? 1 : -1,
    start: Math.max(0, Number(params.get("start")) || 0),
    limit: [12, 24, 48].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 12,
  };
}

function CampaignList({ campaigns, onEdit, onCreate, onStop, onArchive, onDuplicate }: { campaigns: Campaign[]; onEdit: (c: Campaign) => void; onCreate: (event: ReactMouseEvent<HTMLButtonElement>) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void> }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState<CampaignListQuery>({ search: "", status: "All", channel: "all", sort: "edited", direction: -1, start: 0, limit: 12 });
  useEffect(() => { setQuery(readCampaignListQuery(searchParams)); }, [searchParams]);
  const changeQuery = (patch: Partial<CampaignListQuery>, replace = false) => {
    const next = { ...query, ...patch };
    setQuery(next);
    const url = new URL(window.location.href);
    url.searchParams.set("start", String(next.start));
    url.searchParams.set("limit", String(next.limit));
    url.searchParams.set("globalFilter", next.search);
    if (next.channel === "all") url.searchParams.delete("channel");
    else url.searchParams.set("channel", next.channel);
    if (next.status === "All") url.searchParams.delete("columnFilters[status]");
    else url.searchParams.set("columnFilters[status]", next.status.toLowerCase());
    url.searchParams.set("sortby", next.sort === "name" ? "name" : "last_edited");
    url.searchParams.set("sortdir", String(next.direction));
    url.searchParams.set("display", "list");
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };
  const filtered = useMemo(() => campaigns.filter(c => c.name.toLowerCase().includes(query.search.toLowerCase()) && (query.status === "All" || c.status === query.status) && (query.channel === "all" || c.channel === query.channel)).sort((a, b) => (query.sort === "name" ? a.name.localeCompare(b.name) : a.edited.localeCompare(b.edited)) * query.direction), [campaigns, query]);
  const start = Math.min(query.start, Math.max(0, Math.ceil(filtered.length / query.limit) - 1) * query.limit);
  const paged = filtered.slice(start, start + query.limit);
  return <section className="page-content"><div className="page-heading"><div><div className="title-line"><h1>Campaigns</h1><span className="access-pill">Limited access</span></div><p>Campaigns let you send a single, targeted message through email, push, SMS, and more, ensuring timely communication with your audience</p></div><div className="heading-actions"><button className="secondary">Send feedback</button><button className="secondary">Take a tour <ChevronDown size={14}/></button><button className="primary" onClick={onCreate}><Plus size={16}/> Create campaign <ChevronDown size={14}/></button></div></div><div className="filters"><label>Status<select value={query.status} onChange={e => changeQuery({ status: e.target.value, start: 0 })}><option>All</option><option>Draft</option><option>Active</option><option>Stopped</option></select></label><label>Tag<select><option>Select...</option><option>Lifecycle</option><option>Promotional</option></select></label><button className="secondary"><Filter size={15}/> Filters</button><button className="secondary"><Grid2X2 size={15}/> Columns</button><button className="text-button" onClick={() => changeQuery({ status: "All", channel: "all", search: "", start: 0 })}>Reset filters</button><div className="filter-search"><Search size={15}/><input placeholder="Search" value={query.search} onChange={e => changeQuery({ search: e.target.value, start: 0 }, true)}/></div></div><div className="result-heading"><span>{filtered.length} Results</span><small>{query.channel !== "all" ? channelMeta[query.channel].title : query.status !== "All" ? "Status: " + query.status : "All campaigns"}</small></div><div className="table-wrap"><table><thead><tr><th onClick={() => changeQuery({ sort: "name", direction: query.sort === "name" && query.direction === 1 ? -1 : 1, start: 0 })}>Name {query.sort === "name" ? query.direction === 1 ? "↑" : "↓" : ""}</th><th>Status</th><th>Stop date</th><th>Campaign type</th><th>Entry schedule</th><th>Sent</th><th>Last edited</th><th></th></tr></thead><tbody>{paged.map(c => { const Icon = channelMeta[c.channel].icon; return <tr key={c.id}><td><button className="link-button" onClick={() => onEdit(c)}>{c.name}</button></td><td><span className={className("status", c.status.toLowerCase())}>{c.status}</span></td><td>—</td><td><span className="channel-cell"><Icon size={14}/>{channelMeta[c.channel].title}</span></td><td>{c.schedule}</td><td>{c.sent.toLocaleString()}</td><td>{c.edited}</td><td><CampaignRowActions campaign={c} onEdit={onEdit} onStop={onStop} onArchive={onArchive} onDuplicate={onDuplicate}/></td></tr>; })}</tbody></table></div><div className="campaign-pagination"><span>{filtered.length ? start + 1 : 0}–{Math.min(start + query.limit, filtered.length)} of {filtered.length}</span><label>Rows per page <select value={query.limit} onChange={e => changeQuery({ limit: Number(e.target.value), start: 0 })}><option value="12">12</option><option value="24">24</option><option value="48">48</option></select></label><button className="secondary small" disabled={start === 0} onClick={() => changeQuery({ start: Math.max(0, start - query.limit) })} aria-label="Previous page"><ChevronLeft size={15}/></button><button className="secondary small" disabled={start + query.limit >= filtered.length} onClick={() => changeQuery({ start: start + query.limit })} aria-label="Next page"><ChevronRight size={15}/></button></div></section>;
}

function CampaignRowActions({ campaign, onEdit, onStop, onArchive, onDuplicate }: { campaign: Campaign; onEdit: (campaign: Campaign) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void> }) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const act = (action: () => void) => { setAnchor(null); action(); };
  return <><button className="icon-button" aria-label={`Actions for ${campaign.name}`} aria-expanded={Boolean(anchor)} onClick={event => { if (anchor) { setAnchor(null); return; } const rect = event.currentTarget.getBoundingClientRect(); setAnchor({ top: Math.min(rect.bottom + 4, window.innerHeight - 148), left: Math.max(8, Math.min(rect.right - 130, window.innerWidth - 138)) }); }}><MoreHorizontal size={18}/></button>{anchor && createPortal(<div className="campaign-menu-layer" onMouseDown={() => setAnchor(null)}><div className="campaign-action-menu" style={anchor} onMouseDown={event => event.stopPropagation()}><button onClick={() => act(() => onEdit(campaign))}>Edit</button><button onClick={() => act(() => void onDuplicate(campaign))}>Duplicate</button>{campaign.status === "Active" && <button onClick={() => act(() => onStop(campaign.id))}>Stop</button>}<button onClick={() => act(() => void onArchive(campaign.id))}>Archive</button></div></div>, document.body)}</>;
}

function CampaignEditor({ campaign, onSave, onClose }: { campaign: Campaign; onSave: (c: Campaign, publish?: boolean) => Promise<boolean>; onClose: () => void }) {
  const [draft, setDraft] = useState(campaign); const [step, setStep] = useState(0); const [variant, setVariant] = useState(0); const [testOpen, setTestOpen] = useState(false);
  const steps = ["Compose Messages", "Schedule Delivery", "Target Audiences", "Assign Conversions", "Review Summary"];
  const update = (patch: Partial<Campaign>) => setDraft(d => ({ ...d, ...patch }));
  const launchIssues = campaignValidationIssues(draft);
  const saveMessage = async (patch: Partial<Campaign>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    return onSave(next);
  };
  const goToStep = (next: number) => {
    if (next < 0 || next >= steps.length) return;
    setStep(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", ["compose", "schedule", "audience", "conversions", "review"][next]);
    window.history.pushState(null, "", url);
  };
  useEffect(() => {
    const syncStep = () => {
      const current = new URLSearchParams(window.location.search).get("step");
      const index = ["compose", "schedule", "audience", "conversions", "review"].indexOf(current ?? "compose");
      setStep(index < 0 ? 0 : index);
    };
    syncStep();
    window.addEventListener("popstate", syncStep);
    return () => window.removeEventListener("popstate", syncStep);
  }, [campaign.id]);
  const ChannelIcon = channelMeta[draft.channel].icon;
  return <section className="editor-page">
    <div className="editor-access"><LockKeyhole size={11}/> Limited access</div>
    <nav className="editor-steps" aria-label="Campaign steps">{steps.map((item, i) => <button key={item} className={className("editor-step", step === i && "current", step > i && "complete")} onClick={() => goToStep(i)}><span>{step > i ? "✓" : i + 1}</span><b>{item}</b></button>)}</nav>
    {step === 0 && <Compose draft={draft} update={update} saveEmail={saveMessage} variant={variant} setVariant={setVariant} openTest={() => setTestOpen(true)}/>}
    {step === 1 && <Schedule draft={draft} update={update}/>}
    {step === 2 && <Audience draft={draft} update={update}/>}
    {step === 3 && <Conversions draft={draft} update={update}/>}
    {step === 4 && <Review draft={draft} go={goToStep} issues={launchIssues}/>}
    <footer className="editor-footer">
      <button className="footer-arrow" aria-label="Back" disabled={step === 0} onClick={() => goToStep(step - 1)}><ChevronLeft size={17}/></button>
      <div className="editor-footer-steps">{["Compose", "Schedule", "Target", "Assign", "Review"].map((name, i) => <button key={name} className={className("footer-step", step === i && "current", step > i && "complete")} onClick={() => goToStep(i)}><span>{step > i ? "✓" : i + 1}</span>{name}</button>)}</div>
      <button className="footer-arrow" aria-label="Forward" disabled={step === steps.length - 1} onClick={() => goToStep(step + 1)}><ChevronRight size={17}/></button>
      <button className="footer-save" onClick={() => void onSave(draft)}>Save Draft</button>
      {step === 4 && <button className="primary footer-launch" disabled={Boolean(launchIssues.length) || draft.status === "Active"} onClick={() => void onSave(draft, true)}>{draft.status === "Active" ? "Campaign Active" : "Launch Campaign"}</button>}
    </footer>
    {testOpen && <TestModal draft={draft} close={() => setTestOpen(false)}/>}
    <button className="editor-close-shortcut" onClick={onClose}>Close editor</button>
  </section>
}

function Compose({ draft, update, saveEmail, variant, setVariant, openTest }: { draft: Campaign; update: (p: Partial<Campaign>) => void; saveEmail: (p: Partial<Campaign>) => Promise<boolean>; variant: number; setVariant: (x: number) => void; openTest: () => void }) {
  const channel = draft.channel;
  if (channel === "email") return <EmailCompose draft={draft} update={update} saveEmail={saveEmail} variant={variant} setVariant={setVariant} openTest={openTest}/>;
  return <ChannelCompose draft={draft} update={update} openTest={openTest}/>;
  const isEmail = channel === "multichannel" || channel === "operator";
  const isWebhook = channel === "webhook"; const isText = channel === "sms" || channel === "whatsapp" || channel === "line";
  return <div className="editor-body"><section className="editor-card"><h2>Campaign Details</h2><div className="form-grid"><Field label="Campaign Name"><input value={draft.name} onChange={e => update({ name: e.target.value })}/></Field><Field label="Teams"><select><option>Select teams...</option><option>Lifecycle Marketing</option><option>Growth</option></select></Field></div><Field label="Description"><textarea placeholder="Describe this campaign"/></Field><button className="tag-button"><Tags size={14}/> Tags</button></section><section className="editor-card"><div className="card-heading"><div><h2>{channelMeta[channel].title} Composer</h2><p>{channelMeta[channel].description}</p></div><button className="secondary" onClick={openTest}>Preview and test</button></div><div className="variant-row"><b>Variants</b><button className={className("variant", variant === 0 && "active")} onClick={() => setVariant(0)}>Variant 1</button><button className={className("variant", variant === 1 && "active")} onClick={() => setVariant(1)}>Variant 2</button><button className="add-variant" onClick={() => setVariant(1)}><Plus size={15}/></button></div><div className="composer-grid"><div className="composer-form">{isEmail && <><Field label="From"><select><option>Powered by Braze &lt;braze@mta-h466.bftmail.com&gt;</option></select></Field><Field label="Subject"><input value={draft.subject || "Your welcome offer is here"} onChange={e => update({ subject: e.target.value })}/></Field><Field label="Preheader"><input placeholder="Optional preheader text"/></Field><div className="segmented"><button className="selected">Drag-and-drop editor</button><button>HTML editor</button></div></>}{channel === "push" && <><div className="segmented"><button className="selected">iOS</button><button>Android</button><button>Web</button></div><Field label="Notification title"><input value={draft.subject || "Your welcome offer is here"} onChange={e => update({subject: e.target.value})}/></Field><Field label="Deep link"><input defaultValue="myapp://offers/welcome"/></Field></>}{(channel === "iam" || channel === "content" || channel === "banner") && <><Field label="Message title"><input value={draft.subject || "Welcome to the family"} onChange={e => update({subject: e.target.value})}/></Field><div className="segmented"><button className="selected">Modal</button><button>Slideup</button><button>Full</button></div><Field label="Call to action"><input defaultValue="Shop now"/></Field></>}{isText && <><Field label="Sender / subscription group"><select><option>Promotional messages</option><option>Transactional</option></select></Field><Field label="Message"><textarea value={draft.body || "Welcome to Braze! Use code WELCOME10 for 10% off."} onChange={e => update({body: e.target.value})}/></Field><small>{(draft.body || "").length || 58} characters · 1 segment</small></>}{isWebhook && <><div className="form-grid"><Field label="HTTP method"><select><option>POST</option><option>PUT</option><option>GET</option></select></Field><Field label="Authentication"><select><option>Bearer token</option><option>None</option></select></Field></div><Field label="Webhook URL"><input defaultValue="https://api.example.com/events"/></Field><Field label="Request body"><textarea defaultValue={'{\n  "user_id": "{{${user_id}}}",\n  "event": "campaign_sent"\n}'}/></Field></>}{(channel === "feature" || channel === "api" || channel === "operator") && <><Field label={channel === "operator" ? "Campaign goal" : "Configuration"}><textarea value={draft.body || "Welcome new users and encourage their first purchase."} onChange={e => update({body: e.target.value})}/></Field><div className="subtle-note">This local demo models the configuration and event flow without calling an external service.</div></>}{!isText && !isWebhook && channel !== "feature" && channel !== "api" && <Field label="Message"><textarea value={draft.body || "Thanks for being with us. Use code SEPTEMBER20 to get 20% off this month’s featured collection."} onChange={e => update({body: e.target.value})}/></Field>}</div><MessagePreview draft={draft}/></div></section></div>;
}

function EmailCompose({ draft, update, saveEmail, variant, setVariant, openTest }: { draft: Campaign; update: (p: Partial<Campaign>) => void; saveEmail: (p: Partial<Campaign>) => Promise<boolean>; variant: number; setVariant: (x: number) => void; openTest: () => void }) {
  const variants = emailVariants(draft);
  const current = variants[variant] ?? variants[0];
  const currentSubject = current.subject ?? (variant === 0 ? draft.subject : undefined);
  const currentBody = current.body ?? (variant === 0 ? draft.body : undefined);
  const savedEditorMode = current.editorMode ?? (variant === 0 ? draft.config?.emailEditorMode as EmailEditorMode | undefined : undefined);
  const savedBlocks = current.blocks ?? (variant === 0 && Array.isArray(draft.config?.emailBlocks) ? draft.config.emailBlocks as EmailBlock[] : []);
  const savedSending = current.sending ?? (variant === 0 ? draft.config?.emailSending as EmailSending | undefined : undefined);
  const variantDraft: Campaign = { ...draft, subject: currentSubject, body: currentBody, config: { ...draft.config, emailEditorMode: savedEditorMode, emailBlocks: savedBlocks, emailCanvasBg: current.canvasBg ?? draft.config?.emailCanvasBg, emailContentWidth: current.contentWidth ?? draft.config?.emailContentWidth } };
  const [showSending, setShowSending] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailStart, setEmailStart] = useState(() => !currentSubject && !currentBody);
  const [emailEditor, setEmailEditor] = useState<EmailEditorMode | null>(null);
  useEffect(() => { setEmailStart(!currentSubject && !currentBody); setEmailEditor(null); }, [variant]);
  const variantPatch = (patch: Partial<Campaign>) => {
    const next = [...variants];
    next[variant] = { ...current, subject: patch.subject ?? currentSubject, body: patch.body ?? currentBody, editorMode: (patch.config?.emailEditorMode as EmailEditorMode | undefined) ?? savedEditorMode, blocks: Array.isArray(patch.config?.emailBlocks) ? patch.config.emailBlocks as EmailBlock[] : savedBlocks, sending: (patch.config?.emailSending as EmailSending | undefined) ?? savedSending, canvasBg: typeof patch.config?.emailCanvasBg === "string" ? patch.config.emailCanvasBg : current.canvasBg, contentWidth: typeof patch.config?.emailContentWidth === "number" ? patch.config.emailContentWidth : current.contentWidth };
    const config = { ...draft.config, variants: next, ...(variant === 0 ? { emailEditorMode: next[0].editorMode, emailBlocks: next[0].blocks, emailSending: next[0].sending, emailCanvasBg: next[0].canvasBg, emailContentWidth: next[0].contentWidth } : {}) };
    return variant === 0 ? { ...patch, config } : { config };
  };
  const updateVariant = (patch: Partial<Campaign>) => update(variantPatch(patch));
  const saveVariant = (patch: Partial<Campaign>) => saveEmail(variantPatch(patch));
  const addVariant = () => { const next = [...variants, { id: `var_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}` }]; update({ config: { ...draft.config, variants: next } }); setVariant(next.length - 1); };
  const [html, setHtml] = useState(`<div style="max-width:600px;margin:0 auto;padding:32px;font-family:Arial,sans-serif"><h1>September Exclusive</h1><p>Hi {{\${first_name} | default: 'there'}},</p><h2>Your September offer is here</h2><p>Thanks for being with us. Use code <b>SEPTEMBER20</b> to get 20% off this month's featured collection.</p><a href="https://example.com/offers">Claim your offer</a></div>`);
  if (showSending) return <EmailSendingEditor draft={variantDraft} sending={savedSending} save={saveVariant} onClose={() => setShowSending(false)}/>;
  if (emailEditor) return <EmailMessageEditor key={current.id} mode={emailEditor} variantName={current.name} draft={variantDraft} save={saveVariant} onClose={() => { setEmailEditor(null); setEmailStart(false); }} onSendingSettings={() => { setEmailEditor(null); setEmailStart(false); setShowSending(true); }} />;
  if (emailStart) return <EmailStart draft={draft} update={update} importHtml={body => updateVariant({ body, config: { emailEditorMode: "html" } })} variants={variants} variant={variant} setVariant={setVariant} addVariant={addVariant} copied={copied} setCopied={setCopied} onStart={setEmailEditor} />;
  const subject = currentSubject ?? "";
  const fromName = savedSending?.fromName ?? "Powered by Braze";
  const fromAddress = savedSending?.fromAddress ?? "braze@mta-h466.bftmail.com";
  return <div className="editor-body email-compose-page">
    <EmailCampaignDetails draft={draft} update={update} copied={copied} setCopied={setCopied}/>
    <section className="braze-section email-composer-section">
      <h2>Email Composer</h2>
      <EmailVariantTabs variants={variants} selected={variant} onSelect={setVariant} onAdd={addVariant}/>
      <div className="sending-info"><div><h3>Sending info</h3><dl><div><dt>From:</dt><dd>{fromName} &lt;{fromAddress}&gt;</dd></div><div><dt>Subject:</dt><dd>{subject}</dd></div>{savedSending?.preheader && <div><dt>Preheader:</dt><dd>{savedSending.preheader}</dd></div>}<div><dt>One-click list-unsubscribe:</dt><dd>{savedSending?.unsubscribe ?? "Use workspace default"}</dd></div></dl></div><button className="secondary small" onClick={() => setShowSending(true)}>Edit sending info</button></div>
      <div className="email-body-heading"><div><h3>Email body</h3><p>{savedEditorMode === "drag" ? "Drag-and-drop Editor" : "HTML Editor"}</p></div><button className="secondary" onClick={() => setEmailEditor(savedEditorMode ?? "html")}>Edit message</button></div>
      {showEditor && <div className="html-workbench"><div className="editor-toolbar"><button className="selected"><FileCode2 size={14}/> HTML</button><button>Preview</button><button>Personalization</button><button>Content blocks</button></div><textarea value={html} onChange={e => setHtml(e.target.value)} aria-label="Email HTML editor"/></div>}
      <div className="email-document"><div className="email-document-top">{currentSubject || "September Offer"}</div><article>{savedEditorMode === "drag" ? savedBlocks.length ? savedBlocks.map(block => block.kind === "Title" ? <h1 key={block.id}>{block.text}</h1> : block.kind === "Divider" ? <hr key={block.id}/> : block.kind === "Spacer" ? <div key={block.id} style={{height:24}}/> : block.kind === "Button" ? <a key={block.id}>{block.text}</a> : <p key={block.id}>{block.text}</p>) : <p>No content blocks yet.</p> : <><p className="email-kicker">September Exclusive</p><p>{"{% if ${language} == 'zh' %}"}</p><p>你好，{"{{${first_name} | default: '朋友'}}"}！</p><h1>九月专属礼遇已上线</h1><p>感谢一路相伴。使用优惠码 <b>SEPTEMBER20</b>，即可享受本月精选商品 20% 优惠。</p><a>立即领取优惠</a><p>优惠截止至 2026 年 9 月 30 日，条款与条件适用。</p><p>{"{% else %}"}</p><p>Hi {"{{${first_name} | default: 'there'}}"},</p><h1>Your September offer is here</h1><p>{currentBody || "Thanks for being with us. Use code SEPTEMBER20 to get 20% off this month's featured collection."}</p><a>Claim your offer</a><p>Offer ends September 30, 2026. Terms and conditions apply.</p><p>{"{% endif %}"}</p><hr/><p className="email-footer">Don't want to receive these emails? <a>Unsubscribe</a></p></>}</article></div>
      <div className="email-actions"><button className="secondary" onClick={() => setShowTemplates(!showTemplates)}>Choose New Template</button><button className="secondary" onClick={openTest}>Preview and test</button></div>
      {showTemplates && <div className="template-picker"><b>Choose a template</b><button onClick={() => { updateVariant({subject:"Welcome to Braze"}); setShowTemplates(false); }}>Welcome email <small>Drag-and-Drop Editor</small></button><button onClick={() => { updateVariant({subject:"Your September Offer | 20% Off"}); setShowTemplates(false); }}>September Offer <small>HTML Editor</small></button></div>}
    </section>
  </div>;
}

function EmailCampaignDetails({ draft, update, copied, setCopied }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; copied: boolean; setCopied: (copied: boolean) => void }) {
  const description = typeof draft.config?.description === "string" ? draft.config.description : "";
  const tags = Array.isArray(draft.config?.tags) ? draft.config.tags as string[] : [];
  const [showDescription, setShowDescription] = useState(Boolean(description));
  const [showTags, setShowTags] = useState(false);
  const toggleTag = (tag: string) => update({ config: { ...draft.config, tags: tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag] } });
  return <section className="braze-section campaign-details-section">
    <h2>Campaign Details</h2>
    <div className="campaign-name-line"><Field label="Campaign Name"><input value={draft.name} onChange={event => update({ name: event.target.value })} placeholder="Enter Campaign Name"/></Field></div>
    {showDescription ? <Field label="Description"><textarea value={description} onChange={event => update({ config: { ...draft.config, description: event.target.value } })} placeholder="Enter a description"/></Field> : <button className="inline-link" onClick={() => setShowDescription(true)}><Plus size={16}/> Add description</button>}
    <div className="campaign-tag-line"><button className="tag-button" aria-expanded={showTags} onClick={() => setShowTags(!showTags)}><Tags size={14}/> Tags <ChevronDown size={13}/></button>{tags.map(tag => <span className="campaign-tag" key={tag}>{tag}</span>)}{showTags && <div className="campaign-tags-menu">{["Lifecycle", "Promotional", "Retention"].map(tag => <button key={tag} onClick={() => toggleTag(tag)}>{tags.includes(tag) ? "✓ " : ""}{tag}</button>)}</div>}</div>
    <div className="campaign-id-line"><Field label="Campaign ID"><input value={draft.id} readOnly title={draft.id}/></Field><button className="copy-id" onClick={() => { void navigator.clipboard?.writeText(draft.id); setCopied(true); }}><Copy size={17}/>{copied ? "Copied" : "Copy"}</button></div>
  </section>;
}

function EmailStart({ draft, update, importHtml, variants, variant, setVariant, addVariant, copied, setCopied, onStart }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; importHtml: (body: string) => void; variants: EmailVariant[]; variant: number; setVariant: (variant: number) => void; addVariant: () => void; copied: boolean; setCopied: (copied: boolean) => void; onStart: (choice: "operator" | "drag" | "html" | "template") => void }) {
  return <div className="editor-body email-compose-page">
    <EmailCampaignDetails draft={draft} update={update} copied={copied} setCopied={setCopied}/>
    <section className="braze-section email-composer-section">
      <h2>Email Composer</h2>
      <EmailVariantTabs variants={variants} selected={variant} onSelect={setVariant} onAdd={addVariant}/>
      <div className={emailStarterStyles.starter}>
        <h3>Create new email</h3><p>How would you like to start?</p>
        <div className={emailStarterStyles.options}>
          <button className={emailStarterStyles.option} onClick={() => onStart("operator")}><span className={emailStarterStyles.operatorIcon}><Sparkles size={18}/></span><b>Create with Operator</b><small>Generate a custom email</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("drag")}><span><LayoutDashboard size={19}/></span><b>Drag-and-drop editor</b><small>Start from scratch</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("html")}><span><Code2 size={20}/></span><b>HTML code editor</b><small>Start from scratch</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("template")}><span><FileCode2 size={19}/></span><b>Templates</b><small>Choose a template</small></button>
        </div>
        <label className={emailStarterStyles.upload}>Upload file<input type="file" accept=".html,.htm" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; importHtml(await file.text()); onStart("html"); }}/></label>
      </div>
    </section>
  </div>;
}

function EmailSendingEditor({ draft, sending, save, onClose }: { draft: Campaign; sending?: EmailSending; save: (patch: Partial<Campaign>) => Promise<boolean>; onClose: () => void }) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [preheader, setPreheader] = useState(sending?.preheader ?? "");
  const [whitespace, setWhitespace] = useState(sending?.whitespace ?? false);
  const [replyTo, setReplyTo] = useState(sending?.replyTo ?? "Exclude reply-to and send replies to \"from\" address");
  const [bcc, setBcc] = useState(sending?.bcc ?? "No BCC address");
  const [unsubscribe, setUnsubscribe] = useState(sending?.unsubscribe ?? "Use workspace default");
  const [fromName, setFromName] = useState(sending?.fromName ?? "Powered by Braze");
  const [fromAddress, setFromAddress] = useState(sending?.fromAddress ?? "braze@mta-h466.bftmail.com");
  const [ipPool, setIpPool] = useState(sending?.ipPool ?? "PLG_IP_Pool");
  const [section, setSection] = useState<"Sending Info" | "Advanced" | "Personalization" | "Languages">("Sending Info");
  const [insertingInto, setInsertingInto] = useState<"subject" | "preheader" | null>(null);
  const [saving, setSaving] = useState(false);
  const currentSending: EmailSending = { preheader, whitespace, replyTo, bcc, unsubscribe, fromName, fromAddress, ipPool };
  const insert = (token: string) => { if (insertingInto === "preheader") setPreheader(value => appendPersonalization(value, token)); else setSubject(value => appendPersonalization(value, token)); setInsertingInto(null); };
  const done = async () => { if (!subject.trim() || saving) return; setSaving(true); const ok = await save({ subject, config: { ...draft.config, emailSending: currentSending } }); setSaving(false); if (ok) onClose(); };
  const download = () => { const blob = new Blob([`<html><head><title>${subject.replaceAll("<", "&lt;")}</title></head><body><h1>${subject.replaceAll("<", "&lt;")}</h1><p>${(draft.body ?? "").replaceAll("<", "&lt;")}</p></body></html>`], { type: "text/html" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "email-preview.html"; link.click(); URL.revokeObjectURL(link.href); };
  return <section className={brazeSendingStyles.page} aria-label="Email sending settings">
    <header className={brazeSendingStyles.header}><b>{draft.name}</b><button aria-label="BrazeAI Operator"><Sparkles size={19}/></button></header>
    <nav className={brazeSendingStyles.iconRail} aria-label="Email editor sections"><button className={brazeSendingStyles.iconActive} title="Sending settings"><Mail size={22}/></button><button title="Content" onClick={onClose}><FileCode2 size={22}/></button><button title="Preview & Test" onClick={() => setSection("Sending Info")}><Eye size={22}/></button></nav>
    <aside className={brazeSendingStyles.sideRail}><div className={brazeSendingStyles.railTitle}>SENDING SETTINGS<button aria-label="Back to campaign" onClick={onClose}><ChevronLeft size={15}/></button></div>{(["Sending Info", "Advanced", "Personalization", "Languages"] as const).map(name => <button key={name} className={section === name ? brazeSendingStyles.navActive : ""} onClick={() => setSection(name)}>{name}</button>)}<a href="#email-style-settings">Style Settings ↗</a></aside>
    <main className={brazeSendingStyles.formArea}>
      {section === "Sending Info" ? <><h2>Sending Info</h2><p>You can update the default value of your sending information from <a href="#email-settings">Email Settings</a>.</p><label>Subject <span className={brazeSendingStyles.liquidInput}><textarea rows={1} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Enter an email subject"/><button title="Add Liquid" aria-label="Personalize subject" onClick={() => setInsertingInto(insertingInto === "subject" ? null : "subject")}>✦</button></span>{insertingInto === "subject" && <PersonalizationPicker title="Personalize subject" onInsert={insert}/>}</label><label>Preheader <small>(Optional)</small><span className={brazeSendingStyles.liquidInput}><textarea rows={1} value={preheader} onChange={event => setPreheader(event.target.value)} placeholder="Enter an email preheader"/><button title="Add Liquid" aria-label="Personalize preheader" onClick={() => setInsertingInto(insertingInto === "preheader" ? null : "preheader")}>✦</button></span>{insertingInto === "preheader" && <PersonalizationPicker title="Personalize preheader" onInsert={insert}/>}</label><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={whitespace} onChange={event => setWhitespace(event.target.checked)}/><span>Add whitespace after preheader<small>Prevents most email clients from pulling additional content from your email to fill the remaining preview space</small></span></label><div className={brazeSendingStyles.formDivider}/><h3>From display name + address</h3><label>From display name<input value={fromName} onChange={event => setFromName(event.target.value)}/></label><label>From address<input value={fromAddress} onChange={event => setFromAddress(event.target.value)}/></label><label>IP pool<select value={ipPool} onChange={event => setIpPool(event.target.value)}><option>PLG_IP_Pool</option><option>Transactional_IP_Pool</option><option>Shared_IP_Pool</option></select></label><label>Reply-to address<select value={replyTo} onChange={event => setReplyTo(event.target.value)}><option>Exclude reply-to and send replies to &quot;from&quot; address</option><option>Use from address</option></select></label><label>BCC address<select value={bcc} onChange={event => setBcc(event.target.value)}><option>No BCC address</option><option>Use workspace default</option></select></label><label>One-click list-unsubscribe setting<select value={unsubscribe} onChange={event => setUnsubscribe(event.target.value)}><option>Use workspace default</option><option>Enabled</option><option>Disabled</option></select></label></> : section === "Personalization" ? <><h2>Personalization</h2><p>Insert a Liquid variable into the subject or preheader.</p><button className={brazeSendingStyles.variableButton} onClick={() => setSubject(value => appendPersonalization(value, "{{${first_name} | default: 'there'}}"))}>First name → Subject</button><button className={brazeSendingStyles.variableButton} onClick={() => setPreheader(value => appendPersonalization(value, "{{${email}}}"))}>Email address → Preheader</button></> : section === "Languages" ? <><h2>Languages</h2><p>Compose localized subject lines with Liquid conditions.</p><button className={brazeSendingStyles.variableButton} onClick={() => setSubject("{% if ${language} == 'zh' %}你好{% else %}" + subject + "{% endif %}")}>Add Chinese and English condition</button></> : <><h2>Advanced</h2><p>Configure reply handling and unsubscribe behavior.</p><label>Reply-to address<select value={replyTo} onChange={event => setReplyTo(event.target.value)}><option>Exclude reply-to and send replies to &quot;from&quot; address</option><option>Use from address</option></select></label><label>BCC address<select value={bcc} onChange={event => setBcc(event.target.value)}><option>No BCC address</option><option>Use workspace default</option></select></label><label>One-click list-unsubscribe setting<select value={unsubscribe} onChange={event => setUnsubscribe(event.target.value)}><option>Use workspace default</option><option>Enabled</option><option>Disabled</option></select></label></>}
    </main>
    <aside className={brazeSendingStyles.preview}><h2>Preview</h2><p><b>From:</b> {fromName} &lt;{fromAddress}&gt;</p><div className={brazeSendingStyles.previewFrame}><b>{subject}</b><small>{preheader}</small><p>{draft.body}</p></div><small>Actual rendering may not be identical to this preview depending on the user&apos;s environment</small></aside>
    <footer className={brazeSendingStyles.footer}><button onClick={download}>Download file</button><button className={brazeSendingStyles.done} disabled={!subject.trim() || saving} onClick={() => void done()}>{saving ? "Saving…" : "Done"}</button></footer>
  </section>;
}

function EmailMessageEditor({ mode, variantName, draft, save, onClose, onSendingSettings }: { mode: EmailEditorMode; variantName: string; draft: Campaign; save: (patch: Partial<Campaign>) => Promise<boolean>; onClose: () => void; onSendingSettings: () => void }) {
  const [subject, setSubject] = useState(draft.subject ?? "Your September offer is here");
  const [preheader, setPreheader] = useState((draft.config?.emailSending as EmailSending | undefined)?.preheader ?? "Use code SEPTEMBER20 before September 30.");
  const [body, setBody] = useState(draft.body ?? "Thanks for being with us. Use code SEPTEMBER20 to get 20% off this month’s featured collection.");
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [operatorPrompt, setOperatorPrompt] = useState("Create a warm welcome email with a first-purchase offer.");
  const labels: Record<EmailEditorMode, string> = { operator: "Create with Operator", drag: "Drag-and-drop editor", html: "HTML code editor", template: "Templates" };
  const applyTemplate = (nextSubject: string, nextBody: string) => { setSubject(nextSubject); setBody(nextBody); };
  const persist = () => save({ subject, body, config: { ...draft.config, emailEditorMode: mode, emailSending: { ...(draft.config?.emailSending as EmailSending | undefined), preheader } } });
  const saveAndReturn = async () => { if (await persist()) onClose(); };
  const openSendingSettings = async () => { if (await persist()) onSendingSettings(); };
  const insertToken = (token: string) => { setBody(value => appendPersonalization(value, token)); setPersonalizationOpen(false); };
  const addBlock = (name: string) => setBody(current => `${current}\n\n[${name} block]`);
  if (mode === "drag") return <BrazeDragDropEditor draft={draft} variantName={variantName} save={save} onClose={onClose} onSendingSettings={onSendingSettings}/>;
  return <section className={emailEditorStyles.page} aria-label="Email editor">
    <header className={emailEditorStyles.header}>
      <button className={emailEditorStyles.back} onClick={saveAndReturn}><ChevronLeft size={17}/> Back to campaign</button>
      <div className={emailEditorStyles.title}><b>{labels[mode]}</b><small>{draft.name} · {variantName}</small></div>
      <div className={emailEditorStyles.headerActions}><button className={emailEditorStyles.previewButton}><Smartphone size={15}/> Preview</button><button className={emailEditorStyles.previewButton} onClick={() => void openSendingSettings()}><Mail size={15}/> Sending settings</button><button className={emailEditorStyles.saveButton} onClick={saveAndReturn}><Send size={14}/> Save</button></div>
    </header>
    <div className={emailEditorStyles.workspace}>
      <aside className={emailEditorStyles.sidebar}>
        {mode === "html" && <><h2>HTML code</h2><p>Edit your email source. The central canvas renders its current message content.</p><textarea className={emailEditorStyles.codeArea} value={body} onChange={event => setBody(event.target.value)} aria-label="Email HTML source"/><div className={emailEditorStyles.personalizationTools}><button type="button" onClick={() => setPersonalizationOpen(value => !value)}><Sparkles size={14}/> Personalization</button>{personalizationOpen && <PersonalizationPicker title="Insert into HTML" onInsert={insertToken}/>}</div></>}
        {mode === "template" && <><h2>Templates</h2><p>Choose a template, then make changes in the settings panel.</p><div className={emailEditorStyles.templateList}><button className={`${emailEditorStyles.template} ${emailEditorStyles.templateActive}`} onClick={() => applyTemplate("Your September Offer | 20% Off", "Thanks for being with us. Use code SEPTEMBER20 to get 20% off this month’s featured collection.")}><b>September Offer</b><small>HTML Editor</small></button><button className={emailEditorStyles.template} onClick={() => applyTemplate("Welcome to Braze", "We’re glad you’re here. Explore the latest ways to make every customer interaction count.")}><b>Welcome email</b><small>Drag-and-drop Editor</small></button></div></>}
        {mode === "operator" && <><h2>Operator</h2><p>Describe the email you want to create.</p><textarea className={emailEditorStyles.operatorPrompt} value={operatorPrompt} onChange={event => setOperatorPrompt(event.target.value)}/><button className={emailEditorStyles.generate} onClick={() => applyTemplate("Your first order offer", "Welcome! Use code WELCOME10 for 10% off your first purchase. This offer is ready whenever you are.")}><Sparkles size={14}/> Generate email</button></>}
      </aside>
      <main className={emailEditorStyles.canvas}>
        <div className={emailEditorStyles.canvasLabel}>Email preview · 600 px</div>
        <article className={emailEditorStyles.emailFrame}>
          <div className={emailEditorStyles.brandLine}>BRAZE</div>
          <div className={emailEditorStyles.message}><p className={emailEditorStyles.eyebrow}>September exclusive</p><h1>{subject}</h1><p>{"Hi {{${first_name} | default: 'there'}}"},</p><p>{body}</p><span className={emailEditorStyles.cta}>Claim your offer</span><p className={emailEditorStyles.footer}>You are receiving this email because you subscribed to updates. Unsubscribe</p></div>
        </article>
      </main>
      <aside className={emailEditorStyles.settings}>
        <h2>Message settings</h2><label className={emailEditorStyles.field}><span>Subject line</span><input value={subject} onChange={event => setSubject(event.target.value)}/></label><label className={emailEditorStyles.field}><span>Preheader</span><input value={preheader} onChange={event => setPreheader(event.target.value)}/></label><label className={emailEditorStyles.field}><span>Message</span><textarea value={body} onChange={event => setBody(event.target.value)}/></label><div className={emailEditorStyles.personalizationTools}><button type="button" onClick={() => setPersonalizationOpen(value => !value)}><Sparkles size={14}/> Personalization</button>{personalizationOpen && <PersonalizationPicker title="Insert into message" onInsert={insertToken}/>}</div><div className={emailEditorStyles.note}>Personalization, content blocks, and link tracking are available in this local editor.</div>
      </aside>
    </div>
  </section>;
}

function BrazeDragDropEditor({ draft, variantName, save: saveCampaignMessage, onClose, onSendingSettings }: { draft: Campaign; variantName: string; save: (patch: Partial<Campaign>) => Promise<boolean>; onClose: () => void; onSendingSettings: () => void }) {
  const catalog: Array<{ kind: EmailBlockKind; help: string }> = [
    { kind: "Title", help: "Add a heading" }, { kind: "Paragraph", help: "Add text" }, { kind: "List", help: "Add a list" },
    { kind: "Button", help: "Add a CTA" }, { kind: "Divider", help: "Add a divider" }, { kind: "Spacer", help: "Add spacing" },
    { kind: "Image", help: "Add an image" }, { kind: "Video", help: "Add a video" }, { kind: "Social", help: "Add social links" },
    { kind: "HTML", help: "Add custom HTML" }, { kind: "Menu", help: "Add navigation" },
  ];
  const [leftMode, setLeftMode] = useState<"content" | "links" | "personalization" | "languages">("content");
  const [rightTab, setRightTab] = useState<"content" | "rows" | "settings">("content");
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => Array.isArray(draft.config?.emailBlocks) && draft.config.emailBlocks.length ? draft.config.emailBlocks as EmailBlock[] : draft.body ? [{ id: "paragraph_seed", kind: "Paragraph", text: draft.body }] : [{ id: "title_seed", kind: "Title", text: "I'm a new title block" }]);
  const [selected, setSelected] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(true);
  const [canvasBg, setCanvasBg] = useState(typeof draft.config?.emailCanvasBg === "string" ? draft.config.emailCanvasBg : "#ffffff");
  const [contentWidth, setContentWidth] = useState(typeof draft.config?.emailContentWidth === "number" ? draft.config.emailContentWidth : 600);
  const defaults: Record<EmailBlockKind, string> = { Title: "I'm a new title block", Paragraph: "Add your message here.", List: "First item\nSecond item\nThird item", Button: "Call to action", Divider: "", Spacer: "", Image: "Image URL", Video: "Video URL", Social: "Social links", HTML: "<p>Custom HTML</p>", Menu: "Home · Shop · Support" };
  const add = (kind: EmailBlockKind, text = defaults[kind]) => { const block = { id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, kind, text }; setBlocks(current => [...current, block]); setSelected(block.id); };
  const selectedBlock = blocks.find(block => block.id === selected);
  const persist = () => saveCampaignMessage({ body: blocks.map(block => block.text).filter(Boolean).join("\n"), config: { ...draft.config, emailEditorMode: "drag", emailBlocks: blocks, emailCanvasBg: canvasBg, emailContentWidth: contentWidth } });
  const save = async () => { if (await persist()) onClose(); };
  const openSendingSettings = async () => { if (await persist()) onSendingSettings(); };
  const changeSelected = (text: string) => setBlocks(current => current.map(block => block.id === selected ? { ...block, text } : block));
  const changeSelectedStyle = (patch: NonNullable<EmailBlock["style"]>) => setBlocks(current => current.map(block => block.id === selected ? { ...block, style: { ...block.style, ...patch } } : block));
  const duplicateSelected = () => { if (!selectedBlock) return; const copy = { ...selectedBlock, id: `block_${crypto.randomUUID().slice(0, 8)}` }; setBlocks(current => [...current.slice(0, current.findIndex(block => block.id === selected) + 1), copy, ...current.slice(current.findIndex(block => block.id === selected) + 1)]); setSelected(copy.id); };
  const renderBlock = (block: EmailBlock) => {
    const common = { className: `${brazeDndStyles.canvasBlock} ${selected === block.id ? brazeDndStyles.selected : ""}`, onClick: () => setSelected(block.id), style: { textAlign: block.style?.align ?? (block.kind === "Title" ? "center" : "left"), color: block.style?.color, fontSize: block.style?.fontSize, fontWeight: block.style?.bold ? 700 : undefined, fontStyle: block.style?.italic ? "italic" : undefined } as CSSProperties };
    if (block.kind === "Title") return <h1 key={block.id} {...common}>{block.text}</h1>;
    if (block.kind === "Paragraph") return <p key={block.id} {...common}>{block.text}</p>;
    if (block.kind === "List") return <ul key={block.id} {...common}>{block.text.split("\n").filter(Boolean).map(item => <li key={item}>{item}</li>)}</ul>;
    if (block.kind === "Button") return <div key={block.id} {...common}><span className={brazeDndStyles.cta}>{block.text}</span></div>;
    if (block.kind === "Divider") return <hr key={block.id} {...common}/>;
    if (block.kind === "Spacer") return <div key={block.id} {...common} className={`${brazeDndStyles.canvasBlock} ${brazeDndStyles.spacer} ${selected === block.id ? brazeDndStyles.selected : ""}`}>Spacer</div>;
    if (block.kind === "Image") return <div key={block.id} {...common} className={brazeDndStyles.mediaBlock}><Image size={24}/><span>{block.text}</span></div>;
    if (block.kind === "Video") return <div key={block.id} {...common} className={brazeDndStyles.mediaBlock}><Video size={24}/><span>{block.text}</span></div>;
    if (block.kind === "Social") return <div key={block.id} {...common} className={brazeDndStyles.mediaBlock}><Share2 size={24}/><span>{block.text}</span></div>;
    if (block.kind === "Menu") return <nav key={block.id} {...common}>{block.text}</nav>;
    return <pre key={block.id} {...common}>{block.text}</pre>;
  };
  const download = () => {
    const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const html = "<!doctype html><html><body>" + blocks.map(block => block.kind === "Title" ? "<h1>" + escape(block.text) + "</h1>" : "<p>" + escape(block.text) + "</p>").join("") + "</body></html>";
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); link.download = "email.html"; link.click(); URL.revokeObjectURL(link.href);
  };
  return <section className={brazeDndStyles.page} aria-label="Braze drag-and-drop email editor">
    <header className={brazeDndStyles.header}><b>{draft.name}</b><button aria-label="BrazeAI Operator"><Sparkles size={19}/></button></header>
    <nav className={brazeDndStyles.iconRail} aria-label="Email editor sections"><button title="Sending settings" onClick={() => void openSendingSettings()}><Mail size={22}/></button><button className={brazeDndStyles.iconActive} title="Content"><FileCode2 size={22}/></button><button title="Preview & Test" onClick={() => setRightTab("settings")}><Eye size={22}/></button></nav>
    <aside className={brazeDndStyles.leftRail}>
      <div className={brazeDndStyles.leftTitle}>CONTENT<button aria-label="Back to campaign" onClick={() => void save()}><ChevronLeft size={16}/></button></div>
      <button className={leftMode === "content" ? brazeDndStyles.leftActive : ""} onClick={() => setLeftMode("content")}>Content Build</button>
      <button className={leftMode === "links" ? brazeDndStyles.leftActive : ""} onClick={() => setLeftMode("links")}>Link Management</button>
      <button className={leftMode === "personalization" ? brazeDndStyles.leftActive : ""} onClick={() => setLeftMode("personalization")}>✚ &nbsp; Personalization</button>
      <button className={leftMode === "languages" ? brazeDndStyles.leftActive : ""} onClick={() => setLeftMode("languages")}>◉ &nbsp; Languages</button>
      <small>Create with Operator</small><button onClick={() => { if (selectedBlock) changeSelected("A fresh offer, just for you"); else add("Title"); }}>✎ &nbsp; Copy</button>
      <button className={brazeDndStyles.styleLink} onClick={() => { setSelected(null); setRightTab("settings"); }}>Style Settings ↗</button>
    </aside>
    <main className={brazeDndStyles.canvasArea}>
      <div className={brazeDndStyles.deviceModes}><button className={desktop ? brazeDndStyles.deviceActive : ""} title="Desktop" onClick={() => setDesktop(true)}><LayoutDashboard size={16}/></button><button className={!desktop ? brazeDndStyles.deviceActive : ""} title="Mobile" onClick={() => setDesktop(false)}><Smartphone size={16}/></button></div>
      <div className={[brazeDndStyles.emailCanvas, desktop ? "" : brazeDndStyles.mobileCanvas].join(" ")} style={{ background: canvasBg, maxWidth: desktop ? contentWidth : 360 }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const kind = event.dataTransfer.getData("braze-block") as EmailBlockKind; if (catalog.some(item => item.kind === kind)) add(kind); }}>
        {blocks.length ? blocks.map(block => <div key={block.id} className={brazeDndStyles.blockShell}>{renderBlock(block)}{selected === block.id && <div className={brazeDndStyles.inlineToolbar}><button onClick={() => changeSelectedStyle({ bold: !block.style?.bold })}>B</button><button onClick={() => changeSelectedStyle({ italic: !block.style?.italic })}>I</button><button onClick={duplicateSelected} title="Duplicate block"><Copy size={14}/></button><button onClick={() => { setBlocks(current => current.filter(item => item.id !== block.id)); setSelected(null); }} title="Delete block"><Trash2 size={14}/></button></div>}</div>) : <div className={brazeDndStyles.dropZone}>Drag content here to build your email</div>}
      </div>
    </main>
    <aside className={brazeDndStyles.rightPanel}>
      <div className={brazeDndStyles.rightTabs}>{(["content", "rows", "settings"] as const).map(name => <button key={name} className={rightTab === name && !selectedBlock ? brazeDndStyles.rightActive : ""} onClick={() => { setSelected(null); setRightTab(name); }}>{name.toUpperCase()}</button>)}</div>
      {selectedBlock ? <div className={brazeDndStyles.properties}>
        <div className={brazeDndStyles.propertyHead}><b>{selectedBlock.kind.toUpperCase()} PROPERTIES</b><button title="Delete" onClick={() => { setBlocks(current => current.filter(block => block.id !== selectedBlock.id)); setSelected(null); }}><Trash2 size={16}/></button><button title="Duplicate" onClick={duplicateSelected}><Copy size={16}/></button><button title="Close properties" onClick={() => setSelected(null)}><X size={17}/></button></div>
        {selectedBlock.kind === "Title" && <label className={brazeDndStyles.propertyRow}>Title<select value={selectedBlock.style?.fontSize ?? 34} onChange={event => changeSelectedStyle({ fontSize: Number(event.target.value) })}><option value="34">H1</option><option value="28">H2</option><option value="22">H3</option></select></label>}
        <label className={brazeDndStyles.propertyRow}>Font family<select defaultValue="Global font"><option>Global font</option><option>Arial</option><option>Georgia</option></select></label>
        <label className={brazeDndStyles.propertyRow}>Font weight<select value={selectedBlock.style?.bold === false ? "Normal" : "Bold"} onChange={event => changeSelectedStyle({ bold: event.target.value === "Bold" })}><option>Bold</option><option>Normal</option></select></label>
        <div className={brazeDndStyles.propertyRow}><span>Font size</span><div className={brazeDndStyles.stepper}><button onClick={() => changeSelectedStyle({ fontSize: Math.max(8, (selectedBlock.style?.fontSize ?? 34) - 1) })}>−</button><span>{selectedBlock.style?.fontSize ?? 34}</span><button onClick={() => changeSelectedStyle({ fontSize: Math.min(80, (selectedBlock.style?.fontSize ?? 34) + 1) })}>+</button></div></div>
        <label className={brazeDndStyles.propertyRow}>Text color<input type="color" value={selectedBlock.style?.color ?? "#2e3c47"} onChange={event => changeSelectedStyle({ color: event.target.value })}/></label>
        <div className={brazeDndStyles.propertyRow}><span>Align</span><div className={brazeDndStyles.alignButtons}>{(["left", "center", "right"] as const).map(align => <button key={align} className={(selectedBlock.style?.align ?? (selectedBlock.kind === "Title" ? "center" : "left")) === align ? brazeDndStyles.alignActive : ""} onClick={() => changeSelectedStyle({ align })}>{align === "left" ? "≡" : align === "center" ? "☷" : "≡"}</button>)}</div></div>
        <label className={brazeDndStyles.propertyText}>Content<textarea value={selectedBlock.text} onChange={event => changeSelected(event.target.value)}/></label>
      </div> : rightTab === "content" ? <div className={brazeDndStyles.catalogPane}>
        <h3>BASIC BLOCKS</h3><div className={brazeDndStyles.blockCatalog}>{catalog.slice(0,6).map(block => { const Icon = block.kind === "Title" ? Type : block.kind === "Paragraph" ? FileCode2 : block.kind === "List" ? List : block.kind === "Button" ? MousePointerClick : block.kind === "Divider" ? Grid2X2 : LayoutDashboard; return <button draggable key={block.kind} onDragStart={event => event.dataTransfer.setData("braze-block", block.kind)} onClick={() => add(block.kind)}><Icon size={29}/><span>{block.kind.toUpperCase()}</span></button>; })}</div>
        <h3>MEDIA</h3><div className={brazeDndStyles.blockCatalog}>{catalog.slice(6,9).map(block => { const Icon = block.kind === "Image" ? Image : block.kind === "Video" ? Video : Share2; return <button draggable key={block.kind} onDragStart={event => event.dataTransfer.setData("braze-block", block.kind)} onClick={() => add(block.kind)}><Icon size={29}/><span>{block.kind.toUpperCase()}</span></button>; })}</div>
        <h3>ADVANCED</h3><div className={brazeDndStyles.blockCatalog}>{catalog.slice(9).map(block => <button draggable key={block.kind} onDragStart={event => event.dataTransfer.setData("braze-block", block.kind)} onClick={() => add(block.kind)}><Code2 size={29}/><span>{block.kind.toUpperCase()}</span></button>)}</div>
      </div> : rightTab === "rows" ? <div className={brazeDndStyles.catalogPane}><h3>ROWS</h3><p>Drag a layout into your email.</p><div className={brazeDndStyles.rowCatalog}>{[1,2,3].map(columns => <button key={columns} onClick={() => { for (let i = 0; i < columns; i++) add("Paragraph"); }}>{columns} column{columns > 1 ? "s" : ""}<span>{Array.from({ length: columns }, (_, index) => <i key={index}/>)}</span></button>)}</div></div> : <div className={brazeDndStyles.catalogPane}><h3>SETTINGS</h3><label className={brazeDndStyles.settingField}>Background color<input type="color" value={canvasBg} onChange={event => setCanvasBg(event.target.value)}/></label><label className={brazeDndStyles.settingField}>Content width <input type="number" min="320" max="800" value={contentWidth} onChange={event => setContentWidth(Math.min(800, Math.max(320, Number(event.target.value) || 600)))}/></label></div>}
      {leftMode === "personalization" && !selectedBlock && <div className={brazeDndStyles.leftModePanel}><b>Personalization</b><PersonalizationPicker title="Insert Liquid" onInsert={token => add("Paragraph", appendPersonalization("", token))}/></div>}
      {leftMode === "links" && !selectedBlock && <div className={brazeDndStyles.leftModePanel}><b>Link Management</b><p>Button links can be edited by selecting a button block.</p></div>}
    </aside>
    <footer className={brazeDndStyles.footer}><button onClick={download}>Download file</button><button className={brazeDndStyles.done} onClick={() => void save()}>Done</button></footer>
  </section>
}

function ChannelCompose({ draft, update, openTest }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest: () => void }) {
  const [copied, setCopied] = useState(false);
  if (draft.channel === "iam") return <InAppCampaignCompose draft={draft} update={update}/>;
  return <div className="editor-body email-compose-page"><EmailCampaignDetails draft={draft} update={update} copied={copied} setCopied={setCopied}/>{draft.channel === "push" ? <PushFields draft={draft} update={update} openTest={openTest}/> : <section className="braze-section channel-workspace"><div className="card-heading"><div><h2>Compose {channelMeta[draft.channel].title.toLowerCase()}</h2><p>{channelMeta[draft.channel].description}</p></div><button className="secondary" onClick={openTest}>Preview and test</button></div><ChannelFields draft={draft} update={update}/></section>}</div>;
}

function CampaignDetails({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  return <div className="channel-details"><Field label="Campaign Name"><input value={draft.name} onChange={event => update({ name: event.target.value })}/></Field><button className="tag-button"><Tags size={14}/> Tags</button></div>;
}

function ChannelFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const channel = draft.channel;
  if (channel === "push") return <PushFields draft={draft} update={update}/>;
  if (channel === "iam") return <InAppFields draft={draft} update={update}/>;
  if (channel === "content") return <ContentCardFields draft={draft} update={update}/>;
  if (channel === "banner") return <BannerFields draft={draft} update={update}/>;
  if (channel === "sms") return <SmsFields draft={draft} update={update}/>;
  if (channel === "webhook") return <WebhookFields draft={draft} update={update}/>;
  if (channel === "whatsapp") return <WhatsAppFields draft={draft} update={update}/>;
  if (channel === "line") return <LineFields draft={draft} update={update}/>;
  if (channel === "multichannel") return <MultichannelFields draft={draft} update={update}/>;
  if (channel === "operator") return <OperatorFields draft={draft} update={update}/>;
  if (channel === "feature") return <FeatureFlagFields draft={draft} update={update}/>;
  return <ApiCampaignFields draft={draft} update={update}/>;
}

function channelValues(draft: Campaign): Record<string, unknown> { return (draft.config?.channelValues ?? {}) as Record<string, unknown>; }
function changeChannel(draft: Campaign, update: (patch: Partial<Campaign>) => void, patch: Record<string, unknown>) { update({ config: { ...draft.config, channelValues: { ...channelValues(draft), ...patch } } }); }
function smsEstimate(message: string) { const unicode = /[^\x00-\x7F]/.test(message); const first = unicode ? 70 : 160; const rest = unicode ? 67 : 153; return { encoding: unicode ? "Unicode" : "GSM-7 estimate", segments: message.length <= first ? 1 : Math.ceil(message.length / rest) }; }

function PushFields({ draft, update, openTest }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest?: () => void }) {
  const values = channelValues(draft);
  const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const [tab, setTab] = useState<"Compose" | "Settings" | "Test">("Compose");
  const [mediaOpen, setMediaOpen] = useState<string | null>(null);
  const title = draft.subject ?? ""; const body = draft.body ?? "";
  const media = (key: string, label: string, help: string) => <div className={pushStyles.asset} key={key}><h4>{label}</h4><div className={pushStyles.assetBox}>{values[key] ? <img src={String(values[key])} alt={`${label} preview`}/> : <Image size={27}/>}<span>{values[key] ? "Image selected" : "Drag and drop an image here"}</span><small>{help}</small><div><button type="button" onClick={() => setMediaOpen(mediaOpen === key ? null : key)}>Add from media library</button><label className={pushStyles.upload}>Upload image<input type="file" accept="image/png,image/jpeg,image/gif" onChange={event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => set({ [key]: String(reader.result) }); reader.readAsDataURL(file); }}/></label></div></div>{mediaOpen === key && <div className={pushStyles.mediaPicker}><button onClick={() => { set({ [key]: "https://placehold.co/800x400/e9e4f4/5632a6?text=Campaign+image" }); setMediaOpen(null); }}>Campaign image</button><button onClick={() => { set({ [key]: "https://placehold.co/400x400/ebeaf1/342b46?text=Brand" }); setMediaOpen(null); }}>Brand image</button></div>}<Field label="Add from URL"><input value={String(values[key] ?? "")} onChange={event => set({ [key]: event.target.value })} placeholder="Paste URL"/></Field></div>;
  return <section className={className("braze-section", pushStyles.compose)}><h2>Compose push notification</h2><div className={pushStyles.warning}>Multiple Push Notification credentials are missing <button type="button" onClick={() => setTab("Settings")}>More Info</button></div>
    <div className={pushStyles.previews}><div><h3>iOS</h3><div className={pushStyles.previewControls}><Field label="Device"><select value={String(values.device ?? "Phone")} onChange={event => set({ device: event.target.value })}><option>Phone</option><option>Tablet</option></select></Field><Field label="Notification State"><select value={String(values.notificationState ?? "Lock screen")} onChange={event => set({ notificationState: event.target.value })}><option>Lock screen</option><option>Notification center</option><option>Banner</option></select></Field></div><div className={pushStyles.phone}><div className={pushStyles.notification}><b>{title || "Title"}</b><p>{body || "Your message will appear here."}</p><small>now</small></div></div></div><div><h3>Android</h3><div className={pushStyles.phone}><div className={pushStyles.notification}><b>{title || "Title"}</b><small>· 9m</small><p>{body || "Your message will appear here."}</p>{Boolean(values.summaryAndroid) && <p>{String(values.summaryAndroid)}</p>}</div></div></div></div><p className={pushStyles.previewNote}>Always test your message on a real device, as actual rendering may vary.</p>
    <div className={pushStyles.tabs} role="tablist">{(["Compose", "Settings", "Test"] as const).map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? pushStyles.active : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === "Compose" && <div className={pushStyles.form}><Field label="Notification type"><select value={String(values.notificationType ?? "Standard push")} onChange={event => set({ notificationType: event.target.value })}><option>Standard push</option><option>Rich push</option></select></Field><h3>Language</h3><button className="secondary small" onClick={() => set({ language: values.language === "English" ? "Chinese (Simplified)" : "English" })}>Add languages {values.language ? `· ${String(values.language)}` : ""}</button><h3>Content</h3><Field label="Title"><textarea value={title} onChange={event => update({ subject: event.target.value })} placeholder="Enter notification title"/></Field><Field label="Message"><textarea value={body} onChange={event => update({ body: event.target.value })} placeholder="Enter your message"/><small>{body.length} characters</small></Field><Field label="Summary text (Android) (Optional)"><textarea value={String(values.summaryAndroid ?? "")} onChange={event => set({ summaryAndroid: event.target.value })}/></Field><h3>Interactions</h3><p>Set what happens when a user interacts with a push notification.</p><Field label="On-click behavior"><select value={String(values.clickBehavior ?? "Open app/site")} onChange={event => set({ clickBehavior: event.target.value })}><option>Open app/site</option><option>Deep link</option><option>Open web URL</option><option>None</option></select></Field>{values.clickBehavior === "Deep link" || values.clickBehavior === "Open web URL" ? <Field label="Destination"><input value={String(values.destinationUrl ?? "")} onChange={event => set({ destinationUrl: event.target.value })} placeholder="https:// or app://"/></Field> : null}<label className={pushStyles.check}><input type="checkbox" checked={values.sameForAll !== false} onChange={event => set({ sameForAll: event.target.checked })}/>Same for all platforms</label><h4>Action buttons</h4><label className={pushStyles.check}><input type="checkbox" checked={Boolean(values.allowActions)} onChange={event => set({ allowActions: event.target.checked })}/>Allow users to take actions</label>{Boolean(values.allowActions) && <Field label="Button text"><input value={String(values.buttonText ?? "")} onChange={event => set({ buttonText: event.target.value })} placeholder="Open offer"/></Field>}<h3>Assets</h3>{media("androidIcon", "Push icon image (Android)", "JPG or PNG · 1:1")}{media("iosImage", "iOS notification image", "GIF, JPG, JPEG, or PNG")}{media("androidImage", "Android notification image", "JPG or PNG · 2:1 recommended")}<h3>Sending options</h3><Field label="Push destination"><select value={String(values.pushDestination ?? "All devices")} onChange={event => set({ pushDestination: event.target.value })}><option>All devices</option><option>Most recent device</option></select></Field><Field label="iOS device destinations"><select value={String(values.iosDestinations ?? "All iOS devices")} onChange={event => set({ iosDestinations: event.target.value })}><option>All iOS devices</option><option>Most recent iOS device</option></select></Field><Field label="Android delivery priority"><select value={String(values.androidPriority ?? "Normal")} onChange={event => set({ androidPriority: event.target.value })}><option>Normal</option><option>High</option></select></Field></div>}
    {tab === "Settings" && <div className={pushStyles.form}><h3>Push settings</h3><p>Configure platform-specific delivery options for this local campaign.</p><Field label="iOS interruption level"><select value={String(values.interruptionLevel ?? "Active")} onChange={event => set({ interruptionLevel: event.target.value })}><option>Active</option><option>Passive</option><option>Time Sensitive</option></select></Field><Field label="Notification category"><input value={String(values.category ?? "")} onChange={event => set({ category: event.target.value })}/></Field><Field label="Time to live (seconds)"><input type="number" min="0" value={Number(values.ttl ?? 86400)} onChange={event => set({ ttl: Number(event.target.value) })}/></Field></div>}
    {tab === "Test" && <div className={pushStyles.form}><h3>Test push notification</h3><p>Record a simulated test result in the local activity log. No device is contacted.</p><button className="primary" onClick={openTest}>Preview and test</button></div>}
  </section>;
}
function InAppFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const layout = String(values.layout ?? "Modal");
  return <ChannelPanel title="Message design" help="Configure the experience rendered by the Braze SDK."><div className="segmented">{["Modal", "Slideup", "Full screen"].map(value => <button key={value} className={className(layout === value && "selected")} onClick={() => set({ layout: value })}>{value}</button>)}</div><div className="form-grid"><Field label="Headline"><input value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })} placeholder="Add a headline"/></Field><Field label="Close behavior"><select value={String(values.closeBehavior ?? "Dismiss on outside click")} onChange={event => set({ closeBehavior: event.target.value })}><option>Dismiss on outside click</option><option>Require button click</option></select></Field></div><Field label="Message"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Add your message"/></Field><div className="form-grid"><Field label="Primary button"><input value={String(values.buttonText ?? "")} onChange={event => set({ buttonText: event.target.value })} placeholder="Shop now"/></Field><Field label="Display trigger"><select value={String(values.trigger ?? "On session start")} onChange={event => set({ trigger: event.target.value })}><option>On session start</option><option>Custom event</option></select></Field></div>{values.trigger === "Custom event" && <Field label="Custom event name"><input value={String(values.triggerEvent ?? "")} onChange={event => set({ triggerEvent: event.target.value })}/></Field>}<Toggle title="Respect frequency cap" help="Skip users who recently saw an in-app message." value={values.frequencyCap !== false} onChange={value => set({ frequencyCap: value })}/><div className="banner-mini-preview"><b>{draft.subject || "Headline preview"}</b><span>{draft.body || "Message preview"}</span><button>{String(values.buttonText || "Button")}</button></div></ChannelPanel>;
}
function ContentCardFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="Content Card" help="Build a durable card synchronized to the SDK feed."><div className="form-grid"><Field label="Card type"><select value={String(values.cardType ?? "Classic")} onChange={event => set({ cardType: event.target.value })}><option>Image only</option><option>Captioned image</option><option>Classic</option></select></Field><Field label="Category"><input value={String(values.category ?? "Promotions")} onChange={event => set({ category: event.target.value })}/></Field></div><Field label="Title"><input value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })} placeholder="Card title"/></Field><Field label="Description"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Card description"/></Field><div className="form-grid"><Field label="Image URL"><input value={String(values.imageUrl ?? "")} onChange={event => set({ imageUrl: event.target.value })} placeholder="https://..."/></Field><Field label="Click action"><select value={String(values.clickAction ?? "Deep link")} onChange={event => set({ clickAction: event.target.value })}><option>Deep link</option><option>URI</option><option>None</option></select></Field></div>{values.clickAction !== "None" && <Field label="Destination"><input value={String(values.destination ?? "")} onChange={event => set({ destination: event.target.value })} placeholder="https:// or app://"/></Field>}<Toggle title="Pin this card" help="Keep the card above standard feed content." value={Boolean(values.pinned)} onChange={value => set({ pinned: value })}/><Toggle title="Set expiration" help="Remove the card after a specific date." value={Boolean(values.expires)} onChange={value => set({ expires: value })}/>{Boolean(values.expires) && <Field label="Expiration date"><input type="date" value={String(values.expirationDate ?? "")} onChange={event => set({ expirationDate: event.target.value })}/></Field>}</ChannelPanel>;
}
function BannerFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="Banner setup" help="Match a registered SDK placement and render its responsive content."><div className="form-grid"><Field label="Placement"><select value={String(values.placement ?? "home_top")} onChange={event => set({ placement: event.target.value })}><option>home_top</option><option>checkout_promo</option></select></Field><Field label="Priority"><select value={String(values.priority ?? "Normal")} onChange={event => set({ priority: event.target.value })}><option>High</option><option>Normal</option><option>Low</option></select></Field></div><Field label="Banner title"><input value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })} placeholder="Banner title"/></Field><Field label="Body"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Banner message"/></Field><Field label="Button label"><input value={String(values.buttonLabel ?? "Learn more")} onChange={event => set({ buttonLabel: event.target.value })}/></Field><Field label="Destination URL"><input value={String(values.destination ?? "")} onChange={event => set({ destination: event.target.value })} placeholder="https://..."/></Field><div className="banner-mini-preview"><b>{draft.subject || "Banner title"}</b><span>{draft.body || "Banner message"}</span><button>{String(values.buttonLabel ?? "Learn more")}</button></div></ChannelPanel>;
}
function SmsFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const type = String(values.messageType ?? "SMS"); const message = draft.body ?? ""; const estimate = smsEstimate(message);
  return <ChannelPanel title="SMS / MMS / RCS" help="Select an approved sender and subscription group before composing."><div className="segmented">{["SMS", "MMS", "RCS"].map(value => <button key={value} className={className(type === value && "selected")} onClick={() => set({ messageType: value })}>{value}</button>)}</div><div className="form-grid"><Field label="Subscription group"><select value={String(values.subscriptionGroup ?? "Promotional messages")} onChange={event => set({ subscriptionGroup: event.target.value })}><option>Promotional messages</option><option>Transactional</option></select></Field><Field label="Sending number"><select value={String(values.sendingNumber ?? "+1 415 555 0100")} onChange={event => set({ sendingNumber: event.target.value })}><option>+1 415 555 0100</option></select></Field></div><Field label="Message"><textarea value={message} onChange={event => update({ body: event.target.value })} placeholder="Write your message"/></Field><small>{message.length} characters · {estimate.encoding} · approximately {estimate.segments} segment{estimate.segments !== 1 ? "s" : ""}</small>{type !== "SMS" && <Field label="Media URL"><input value={String(values.mediaUrl ?? "")} onChange={event => set({ mediaUrl: event.target.value })} placeholder="https://..."/></Field>}<Toggle title="Append STOP instructions" help="Use the workspace opt-out disclosure." value={values.appendStop !== false} onChange={value => set({ appendStop: value })}/></ChannelPanel>;
}
function WebhookFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch); const [preview, setPreview] = useState(false);
  const url = String(values.url ?? ""); const method = String(values.method ?? "POST");
  return <ChannelPanel title="Webhook request" help="Requests are rendered and simulated locally; no destination URL is contacted."><div className="form-grid"><Field label="Method"><select value={method} onChange={event => set({ method: event.target.value })}><option>POST</option><option>PUT</option><option>GET</option><option>PATCH</option></select></Field><Field label="Authentication"><select value={String(values.auth ?? "None")} onChange={event => set({ auth: event.target.value })}><option>Bearer token</option><option>Basic</option><option>None</option></select></Field></div><Field label="Webhook URL"><input value={url} onChange={event => set({ url: event.target.value })} placeholder="https://api.example.test/events"/></Field><Field label="Headers"><textarea value={String(values.headers ?? "Content-Type: application/json")} onChange={event => set({ headers: event.target.value })}/></Field><Field label="Request body"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="{ }"/></Field><button className="secondary" onClick={() => setPreview(true)}>Preview simulated response</button>{preview && <div className="subtle-note" role="status"><b>{url.startsWith("https://") ? "200 Simulated OK" : "400 Invalid URL"}</b><pre>{method} {url || "[missing URL]"}{"\n"}{String(values.headers ?? "Content-Type: application/json")}{"\n\n"}{draft.body ?? ""}</pre><p>No external request was sent.</p></div>}</ChannelPanel>;
}
function WhatsAppFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="WhatsApp template" help="Only approved templates can be selected for an outbound campaign."><div className="form-grid"><Field label="Template"><select value={String(values.template ?? "September offer · Approved")} onChange={event => set({ template: event.target.value })}><option>September offer · Approved</option><option>Order update · Approved</option></select></Field><Field label="Language"><select value={String(values.language ?? "English (US)")} onChange={event => set({ language: event.target.value })}><option>English (US)</option><option>Chinese (Simplified)</option></select></Field></div><Field label="Header media"><select value={String(values.headerMedia ?? "None")} onChange={event => set({ headerMedia: event.target.value })}><option>None</option><option>Image</option></select></Field>{values.headerMedia === "Image" && <Field label="Image URL"><input value={String(values.imageUrl ?? "")} onChange={event => set({ imageUrl: event.target.value })} placeholder="https://..."/></Field>}<Field label="Body parameter preview"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Map approved template parameters"/></Field><Field label="Button URL"><input value={String(values.buttonUrl ?? "")} onChange={event => set({ buttonUrl: event.target.value })} placeholder="https://..."/></Field></ChannelPanel>;
}
function LineFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="LINE message" help="Create a message sent through a LINE Official Account."><div className="form-grid"><Field label="Message type"><select value={String(values.messageType ?? "Text")} onChange={event => set({ messageType: event.target.value })}><option>Text</option><option>Image</option><option>Flex message</option></select></Field><Field label="Official Account"><select value={String(values.officialAccount ?? "Demo – Thinkingai")} onChange={event => set({ officialAccount: event.target.value })}><option>Demo – Thinkingai</option></select></Field></div><Field label="Message content"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Write a LINE message"/></Field>{values.messageType === "Image" && <Field label="Image URL"><input value={String(values.imageUrl ?? "")} onChange={event => set({ imageUrl: event.target.value })} placeholder="https://..."/></Field>}<Field label="Action URL"><input value={String(values.actionUrl ?? "")} onChange={event => set({ actionUrl: event.target.value })} placeholder="https://..."/></Field></ChannelPanel>;
}
function MultichannelFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch); const selected = Array.isArray(values.channels) ? values.channels as string[] : ["Email", "Push notification"];
  const toggle = (name: string) => set({ channels: selected.includes(name) ? selected.filter(value => value !== name) : [...selected, name] });
  return <ChannelPanel title="Channel orchestration" help="Define fallback order and message variants for each selected channel."><div className="channel-checks">{["Email", "Push notification", "In-app message", "SMS"].map(name => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)}/>{name}</label>)}</div><Field label="Orchestration rule"><select value={String(values.rule ?? "Send all channels at once")} onChange={event => set({ rule: event.target.value })}><option>Send all channels at once</option><option>Send Push, then Email if not opened</option></select></Field><Field label="Campaign message"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Write your campaign message"/></Field><p className="subtle-note">Each selected channel still needs its own content before a real multichannel send.</p></ChannelPanel>;
}
function OperatorFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="Create with Operator" help="The local Operator produces deterministic, editable suggestions."><Field label="Campaign goal"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Describe a goal"/></Field><button className="primary" onClick={() => { update({ subject: "Your first order offer", body: "Welcome! Use code WELCOME10 for 10% off your first order.", config: { ...draft.config, channelValues: { ...values, generated: true } } }); }}><Sparkles size={15}/> Generate local plan</button>{Boolean(values.generated) && <div className="subtle-note">Suggested Email + Push journey created. Review and edit each channel before launch.</div>}</ChannelPanel>;
}
function FeatureFlagFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="Feature flag experiment" help="Set a stable rollout value and measure exposure against a conversion event."><div className="form-grid"><Field label="Flag key"><input value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })} placeholder="new_checkout"/></Field><Field label="Rollout"><input type="number" value={Number(values.rollout ?? 50)} min="0" max="100" onChange={event => set({ rollout: Math.min(100, Math.max(0, Number(event.target.value))) })}/></Field></div><Field label="Variant value"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="{ }"/></Field><Field label="Primary conversion"><select value={draft.conversion ?? "Make Purchase"} onChange={event => update({ conversion: event.target.value })}><option>Make Purchase</option><option>Start Session</option></select></Field></ChannelPanel>;
}
function ApiCampaignFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="API campaign" help="Create an identifier used to associate external sends with campaign analytics."><Field label="Campaign name"><input value={draft.name} onChange={event => update({ name: event.target.value })}/></Field><Field label="API campaign ID"><input value={draft.subject ?? `api_${draft.id}`} onChange={event => update({ subject: event.target.value })}/></Field><Field label="Event mapping"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Describe how external events map to this campaign"/></Field><Toggle title="Allow external attribution" help="Accept locally simulated message and conversion events." value={values.externalAttribution !== false} onChange={value => set({ externalAttribution: value })}/></ChannelPanel>;
}
function ChannelPanel({ title, help, children }: { title: string; help: string; children: ReactNode }) { return <section className="channel-panel"><h3>{title}</h3><p>{help}</p>{children}</section>; }

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Schedule({ draft, update }: { draft: Campaign; update: (p: Partial<Campaign>) => void }) {
  const delivery = (draft.config?.delivery ?? {}) as Record<string, unknown>;
  const changeDelivery = (patch: Record<string, unknown>) => update({ config: { ...draft.config, delivery: { ...delivery, ...patch } } });
  const mode = draft.schedule === "Action-based" || draft.schedule === "API-triggered" ? draft.schedule : "One time";
  const timing = String(delivery.timing ?? "designated");
  return <div className="editor-body braze-flow"><section className="editor-card"><h2>Delivery</h2><h3>Choose a Type</h3>
    <div className="delivery-types">{[["One time", "Scheduled", "Enter users at designated times", CalendarDays], ["Action-based", "Action-Based", "Enter user when they perform actions", MousePointerClick], ["API-triggered", "API-Triggered", "Enter users via API request", Settings]].map(([value, label, help, Icon]) => <button key={value as string} type="button" role="radio" aria-checked={mode === value} className={className("delivery-type", mode === value && "selected")} onClick={() => update({ schedule: value as string })}><span className="delivery-icon"><Icon size={18}/></span><span className="delivery-radio"/><b>{label as string}</b><small>{help as string}</small></button>)}</div>
  </section><section className="editor-card"><h2>{mode === "One time" ? "Time-Based Scheduling Options" : mode === "Action-based" ? "Action-Based Scheduling Options" : "API-Triggered Scheduling Options"}</h2>
    {mode === "One time" ? <><div className="timing-choices">{[["now", "Send as soon as Campaign is launched", ""], ["designated", "Send at a designated time", "Choose a time for users to receive this message."], ["intelligent", "Intelligent Timing", "Each user will receive the Campaign at the time they are most likely to engage."]].map(([value, title, help]) => <label key={value} className="timing-choice"><input type="radio" name="delivery-timing" checked={timing === value} onChange={() => changeDelivery({ timing: value })}/><span><b>{title}</b>{help && <small>{help}</small>}</span></label>)}</div>{timing === "designated" && <div className="schedule-fields"><Field label="Entry Frequency"><select value={String(delivery.frequency ?? "One time")} onChange={event => changeDelivery({ frequency: event.target.value })}><option>One time</option><option>Daily</option><option>Weekly</option><option>Monthly</option></select></Field><div className="form-grid"><Field label="Start date"><input type="date" value={String(delivery.startDate ?? "2026-09-17")} onChange={event => changeDelivery({ startDate: event.target.value })}/></Field><Field label="Send time"><input type="time" value={String(delivery.sendTime ?? "10:00")} onChange={event => changeDelivery({ sendTime: event.target.value })}/></Field></div><label className="checkline"><input type="checkbox" checked={delivery.timezone === "Recipient local time"} onChange={event => changeDelivery({ timezone: event.target.checked ? "Recipient local time" : "Company time zone (UTC+08:00)" })}/>Enter users into this Campaign in their local time zone</label></div>}<div className="next-send">Next Send Time: {timing === "now" ? "As soon as this Campaign is launched." : timing === "designated" && delivery.startDate ? `${String(delivery.startDate)} ${String(delivery.sendTime ?? "10:00")}` : "No upcoming messages scheduled."}</div></> : mode === "Action-based" ? <div className="schedule-fields"><Field label="Trigger event"><select value={String(delivery.triggerEvent ?? "Start Session")} onChange={event => changeDelivery({ triggerEvent: event.target.value })}><option>Start Session</option><option>Make Purchase</option><option>Perform Custom Event</option></select></Field><Field label="Delay in minutes"><input type="number" min="0" value={Number(delivery.delayMinutes ?? 0)} onChange={event => changeDelivery({ delayMinutes: Number(event.target.value) })}/></Field></div> : <p>Enter users via an API request after launching this Campaign.</p>}
  </section><section className="editor-card"><h2>Delivery Controls</h2><p>Manage the number of messages your users will receive.</p><label className="checkline"><input type="checkbox" checked={Boolean(delivery.reeligible)} onChange={event => changeDelivery({ reeligible: event.target.checked })}/>Allow users to become re-eligible to receive campaign</label>{Boolean(delivery.reeligible) && <Field label="Re-eligibility after"><select value={String(delivery.reentry ?? "7 days")} onChange={event => changeDelivery({ reentry: event.target.value })}><option>1 day</option><option>7 days</option><option>30 days</option></select></Field>}<h3>Frequency Capping</h3><p>You have not created any Frequency Capping rules.</p><label className="checkline"><input type="checkbox" checked={Boolean(delivery.quietHours)} onChange={event => changeDelivery({ quietHours: event.target.checked })}/>Apply quiet hours</label></section></div>;
}
function Audience({ draft, update }: { draft: Campaign; update: (p: Partial<Campaign>) => void }) {
  const country = typeof draft.config?.audienceCountry === "string" ? draft.config.audienceCountry : "";
  const excludedCountry = typeof draft.config?.audienceExcludeCountry === "string" ? draft.config.audienceExcludeCountry : "";
  const changeAudience = (patch: Record<string, unknown>) => update({ config: { ...draft.config, ...patch } });
  const [estimate, setEstimate] = useState<{ matching: number; reachable: number; total: number } | null>(null);
  const [subscriptionGroups, setSubscriptionGroups] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  useEffect(() => { const controller = new AbortController(); fetch("/api/subscription-groups?status=Active", { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(result => { if (result?.data) setSubscriptionGroups(result.data); }).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ audience: draft.audience ?? "All Users" });
    if (country) query.set("country", country);
    if (excludedCountry) query.set("excludeCountry", excludedCountry);
    query.set("eligibility", String(draft.config?.subscribeEligibility ?? "subscribed"));
    if (typeof draft.config?.subscriptionGroupId === "string") query.set("subscriptionGroupId", draft.config.subscriptionGroupId);
    fetch(`/api/audience/estimate?${query}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (result) setEstimate(result); })
      .catch(() => {});
    return () => controller.abort();
  }, [draft.audience, country, excludedCountry, draft.config?.subscribeEligibility, draft.config?.subscriptionGroupId]);
  const percentage = estimate?.total ? Math.round(estimate.reachable / estimate.total * 1000) / 10 : 0;
  const split = Number(draft.config?.controlGroup ?? 20);
  return <div className="editor-body braze-flow"><section className="editor-card"><h2>Targeting Options</h2><p>Target users by choosing multiple segments they must fall into. Further refine your audience by adding additional filters.</p>
    <Field label="Target Users By Segment"><select className="audience-segment-select" value={draft.audience ?? "All Users"} onChange={event => update({ audience: event.target.value })}><option value="All Users">Search Segments...</option><option>Recent Purchasers</option><option>New Users</option></select></Field>
    <div className="audience-divider"/><h3>Additional Filters</h3><div className="braze-filter-group"><div className="braze-filter-head"><b>⠿ &nbsp;Filter group</b><select aria-label="Filter group operator" defaultValue="OR"><option>OR</option><option>AND</option></select></div><div className="braze-filter-content"><select aria-label="Select filter" value={country ? "Country" : ""} onChange={event => changeAudience({ audienceCountry: event.target.value ? "US" : "" })}><option value="">Search filter...</option><option>Country</option></select>{country && <select aria-label="Country" value={country} onChange={event => changeAudience({ audienceCountry: event.target.value })}>{["US", "GB", "CN", "SG", "DE"].map(value => <option key={value}>{value}</option>)}</select>}<button aria-label="Remove filter" disabled={!country} onClick={() => changeAudience({ audienceCountry: "" })}><X size={15}/></button></div></div><div className="filter-actions"><button onClick={() => changeAudience({ audienceCountry: country || "US" })}><Plus size={14}/> Add filter group</button><button onClick={() => changeAudience({ audienceExcludeCountry: excludedCountry || "US" })}><Plus size={14}/> Add exclusion group</button></div>{excludedCountry && <div className="exclusion-group"><b>Exclusion group</b><span>Country is {excludedCountry}</span><select aria-label="Exclude country" value={excludedCountry} onChange={event => changeAudience({ audienceExcludeCountry: event.target.value })}>{["US", "GB", "CN", "SG", "DE"].map(value => <option key={value}>{value}</option>)}</select><button onClick={() => changeAudience({ audienceExcludeCountry: "" })}>Remove</button></div>}
    <div className="audience-summary"><h3>Audience Summary</h3><p>{audienceSummary(draft)}</p></div><div className="audience-summary"><h3>User Lookup</h3><p>Check if a user matches the segment, filter, and app criteria</p><button className="secondary small" onClick={() => document.getElementById("audience-user-lookup")?.focus()}>Lookup User</button><input id="audience-user-lookup" placeholder="Search user ID"/></div>
    {draft.channel === "email" && <table className="audience-provider"><thead><tr><th>Variant</th><th>Domain</th><th>IP Pool</th><th>Sending Provider</th></tr></thead><tbody><tr><td>Variant 1</td><td>mta-h466.bftmail.com</td><td>PLG_IP_Pool</td><td>SparkPost</td></tr></tbody></table>}
    <Field label="Send to these users:"><select value={String(draft.config?.subscribeEligibility ?? "subscribed")} onChange={event => changeAudience({ subscribeEligibility: event.target.value })}><option value="subscribed">users who are subscribed or opted in</option><option value="opted-in">users who are opted in</option><option value="all">all users</option></select></Field>{draft.config?.subscribeEligibility !== "all" && <Field label="Subscription group"><select value={String(draft.config?.subscriptionGroupId ?? "")} onChange={event => changeAudience({ subscriptionGroupId: event.target.value || undefined })}><option value="">Workspace subscription status</option>{subscriptionGroups.filter(group => draft.channel === "sms" ? group.channel === "SMS" : draft.channel === "whatsapp" ? group.channel === "WhatsApp" : group.channel === "Email").map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></Field>}<label className="checkline"><input type="checkbox" checked={Boolean(draft.config?.limitVolume)} onChange={event => changeAudience({ limitVolume: event.target.checked })}/>Limit send volume</label>{Boolean(draft.config?.limitVolume) && <Field label="Maximum users"><input type="number" min="1" value={Number(draft.config?.maxUsers ?? 100)} onChange={event => changeAudience({ maxUsers: Number(event.target.value) })}/></Field>}<label className="checkline"><input type="checkbox" checked={Boolean(draft.config?.rateLimitEnabled)} onChange={event => changeAudience({ rateLimitEnabled: event.target.checked })}/>Limit the rate at which this Campaign will send</label>{Boolean(draft.config?.rateLimitEnabled) && <Field label="Messages per minute"><input type="number" min="1" value={Number(draft.config?.rateLimit ?? 100)} onChange={event => changeAudience({ rateLimit: Number(event.target.value) })}/></Field>}
  </section><section className="editor-card"><h2>A/B Testing <small>Optimize with BrazeAI™</small></h2><p>Set your own variant split and control group. All variants send at the date and time you set in Schedule delivery.</p><div className="split-row"><Field label="% Control Group"><input type="number" min="0" max="100" value={split} onChange={event => changeAudience({ controlGroup: Math.min(100, Math.max(0, Number(event.target.value))) })}/></Field><Field label="% Variant 1"><input type="number" readOnly value={100 - split}/></Field></div><button className="inline-link" onClick={() => changeAudience({ controlGroup: 0 })}>Remove Control Group</button></section><section className="editor-card"><h2>Suppression Lists</h2><p>There are no suppression lists applied</p></section><section className="editor-card"><h2>Total Population</h2><div className="population-grid"><div><h3>Exact users</h3><strong>{estimate ? estimate.reachable.toLocaleString() : "…"}</strong><p>{percentage}% of total users</p><div className="population-bar"><span style={{width: `${percentage}%`}}/></div><small>Calculated from local users</small></div><div><h3>Channel breakdown</h3><table><tbody><tr><th>{channelMeta[draft.channel].title}</th><td/></tr><tr><td>Reachable Users</td><td>{estimate?.reachable.toLocaleString() ?? "…"}</td></tr><tr><td>% of Workspace</td><td>{percentage}%</td></tr><tr><td>LTV</td><td>--</td></tr></tbody></table></div></div></section></div>;
}
type ConversionEvent = { type: string; app: string; deadline: number; unit: string };
function conversionEvents(draft: Campaign): ConversionEvent[] {
  const stored = draft.config?.conversionEvents;
  if (Array.isArray(stored)) return stored as ConversionEvent[];
  return [{ type: draft.conversion === "Make Purchase" ? "Makes Purchase" : "Starts Session", app: "Users from all apps", deadline: 3, unit: "Days" }];
}
function Conversions({ draft, update }: { draft: Campaign; update: (p: Partial<Campaign>) => void }) {
  const events = conversionEvents(draft);
  const saveEvents = (next: ConversionEvent[]) => update({ conversion: next[0]?.type === "Makes Purchase" ? "Make Purchase" : next[0]?.type === "Starts Session" ? "Start Session" : next[0]?.type ?? "Start Session", config: { ...draft.config, conversionEvents: next } });
  const patchEvent = (index: number, patch: Partial<ConversionEvent>) => saveEvents(events.map((event, i) => i === index ? { ...event, ...patch } : event));
  return <div className="editor-body braze-flow"><section className="editor-card"><h2>Assign Conversion Events</h2><p>Define up to 4 conversion events to track for this Campaign. The conversion events must be assigned during Campaign creation, and cannot be changed once a Campaign has launched.</p>
    {events.map((event, index) => <div className="braze-conversion" key={index}><div className="conversion-title"><h3>{index === 0 ? "Primary Conversion Event - A" : `Conversion Event - ${String.fromCharCode(65 + index)}`}</h3><button aria-label="Remove Conversion Event" disabled={events.length === 1} onClick={() => saveEvents(events.filter((_, i) => i !== index))}><X size={16}/></button></div><Field label="Conversion event type"><select value={event.type} onChange={e => patchEvent(index, { type: e.target.value })}><option>Starts Session</option><option>Makes Purchase</option><option>Performs Custom Event</option><option>Opens Email</option><option>Clicks Email</option></select></Field><Field label="Apps and websites targeted"><select value={event.app} onChange={e => patchEvent(index, { app: e.target.value })}><option>Users from all apps</option><option>Demo – Thinkingai</option><option>Web</option></select></Field><Field label="Conversion deadline"><small>Define the maximum time that may pass between a user entering a Campaign and the conversion.</small><div className="conversion-deadline"><input type="number" min="1" value={event.deadline} onChange={e => patchEvent(index, { deadline: Math.max(1, Number(e.target.value) || 1) })}/><select value={event.unit} onChange={e => patchEvent(index, { unit: e.target.value })}><option>Days</option><option>Hours</option><option>Minutes</option></select></div></Field><div className="deadline-summary"><b>Conversion deadline:</b> {event.deadline} {event.unit.toLowerCase()}</div></div>)}<button className="secondary small" disabled={events.length >= 4} onClick={() => saveEvents([...events, { type: "Starts Session", app: "Users from all apps", deadline: 3, unit: "Days" }])}><Plus size={15}/> Add Conversion Event</button>
  </section></div>;
}
function Review({ draft, go, issues }: { draft: Campaign; go: (step: number) => void; issues: string[] }) {
  const delivery = (draft.config?.delivery ?? {}) as Record<string, unknown>;
  const variants = draft.channel === "email" ? emailVariants(draft) : [];
  const timing = draft.schedule === "One time" ? String(delivery.timing ?? "designated") === "now" ? "Send as soon as Campaign is launched" : delivery.startDate ? `${String(delivery.startDate)} ${String(delivery.sendTime ?? "10:00")}` : "No upcoming messages scheduled." : draft.schedule;
  return <div className="editor-body braze-review"><h2>Review Campaign Summary</h2><ReviewReach draft={draft}/>{issues.length > 0 && <div className="review-issues" role="alert"><b>Complete before launch</b>{issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
    <section className="editor-card"><div className="review-card-head"><h3>Messages</h3><button onClick={() => go(0)}>Edit Messages</button></div>{variants.length ? variants.map(variant => <div className="review-variant" key={variant.id}><h3>{variant.name} Preview</h3><div><b>From:</b> {variant.sending?.fromName ?? "Powered by Braze"} &lt;{variant.sending?.fromAddress ?? "braze@mta-h466.bftmail.com"}&gt;</div><div><b>Subject:</b> {variant.subject ?? draft.subject ?? ""}</div><div><b>One-click list-unsubscribe:</b> {variant.sending?.unsubscribe ?? "Use workspace default"}</div><p>{variant.editorMode === "html" ? "HTML Code Editor" : "Drag-And-Drop Editor"}</p><div className="review-email-preview">{variant.blocks?.length ? variant.blocks.map(block => <div key={block.id}>{block.text}</div>) : <div>{variant.body ?? draft.body ?? "Email content has not been added."}</div>}</div></div>) : <div className="review-variant"><h3>Variant 1 Preview</h3><p>{channelMeta[draft.channel].title}</p><p>{draft.subject}</p><p>{draft.body}</p><ChannelConfigReview draft={draft}/></div>}</section>
    <section className="editor-card"><div className="review-card-head"><h3>Delivery</h3><button onClick={() => go(1)}>Edit Delivery</button></div><p>{draft.schedule === "One time" ? "Scheduled Entry" : draft.schedule}</p><p>{draft.schedule === "One time" ? "Enter users at designated times" : "Enter users when the selected trigger occurs"}</p><p><b>Next Send Time:</b> {timing}</p><ul><li>{delivery.reeligible ? "Users can re-enter this campaign" : "Users are not eligible to re-enter this campaign"}</li></ul></section>
    <section className="editor-card"><div className="review-card-head"><h3>Target Audience</h3><button onClick={() => go(2)}>Edit Target Audience</button></div><h4>Audience Summary</h4><p>{audienceSummary(draft)}</p><h4>Entry Audience</h4><ul><li>{draft.config?.rateLimitEnabled ? `Limited to ${String(draft.config.rateLimit ?? 100)} messages per minute` : "No limitations on the rate at which users will receive messages."}</li><li>Workspace Messaging Rate Limits OFF</li></ul><h4>Suppression Lists</h4><p>There are no suppression lists applied</p><h4>Total Population</h4><ReviewAudiencePopulation draft={draft}/></section>
    <section className="editor-card"><div className="review-card-head"><h3>Conversion Events</h3><button onClick={() => go(3)}>Edit Conversion Events</button></div>{conversionEvents(draft).map((event, index) => <p key={index}><b>{index === 0 ? "Primary Conversion Event - A" : `Conversion Event - ${String.fromCharCode(65 + index)}`}</b><br/>{event.type === "Starts Session" ? "Started Session" : event.type === "Makes Purchase" ? "Made Purchase" : event.type} within {event.deadline} {event.unit}</p>)}</section>
  </div>;
}
function ReviewReach({ draft }: { draft: Campaign }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { const controller = new AbortController(); const query = new URLSearchParams({ audience: draft.audience ?? "All Users", eligibility: String(draft.config?.subscribeEligibility ?? "subscribed") }); if (draft.config?.audienceCountry) query.set("country", String(draft.config.audienceCountry)); if (draft.config?.audienceExcludeCountry) query.set("excludeCountry", String(draft.config.audienceExcludeCountry)); if (typeof draft.config?.subscriptionGroupId === "string") query.set("subscriptionGroupId", draft.config.subscriptionGroupId); fetch(`/api/audience/estimate?${query}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setCount(Number(data.reachable)); }).catch(() => {}); return () => controller.abort(); }, [draft.audience, draft.config?.audienceCountry, draft.config?.audienceExcludeCountry, draft.config?.subscribeEligibility, draft.config?.subscriptionGroupId]);
  return <div className="review-reach">Reachable users is {count?.toLocaleString() ?? "calculating…"}.</div>;
}
function ChannelConfigReview({ draft }: { draft: Campaign }) {
  const fields: Record<Channel, [string, string][]> = {
    email: [], push: [["notificationType", "Notification type"], ["clickBehavior", "On-click behavior"], ["pushDestination", "Push destination"], ["androidPriority", "Android delivery priority"]],
    iam: [["layout", "Layout"], ["trigger", "Display trigger"], ["closeBehavior", "Close behavior"]], content: [["cardType", "Card type"], ["category", "Category"], ["clickAction", "Click action"]], banner: [["placement", "Placement"], ["priority", "Priority"], ["buttonLabel", "Button label"]], sms: [["messageType", "Message type"], ["subscriptionGroup", "Subscription group"], ["sendingNumber", "Sending number"]], webhook: [["method", "Method"], ["url", "Webhook URL"], ["auth", "Authentication"]], whatsapp: [["template", "Template"], ["language", "Language"], ["headerMedia", "Header media"]], line: [["messageType", "Message type"], ["officialAccount", "Official Account"]], multichannel: [["channels", "Channels"], ["rule", "Orchestration rule"]], operator: [["generated", "Operator generated"]], feature: [["rollout", "Rollout percentage"]], api: [["externalAttribution", "External attribution"]]
  };
  const values = channelValues(draft);
  const defaults: Partial<Record<Channel, Record<string, string>>> = { push: { notificationType: "Standard push", clickBehavior: "Open app/site", pushDestination: "All devices", androidPriority: "Normal" }, iam: { layout: "Modal", trigger: "On session start", closeBehavior: "Dismiss on outside click" }, content: { cardType: "Classic", category: "Promotions", clickAction: "Deep link" }, banner: { placement: "home_top", priority: "Normal", buttonLabel: "Learn more" }, sms: { messageType: "SMS", subscriptionGroup: "Promotional messages", sendingNumber: "+1 415 555 0100" }, webhook: { method: "POST", auth: "None" }, whatsapp: { template: "September offer · Approved", language: "English (US)", headerMedia: "None" }, line: { messageType: "Text", officialAccount: "Demo – Thinkingai" }, multichannel: { channels: "Email, Push notification", rule: "Send all channels at once" }, feature: { rollout: "50" }, api: { externalAttribution: "Enabled" } };
  return <dl className="channel-review-values">{fields[draft.channel].map(([key, label]) => <div key={key}><dt>{label}:</dt><dd>{Array.isArray(values[key]) ? values[key].join(", ") : typeof values[key] === "boolean" ? values[key] ? "Enabled" : "Disabled" : String(values[key] ?? defaults[draft.channel]?.[key] ?? "Not configured")}</dd></div>)}</dl>;
}
function ReviewAudiencePopulation({ draft }: { draft: Campaign }) {
  const [estimate, setEstimate] = useState<{ matching: number; reachable: number; total: number } | null>(null);
  useEffect(() => { const controller = new AbortController(); const query = new URLSearchParams({ audience: draft.audience ?? "All Users" }); if (draft.config?.audienceCountry) query.set("country", String(draft.config.audienceCountry)); if (draft.config?.audienceExcludeCountry) query.set("excludeCountry", String(draft.config.audienceExcludeCountry)); query.set("eligibility", String(draft.config?.subscribeEligibility ?? "subscribed")); if (typeof draft.config?.subscriptionGroupId === "string") query.set("subscriptionGroupId", draft.config.subscriptionGroupId); fetch(`/api/audience/estimate?${query}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setEstimate(data); }).catch(() => {}); return () => controller.abort(); }, [draft.audience, draft.config?.audienceCountry, draft.config?.audienceExcludeCountry, draft.config?.subscribeEligibility, draft.config?.subscriptionGroupId]);
  const percentage = estimate?.total ? Math.round(estimate.reachable / estimate.total * 1000) / 10 : 0;
  return <div className="population-grid"><div><h4>Exact users</h4><strong>{estimate?.reachable.toLocaleString() ?? "…"}</strong><p>{percentage}% of total users</p><div className="population-bar"><span style={{ width: `${percentage}%` }}/></div></div><div><h4>Channel breakdown</h4><table><tbody><tr><th>{channelMeta[draft.channel].title}</th><td/></tr><tr><td>Reachable Users</td><td>{estimate?.reachable.toLocaleString() ?? "…"}</td></tr><tr><td>% of Workspace</td><td>{percentage}%</td></tr></tbody></table></div></div>;
}
function Toggle({ title, help, checked = false, value, onChange }: { title: string; help: string; checked?: boolean; value?: boolean; onChange?: (value: boolean) => void }) { const [localValue, setLocalValue] = useState(checked); const active = value ?? localValue; return <div className="toggle-row"><div><b>{title}</b><small>{help}</small></div><button type="button" role="switch" aria-checked={active} aria-label={title} className={className("switch", active && "on")} onClick={() => { if (onChange) onChange(!active); else setLocalValue(!active); }}><i/></button></div>; }
function MessagePreview({ draft }: { draft: Campaign }) { const title = draft.subject || "Your welcome offer is here"; const body = draft.body || "Thanks for being with us. Use code SEPTEMBER20 to get 20% off."; const channel = draft.channel; return <div className="preview-panel"><div className="preview-head"><span>Preview</span><small>Live preview</small></div><div className="device-stage">{channel === "email" || channel === "multichannel" ? <article className="email-preview"><small>From: Powered by Braze</small><h3>{title}</h3><div className="email-image"/><h2>September Exclusive</h2><p>{body}</p><button>Claim your offer</button></article> : channel === "webhook" ? <pre>POST https://api.example.com/events{`\n\n`}{'{'}{`\n  "user_id": "user_1024",`}{`\n  "event": "campaign_sent"`}{`\n}`}</pre> : <div className="phone"><div className="phone-top">9:41</div>{channel === "iam" ? <div className="iam-card"><div className="email-image"/><h3>{title}</h3><p>{body}</p><button>Shop now</button></div> : channel === "content" ? <div className="content-card"><div className="email-image"/><b>{title}</b><p>{body}</p></div> : channel === "banner" ? <div className="banner-card"><b>{title}</b><p>{body}</p><button>Shop now</button></div> : <div className="notification"><b>{title}</b><p>{body}</p></div>}</div>}</div></div>; }
function LegacyTestModal({ draft, close }: { draft: Campaign; close: () => void }) { const [sent, setSent] = useState(false); return <div className="modal-backdrop"><section className="test-modal"><button className="modal-close" onClick={close}><X size={18}/></button><h2>Preview and test</h2><p>Send a simulated test event to the local activity log. No external service is contacted.</p><Field label="Test user"><input defaultValue="marketing.qa@example.com"/></Field>{sent ? <div className="test-success"><ShieldCheck size={18}/><span>Test event created for {channelMeta[draft.channel].title}.</span></div> : <button className="primary" onClick={() => setSent(true)}><Send size={15}/> Send test</button>}</section></div>; }

function TestModal({ draft, close }: { draft: Campaign; close: () => void }) {
  const [recipient, setRecipient] = useState("marketing.qa@example.com");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const send = async () => {
    setState("sending");
    const response = await fetch(`/api/campaigns/${draft.id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient }) });
    setState(response.ok ? "sent" : "error");
  };
  return <div className="modal-backdrop"><section className="test-modal"><button className="modal-close" onClick={close}><X size={18}/></button><h2>Preview and test</h2><p>Write a test delivery event to the local SQLite activity log. No external service is contacted.</p><Field label="Test user"><input value={recipient} onChange={event => setRecipient(event.target.value)}/></Field>{state === "sent" ? <div className="test-success"><ShieldCheck size={18}/><span>Test delivery recorded for {recipient}.</span></div> : <><button className="primary" disabled={state === "sending"} onClick={send}><Send size={15}/>{state === "sending" ? "Sending…" : "Send test"}</button>{state === "error" && <p className="form-error">The local test event could not be created.</p>}</>}</section></div>;
}

function CollectionPage({ title, page, notify, openPage }: { title: string; page: string; notify: (x: string) => void; openPage: (x: string) => void }) { const [rows, setRows] = useState([`${title} default`, `${title} lifecycle`, `${title} production`]); const [query, setQuery] = useState(""); const visible = rows.filter(x => x.toLowerCase().includes(query.toLowerCase())); const kind = page.includes("analytics") || title.includes("Report") || title.includes("Performance") ? "report" : page.includes("settings") || page === "settings" ? "settings" : "resource";
  if (kind === "report") return <ReportPage title={title} notify={notify}/>;
  return <section className="page-content"><div className="page-heading"><div><div className="title-line"><h1>{title}</h1><span className="access-pill">Limited access</span></div><p>{collectionDescription(title)}</p></div><div className="heading-actions"><button className="secondary" onClick={() => notify("Export prepared in the local activity log.")}>Export</button><button className="primary" onClick={() => setRows(r => [`${title} ${r.length + 1}`, ...r])}><Plus size={16}/> Create {singular(title)}</button></div></div>{page === "segments" && <SegmentBuilder notify={notify}/>} {page === "landing-pages" && <LandingPreview/>} {page === "messaging-diagnostics" && <Diagnostics/>} {page === "search-users" && <UserSearch/>} {page === "catalogs" && <CatalogPreview/>} {page === "approval-workflow" && <ApprovalSettings notify={notify}/>} {kind === "settings" && <SettingsPanel title={title} notify={notify}/>}<div className="list-toolbar"><div className="filter-search"><Search size={15}/><input placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={e => setQuery(e.target.value)}/></div><button className="secondary"><Filter size={15}/> Filters</button><button className="secondary"><Grid2X2 size={15}/> Columns</button></div><div className="generic-list">{visible.map((row, i) => <div className="generic-row" key={row}><span className="resource-avatar">{title[0]}</span><div><b>{row}</b><small>{i === 0 ? "Active · Updated just now" : "Draft · Updated Sep 15, 2026"}</small></div><span className="row-detail">{kind === "settings" ? "Workspace default" : i % 2 ? "Lifecycle Marketing" : "Demo – Thinkingai"}</span><button className="icon-button" onClick={() => notify(`${row} was opened in the local demo.`)}><MoreHorizontal size={18}/></button></div>)}</div>{page === "content-calendar" && <CalendarGrid openPage={openPage}/>}</section>; }

function collectionDescription(title: string) { const map: Record<string,string> = { "Segments": "Split your audience into segments to target a specific list of users.", "Feature Flags": "Remotely turn native functionality on or off for a selection of users.", "Landing Pages": "Build standalone web pages that drive conversions and grow your subscriber list.", "Media Library": "Store and reuse images, video, and files across messages.", "Message Activity Log": "Review the local message events created by simulated campaign delivery.", "Custom Attributes": "Manage the custom attributes collected from your users.", "Technology Partners": "Connect Braze to the technologies your team uses." }; return map[title] || `Manage ${title.toLowerCase()} for this workspace.`; }
function singular(title: string) { return title.endsWith("s") ? title.slice(0,-1) : title; }
function ReportPage({ title, notify }: { title:string; notify:(x:string)=>void }) { const [range, setRange] = useState("Last 30 days"); return <section className="page-content"><div className="page-heading"><div><h1>{title}</h1><p>Analyze locally generated delivery and engagement events.</p></div><div className="heading-actions"><select className="date-select" value={range} onChange={e=>setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select><button className="primary" onClick={()=>notify("Report definition saved.")}><Plus size={15}/> Create report</button></div></div><div className="metric-grid">{[["Delivered", "38,420", "+12.4%"],["Engagement", "4,972", "+8.1%"],["Conversions", "1,018", "+5.2%"],["Unsubscribes", "63", "-1.4%"]].map(([label,value,change])=><div className="metric" key={label}><small>{label}</small><b>{value}</b><span>{change}</span></div>)}</div><section className="chart-card"><div><h2>Campaign performance</h2><p>{range} · modeled local event data</p></div><div className="bar-chart">{[34,51,42,72,59,84,68,92,75,100,81,87].map((h,i)=><span key={i} style={{height:`${h}%`}}/>)}</div></section></section>; }
function CanvasPage({ notify }: { notify: (x:string)=>void }) { const [nodes,setNodes] = useState(["Audience entry", "Delay · 1 day", "Email message"]); const [selected,setSelected]=useState(2); return <section className="canvas-page"><div className="page-heading"><div><h1>Canvas</h1><p>Build and simulate a customer journey.</p></div><div className="heading-actions"><button className="secondary" onClick={()=>notify("Canvas saved.")}>Save Draft</button><button className="primary" onClick={()=>notify("Canvas launched. 124 local users entered the journey.")}>Launch Canvas</button></div></div><div className="canvas-shell"><aside><h3>Steps</h3>{["Audience Paths", "Message", "Delay", "Action Paths", "Update User"].map(x=><button key={x} onClick={()=>setNodes(n=>[...n,x])}><Plus size={14}/>{x}</button>)}<hr/><h3>Inspector</h3><p>{nodes[selected] || "Select a node"}</p><label>Step name<input value={nodes[selected] || ""} onChange={e=>setNodes(n=>n.map((x,i)=>i===selected?e.target.value:x))}/></label></aside><div className="journey-canvas"><div className="zoom-control">− &nbsp; 100% &nbsp; +</div>{nodes.map((node,i)=><button key={`${node}-${i}`} className={className("journey-node", selected===i&&"selected")} style={{left:`${110+i*205}px`,top:`${210+(i%2)*84}px`}} onClick={()=>setSelected(i)}>{i>0&&<i/>}{i===0?<Users size={18}/>:i===1?<CalendarDays size={18}/>:<Mail size={18}/>}<span>{node}</span></button>)}</div></div></section>; }
function GettingStarted({ openPage }: { openPage:(p:string)=>void }) { const [done,setDone]=useState([false,false,false]); const tasks=[["Get to know the Braze dashboard","Explore key features and create your first content.","campaigns"],["Send your first live email campaign","Create a campaign and send a simulated test.","campaigns"],["Scale your strategy","Build a segment and an automated journey.","segments"]]; return <section className="page-content getting"><div className="page-heading"><div><h1>Your getting started checklist</h1><p>Explore Braze features in the demo workspace, then switch into the live workspace to launch a campaign.</p></div></div><section className="checklist"><div className="progress-line"><span style={{width:`${done.filter(Boolean).length/3*100}%`}}/></div><b>{done.filter(Boolean).length} of 3 milestones completed</b>{tasks.map(([title,desc,target],i)=><div className="check-item" key={title}><button className={className("task-check",done[i]&&"done")} onClick={()=>setDone(d=>d.map((x,index)=>index===i?!x:x))}>{done[i]&&"✓"}</button><div><h3>{title}</h3><p>{desc}</p></div><button className="secondary" onClick={()=>openPage(target)}>Begin</button></div>)}</section></section>; }
function Performance({ campaigns }: { campaigns:Campaign[] }) { return <LiveReportPage title="Performance Overview" />; }
function DemoLab({ notify }: { notify:(x:string)=>void }) { return <section className="page-content"><div className="page-heading"><div><h1>Demo Lab</h1><p>Control deterministic local delivery data without changing the dashboard experience.</p></div></div><div className="lab-grid">{[["Advance simulated time","Move scheduled work forward by one day"],["Generate delivery receipts","Create success, bounce, click and impression events"],["Inject a failure","Create a token, template or rate-limit error"],["Reset sample data","Restore the deterministic workspace seed"]].map(([title,desc])=><button key={title} className="lab-action" onClick={()=>notify(`${title} completed in the local simulation.`)}><Zap size={20}/><b>{title}</b><small>{desc}</small></button>)}</div></section>; }
function SegmentBuilder({ notify }:{notify:(m:string)=>void}) { return <section className="builder-inline"><h2>Segment builder</h2><div className="filter-row"><select><option>Custom attribute</option></select><select><option>country</option></select><select><option>equals US</option></select></div><button className="secondary small" onClick={()=>notify("Segment condition saved.")}><Plus size={14}/> Add filter</button></section>; }
function LandingPreview(){return <section className="landing-preview"><div><span>THE SEPTEMBER EDIT</span><h2>Twenty percent off, before the month ends.</h2><p>A local landing page preview with editable content blocks.</p><button>Claim your offer</button></div></section>; }
function Diagnostics(){return <section className="diagnostics"><ShieldCheck size={20}/><div><b>No delivery issues in the last 24 hours</b><p>Simulated events are checked for configuration, eligibility and delivery errors.</p></div></section>; }
function UserSearch(){return <section className="user-search"><Search size={17}/><input placeholder="Search by external ID, email, or phone number"/><button className="primary">Search</button></section>; }
function CatalogPreview(){return <section className="catalog-preview"><div className="catalog-image"/><div><b>Featured collection</b><p>SKU-0926 · 20 products</p><button className="secondary small">View items</button></div></section>; }
function ApprovalSettings({notify}:{notify:(m:string)=>void}) { return <section className="builder-inline"><h2>Campaign approval workflow</h2><Toggle title="Require approval before launch" help="Drafts require a reviewer before they can be launched." checked/><button className="primary" onClick={()=>notify("Approval workflow saved.")}>Save changes</button></section>; }
function SettingsPanel({title,notify}:{title:string;notify:(m:string)=>void}) { return <section className="settings-panel"><h2>{title}</h2><Toggle title="Use workspace default" help="Apply this configuration to new campaigns." checked/><Toggle title="Notify workspace admins" help="Create a local notification when this setting changes."/><button className="primary small" onClick={()=>notify(`${title} saved.`)}>Save changes</button></section>; }
function CalendarGrid({openPage}:{openPage:(x:string)=>void}) { return <section className="calendar-grid"><div className="calendar-head">September 2026 <button onClick={()=>openPage("campaigns")}>View campaigns</button></div>{Array.from({length:28},(_,i)=><div key={i}><small>{i+1}</small>{[4,12,17,24].includes(i)&&<span>Campaign</span>}</div>)}</section>; }
function UserSearchEmpty(){ return null; }

type Overview = { delivered: number; opened: number; clicked: number; suppressed: number; unreachable: number; series: { date: string; delivered: number }[] };

function LiveReportPage({ title }: { title: string }) {
  const [range, setRange] = useState("30");
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => { void fetch(`/api/reports/overview?days=${range}`).then(response => response.json()).then(setOverview); }, [range]);
  const delivered = overview?.delivered ?? 0; const opened = overview?.opened ?? 0; const clicked = overview?.clicked ?? 0;
  const max = Math.max(...(overview?.series.map(point => point.delivered) ?? [1]), 1);
  return <section className="page-content"><div className="page-heading"><div><h1>{title}</h1><p>Metrics are calculated from local execution runs and message events.</p></div><select className="date-select" value={range} onChange={event => setRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div><div className="metric-grid">{[["Delivered", delivered], ["Opened", opened], ["Clicked", clicked], ["Suppressed", overview?.suppressed ?? 0], ["Unreachable", overview?.unreachable ?? 0]].map(([label, value]) => <div className="metric" key={String(label)}><small>{label}</small><b>{Number(value).toLocaleString()}</b><span>{delivered ? `${Math.round(Number(value) / delivered * 100)}% of delivered` : "No executions yet"}</span></div>)}</div><section className="chart-card"><div><h2>Delivery runs</h2><p>Each bar is a completed local Campaign or Canvas execution snapshot.</p></div><div className="bar-chart" aria-label="Delivery run chart">{overview?.series.length ? overview.series.map((point, index) => <span key={`${point.date}-${index}`} title={`${point.delivered} delivered`} style={{ height: `${Math.max(8, point.delivered / max * 100)}%` }}/>) : <p className="empty-inline">Launch a Campaign or Canvas to create report data.</p>}</div></section></section>;
}

function LiveDemoLab({ notify }: { notify: (message: string) => void }) {
  const [working, setWorking] = useState<string | null>(null);
  const [state, setState] = useState<{ simulatedTime: string; pendingReceipts: number } | null>(null);
  useEffect(() => { void fetch("/api/demo").then(response => response.json()).then(setState).catch(() => {}); }, []);
  const actions = [["advance", "Advance demo clock", "Move the local demo clock forward by one day"], ["receipts", "Generate delivery receipts", "Write eligible open and click events from completed deliveries"], ["failure", "Inject a failure", "Write a rate-limit failure into the activity log"], ["reset", "Reset sample data", "Restore campaigns, resources, users and local events"]] as const;
  const run = async (action: string) => { setWorking(action); try { const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Demo action failed."); setState(result.state); notify(result.message); } catch (cause) { notify(cause instanceof Error ? cause.message : "Demo action failed."); } finally { setWorking(null); } };
  return <section className="page-content"><div className="page-heading"><div><h1>Demo Lab</h1><p>Control the same SQLite data that powers campaign execution, activity, and reports.</p></div></div>{state && <div className="demo-state"><b>Demo clock: {new Date(state.simulatedTime).toLocaleString()}</b><span>{state.pendingReceipts} deliveries awaiting receipt generation</span><small>The clock is a local simulation; it does not trigger scheduled campaigns.</small></div>}<div className="lab-grid">{actions.map(([action, title, description]) => <button key={action} className="lab-action" disabled={working !== null} onClick={() => void run(action)}><Zap size={20}/><b>{working === action ? "Working…" : title}</b><small>{description}</small></button>)}</div></section>;
}

function ActivityLogPage() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { void fetch("/api/activity").then(response => response.json()).then(result => setEvents(result.data)); }, []);
  return <section className="page-content"><div className="page-heading"><div><h1>Message Activity Log</h1><p>Local test, delivery, engagement, suppression and failure events.</p></div></div><div className="table-wrap"><table><thead><tr><th>Event</th><th>Campaign</th><th>Channel</th><th>User</th><th>Timestamp</th></tr></thead><tbody>{events.length ? events.map(event => <tr key={String(event.id)}><td><span className="status active">{String(event.event_type)}</span></td><td>{String(event.campaign_name ?? event.campaign_id)}</td><td>{String(event.channel)}</td><td>{String(event.user_id)}</td><td>{new Date(String(event.created_at)).toLocaleString()}</td></tr>) : <tr><td colSpan={5}>No message events have been recorded.</td></tr>}</tbody></table></div></section>;
}

function ModuleWorkspace({ title, page, notify, openPage }: { title: string; page: string; notify: (message: string) => void; openPage: (page: string) => void }) {
  const [creating, setCreating] = useState(false);
  const domain = ["segments", "segment-extensions", "global-control-group", "suppression-lists", "subscription-group-management", "email-preference-centers", "search-users", "manage-audience", "import-users", "locations"].includes(page) ? "audience" : ["media-library", "banner-templates", "canvas-templates", "content-blocks", "email-link-templates", "email-templates", "in-app-message-templates", "webhook-templates", "promotion-codes", "catalogs", "brand-guidelines"].includes(page) ? "content" : ["technology-partners", "currents", "data-sharing", "solutions-partners"].includes(page) ? "integrations" : ["custom-attributes", "custom-events", "products", "cloud-data-ingestion", "data-transformation"].includes(page) ? "data" : page.includes("settings") || ["app-settings", "apis-and-identifiers", "internal-groups", "exports-log", "tag-management", "email-preferences", "frequency-capping-rules", "push-settings", "approval-workflow", "localization-settings", "banner-placements", "messaging-rate-limits", "billing", "user-management"].includes(page) ? "settings" : "messaging";
  const exportResources = async () => {
    try {
      const response = await fetch(`/api/resources/${page}`);
      if (!response.ok) throw new Error("Export request failed");
      const result = await response.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${page}.json`; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`${title} exported as JSON.`);
    } catch { notify(`Unable to export ${title.toLowerCase()}.`); }
  };
  return <section className="page-content module-workspace"><div className="page-heading"><div><div className="title-line"><h1>{title}</h1><span className="access-pill">Limited access</span></div><p>{moduleDescription(domain, title)}</p></div><div className="heading-actions"><button className="secondary" onClick={() => void exportResources()}>Export</button><button className="primary" onClick={() => setCreating(true)}><Plus size={16}/> Create {singular(title)}</button></div></div><DomainConfiguration domain={domain} page={page} openPage={openPage} notify={notify}/><PersistentResourceList page={page} title={title} notify={notify} creating={creating} setCreating={setCreating}/></section>;
}

function moduleDescription(domain: string, title: string) { const copy: Record<string, string> = { audience: "Define users, subscriptions, eligibility, and audience controls used by local campaign execution.", content: "Manage reusable message content, templates, media, catalogs, and promotion data.", integrations: "Configure local representations of partner connections, data sharing, and delivery logs.", data: "Define the data schema and ingestion inputs that power targeting and personalization.", settings: "Configure workspace defaults, governance, channel settings, and local access controls.", messaging: "Configure message assets, entry rules, and delivery diagnostics." }; return copy[domain] ?? `Manage ${title.toLowerCase()} for this workspace.`; }

function DomainConfiguration({ domain, page, openPage, notify }: { domain: string; page: string; openPage: (page: string) => void; notify: (message: string) => void }) {
  if (page === "segments") return <section className="domain-config"><h2>Segment builder</h2><div className="filter-row"><select><option>Custom attribute</option><option>Event</option><option>Subscription</option></select><select><option>country</option><option>lifecycle</option></select><select><option>equals US</option><option>equals Recent Purchasers</option></select></div><div className="audience-meter"><div className="meter-ring"><span>1,000</span></div><b>Local users available for estimates</b><button className="secondary small" onClick={() => notify("Segment condition saved to the local workspace.")}>Estimate audience</button></div></section>;
  if (domain === "content") return <section className="domain-config content-config"><div className="content-thumbnail"/><div><h2>{page === "catalogs" ? "Catalog schema" : "Reusable content"}</h2><p>{page === "catalogs" ? "sku, name, price, image, inventory and custom product fields are available to local Liquid previews." : "Resources created here can be selected by the matching campaign composer."}</p><button className="secondary small" onClick={() => openPage(page === "catalogs" ? "campaigns" : "email-templates")}>Open related workspace</button></div></section>;
  if (domain === "integrations") return <section className="domain-config integration-config"><ShieldCheck size={22}/><div><h2>Connection status</h2><p>Local simulation is enabled. Connection tests render a deterministic success or failure result and do not call external systems.</p></div><button className="secondary small" onClick={() => notify("Local connection test succeeded. No external request was sent.")}>Test connection</button></section>;
  if (domain === "data") return <section className="domain-config"><h2>Data definition</h2><div className="schema-fields"><span>first_name <i>string</i></span><span>country <i>string</i></span><span>language <i>string</i></span><span>Make Purchase <i>event</i></span></div></section>;
  if (domain === "settings") return <section className="domain-config"><h2>Workspace default</h2><Toggle title="Use workspace default" help="Apply this setting to new local resources and campaigns." checked/><button className="primary small" onClick={() => notify(`${page} saved in local SQLite audit log.`)}>Save changes</button></section>;
  return <section className="domain-config"><h2>Workspace configuration</h2><div className="form-grid"><Field label="Status"><select><option>Active</option><option>Draft</option></select></Field><Field label="Owner"><select><option>Lifecycle Marketing</option><option>Growth</option></select></Field></div><button className="secondary small" onClick={() => notify("Messaging configuration saved.")}>Save configuration</button></section>;
}

function PersistentResourceList({ page, title, notify, creating, setCreating }: { page: string; title: string; notify: (message: string) => void; creating: boolean; setCreating: (value: boolean) => void }) {
  const [rows, setRows] = useState<{ id: string; name: string; status: string; description: string; updatedAt: string }[]>([]); const [query, setQuery] = useState(""); const [name, setName] = useState("");
  const load = async () => { const response = await fetch(`/api/resources/${page}?q=${encodeURIComponent(query)}`); if (response.ok) { const result = await response.json(); setRows(result.data); } };
  useEffect(() => { void load(); }, [page, query]);
  const create = async () => { if (!name.trim()) return; const response = await fetch(`/api/resources/${page}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: `Local ${title.toLowerCase()} resource` }) }); if (response.ok) { setName(""); setCreating(false); await load(); notify(`${title} resource saved to local SQLite.`); } };
  return <section className="resource-workspace"><div className="list-toolbar"><div className="filter-search"><Search size={15}/><input placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)}/></div><button className="secondary" onClick={() => setCreating(!creating)}><Plus size={15}/> Create</button></div>{creating && <div className="resource-create"><input id="resource-name" autoFocus placeholder={`Name this ${singular(title).toLowerCase()}`} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void create(); }}/><button className="primary small" onClick={() => void create()}>Save</button></div>}<div className="resource-cards">{rows.length ? rows.map(row => <article key={row.id}><div className="resource-avatar">{row.name[0]}</div><div><b>{row.name}</b><p>{row.description}</p><small>{row.status} · {new Date(row.updatedAt).toLocaleString()}</small></div><button className="icon-button" onClick={() => notify(`${row.name} opened in its local workspace.`)}><MoreHorizontal size={18}/></button></article>) : <div className="empty-inline">No {title.toLowerCase()} resources found.</div>}</div></section>;
}
