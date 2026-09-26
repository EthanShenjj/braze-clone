"use client";

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import emailStarterStyles from "./email-starter.module.css";
import brazeSendingStyles from "./braze-sending.module.css";
import pushStyles from "./push-editor.module.css";
import LiveCanvas from "./live-canvas";
import LiveUserSearch from "./live-user-search";
import CatalogWorkspace from "./catalog-workspace";
import GlobalControlGroup from "./global-control-group";
import { PreferenceCenterWorkspace, SubscriptionGroupWorkspace } from "./subscription-group-workspace";
import InAppCampaignCompose from "./in-app-message";
import WebhookEditor from "./webhook-editor";
import WhatsAppEditor from "./whatsapp-editor";
import { EmailMessageEditor, EmailTemplateGallery, PersonalizationMenu, TestModal, type EmailCampaignLike } from "./email-dnd-editor";
import moduleStyles from "./module-workspaces.module.css";
import {
  ApisIdentifiersWorkspace, BrandGuidelinesWorkspace, ContentBlocksWorkspace, FrequencyCappingWorkspace, ImportUsersWorkspace,
  LocationsWorkspace, MediaLibraryWorkspace, NotificationsMenu, ProfileMenu, PromotionCodesWorkspace, QueryBuilderWorkspace,
  ReportBuilderWorkspace, SegmentExtensionsWorkspace, SegmentsWorkspace, SuppressionListsWorkspace, TagManagementWorkspace,
  TemplatesWorkspace, TourModal, WorkspaceSearch, field, PersistedSettingsPage, CustomAttributesWorkspace,
  CustomEventsWorkspace, settingsForms,
} from "./module-workspaces";
import { emailLocales, hasRenderableContent, rowsToPlainText, type EmailBlock, type EmailRow, type EmailStyle } from "@/lib/email-editor-model";
import { normalizeWebhookVariants } from "@/lib/webhook-model";
import { pageFromPath, pageKeyForDrawerItem, routeForPage } from "@/lib/navigation";
import { campaignValidationIssues } from "@/lib/campaign-validation";
import { formatDate, formatNumber, localeNames, normalizeLocale, supportedLocales, translate, withLocale, type Locale } from "@/lib/i18n";
import { sampleSegments } from "@/lib/sample-segments";
import { getWhatsAppTemplate, normalizeWhatsAppVariants, renderWhatsAppVariant } from "@/lib/whatsapp-model";
import {
  Activity, Bell, Bot, Box, CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Check, CircleHelp, Code2, Copy, Database, Eye, FileCode2, Flag, Filter, Grid2X2, Image,
  LayoutDashboard, Languages, LineChart, List, LockKeyhole, Mail, MapPin, MessageCircle, MoreHorizontal,
  MousePointerClick, Plus, Search, Send, Settings, Share2, ShieldCheck, Smartphone,
  Sparkles, Tags, Trash2, Type, Users, Video, Webhook, X, Zap
} from "lucide-react";

type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
type CampaignStatus = "Draft" | "Active" | "Stopped";
type Campaign = { id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number; edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config?: Record<string, unknown> };
export type EmailEditorMode = "operator" | "drag" | "html" | "plain" | "template";
type EmailSending = { preheader: string; whitespace: boolean; replyTo: string; bcc: string; unsubscribe: string; fromName?: string; fromAddress?: string; ipPool?: string; openTracking?: boolean; clickTracking?: boolean; gaEnabled?: boolean; utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string; subjectTranslations?: Record<string, string>; preheaderTranslations?: Record<string, string> };
type EmailVariant = { id: string; name: string; subject?: string; body?: string; editorMode?: EmailEditorMode; rows?: EmailRow[]; sending?: EmailSending; style?: EmailStyle };

const verifiedIdentities = [
  { name: "Powered by Braze", address: "braze@mta-h466.bftmail.com" },
  { name: "Thinkingai Marketing", address: "marketing@thinkingai.com" },
  { name: "Thinkingai Support", address: "support@thinkingai.com" },
] as const;
function emailVariants(campaign: Campaign): EmailVariant[] {
  const stored = campaign.config?.variants;
  return Array.isArray(stored) && stored.length ? stored as EmailVariant[] : [{ id: "var_1", name: "Variant 1" }];
}
function appendPersonalization(value: string, token: string) { return `${value}${value && !/\s$/.test(value) ? " " : ""}${token}`; }
function EmailVariantTabs({ locale, variants, selected, onSelect, onAdd }: { locale: Locale; variants: EmailVariant[]; selected: number; onSelect: (index: number) => void; onAdd: () => void }) {
  return <div className="variant-header"><h3>{translate(locale, "Variants")}</h3><div className="real-tabs">{variants.map((item, index) => <button key={item.id} className={className(selected === index && "selected")} onClick={() => onSelect(index)}>{item.name}</button>)}<button className="plus-tab" aria-label={translate(locale, "Add variant")} onClick={onAdd}><Plus size={16}/></button></div></div>;
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
  { id: "cmp_iam", name: "Welcome Offer IAM", channel: "iam", status: "Active", schedule: "One time", sent: 4784, edited: "Sep 13, 2026", audience: "New Users", conversion: "Start Session", config: { delivery: { timing: "designated", frequency: "One time", startDate: "2026-09-17", sendTime: "10:00" } } }
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const refreshCampaigns = async () => {
    const response = await fetch(`/api/campaigns?${new URLSearchParams({ limit: "1000", status: "All", sort: "edited" })}`);
    if (response.ok) { const result = await response.json(); setCampaigns(result.data); }
  };
  useEffect(() => { void refreshCampaigns(); }, []);
  useEffect(() => { setPage(pageFromPath(pathname)); }, [pathname]);
  useEffect(() => {
    const requested = searchParams.get("locale");
    if (requested) setLocale(normalizeLocale(requested));
    else {
      const stored = window.localStorage.getItem("braze:locale");
      if (stored) {
        const nextLocale = normalizeLocale(stored);
        setLocale(nextLocale);
        const params = new URLSearchParams(searchParams.toString());
        params.set("locale", nextLocale);
        router.replace(`${pathname}?${params.toString()}`);
      }
    }
  }, [pathname, router, searchParams]);
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
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(open => !open); }
      if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); setProfileOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openPage(key: string) {
    setCreateAnchor(null); setDrawer(null); setEditing(null); setPage(key); router.push(withLocale(routeForPage(key), locale));
  }
  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    const params = new URLSearchParams(searchParams.toString());
    params.set("locale", nextLocale);
    router.replace(`${pathname}?${params.toString()}`);
  }
  function openCampaignChannel(channel: Channel) {
    setCreateAnchor(null); setDrawer(null); setEditing(null); setPage("campaigns");
    router.push(`${withLocale(routeForPage("campaigns"), locale)}&channel=${encodeURIComponent(channel)}`);
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
    router.push(withLocale(`/engagement/campaigns/${id}?step=compose`, locale));
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
  function openCampaign(campaign: Campaign) { setEditing(campaign); router.push(withLocale(`/engagement/campaigns/${campaign.id}?step=compose`, locale)); }

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
      <div className="trial">◷ &nbsp;{translate(locale, "8 days left in your free trial.")} <button>{translate(locale, "Connect with sales")}</button></div>
      <header className="topbar"><button className="search-button" onClick={() => setSearchOpen(true)}><Search size={16}/> {translate(locale, "Search workspace")} <kbd>⌘K</kbd></button><div className="top-actions"><button className="icon-ghost" title={translate(locale, "Take a tour")} onClick={() => setTourOpen(true)}><CircleHelp size={18}/></button><Users size={18}/><label className="language-picker"><Languages size={16}/><select aria-label={translate(locale, "Language")} value={locale} onChange={event => changeLocale(event.target.value as Locale)}>{supportedLocales.map(value => <option value={value} key={value}>{localeNames[value]}</option>)}</select></label><span className="anchor"><button className="icon-ghost" aria-label="Notifications" onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }}><Bell size={18}/></button><NotificationsMenu locale={locale} open={notificationsOpen} onClose={() => setNotificationsOpen(false)} openPage={openPage}/></span><span className="anchor"><button className="profile" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }}>S</button><ProfileMenu locale={locale} open={profileOpen} onClose={() => setProfileOpen(false)} notify={setToast} openPage={openPage}/><ChevronDown size={17}/></span><button className="operator-trigger" onClick={() => setOperatorOpen(!operatorOpen)}><Sparkles size={17}/></button></div></header>
      {!['catalogs', 'global-control-group'].includes(page) && <div className="page-tabs"><button className={className("page-tab", !editing && "selected")} onClick={() => openPage(editing ? "campaigns" : page)}>{editing ? translate(locale, "Campaigns") : translate(locale, page === "performance" ? "Performance Overview" : page === "agents" ? "Agent Console" : page === "partners" ? "Partner Integrations" : page === "data" ? "Data Settings" : titleFrom(page))}</button>{editing && <button className="page-tab selected">{translate(locale, "Edit")} '{editing.name}' <X size={14} onClick={() => openPage("campaigns")}/></button>}</div>}
      {editing ? <CampaignEditor locale={locale} key={editing.id} campaign={editing} onSave={saveCampaign} onClose={() => openPage("campaigns")} /> : <PageContent locale={locale} page={page} campaigns={campaigns} openPage={openPage} onEdit={openCampaign} onCreate={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setCreateAnchor({ position: "fixed", top: rect.bottom + 6, left: Math.max(16, rect.right - 325), zIndex: 61 }); }} onStop={stopCampaign} onArchive={archiveCampaign} onDuplicate={duplicateCampaign} notify={setToast} onTour={() => setTourOpen(true)} />}
    </main>
    {drawer && <NavigationDrawer locale={locale} name={titleFrom(drawer)} items={drawers[drawer]} activePage={page} close={() => setDrawer(null)} open={openPage} openCampaignChannel={openCampaignChannel} />}
    {createAnchor && <CreateMenu locale={locale} anchor={createAnchor} start={start} close={() => setCreateAnchor(null)} />}
    {operatorOpen && <Operator locale={locale} close={() => setOperatorOpen(false)} start={start} />}
    {searchOpen && <WorkspaceSearch locale={locale} open onClose={() => setSearchOpen(false)} openPage={openPage} openCampaign={(id, name) => openCampaign({ id, name } as Campaign)}/>}
    {tourOpen && <TourModal open locale={locale} onClose={() => setTourOpen(false)}/>}
    {toast && <div className="toast"><ShieldCheck size={18}/><span>{translate(locale, toast)}</span><button aria-label={translate(locale, "Close")} onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>;
}

function NavigationDrawer({ locale, name, items, activePage, close, open, openCampaignChannel }: { locale: Locale; name: string; items: string[]; activePage: string; close: () => void; open: (page: string) => void; openCampaignChannel: (channel: Channel) => void }) {
  const [channelsOpen, setChannelsOpen] = useState(false);
  const channels: Channel[] = ["email", "push", "iam", "content", "banner", "sms", "webhook", "whatsapp", "line"];
  return <div className="drawer-backdrop" onMouseDown={close}><section className="nav-drawer" onMouseDown={e => e.stopPropagation()}><header><h2>{translate(locale, name)}</h2><button type="button" aria-label={translate(locale, "Close navigation")} onClick={close}><X size={18}/></button></header><div className="drawer-list">{items.map((item, index) => { const key = pageKeyForDrawerItem(item); return <div key={item}><button type="button" aria-current={activePage === key ? "page" : undefined} onClick={() => open(key)}><span className="drawer-icon">{index % 3 === 0 ? <Grid2X2 size={18}/> : index % 3 === 1 ? <Activity size={18}/> : <Settings size={18}/>}</span><span><b>{translate(locale, item)}</b><small>{translate(locale, drawerDescription(item))}</small></span><ChevronRight size={16}/></button>{name === "Messaging" && item === "Campaigns" && <div className="drawer-channel-group"><button type="button" className="drawer-channel-toggle" aria-expanded={channelsOpen} onClick={() => setChannelsOpen(!channelsOpen)}>{translate(locale, "View by channel")} <ChevronDown size={14} className={channelsOpen ? "open" : ""}/></button>{channelsOpen && <div className="drawer-channel-list">{channels.map(channel => <button type="button" key={channel} onClick={() => openCampaignChannel(channel)}>{translate(locale, channelMeta[channel].title)}</button>)}</div>}</div>}</div>; })}</div></section></div>;
}

function drawerDescription(name: string) {
  const descriptions: Record<string, string> = { "Content Calendar": "View upcoming scheduled campaigns and related analytics", "Messaging Diagnostics": "Troubleshoot why messages did not send", "Segments": "Split your audience into targeted groups", "Catalogs": "Manage non-user data such as products", "Report Builder": "Build and save performance reports", "Email Preferences": "Manage sending and subscription settings" };
  return descriptions[name] || "Manage this area for this workspace";
}

function CreateMenu({ locale, anchor, start, close }: { locale: Locale; anchor: CSSProperties; start: (channel: Channel) => void; close: () => void }) {
  const standard: Channel[] = ["email", "push", "iam", "content", "banner", "sms", "webhook", "whatsapp", "line"];
  return <div className="create-popover-layer" style={{ position: "fixed", inset: 0, zIndex: 60 }} onMouseDown={close}><section className="create-menu" style={anchor} onMouseDown={e => e.stopPropagation()}><button className="create-option operator-option" onClick={() => start("operator")}><Sparkles size={17}/><span><b>{translate(locale, "Create with Operator")}</b><small>{translate(locale, "Generate a coordinated campaign draft")}</small></span></button><p>{translate(locale, "MESSAGE ONE OR MORE CHANNELS")}</p><button className="create-option" onClick={() => start("multichannel")}><Grid2X2 size={17}/><span><b>{translate(locale, "Multichannel")}</b><small>{translate(locale, "Coordinate messages across channels")}</small></span></button><p>{translate(locale, "SINGLE CHANNEL")}</p>{standard.map(channel => { const meta = channelMeta[channel]; const Icon = meta.icon; return <button className="create-option" key={channel} onClick={() => start(channel)}><Icon size={17}/><span><b>{translate(locale, meta.title)}</b><small>{channel === "iam" ? `1 / 200 ${translate(locale, "Active").toLowerCase()}` : channel === "content" ? `0 / 500 ${translate(locale, "Active").toLowerCase()}` : channel === "banner" ? `0 / 200 ${translate(locale, "Active").toLowerCase()}` : ""}</small></span></button>; })}<p>{translate(locale, "FEATURE FLAGS")}</p><button className="create-option" onClick={() => start("feature")}><Flag size={17}/><span><b>{translate(locale, "Feature flag experiment")}</b><small>0 / 1 {translate(locale, "Active").toLowerCase()}</small></span></button><p>{translate(locale, "TRACK MESSAGES SENT VIA API")}</p><button className="create-option" onClick={() => start("api")}><Code2 size={17}/><span><b>{translate(locale, "API campaign")}</b></span></button></section></div>;
}

function Operator({ locale, close, start }: { locale: Locale; close: () => void; start: (channel: Channel) => void }) {
  const [prompt, setPrompt] = useState("");
  return <aside className="operator"><header><h2><Sparkles size={16}/> BrazeAI Operator™</h2><button aria-label={translate(locale, "Close")} onClick={close}><X size={17}/></button></header><div className="operator-chat">{translate(locale, "What kind of campaign would you like to create?")}</div><div className="operator-chat">{translate(locale, "I can choose channels, draft copy, and configure targeting for a local campaign draft.")}</div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={translate(locale, "Ask Operator to create a campaign…")}/><button className="primary" style={{marginTop:10,width:"100%"}} onClick={() => { start("operator"); }}>{translate(locale, "Generate campaign plan")}</button></aside>;
}

function PageContent({ locale, page, campaigns, openPage, onEdit, onCreate, onStop, onArchive, onDuplicate, notify, onTour }: { locale: Locale; page: string; campaigns: Campaign[]; openPage: (p: string) => void; onEdit: (c: Campaign) => void; onCreate: (event: ReactMouseEvent<HTMLButtonElement>) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void>; notify: (m: string) => void; onTour: () => void }) {
  if (page === "campaigns") return <CampaignList locale={locale} campaigns={campaigns} onEdit={onEdit} onCreate={onCreate} onStop={onStop} onArchive={onArchive} onDuplicate={onDuplicate} onTour={onTour} notify={notify}/>;
  if (page === "canvas") return <LiveCanvas locale={locale} notify={notify}/>;
  if (page === "getting-started") return <GettingStarted locale={locale} openPage={openPage}/>;
  if (page === "performance") return <Performance locale={locale} campaigns={campaigns}/>;
  if (page === "demo-lab") return <LiveDemoLab locale={locale} notify={notify}/>;
  if (page === "segments") return <SegmentsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "segment-extensions") return <SegmentExtensionsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "suppression-lists") return <SuppressionListsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "import-users") return <ImportUsersWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "locations") return <LocationsWorkspace key={page} locale={locale}/>;
  if (page === "media-library") return <MediaLibraryWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "content-blocks") return <ContentBlocksWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "promotion-codes") return <PromotionCodesWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "brand-guidelines") return <BrandGuidelinesWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "report-builder") return <ReportBuilderWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "query-builder") return <QueryBuilderWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "apis-and-identifiers") return <ApisIdentifiersWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "frequency-capping-rules") return <FrequencyCappingWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "tag-management") return <TagManagementWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "custom-attributes") return <CustomAttributesWorkspace key={page} locale={locale}/>;
  if (page === "custom-events") return <CustomEventsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page in settingsForms) return <PersistedSettingsPage key={page} locale={locale} notify={notify} page={page}/>;
  if (["custom-events-report", "global-control-group-report", "engagement-reports", "revenue-report", "segment-insights", "dashboard-builder", "email-performance", "push-performance", "sms-mms-rcs-performance", "conversions"].includes(page)) return <LiveReportPage locale={locale} title={titleFrom(page)} />;
  if (page === "message-activity-log") return <ActivityLogPage locale={locale} />;
  if (page === "search-users") return <LiveUserSearch locale={locale} notify={notify}/>;
  if (page === "global-control-group") return <GlobalControlGroup locale={locale} notify={notify}/>;
  if (page === "catalogs") return <CatalogWorkspace locale={locale} notify={notify}/>;
  if (page === "subscription-group-management") return <SubscriptionGroupWorkspace locale={locale} notify={notify}/>;
  if (page === "email-preference-centers") return <PreferenceCenterWorkspace locale={locale} notify={notify}/>;
  if (["email-templates", "push-templates", "in-app-message-templates", "webhook-templates", "canvas-templates", "banner-templates", "email-link-templates"].includes(page)) return <TemplatesWorkspace key={page} locale={locale} notify={notify} page={page} title={titleFrom(page)}/>;
  return <ModuleWorkspace locale={locale} key={page} title={titleFrom(page)} page={page} notify={notify} openPage={openPage}/>;
}

type CampaignListQuery = { search: string; status: string; channel: Channel | "all"; tag: string; sort: "name" | "edited"; direction: 1 | -1; start: number; limit: number };

function readCampaignListQuery(params: URLSearchParams): CampaignListQuery {
  const status = params.get("columnFilters[status]") ?? "All";
  const channel = params.get("channel");
  return {
    search: params.get("globalFilter") ?? "",
    status: status === "active" ? "Active" : status === "draft" ? "Draft" : status === "stopped" ? "Stopped" : "All",
    channel: channel && channel in channelMeta ? channel as Channel : "all",
    tag: params.get("tag") ?? "",
    sort: params.get("sortby") === "name" ? "name" : "edited",
    direction: params.get("sortdir") === "1" ? 1 : -1,
    start: Math.max(0, Number(params.get("start")) || 0),
    limit: [12, 24, 48].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 12,
  };
}

const campaignColumns = [
  { key: "status", label: "Status" }, { key: "stopDate", label: "Stop date" }, { key: "type", label: "Campaign type" },
  { key: "schedule", label: "Entry schedule" }, { key: "sent", label: "Sent" }, { key: "edited", label: "Last edited" },
] as const;

function CampaignList({ locale, campaigns, onEdit, onCreate, onStop, onArchive, onDuplicate, onTour, notify }: { locale: Locale; campaigns: Campaign[]; onEdit: (c: Campaign) => void; onCreate: (event: ReactMouseEvent<HTMLButtonElement>) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void>; onTour: () => void; notify: (m: string) => void }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState<CampaignListQuery>({ search: "", status: "All", channel: "all", tag: "", sort: "edited", direction: -1, start: 0, limit: 12 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem("braze:campaign-columns") ?? "[]") as string[]; } catch { return []; } });
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
    if (next.tag) url.searchParams.set("tag", next.tag); else url.searchParams.delete("tag");
    url.searchParams.set("sortby", next.sort === "name" ? "name" : "last_edited");
    url.searchParams.set("sortdir", String(next.direction));
    url.searchParams.set("display", "list");
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };
  const allTags = useMemo(() => [...new Set(campaigns.flatMap(c => Array.isArray(c.config?.tags) ? c.config.tags as string[] : []))], [campaigns]);
  const filtered = useMemo(() => campaigns.filter(c => c.name.toLowerCase().includes(query.search.toLowerCase()) && (query.status === "All" || c.status === query.status) && (query.channel === "all" || c.channel === query.channel) && (!query.tag || (Array.isArray(c.config?.tags) && (c.config.tags as string[]).includes(query.tag)))).sort((a, b) => (query.sort === "name" ? a.name.localeCompare(b.name) : a.edited.localeCompare(b.edited)) * query.direction), [campaigns, query]);
  const start = Math.min(query.start, Math.max(0, Math.ceil(filtered.length / query.limit) - 1) * query.limit);
  const paged = filtered.slice(start, start + query.limit);
  const statusLabel = (value: string) => translate(locale, value);
  const toggleColumn = (key: string) => {
    const next = hiddenColumns.includes(key) ? hiddenColumns.filter(item => item !== key) : [...hiddenColumns, key];
    setHiddenColumns(next);
    window.localStorage.setItem("braze:campaign-columns", JSON.stringify(next));
  };
  const col = (key: string) => !hiddenColumns.includes(key);
  return <section className="page-content"><div className="page-heading"><div><div className="title-line"><h1>{translate(locale, "Campaigns")}</h1><span className="access-pill">{translate(locale, "Limited access")}</span></div><p>{translate(locale, "Campaigns let you send a single, targeted message through email, push, SMS, and more, ensuring timely communication with your audience")}</p></div><div className="heading-actions"><button className="secondary" onClick={() => notify("Thanks — feedback is recorded in the local demo.")}>{translate(locale, "Send feedback")}</button><button className="secondary" onClick={onTour}>{translate(locale, "Take a tour")} <ChevronDown size={14}/></button><button className="primary" onClick={onCreate}><Plus size={16}/> {translate(locale, "Create campaign")} <ChevronDown size={14}/></button></div></div><div className="filters"><label>{translate(locale, "Status")}<select value={query.status} onChange={e => changeQuery({ status: e.target.value, start: 0 })}><option value="All">{statusLabel("All")}</option><option value="Draft">{statusLabel("Draft")}</option><option value="Active">{statusLabel("Active")}</option><option value="Stopped">{statusLabel("Stopped")}</option></select></label><label>{translate(locale, "Tag")}<select value={query.tag} onChange={e => changeQuery({ tag: e.target.value, start: 0 })}><option value="">{translate(locale, "Select...")}</option>{allTags.map(tag => <option key={tag}>{tag}</option>)}</select></label><button className={className("secondary", filtersOpen && "active-filter")} onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15}/> {translate(locale, "Filters")}</button><button className="secondary" onClick={() => setColumnsOpen(!columnsOpen)}><Grid2X2 size={15}/> {translate(locale, "Columns")}</button><button className="text-button" onClick={() => changeQuery({ status: "All", channel: "all", tag: "", search: "", start: 0 })}>{translate(locale, "Reset filters")}</button><div className="filter-search"><Search size={15}/><input aria-label={translate(locale, "Search")} placeholder={translate(locale, "Search")} value={query.search} onChange={e => changeQuery({ search: e.target.value, start: 0 }, true)}/></div></div>
    {filtersOpen && <div className={moduleStyles.card} style={{ padding: 16 }}>
      <div className={moduleStyles.toolbar}>
        {field("Channel", <select value={query.channel} onChange={e => changeQuery({ channel: e.target.value as Channel, start: 0 })}><option value="all">{translate(locale, "All channels")}</option>{(["email", "push", "iam", "content", "banner", "sms", "webhook", "whatsapp", "line"] as Channel[]).map(channel => <option key={channel} value={channel}>{translate(locale, channelMeta[channel].title)}</option>)}</select>)}
        {field("Tag", <select value={query.tag} onChange={e => changeQuery({ tag: e.target.value, start: 0 })}><option value="">Any tag</option>{allTags.map(tag => <option key={tag}>{tag}</option>)}</select>)}
        {field("Status", <select value={query.status} onChange={e => changeQuery({ status: e.target.value, start: 0 })}><option value="All">{statusLabel("All")}</option><option value="Draft">{statusLabel("Draft")}</option><option value="Active">{statusLabel("Active")}</option><option value="Stopped">{statusLabel("Stopped")}</option></select>)}
      </div>
    </div>}
    {columnsOpen && <div className={moduleStyles.card} style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Visible columns</h3>
      <div className={moduleStyles.toolbar}>{campaignColumns.map(column => <label key={column.key} className={className(moduleStyles.metricPicker)} style={{ display: "inline-flex" }}><label className={moduleStyles.metricPicker}><span className={className(!hiddenColumns.includes(column.key) && moduleStyles.on)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid #ddd9e3", borderRadius: 8, fontSize: 12.5, cursor: "pointer" }} onClick={() => toggleColumn(column.key)}>{col(column.key) ? <Check size={13}/> : <Plus size={13}/>} {translate(locale, column.label)}</span></label></label>)}</div>
    </div>}
    <div className="result-heading"><span>{formatNumber(locale, filtered.length)} {translate(locale, "Results")}</span><small>{query.channel !== "all" ? translate(locale, channelMeta[query.channel].title) : query.status !== "All" ? `${translate(locale, "Status")}: ${statusLabel(query.status)}` : query.tag ? `${translate(locale, "Tag")}: ${query.tag}` : translate(locale, "All campaigns")}</small></div><div className="table-wrap"><table><thead><tr><th onClick={() => changeQuery({ sort: "name", direction: query.sort === "name" && query.direction === 1 ? -1 : 1, start: 0 })}>{translate(locale, "Name")} {query.sort === "name" ? query.direction === 1 ? "↑" : "↓" : ""}</th>{col("status") && <th>{translate(locale, "Status")}</th>}{col("stopDate") && <th>{translate(locale, "Stop date")}</th>}{col("type") && <th>{translate(locale, "Campaign type")}</th>}{col("schedule") && <th>{translate(locale, "Entry schedule")}</th>}{col("sent") && <th>{translate(locale, "Sent")}</th>}{col("edited") && <th>{translate(locale, "Last edited")}</th>}<th/></tr></thead><tbody>{paged.map(c => { const Icon = channelMeta[c.channel].icon; return <tr key={c.id}><td><button className="link-button" onClick={() => onEdit(c)}>{c.name}</button></td>{col("status") && <td><span className={className("status", c.status.toLowerCase())}>{statusLabel(c.status)}</span></td>}{col("stopDate") && <td>—</td>}{col("type") && <td><span className="channel-cell"><Icon size={14}/>{translate(locale, channelMeta[c.channel].title)}</span></td>}{col("schedule") && <td>{translate(locale, c.schedule)}</td>}{col("sent") && <td>{formatNumber(locale, c.sent)}</td>}{col("edited") && <td>{formatDate(locale, c.edited, { dateStyle: "medium", timeStyle: "short" })}</td>}<td><CampaignRowActions locale={locale} campaign={c} onEdit={onEdit} onStop={onStop} onArchive={onArchive} onDuplicate={onDuplicate}/></td></tr>; })}</tbody></table></div><div className="campaign-pagination"><span>{formatNumber(locale, filtered.length ? start + 1 : 0)}–{formatNumber(locale, Math.min(start + query.limit, filtered.length))} / {formatNumber(locale, filtered.length)}</span><label>{translate(locale, "Rows per page")} <select value={query.limit} onChange={e => changeQuery({ limit: Number(e.target.value), start: 0 })}><option value="12">12</option><option value="24">24</option><option value="48">48</option></select></label><button className="secondary small" disabled={start === 0} onClick={() => changeQuery({ start: Math.max(0, start - query.limit) })} aria-label={translate(locale, "Previous page")}><ChevronLeft size={15}/></button><button className="secondary small" disabled={start + query.limit >= filtered.length} onClick={() => changeQuery({ start: start + query.limit })} aria-label={translate(locale, "Next page")}><ChevronRight size={15}/></button></div></section>;
}

function CampaignRowActions({ locale, campaign, onEdit, onStop, onArchive, onDuplicate }: { locale: Locale; campaign: Campaign; onEdit: (campaign: Campaign) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void> }) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const act = (action: () => void) => { setAnchor(null); action(); };
  return <><button className="icon-button" aria-label={`${translate(locale, "Actions")} ${campaign.name}`} aria-expanded={Boolean(anchor)} onClick={event => { if (anchor) { setAnchor(null); return; } const rect = event.currentTarget.getBoundingClientRect(); setAnchor({ top: Math.min(rect.bottom + 4, window.innerHeight - 148), left: Math.max(8, Math.min(rect.right - 130, window.innerWidth - 138)) }); }}><MoreHorizontal size={18}/></button>{anchor && createPortal(<div className="campaign-menu-layer" onMouseDown={() => setAnchor(null)}><div className="campaign-action-menu" style={anchor} onMouseDown={event => event.stopPropagation()}><button onClick={() => act(() => onEdit(campaign))}>{translate(locale, "Edit")}</button><button onClick={() => act(() => void onDuplicate(campaign))}>{translate(locale, "Duplicate")}</button>{campaign.status === "Active" && <button onClick={() => act(() => onStop(campaign.id))}>{translate(locale, "Stop")}</button>}<button onClick={() => act(() => void onArchive(campaign.id))}>{translate(locale, "Archive")}</button></div></div>, document.body)}</>;
}

function CampaignEditor({ locale, campaign, onSave, onClose }: { locale: Locale; campaign: Campaign; onSave: (c: Campaign, publish?: boolean) => Promise<boolean>; onClose: () => void }) {
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
    <div className="editor-access"><LockKeyhole size={11}/> {translate(locale, "Limited access")}</div>
    <nav className="editor-steps" aria-label={translate(locale, "Campaign steps")}>{steps.map((item, i) => <button key={item} className={className("editor-step", step === i && "current", step > i && "complete")} onClick={() => goToStep(i)}><span>{step > i ? "✓" : i + 1}</span><b>{translate(locale, item)}</b></button>)}</nav>
    {step === 0 && (
      <Compose locale={locale} draft={draft} update={update} saveEmail={saveMessage} variant={variant} setVariant={setVariant} openTest={() => { void saveMessage({}).then(ok => { if (ok) setTestOpen(true); }); }}/>
    )}
    {step === 1 && <Schedule locale={locale} draft={draft} update={update}/>}
    {step === 2 && <Audience locale={locale} draft={draft} update={update}/>}
    {step === 3 && <Conversions locale={locale} draft={draft} update={update}/>}
    {step === 4 && <Review locale={locale} draft={draft} go={goToStep} issues={launchIssues}/>}
    <footer className="editor-footer">
      <button className="footer-arrow" aria-label={translate(locale, "Back")} disabled={step === 0} onClick={() => goToStep(step - 1)}><ChevronLeft size={17}/></button>
      <div className="editor-footer-steps">{["Compose", "Schedule", "Target", "Assign", "Review"].map((name, i) => <button key={name} className={className("footer-step", step === i && "current", step > i && "complete")} onClick={() => goToStep(i)}><span>{step > i ? "✓" : i + 1}</span>{translate(locale, name)}</button>)}</div>
      <button className="footer-arrow" aria-label={translate(locale, "Forward")} disabled={step === steps.length - 1} onClick={() => goToStep(step + 1)}><ChevronRight size={17}/></button>
      <button className="footer-save" onClick={() => void onSave(draft)}>{translate(locale, "Save Draft")}</button>
      {step === 4 && <button className="primary footer-launch" disabled={Boolean(launchIssues.length) || draft.status === "Active"} onClick={() => void onSave(draft, true)}>{translate(locale, draft.status === "Active" ? "Campaign Active" : "Launch Campaign")}</button>}
    </footer>
    {testOpen && <TestModal locale={locale} draft={draft} variantIndex={variant} close={() => setTestOpen(false)}/>}
    <button className="editor-close-shortcut" onClick={onClose}>{translate(locale, "Close editor")}</button>
  </section>
}

function Compose({ locale, draft, update, saveEmail, variant, setVariant, openTest }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void; saveEmail: (p: Partial<Campaign>) => Promise<boolean>; variant: number; setVariant: (x: number) => void; openTest: () => void }) {
  const channel = draft.channel;
  if (channel === "email") return <EmailCompose locale={locale} draft={draft} update={update} saveEmail={saveEmail} variant={variant} setVariant={setVariant} openTest={openTest}/>;
  return <ChannelCompose locale={locale} draft={draft} update={update} openTest={openTest}/>;
  const isEmail = channel === "multichannel" || channel === "operator";
  const isWebhook = channel === "webhook"; const isText = channel === "sms" || channel === "whatsapp" || channel === "line";
  return <div className="editor-body"><section className="editor-card"><h2>Campaign Details</h2><div className="form-grid"><Field label="Campaign Name"><input value={draft.name} onChange={e => update({ name: e.target.value })}/></Field><Field label="Teams"><select><option>Select teams...</option><option>Lifecycle Marketing</option><option>Growth</option></select></Field></div><Field label="Description"><textarea placeholder="Describe this campaign"/></Field><button className="tag-button"><Tags size={14}/> Tags</button></section><section className="editor-card"><div className="card-heading"><div><h2>{channelMeta[channel].title} Composer</h2><p>{channelMeta[channel].description}</p></div><button className="secondary" onClick={openTest}>Preview and test</button></div><div className="variant-row"><b>Variants</b><button className={className("variant", variant === 0 && "active")} onClick={() => setVariant(0)}>Variant 1</button><button className={className("variant", variant === 1 && "active")} onClick={() => setVariant(1)}>Variant 2</button><button className="add-variant" onClick={() => setVariant(1)}><Plus size={15}/></button></div><div className="composer-grid"><div className="composer-form">{isEmail && <><Field label="From"><select><option>Powered by Braze &lt;braze@mta-h466.bftmail.com&gt;</option></select></Field><Field label="Subject"><input value={draft.subject || "Your welcome offer is here"} onChange={e => update({ subject: e.target.value })}/></Field><Field label="Preheader"><input placeholder="Optional preheader text"/></Field><div className="segmented"><button className="selected">Drag-and-drop editor</button><button>HTML editor</button></div></>}{channel === "push" && <><div className="segmented"><button className="selected">iOS</button><button>Android</button><button>Web</button></div><Field label="Notification title"><input value={draft.subject || "Your welcome offer is here"} onChange={e => update({subject: e.target.value})}/></Field><Field label="Deep link"><input defaultValue="myapp://offers/welcome"/></Field></>}{(channel === "iam" || channel === "content" || channel === "banner") && <><Field label="Message title"><input value={draft.subject || "Welcome to the family"} onChange={e => update({subject: e.target.value})}/></Field><div className="segmented"><button className="selected">Modal</button><button>Slideup</button><button>Full</button></div><Field label="Call to action"><input defaultValue="Shop now"/></Field></>}{isText && <><Field label="Sender / subscription group"><select><option>Promotional messages</option><option>Transactional</option></select></Field><Field label="Message"><textarea value={draft.body || "Welcome to Braze! Use code WELCOME10 for 10% off."} onChange={e => update({body: e.target.value})}/></Field><small>{(draft.body || "").length || 58} characters · 1 segment</small></>}{isWebhook && <><div className="form-grid"><Field label="HTTP method"><select><option>POST</option><option>PUT</option><option>GET</option></select></Field><Field label="Authentication"><select><option>Bearer token</option><option>None</option></select></Field></div><Field label="Webhook URL"><input defaultValue="https://api.example.com/events"/></Field><Field label="Request body"><textarea defaultValue={'{\n  "user_id": "{{${user_id}}}",\n  "event": "campaign_sent"\n}'}/></Field></>}{(channel === "feature" || channel === "api" || channel === "operator") && <><Field label={channel === "operator" ? "Campaign goal" : "Configuration"}><textarea value={draft.body || "Welcome new users and encourage their first purchase."} onChange={e => update({body: e.target.value})}/></Field><div className="subtle-note">This local demo models the configuration and event flow without calling an external service.</div></>}{!isText && !isWebhook && channel !== "feature" && channel !== "api" && <Field label="Message"><textarea value={draft.body || "Thanks for being with us. Use code SEPTEMBER20 to get 20% off this month’s featured collection."} onChange={e => update({body: e.target.value})}/></Field>}</div><MessagePreview draft={draft}/></div></section></div>;
}

function EmailCompose({ locale, draft, update, saveEmail, variant, setVariant, openTest }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void; saveEmail: (p: Partial<Campaign>) => Promise<boolean>; variant: number; setVariant: (x: number) => void; openTest: () => void }) {
  const variants = emailVariants(draft);
  const current = variants[variant] ?? variants[0];
  const currentSubject = current.subject ?? (variant === 0 ? draft.subject : undefined);
  const currentBody = current.body ?? (variant === 0 ? draft.body : undefined);
  const savedEditorMode = current.editorMode ?? (variant === 0 ? draft.config?.emailEditorMode as EmailEditorMode | undefined : undefined);
  const savedRows = current.rows ?? (variant === 0 && Array.isArray(draft.config?.emailRows) ? draft.config.emailRows as EmailRow[] : []);
  const savedStyle = current.style ?? (variant === 0 ? draft.config?.emailStyle as EmailStyle | undefined : undefined);
  const savedSending = current.sending ?? (variant === 0 ? draft.config?.emailSending as EmailSending | undefined : undefined);
  const variantDraft: Campaign = { ...draft, subject: currentSubject, body: currentBody, config: { ...draft.config, emailEditorMode: savedEditorMode, emailRows: savedRows, emailStyle: savedStyle, emailSending: savedSending } };
  const [showSending, setShowSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [emailStart, setEmailStart] = useState(() => !currentSubject && !currentBody && !savedRows.length && !currentBody);
  const [emailEditor, setEmailEditor] = useState<EmailEditorMode | null>(null);
  useEffect(() => { setEmailStart(!currentSubject && !currentBody && !savedRows.length); setEmailEditor(null); }, [variant]);
  const variantPatch = (patch: Partial<Campaign>) => {
    const next = [...variants];
    next[variant] = { ...current, subject: patch.subject ?? currentSubject, body: patch.body ?? currentBody, editorMode: (patch.config?.emailEditorMode as EmailEditorMode | undefined) ?? savedEditorMode, rows: Array.isArray(patch.config?.emailRows) ? patch.config.emailRows as EmailRow[] : savedRows, style: patch.config?.emailStyle as EmailStyle | undefined ?? savedStyle, sending: (patch.config?.emailSending as EmailSending | undefined) ?? savedSending };
    const config = { ...draft.config, variants: next, ...(variant === 0 ? { emailEditorMode: next[0].editorMode, emailRows: next[0].rows, emailStyle: next[0].style, emailSending: next[0].sending } : {}) };
    return variant === 0 ? { ...patch, config } : { config };
  };
  const updateVariant = (patch: Partial<Campaign>) => update(variantPatch(patch));
  const saveVariant = (patch: Partial<Campaign>) => saveEmail(variantPatch(patch));
  const addVariant = () => { const next = [...variants, { id: `var_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}` }]; update({ config: { ...draft.config, variants: next } }); setVariant(next.length - 1); };
  if (showSending) return <EmailSendingEditor locale={locale} draft={variantDraft} sending={savedSending} save={saveVariant} onClose={() => setShowSending(false)}/>;
  if (emailEditor) return <EmailMessageEditor locale={locale} key={`${current.id}-${emailEditor}`} mode={emailEditor} variantName={current.name} draft={variantDraft} save={saveVariant} onClose={() => { setEmailEditor(null); setEmailStart(false); }} onSendingSettings={() => { setEmailEditor(null); setEmailStart(false); setShowSending(true); }} onModeChange={mode => setEmailEditor(mode)} onOpenTest={openTest} />;
  if (emailStart) return <EmailStart locale={locale} draft={draft} update={update} importHtml={body => updateVariant({ body, config: { emailEditorMode: "html" } })} variants={variants} variant={variant} setVariant={setVariant} addVariant={addVariant} copied={copied} setCopied={setCopied} onStart={setEmailEditor} />;
  const subject = currentSubject ?? "";
  const fromName = savedSending?.fromName ?? "Powered by Braze";
  const fromAddress = savedSending?.fromAddress ?? "braze@mta-h466.bftmail.com";
  const hasRows = savedRows.length > 0;
  const modeLabel = savedEditorMode === "drag" ? "Drag-and-drop Editor" : savedEditorMode === "plain" ? "Plain-text Editor" : "HTML Editor";
  return <div className="editor-body email-compose-page">
    <EmailCampaignDetails locale={locale} draft={draft} update={update} copied={copied} setCopied={setCopied}/>
    <section className="braze-section email-composer-section">
      <h2>{translate(locale, "Email Composer")}</h2>
      <EmailVariantTabs locale={locale} variants={variants} selected={variant} onSelect={setVariant} onAdd={addVariant}/>
      <div className="sending-info"><div><h3>{translate(locale, "Sending info")}</h3><dl><div><dt>{translate(locale, "From")}:</dt><dd>{fromName} &lt;{fromAddress}&gt;</dd></div><div><dt>{translate(locale, "Subject")}:</dt><dd>{subject}</dd></div>{savedSending?.preheader && <div><dt>{translate(locale, "Preheader")}:</dt><dd>{savedSending.preheader}</dd></div>}<div><dt>{translate(locale, "One-click list-unsubscribe")}:</dt><dd>{savedSending?.unsubscribe ?? "Use workspace default"}</dd></div></dl></div><button className="secondary small" onClick={() => setShowSending(true)}>{translate(locale, "Edit sending info")}</button></div>
      <div className="email-body-heading"><div><h3>{translate(locale, "Email body")}</h3><p>{modeLabel}</p></div><button className="secondary" onClick={() => setEmailEditor(savedEditorMode ?? "html")}>{translate(locale, "Edit message")}</button></div>
      <div className="email-document"><div className="email-document-top">{currentSubject || "September Offer"}</div><article>{hasRows
        ? savedRows.map(row => row.cells.map(cell => cell.blocks.map(block => <div key={block.id} className="email-preview-block">{blockTextForPreview(block)}</div>)))
        : <div dangerouslySetInnerHTML={{ __html: currentBody || "<p>No content yet.</p>" }} />}</article></div>
      <div className="email-actions"><button className="secondary" onClick={() => setGalleryOpen(!galleryOpen)}>{translate(locale, "Choose New Template")}</button><button className="secondary" onClick={openTest}>{translate(locale, "Preview and test")}</button></div>
      {galleryOpen && <EmailTemplateGallery locale={locale} onApply={template => {
        if (template.rows) updateVariant({ subject: template.subject, config: { emailEditorMode: "drag", emailRows: template.rows, emailStyle: savedStyle } });
        else if (template.html) updateVariant({ subject: template.subject, body: template.html, config: { emailEditorMode: "html" } });
        else if (template.plain) updateVariant({ subject: template.subject, body: template.plain, config: { emailEditorMode: "plain" } });
        setGalleryOpen(false);
      }} onClose={() => setGalleryOpen(false)} />}
    </section>
  </div>;
}

// Renders a saved block as static compose-page preview markup.
function blockTextForPreview(block: EmailBlock) {
  const style = block.style ?? {};
  if (block.kind === "Title") return <h1 key={block.id} style={{ fontSize: style.fontSize ?? 34, color: style.color }}>{block.text}</h1>;
  if (block.kind === "Button") return <a key={block.id} style={{ background: style.bgColor, color: style.color, padding: style.padding ?? 12, borderRadius: style.radius ?? 4, display: "inline-block" }}>{block.text}</a>;
  if (block.kind === "Divider") return <hr key={block.id}/>;
  if (block.kind === "Spacer") return <div key={block.id} style={{ height: style.height ?? 44 }}/>;
  if (block.kind === "Image") return <img key={block.id} src={block.src} alt={block.alt} style={{ maxWidth: "100%" }}/>;
  if (block.kind === "List") return <ul key={block.id}>{block.text.split("\n").filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul>;
  return <p key={block.id} dangerouslySetInnerHTML={{ __html: block.text }} />;
}

function EmailCampaignDetails({ locale, draft, update, copied, setCopied }: { locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; copied: boolean; setCopied: (copied: boolean) => void }) {
  const description = typeof draft.config?.description === "string" ? draft.config.description : "";
  const tags = Array.isArray(draft.config?.tags) ? draft.config.tags as string[] : [];
  const [workspaceTags, setWorkspaceTags] = useState<string[]>([]);
  useEffect(() => { void fetch("/api/resources/tag-management").then(r => r.json()).then(d => setWorkspaceTags(((d.data ?? []) as Array<{ name: string }>).map(row => row.name))).catch(() => {}); }, []);
  const tagChoices = [...new Set(["Lifecycle", "Promotional", "Retention", ...workspaceTags])];
  const [showDescription, setShowDescription] = useState(Boolean(description));
  const [showTags, setShowTags] = useState(false);
  const toggleTag = (tag: string) => update({ config: { ...draft.config, tags: tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag] } });
  return <section className="braze-section campaign-details-section">
    <h2>{translate(locale, "Campaign Details")}</h2>
    <div className="form-grid">
      <div className="campaign-name-line"><Field label={translate(locale, "Campaign Name")}><input value={draft.name} onChange={event => update({ name: event.target.value })} placeholder={translate(locale, "Enter Campaign Name")}/></Field></div>
      <Field label={translate(locale, "Teams")}><select value={String(draft.config?.team ?? "")} onChange={event => update({ config: { ...draft.config, team: event.target.value || undefined } })}><option value="">{translate(locale, "Select...")}</option><option>Lifecycle Marketing</option><option>Growth</option><option>Retention</option></select></Field>
    </div>
    {showDescription ? <Field label={translate(locale, "Description")}><textarea value={description} onChange={event => update({ config: { ...draft.config, description: event.target.value } })} placeholder={translate(locale, "Enter a description")}/></Field> : <button className="inline-link" onClick={() => setShowDescription(true)}><Plus size={16}/> {translate(locale, "Add description")}</button>}
    <div className="campaign-tag-line"><button className="tag-button" aria-expanded={showTags} onClick={() => setShowTags(!showTags)}><Tags size={14}/> {translate(locale, "Tags")} <ChevronDown size={13}/></button>{tags.map(tag => <span className="campaign-tag" key={tag}>{tag}</span>)}{showTags && <div className="campaign-tags-menu">{tagChoices.map(tag => <button key={tag} onClick={() => toggleTag(tag)}>{tags.includes(tag) ? "✓ " : ""}{tag}</button>)}</div>}</div>
    <div className="campaign-id-line"><Field label={translate(locale, "Campaign ID")}><input value={draft.id} readOnly title={draft.id}/></Field><button className="copy-id" onClick={() => { void navigator.clipboard?.writeText(draft.id); setCopied(true); }}><Copy size={17}/>{translate(locale, copied ? "Copied" : "Copy")}</button></div>
  </section>;
}

function EmailStart({ locale, draft, update, importHtml, variants, variant, setVariant, addVariant, copied, setCopied, onStart }: { locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; importHtml: (body: string) => void; variants: EmailVariant[]; variant: number; setVariant: (variant: number) => void; addVariant: () => void; copied: boolean; setCopied: (copied: boolean) => void; onStart: (choice: "operator" | "drag" | "html" | "plain" | "template") => void }) {
  return <div className="editor-body email-compose-page">
    <EmailCampaignDetails locale={locale} draft={draft} update={update} copied={copied} setCopied={setCopied}/>
    <section className="braze-section email-composer-section">
      <h2>{translate(locale, "Email Composer")}</h2>
      <EmailVariantTabs locale={locale} variants={variants} selected={variant} onSelect={setVariant} onAdd={addVariant}/>
      <div className={emailStarterStyles.starter}>
        <h3>{translate(locale, "Create new email")}</h3><p>{translate(locale, "How would you like to start?")}</p>
        <div className={emailStarterStyles.options}>
          <button className={emailStarterStyles.option} onClick={() => onStart("operator")}><span className={emailStarterStyles.operatorIcon}><Sparkles size={18}/></span><b>{translate(locale, "Create with Operator")}</b><small>{translate(locale, "Generate a custom email")}</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("drag")}><span><LayoutDashboard size={19}/></span><b>{translate(locale, "Drag-and-drop editor")}</b><small>{translate(locale, "Start from scratch")}</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("html")}><span><Code2 size={20}/></span><b>{translate(locale, "HTML code editor")}</b><small>{translate(locale, "Start from scratch")}</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("plain")}><span><List size={19}/></span><b>Plain-text editor</b><small>{translate(locale, "Start from scratch")}</small></button>
          <button className={emailStarterStyles.option} onClick={() => onStart("template")}><span><FileCode2 size={19}/></span><b>{translate(locale, "Templates")}</b><small>{translate(locale, "Choose a template")}</small></button>
        </div>
        <label className={emailStarterStyles.upload}>{translate(locale, "Upload file")}<input type="file" accept=".html,.htm" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; importHtml(await file.text()); onStart("html"); }}/></label>
      </div>
    </section>
  </div>;
}

function EmailSendingEditor({ locale, draft, sending, save, onClose }: { locale: Locale; draft: Campaign; sending?: EmailSending; save: (patch: Partial<Campaign>) => Promise<boolean>; onClose: () => void }) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [preheader, setPreheader] = useState(sending?.preheader ?? "");
  const [whitespace, setWhitespace] = useState(sending?.whitespace ?? false);
  const [replyTo, setReplyTo] = useState(sending?.replyTo ?? "Exclude reply-to and send replies to \"from\" address");
  const [bcc, setBcc] = useState(sending?.bcc ?? "No BCC address");
  const [unsubscribe, setUnsubscribe] = useState(sending?.unsubscribe ?? "Use workspace default");
  const [identity, setIdentity] = useState(sending?.fromAddress ?? verifiedIdentities[0].address);
  const [ipPool, setIpPool] = useState(sending?.ipPool ?? "PLG_IP_Pool");
  const [openTracking, setOpenTracking] = useState(sending?.openTracking ?? true);
  const [clickTracking, setClickTracking] = useState(sending?.clickTracking ?? true);
  const [gaEnabled, setGaEnabled] = useState(sending?.gaEnabled ?? false);
  const [utmSource, setUtmSource] = useState(sending?.utmSource ?? "");
  const [utmMedium, setUtmMedium] = useState(sending?.utmMedium ?? "email");
  const [utmCampaign, setUtmCampaign] = useState(sending?.utmCampaign ?? "");
  const [utmTerm, setUtmTerm] = useState(sending?.utmTerm ?? "");
  const [utmContent, setUtmContent] = useState(sending?.utmContent ?? "");
  const [subjectTranslations, setSubjectTranslations] = useState<Record<string, string>>(sending?.subjectTranslations ?? {});
  const [preheaderTranslations, setPreheaderTranslations] = useState<Record<string, string>>(sending?.preheaderTranslations ?? {});
  const [section, setSection] = useState<"Sending Info" | "Advanced" | "Personalization" | "Languages">("Sending Info");
  const [insertingInto, setInsertingInto] = useState<"subject" | "preheader" | null>(null);
  const [saving, setSaving] = useState(false);
  const currentIdentity = verifiedIdentities.find(item => item.address === identity) ?? verifiedIdentities[0];
  const currentSending: EmailSending = { preheader, whitespace, replyTo, bcc, unsubscribe, fromName: currentIdentity.name, fromAddress: currentIdentity.address, ipPool, openTracking, clickTracking, gaEnabled, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, subjectTranslations, preheaderTranslations };
  const insert = (token: string) => { if (insertingInto === "preheader") setPreheader(value => appendPersonalization(value, token)); else setSubject(value => appendPersonalization(value, token)); setInsertingInto(null); };
  const done = async () => { if (!subject.trim() || saving) return; setSaving(true); const ok = await save({ subject, config: { ...draft.config, emailSending: currentSending } }); setSaving(false); if (ok) onClose(); };
  const download = () => { const blob = new Blob([`<html><head><title>${subject.replaceAll("<", "&lt;")}</title></head><body><h1>${subject.replaceAll("<", "&lt;")}</h1><p>${(draft.body ?? "").replaceAll("<", "&lt;")}</p></body></html>`], { type: "text/html" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "email-preview.html"; link.click(); URL.revokeObjectURL(link.href); };
  return <section className={brazeSendingStyles.page} aria-label={translate(locale, "Email sending settings")}>
    <header className={brazeSendingStyles.header}><b>{draft.name}</b><button aria-label="BrazeAI Operator"><Sparkles size={19}/></button></header>
    <nav className={brazeSendingStyles.iconRail} aria-label={translate(locale, "Email editor sections")}><button className={brazeSendingStyles.iconActive} title={translate(locale, "Sending settings")}><Mail size={22}/></button><button title={translate(locale, "Content")} onClick={onClose}><FileCode2 size={22}/></button><button title={translate(locale, "Preview & Test")} onClick={onClose}><Eye size={22}/></button></nav>
    <aside className={brazeSendingStyles.sideRail}><div className={brazeSendingStyles.railTitle}>SENDING SETTINGS<button aria-label={translate(locale, "Back to campaign")} onClick={onClose}><ChevronLeft size={15}/></button></div>{(["Sending Info", "Advanced", "Personalization", "Languages"] as const).map(name => <button key={name} className={section === name ? brazeSendingStyles.navActive : ""} onClick={() => setSection(name)}>{translate(locale, name)}</button>)}<a href="#email-style-settings">{translate(locale, "Style Settings")} ↗</a></aside>
    <main className={brazeSendingStyles.formArea}>
      {section === "Sending Info" ? <><h2>{translate(locale, "Sending Info")}</h2><p>You can update the default value of your sending information from <a href="#email-settings">Email Settings</a>.</p><label>Subject <span className={brazeSendingStyles.liquidInput}><textarea rows={1} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Enter an email subject"/><button title="Add Liquid" aria-label="Personalize subject" onClick={() => setInsertingInto(insertingInto === "subject" ? null : "subject")}>✦</button></span>{insertingInto === "subject" && <PersonalizationMenu title="Personalize subject" onInsert={insert}/>}</label><label>Preheader <small>(Optional)</small><span className={brazeSendingStyles.liquidInput}><textarea rows={1} value={preheader} onChange={event => setPreheader(event.target.value)} placeholder="Enter an email preheader"/><button title="Add Liquid" aria-label="Personalize preheader" onClick={() => setInsertingInto(insertingInto === "preheader" ? null : "preheader")}>✦</button></span>{insertingInto === "preheader" && <PersonalizationMenu title="Personalize preheader" onInsert={insert}/>}</label><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={whitespace} onChange={event => setWhitespace(event.target.checked)}/><span>Add whitespace after preheader<small>Prevents most email clients from pulling additional content from your email to fill the remaining preview space</small></span></label><div className={brazeSendingStyles.formDivider}/><h3>From display name + address</h3><label>From address (verified sending identity)<select value={identity} onChange={event => setIdentity(event.target.value)}>{verifiedIdentities.map(item => <option key={item.address} value={item.address}>{item.name} &lt;{item.address}&gt;</option>)}</select></label><label>IP pool<select value={ipPool} onChange={event => setIpPool(event.target.value)}><option>PLG_IP_Pool</option><option>Transactional_IP_Pool</option><option>Shared_IP_Pool</option></select></label><label>Reply-to address<select value={replyTo} onChange={event => setReplyTo(event.target.value)}><option value="Exclude reply-to and send replies to &quot;from&quot; address">Exclude reply-to and send replies to "from" address</option>{verifiedIdentities.map(item => <option key={item.address} value={item.address}>{item.address}</option>)}</select></label><label>BCC address<select value={bcc} onChange={event => setBcc(event.target.value)}><option value="No BCC address">No BCC address</option><option value="workspace_default">Workspace default BCC</option></select></label><label>One-click list-unsubscribe setting<select value={unsubscribe} onChange={event => setUnsubscribe(event.target.value)}><option>Use workspace default</option><option>Enabled</option><option>Disabled</option></select></label></> : section === "Personalization" ? <><h2>{translate(locale, "Personalization")}</h2><p>Pick a target field, then insert a Liquid variable from any category.</p><div className={brazeSendingStyles.variableButtons}><button className={brazeSendingStyles.variableButton} onClick={() => setInsertingInto("subject")}>Subject</button><button className={brazeSendingStyles.variableButton} onClick={() => setInsertingInto("preheader")}>Preheader</button></div>{insertingInto && <PersonalizationMenu title={`Insert into ${insertingInto}`} onInsert={insert}/>}</> : section === "Languages" ? <><h2>{translate(locale, "Languages")}</h2><p>Provide localized subject lines and preheaders. Users receive the translation matching their language, falling back to the default.</p>{emailLocales.filter(item => item.code !== "en").map(item => <div key={item.code} className={brazeSendingStyles.languageGroup}><h3>{item.label}</h3><label>Subject ({item.label})<input value={subjectTranslations[item.code] ?? ""} onChange={event => setSubjectTranslations({ ...subjectTranslations, [item.code]: event.target.value })} placeholder={subject || "Enter an email subject"}/></label><label>Preheader ({item.label})<input value={preheaderTranslations[item.code] ?? ""} onChange={event => setPreheaderTranslations({ ...preheaderTranslations, [item.code]: event.target.value })} placeholder={preheader || "Enter an email preheader"}/></label></div>)}</> : <><h2>{translate(locale, "Advanced")}</h2><p>Configure tracking and link behavior for this campaign.</p><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={openTracking} onChange={event => setOpenTracking(event.target.checked)}/><span>Track opens<small>Injects an open-tracking pixel into delivered emails</small></span></label><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={clickTracking} onChange={event => setClickTracking(event.target.checked)}/><span>Track clicks<small>Rewrites links to route through click tracking</small></span></label><div className={brazeSendingStyles.formDivider}/><h3>Google Analytics</h3><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={gaEnabled} onChange={event => setGaEnabled(event.target.checked)}/><span>Enable Google Analytics tracking<small>Appends UTM parameters to links in this campaign</small></span></label>{gaEnabled && <div className={brazeSendingStyles.utmGrid}><label>utm_source<input value={utmSource} onChange={event => setUtmSource(event.target.value)}/></label><label>utm_medium<input value={utmMedium} onChange={event => setUtmMedium(event.target.value)}/></label><label>utm_campaign<input value={utmCampaign} onChange={event => setUtmCampaign(event.target.value)}/></label><label>utm_term<input value={utmTerm} onChange={event => setUtmTerm(event.target.value)}/></label><label>utm_content<input value={utmContent} onChange={event => setUtmContent(event.target.value)}/></label></div>}<div className={brazeSendingStyles.formDivider}/><label>One-click list-unsubscribe setting<select value={unsubscribe} onChange={event => setUnsubscribe(event.target.value)}><option>Use workspace default</option><option>Enabled</option><option>Disabled</option></select></label></>}
    </main>
    <aside className={brazeSendingStyles.preview}><h2>{translate(locale, "Preview")}</h2><p><b>From:</b> {currentIdentity.name} &lt;{currentIdentity.address}&gt;</p><div className={brazeSendingStyles.previewFrame}><b>{subject}</b><small>{preheader}</small><p>{draft.body}</p></div><small>Actual rendering may not be identical to this preview depending on the user&apos;s environment</small></aside>
    <footer className={brazeSendingStyles.footer}><button onClick={download}>{translate(locale, "Download file")}</button><button className={brazeSendingStyles.done} disabled={!subject.trim() || saving} onClick={() => void done()}>{translate(locale, saving ? "Saving…" : "Done")}</button></footer>
  </section>;
}
function ChannelCompose({ locale, draft, update, openTest }: { locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest: () => void }) {
  const [copied, setCopied] = useState(false);
  if (draft.channel === "iam") return <InAppCampaignCompose draft={draft} update={update}/>;
  return <div className="editor-body email-compose-page"><EmailCampaignDetails locale={locale} draft={draft} update={update} copied={copied} setCopied={setCopied}/>{draft.channel === "push" ? <PushFields draft={draft} update={update} openTest={openTest}/> : <section className="braze-section channel-workspace"><div className="card-heading"><div><h2>{translate(locale, "Compose")} {translate(locale, channelMeta[draft.channel].title)}</h2><p>{translate(locale, channelMeta[draft.channel].description)}</p></div>{draft.channel !== "webhook" && <button className="secondary" onClick={openTest}>{translate(locale, "Preview and test")}</button>}</div><ChannelFields draft={draft} update={update} openTest={openTest}/></section>}</div>;
}

function CampaignDetails({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  return <div className="channel-details"><Field label="Campaign Name"><input value={draft.name} onChange={event => update({ name: event.target.value })}/></Field><button className="tag-button"><Tags size={14}/> Tags</button></div>;
}

function ChannelFields({ draft, update, openTest = () => {}, notify = () => {} }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest?: () => void; notify?: (m: string) => void }) {
  const channel = draft.channel;
  if (channel === "push") return <PushFields draft={draft} update={update}/>;
  if (channel === "iam") return <InAppFields draft={draft} update={update}/>;
  if (channel === "content") return <ContentCardFields draft={draft} update={update}/>;
  if (channel === "banner") return <BannerFields draft={draft} update={update}/>;
  if (channel === "sms") return <SmsFields draft={draft} update={update}/>;
  if (channel === "webhook") return <WebhookFields draft={draft} update={update} openTest={openTest}/>;
  if (channel === "whatsapp") return <WhatsAppEditor draft={draft} update={update} notify={notify}/>;
  if (channel === "line") return <LineFields draft={draft} update={update}/>;
  if (channel === "multichannel") return <MultichannelFields draft={draft} update={update}/>;
  if (channel === "operator") return <OperatorFields draft={draft} update={update}/>;
  if (channel === "feature") return <FeatureFlagFields draft={draft} update={update}/>;
  return <ApiCampaignFields draft={draft} update={update} notify={notify}/>;
}

function channelValues(draft: Campaign): Record<string, unknown> { return (draft.config?.channelValues ?? {}) as Record<string, unknown>; }
function changeChannel(draft: Campaign, update: (patch: Partial<Campaign>) => void, patch: Record<string, unknown>) { update({ config: { ...draft.config, channelValues: { ...channelValues(draft), ...patch } } }); }
function smsEstimate(message: string) { const unicode = /[^\x00-\x7F]/.test(message); const first = unicode ? 70 : 160; const rest = unicode ? 67 : 153; return { encoding: unicode ? "Unicode" : "GSM-7 estimate", segments: message.length <= first ? 1 : Math.ceil(message.length / rest) }; }

function PushFields({ draft, update, openTest }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest?: () => void }) {
  const values = channelValues(draft);
  const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const [tab, setTab] = useState<"Compose" | "Settings" | "Test">("Compose");
  const [mediaOpen, setMediaOpen] = useState<string | null>(null);
  const [mediaLibrary, setMediaLibrary] = useState<Array<{ id: string; name: string; src: string }>>([]);
  useEffect(() => { if (!mediaOpen) return; void fetch("/api/resources/media").then(r => r.json()).then(d => setMediaLibrary(((d.data ?? []) as Array<{ id: string; name: string; data: { src?: unknown } }>).map(row => ({ id: row.id, name: row.name, src: String(row.data.src ?? "") })).filter(item => item.src))).catch(() => {}); }, [mediaOpen]);
  const [credentials, setCredentials] = useState<{ ios?: string; android?: string }>({});
  useEffect(() => { void fetch("/api/resources/push-settings").then(r => r.json()).then(d => { const record = (d.data ?? [])[0] as { data?: Record<string, unknown> } | undefined; if (record?.data) setCredentials({ ios: String(record.data.iosCredentials ?? ""), android: String(record.data.androidCredentials ?? "") }); }).catch(() => {}); }, []);
  const pushLanguages: string[] = Array.isArray(values.languages) ? values.languages as string[] : ["English"];
  const activePushLanguage = String(values.activeLanguage ?? pushLanguages[0]);
  const pushContentFor = (lang: string) => ((values.contentByLanguage ?? {}) as Record<string, { title?: string; message?: string }>)[lang] ?? {};
  const currentPushContent = pushContentFor(activePushLanguage);
  const setPushContent = (patch: { title?: string; message?: string }) => set({ contentByLanguage: { ...(values.contentByLanguage ?? {}), [activePushLanguage]: { ...currentPushContent, ...patch } } });
  const languagePool = ["English", "Chinese (Simplified)", "Japanese", "Korean", "Spanish"];
  const title = draft.subject ?? ""; const body = draft.body ?? "";
  const media = (key: string, label: string, help: string) => <div className={pushStyles.asset} key={key}><h4>{label}</h4><div className={pushStyles.assetBox}>{values[key] ? <img src={String(values[key])} alt={`${label} preview`}/> : <Image size={27}/>}<span>{values[key] ? "Image selected" : "Drag and drop an image here"}</span><small>{help}</small><div><button type="button" onClick={() => setMediaOpen(mediaOpen === key ? null : key)}>Add from media library</button><label className={pushStyles.upload}>Upload image<input type="file" accept="image/png,image/jpeg,image/gif" onChange={event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => set({ [key]: String(reader.result) }); reader.readAsDataURL(file); }}/></label></div></div>{mediaOpen === key && <div className={pushStyles.mediaPicker}>{mediaLibrary.map(item => <button key={item.id} onClick={() => { set({ [key]: item.src }); setMediaOpen(null); }}>{item.name}</button>)}<button onClick={() => { set({ [key]: "https://placehold.co/800x400/e9e4f4/5632a6?text=Campaign+image" }); setMediaOpen(null); }}>Campaign image</button><button onClick={() => { set({ [key]: "https://placehold.co/400x400/ebeaf1/342b46?text=Brand" }); setMediaOpen(null); }}>Brand image</button></div>}<Field label="Add from URL"><input value={String(values[key] ?? "")} onChange={event => set({ [key]: event.target.value })} placeholder="Paste URL"/></Field></div>;
  return <section className={className("braze-section", pushStyles.compose)}><h2>Compose push notification</h2><div className={pushStyles.warning}>{credentials.ios === "Configured" && credentials.android === "Configured" ? "Push credentials are configured for iOS and Android in Push Settings." : `Push credentials: iOS ${credentials.ios || "missing"} · Android ${credentials.android || "missing"}`} <button type="button" onClick={() => setTab("Settings")}>More Info</button></div>
    <div className={pushStyles.previews}><div><h3>iOS</h3><div className={pushStyles.previewControls}><Field label="Device"><select value={String(values.device ?? "Phone")} onChange={event => set({ device: event.target.value })}><option>Phone</option><option>Tablet</option></select></Field><Field label="Notification State"><select value={String(values.notificationState ?? "Lock screen")} onChange={event => set({ notificationState: event.target.value })}><option>Lock screen</option><option>Notification center</option><option>Banner</option></select></Field></div><div className={pushStyles.phone}><div className={pushStyles.notification}><b>{title || "Title"}</b><p>{body || "Your message will appear here."}</p><small>now</small></div></div></div><div><h3>Android</h3><div className={pushStyles.phone}><div className={pushStyles.notification}><b>{title || "Title"}</b><small>· 9m</small><p>{body || "Your message will appear here."}</p>{Boolean(values.summaryAndroid) && <p>{String(values.summaryAndroid)}</p>}</div></div></div></div><p className={pushStyles.previewNote}>Always test your message on a real device, as actual rendering may vary.</p>
    <div className={pushStyles.tabs} role="tablist">{(["Compose", "Settings", "Test"] as const).map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? pushStyles.active : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === "Compose" && <div className={pushStyles.form}><Field label="Notification type"><select value={String(values.notificationType ?? "Standard push")} onChange={event => set({ notificationType: event.target.value })}><option>Standard push</option><option>Rich push</option></select></Field><h3>Language</h3><div className={className(pushStyles.tabs)} style={{ marginBottom: 10 }}>{pushLanguages.map(lang => <button key={lang} type="button" className={activePushLanguage === lang ? pushStyles.active : ""} onClick={() => set({ activeLanguage: lang })}>{lang}</button>)}{languagePool.some(lang => !pushLanguages.includes(lang)) && <button type="button" onClick={() => { const next = languagePool.find(lang => !pushLanguages.includes(lang)); if (next) set({ languages: [...pushLanguages, next], activeLanguage: next }); }}><Plus size={13}/> Add language</button>}</div>{activePushLanguage !== "English" && <small style={{ color: "#827d8c", display: "block", marginBottom: 8 }}>Content falls back to English when no translation is provided.</small>}<h3>Content{activePushLanguage !== "English" ? ` (${activePushLanguage})` : ""}</h3><Field label="Title"><textarea value={activePushLanguage === "English" ? title : currentPushContent.title ?? ""} onChange={event => activePushLanguage === "English" ? update({ subject: event.target.value }) : setPushContent({ title: event.target.value })} placeholder="Enter notification title"/></Field><Field label="Message"><textarea value={activePushLanguage === "English" ? body : currentPushContent.message ?? ""} onChange={event => activePushLanguage === "English" ? update({ body: event.target.value }) : setPushContent({ message: event.target.value })} placeholder="Enter your message"/><small>{(activePushLanguage === "English" ? body : currentPushContent.message ?? "").length} characters</small></Field><Field label="Summary text (Android) (Optional)"><textarea value={String(values.summaryAndroid ?? "")} onChange={event => set({ summaryAndroid: event.target.value })}/></Field><h3>Interactions</h3><p>Set what happens when a user interacts with a push notification.</p><Field label="On-click behavior"><select value={String(values.clickBehavior ?? "Open app/site")} onChange={event => set({ clickBehavior: event.target.value })}><option>Open app/site</option><option>Deep link</option><option>Open web URL</option><option>None</option></select></Field>{values.clickBehavior === "Deep link" || values.clickBehavior === "Open web URL" ? <Field label="Destination"><input value={String(values.destinationUrl ?? "")} onChange={event => set({ destinationUrl: event.target.value })} placeholder="https:// or app://"/></Field> : null}<label className={pushStyles.check}><input type="checkbox" checked={values.sameForAll !== false} onChange={event => set({ sameForAll: event.target.checked })}/>Same for all platforms</label><h4>Action buttons</h4><label className={pushStyles.check}><input type="checkbox" checked={Boolean(values.allowActions)} onChange={event => set({ allowActions: event.target.checked })}/>Allow users to take actions</label>{Boolean(values.allowActions) && <Field label="Button text"><input value={String(values.buttonText ?? "")} onChange={event => set({ buttonText: event.target.value })} placeholder="Open offer"/></Field>}<h3>Assets</h3>{media("androidIcon", "Push icon image (Android)", "JPG or PNG · 1:1")}{media("iosImage", "iOS notification image", "GIF, JPG, JPEG, or PNG")}{media("androidImage", "Android notification image", "JPG or PNG · 2:1 recommended")}<h3>Sending options</h3><Field label="Push destination"><select value={String(values.pushDestination ?? "All devices")} onChange={event => set({ pushDestination: event.target.value })}><option>All devices</option><option>Most recent device</option></select></Field><Field label="iOS device destinations"><select value={String(values.iosDestinations ?? "All iOS devices")} onChange={event => set({ iosDestinations: event.target.value })}><option>All iOS devices</option><option>Most recent iOS device</option></select></Field><Field label="Android delivery priority"><select value={String(values.androidPriority ?? "Normal")} onChange={event => set({ androidPriority: event.target.value })}><option>Normal</option><option>High</option></select></Field></div>}
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
  const [placements, setPlacements] = useState<string[]>(["home_top", "checkout_promo"]);
  useEffect(() => { void fetch("/api/resources/banner-placements").then(r => r.json()).then(d => { const saved = ((d.data ?? []) as Array<{ data: { placementName?: string } }>).map(row => String(row.data.placementName ?? "")).filter(Boolean); if (saved.length) setPlacements(saved); }).catch(() => {}); }, []);
  return <ChannelPanel title="Banner setup" help="Match a registered SDK placement and render its responsive content."><div className="form-grid"><Field label="Placement"><select value={String(values.placement ?? placements[0])} onChange={event => set({ placement: event.target.value })}>{placements.map(placement => <option key={placement}>{placement}</option>)}</select></Field><Field label="Priority"><select value={String(values.priority ?? "Normal")} onChange={event => set({ priority: event.target.value })}><option>High</option><option>Normal</option><option>Low</option></select></Field></div><Field label="Banner title"><input value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })} placeholder="Banner title"/></Field><Field label="Body"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Banner message"/></Field><Field label="Button label"><input value={String(values.buttonLabel ?? "Learn more")} onChange={event => set({ buttonLabel: event.target.value })}/></Field><Field label="Destination URL"><input value={String(values.destination ?? "")} onChange={event => set({ destination: event.target.value })} placeholder="https://..."/></Field><div className="banner-mini-preview"><b>{draft.subject || "Banner title"}</b><span>{draft.body || "Banner message"}</span><button>{String(values.buttonLabel ?? "Learn more")}</button></div></ChannelPanel>;
}
function SmsFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const type = String(values.messageType ?? "SMS"); const message = draft.body ?? ""; const estimate = smsEstimate(message);
  return <ChannelPanel title="SMS / MMS / RCS" help="Select an approved sender and subscription group before composing."><div className="segmented">{["SMS", "MMS", "RCS"].map(value => <button key={value} className={className(type === value && "selected")} onClick={() => set({ messageType: value })}>{value}</button>)}</div><div className="form-grid"><Field label="Subscription group"><select value={String(values.subscriptionGroup ?? "Promotional messages")} onChange={event => set({ subscriptionGroup: event.target.value })}><option>Promotional messages</option><option>Transactional</option></select></Field><Field label="Sending number"><select value={String(values.sendingNumber ?? "+1 415 555 0100")} onChange={event => set({ sendingNumber: event.target.value })}><option>+1 415 555 0100</option></select></Field></div><Field label="Message"><textarea value={message} onChange={event => update({ body: event.target.value })} placeholder="Write your message"/></Field><small>{message.length} characters · {estimate.encoding} · approximately {estimate.segments} segment{estimate.segments !== 1 ? "s" : ""}</small>{type !== "SMS" && <Field label="Media URL"><input value={String(values.mediaUrl ?? "")} onChange={event => set({ mediaUrl: event.target.value })} placeholder="https://..."/></Field>}<Toggle title="Append STOP instructions" help="Use the workspace opt-out disclosure." value={values.appendStop !== false} onChange={value => set({ appendStop: value })}/></ChannelPanel>;
}
function WebhookFields({ draft, update, openTest }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest: () => void }) {
  return <WebhookEditor draft={draft} update={update} openTest={openTest}/>;
}
function LineFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const flexJson = String(values.flexJson ?? "");
  const flexParsed = useMemo(() => { try { return JSON.parse(flexJson) as { altText?: string; body?: { contents?: Array<{ text?: string }> } }; } catch { return null; } }, [flexJson]);
  return <ChannelPanel title="LINE message" help="Create a message sent through a LINE Official Account."><div className="form-grid"><Field label="Message type"><select value={String(values.messageType ?? "Text")} onChange={event => set({ messageType: event.target.value })}><option>Text</option><option>Image</option><option>Flex message</option></select></Field><Field label="Official Account"><select value={String(values.officialAccount ?? "Demo – Thinkingai")} onChange={event => set({ officialAccount: event.target.value })}><option>Demo – Thinkingai</option></select></Field></div><Field label="Message content"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Write a LINE message"/></Field>{values.messageType === "Image" && <Field label="Image URL"><input value={String(values.imageUrl ?? "")} onChange={event => set({ imageUrl: event.target.value })} placeholder="https://..."/></Field>}{values.messageType === "Flex message" && <><Field label="Flex message JSON"><textarea value={flexJson} onChange={event => set({ flexJson: event.target.value })} className={moduleStyles.mono} style={{ minHeight: 120 }} /></Field>{flexParsed === null ? <p className="form-error">Flex JSON is invalid — fix the syntax to enable the preview.</p> : <div className={moduleStyles.card} style={{ padding: 14 }}><b>{String(flexParsed.altText ?? "Flex message")}</b><div style={{ marginTop: 8, display: "grid", gap: 4 }}>{(flexParsed.body?.contents ?? []).map((item, index) => <span key={index} style={{ fontSize: 12.5 }}>{String(item.text ?? "")}</span>)}</div></div>}</>}<Field label="Action URL"><input value={String(values.actionUrl ?? "")} onChange={event => set({ actionUrl: event.target.value })} placeholder="https://..."/></Field></ChannelPanel>;
}
function MultichannelFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch); const selected = Array.isArray(values.channels) ? values.channels as string[] : ["Email", "Push notification"];
  const toggle = (name: string) => set({ channels: selected.includes(name) ? selected.filter(value => value !== name) : [...selected, name] });
  return <ChannelPanel title="Channel orchestration" help="Define fallback order and message variants for each selected channel."><div className="channel-checks">{["Email", "Push notification", "In-app message", "SMS"].map(name => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)}/>{name}</label>)}</div><Field label="Orchestration rule"><select value={String(values.rule ?? "Send all channels at once")} onChange={event => set({ rule: event.target.value })}><option>Send all channels at once</option><option>Send Push, then Email if not opened</option></select></Field>{selected.map(name => <Field key={name} label={`${name} content`}><textarea value={((values.channelContent ?? {}) as Record<string, string>)[name] ?? ""} onChange={event => set({ channelContent: { ...((values.channelContent ?? {}) as Record<string, string>), [name]: event.target.value } })} placeholder={`Write the ${name.toLowerCase()} message`}/></Field>)}<p className="subtle-note">Each channel above sends its own content; the orchestration rule decides fallback.</p></ChannelPanel>;
}
function OperatorFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const generate = () => {
    const prompt = (draft.body ?? "").toLowerCase();
    const channels: string[] = ["Email"];
    if (/push|notification/.test(prompt)) channels.push("Push notification");
    if (/sms|text message/.test(prompt)) channels.push("SMS");
    if (/whatsapp/.test(prompt)) channels.push("WhatsApp");
    const percent = prompt.match(/(\d{1,2})\s*%/)?.[1];
    const code = prompt.match(/code\s+([a-z0-9]+)/i)?.[1]?.toUpperCase() ?? "WELCOME10";
    const discount = percent ? `${percent}% off` : "10% off";
    const theme = prompt.match(/welcome|back|offer|launch|event/)?.[0] ?? "offer";
    const themes: Record<string, { subject: string; body: string }> = {
      welcome: { subject: `Welcome — here's ${discount}`, body: `Welcome aboard, {{${"${first_name}"} | default: 'there'}}! Use code ${code} for ${discount} on your first order.` },
      back: { subject: `We miss you — ${discount} inside`, body: `It's been a while. Come back and enjoy ${discount} with code ${code}.` },
      launch: { subject: `Just launched: ${discount} for early access`, body: `Be first to try what's new. Code ${code} gives you ${discount} this week.` },
      event: { subject: `You're invited — ${discount} for attendees`, body: `Reserve your seat and use code ${code} for ${discount} on registration.` },
      offer: { subject: `${discount} this month only`, body: `Thanks for being with us. Use code ${code} for ${discount} on your next order.` },
    };
    const chosen = themes[theme] ?? themes.offer;
    const channelContent: Record<string, string> = { Email: chosen.body };
    if (channels.includes("Push notification")) channelContent["Push notification"] = `${chosen.subject} — tap to redeem ${code}.`;
    if (channels.includes("SMS")) channelContent.SMS = `${chosen.subject}. Code ${code}. Reply STOP to opt out.`;
    if (channels.includes("WhatsApp")) channelContent.WhatsApp = `Hi {{${"${first_name}"} | default: 'there'}}! Your code ${code} gives ${discount}.`;
    update({ subject: chosen.subject, body: chosen.body, config: { ...draft.config, channelValues: { ...values, channels, rule: "Send all channels at once", generated: true, generatedFrom: draft.body, channelContent } } });
  };
  return <ChannelPanel title="Create with Operator" help="The local Operator reads your goal, detects channels, discounts and codes, and drafts per-channel copy."><Field label="Campaign goal"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="e.g. Welcome new users with 15% off via push and email, code HELLO15"/></Field><button className="primary" onClick={generate}><Sparkles size={15}/> Generate local plan</button>{Boolean(values.generated) && <div className="subtle-note">Drafted {((values.channels as string[]) ?? ["Email"]).join(", ")} from your goal. Review each channel before launch.</div>}</ChannelPanel>;
}
function FeatureFlagFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  return <ChannelPanel title="Feature flag experiment" help="Set a stable rollout value and measure exposure against a conversion event."><div className="form-grid"><Field label="Flag key"><input value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })} placeholder="new_checkout"/></Field><Field label="Rollout"><input type="number" value={Number(values.rollout ?? 50)} min="0" max="100" onChange={event => set({ rollout: Math.min(100, Math.max(0, Number(event.target.value))) })}/></Field></div><Field label="Variant value"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="{ }"/></Field><Field label="Primary conversion"><select value={draft.conversion ?? "Make Purchase"} onChange={event => update({ conversion: event.target.value })}><option>Make Purchase</option><option>Start Session</option></select></Field></ChannelPanel>;
}
function ApiCampaignFields({ draft, update, notify }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; notify: (m: string) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const [eventUser, setEventUser] = useState("user_1");
  const [eventType, setEventType] = useState("delivered");
  const [eventResult, setEventResult] = useState("");
  const recordEvent = async () => {
    const response = await fetch(`/api/campaigns/${draft.id}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: eventUser, event: eventType }) });
    const payload = await response.json();
    setEventResult(response.ok ? `Recorded ${payload.event} for ${payload.userId}.` : String(payload.error ?? "Recording failed."));
    if (response.ok) notify(`External ${payload.event} event recorded.`);
  };
  return <ChannelPanel title="API campaign" help="Create an identifier used to associate external sends with campaign analytics, then record events sent from your systems."><Field label="Campaign name"><input value={draft.name} onChange={event => update({ name: event.target.value })}/></Field><Field label="API campaign ID"><input value={draft.subject ?? `api_${draft.id}`} onChange={event => update({ subject: event.target.value })}/></Field><Field label="Event mapping"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="Describe how external events map to this campaign"/></Field><div className={moduleStyles.toolbar}><Field label="User ID"><input value={eventUser} onChange={event => setEventUser(event.target.value)} /></Field><Field label="Event"><select value={eventType} onChange={event => setEventType(event.target.value)}><option>sent</option><option>delivered</option><option>opened</option><option>clicked</option><option>conversion</option><option>failed</option></select></Field><button className="primary" style={{ alignSelf: "end" }} onClick={() => void recordEvent()}>Record event</button></div>{eventResult && <small className={moduleStyles.mono}>{eventResult}</small>}<Toggle title="Allow external attribution" help="Accept locally simulated message and conversion events." value={values.externalAttribution !== false} onChange={value => set({ externalAttribution: value })}/></ChannelPanel>;
}
function ChannelPanel({ title, help, children }: { title: string; help: string; children: ReactNode }) { return <section className="channel-panel"><h3>{title}</h3><p>{help}</p>{children}</section>; }

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Schedule({ locale, draft, update }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void }) {
  const delivery = (draft.config?.delivery ?? {}) as Record<string, unknown>;
  const changeDelivery = (patch: Record<string, unknown>) => update({ config: { ...draft.config, delivery: { ...delivery, ...patch } } });
  const mode = draft.schedule === "Action-based" || draft.schedule === "API-triggered" ? draft.schedule : "One time";
  const timing = String(delivery.timing ?? "designated");
  return <div className="editor-body braze-flow"><section className="editor-card"><h2>{translate(locale, "Delivery")}</h2><h3>{translate(locale, "Choose a Type")}</h3>
    <div className="delivery-types">{[["One time", "Scheduled", "Enter users at designated times", CalendarDays], ["Action-based", "Action-Based", "Enter user when they perform actions", MousePointerClick], ["API-triggered", "API-Triggered", "Enter users via API request", Settings]].map(([value, label, help, Icon]) => <button key={value as string} type="button" role="radio" aria-checked={mode === value} className={className("delivery-type", mode === value && "selected")} onClick={() => update({ schedule: value as string })}><span className="delivery-icon"><Icon size={18}/></span><span className="delivery-radio"/><b>{translate(locale, label as string)}</b><small>{translate(locale, help as string)}</small></button>)}</div>
  </section><section className="editor-card"><h2>{translate(locale, mode === "One time" ? "Time-Based Scheduling Options" : mode === "Action-based" ? "Action-Based Scheduling Options" : "API-Triggered Scheduling Options")}</h2>
    {mode === "One time" ? <><div className="timing-choices">{[["now", "Send as soon as Campaign is launched", ""], ["designated", "Send at a designated time", "Choose a time for users to receive this message."], ["intelligent", "Intelligent Timing", "Each user will receive the Campaign at the time they are most likely to engage."]].map(([value, title, help]) => <label key={value} className="timing-choice"><input type="radio" name="delivery-timing" checked={timing === value} onChange={() => changeDelivery({ timing: value })}/><span><b>{translate(locale, title)}</b>{help && <small>{translate(locale, help)}</small>}</span></label>)}</div>{timing === "designated" && <div className="schedule-fields"><Field label={translate(locale, "Entry Frequency")}><select value={String(delivery.frequency ?? "One time")} onChange={event => changeDelivery({ frequency: event.target.value })}><option>One time</option><option>Daily</option><option>Weekly</option><option>Monthly</option></select></Field><div className="form-grid"><Field label={translate(locale, "Start date")}><input type="date" value={String(delivery.startDate ?? "2026-09-17")} onChange={event => changeDelivery({ startDate: event.target.value })}/></Field><Field label={translate(locale, "Send time")}><input type="time" value={String(delivery.sendTime ?? "10:00")} onChange={event => changeDelivery({ sendTime: event.target.value })}/></Field></div><label className="checkline"><input type="checkbox" checked={delivery.timezone === "Recipient local time"} onChange={event => changeDelivery({ timezone: event.target.checked ? "Recipient local time" : "Company time zone (UTC+08:00)" })}/>{translate(locale, "Enter users into this Campaign in their local time zone")}</label></div>}<div className="next-send">{translate(locale, "Next Send Time")}: {timing === "now" ? "As soon as this Campaign is launched." : timing === "designated" && delivery.startDate ? `${String(delivery.startDate)} ${String(delivery.sendTime ?? "10:00")}` : "No upcoming messages scheduled."}</div></> : mode === "Action-based" ? <div className="schedule-fields"><Field label={translate(locale, "Trigger event")}><select value={String(delivery.triggerEvent ?? "Start Session")} onChange={event => changeDelivery({ triggerEvent: event.target.value })}><option>Start Session</option><option>Make Purchase</option><option>Perform Custom Event</option></select></Field><Field label={translate(locale, "Delay in minutes")}><input type="number" min="0" value={Number(delivery.delayMinutes ?? 0)} onChange={event => changeDelivery({ delayMinutes: Number(event.target.value) })}/></Field></div> : <p>{translate(locale, "Enter users via an API request after launching this Campaign.")}</p>}
  </section><section className="editor-card"><h2>{translate(locale, "Delivery Controls")}</h2><p>{translate(locale, "Manage the number of messages your users will receive.")}</p><label className="checkline"><input type="checkbox" checked={Boolean(delivery.reeligible)} onChange={event => changeDelivery({ reeligible: event.target.checked })}/>{translate(locale, "Allow users to become re-eligible to receive campaign")}</label>{Boolean(delivery.reeligible) && <Field label={translate(locale, "Re-eligibility after")}><select value={String(delivery.reentry ?? "7 days")} onChange={event => changeDelivery({ reentry: event.target.value })}><option>1 day</option><option>7 days</option><option>30 days</option></select></Field>}<h3>{translate(locale, "Frequency Capping")}</h3><p>{translate(locale, "You have not created any Frequency Capping rules.")}</p><label className="checkline"><input type="checkbox" checked={Boolean(delivery.quietHours)} onChange={event => changeDelivery({ quietHours: event.target.checked })}/>{translate(locale, "Apply quiet hours")}</label>{Boolean(delivery.quietHours) && <div className="form-grid"><Field label={translate(locale, "Quiet hours start")}><input type="time" value={String(delivery.quietStart ?? "22:00")} onChange={event => changeDelivery({ quietStart: event.target.value })}/></Field><Field label={translate(locale, "Quiet hours end")}><input type="time" value={String(delivery.quietEnd ?? "08:00")} onChange={event => changeDelivery({ quietEnd: event.target.value })}/></Field></div>}</section></div>;
}
function Audience({ locale, draft, update }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void }) {
  const country = typeof draft.config?.audienceCountry === "string" ? draft.config.audienceCountry : "";
  const excludedCountry = typeof draft.config?.audienceExcludeCountry === "string" ? draft.config.audienceExcludeCountry : "";
  const changeAudience = (patch: Record<string, unknown>) => update({ config: { ...draft.config, ...patch } });
  const [estimate, setEstimate] = useState<{ matching: number; reachable: number; total: number } | null>(null);
  const [subscriptionGroups, setSubscriptionGroups] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  const [savedSegments, setSavedSegments] = useState<Array<{ id: string; name: string }>>([]);
  const [lookup, setLookup] = useState("");
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); fetch("/api/subscription-groups?status=Active", { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(result => { if (result?.data) setSubscriptionGroups(result.data); }).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => { const controller = new AbortController(); fetch("/api/resources/segments", { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(result => { if (result?.data) setSavedSegments(result.data); }).catch(() => {}); return () => controller.abort(); }, []);
  const runLookup = async () => {
    if (!lookup.trim()) { setLookupResult("Enter an email or external ID first."); return; }
    try {
      const response = await fetch(`/api/users?q=${encodeURIComponent(lookup.trim())}`);
      const payload = await response.json();
      const match = (payload.data ?? [])[0];
      setLookupResult(match ? `Match: ${match.firstName ?? match.first_name} (${match.id}) · ${match.email} · ${match.subscribed ? "Subscribed" : "Unsubscribed"}` : `No user matches "${lookup.trim()}".`);
    } catch { setLookupResult("User lookup failed."); }
  };
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
  const abVariants = draft.channel === "email" ? emailVariants(draft) : [];
  const variantSplits: number[] = abVariants.length > 1
    ? (Array.isArray(draft.config?.variantSplits) && (draft.config.variantSplits as number[]).length === abVariants.length
        ? draft.config.variantSplits as number[]
        : abVariants.map((_, index) => Math.floor((100 - split) / abVariants.length) + (index === 0 ? (100 - split) % abVariants.length : 0)))
    : [100 - split];
  const changeVariantSplit = (index: number, value: number) => {
    const next = [...variantSplits];
    next[index] = Math.min(100, Math.max(0, value));
    changeAudience({ variantSplits: next });
  };
  const splitOverflow = split + variantSplits.reduce((sum, value) => sum + value, 0) > 100;
  return <div className="editor-body braze-flow"><section className="editor-card"><h2>{translate(locale, "Targeting Options")}</h2><p>{translate(locale, "Target users by choosing multiple segments they must fall into. Further refine your audience by adding additional filters.")}</p>
    <Field label={translate(locale, "Target Users By Segment")}><select className={className("audience-segment-select", draft.audience && draft.audience !== "All Users" && "has-value")} value={draft.audience ?? "All Users"} onChange={event => update({ audience: event.target.value })}><option value="All Users">Search Segments...</option>{savedSegments.length > 0 && <optgroup label="Custom segments">{savedSegments.map(segment => <option key={segment.id} value={segment.name}>{segment.name}</option>)}</optgroup>}<optgroup label="Sample segments">{sampleSegments.map(segment => <option key={segment.id} value={segment.name}>{segment.name}</option>)}</optgroup></select></Field>
    <div className="audience-divider"/><h3>{translate(locale, "Additional Filters")}</h3><div className="braze-filter-group"><div className="braze-filter-head"><b>⠿ &nbsp;Filter group</b><select aria-label="Filter group operator" defaultValue="OR"><option>OR</option><option>AND</option></select></div><div className="braze-filter-content"><select aria-label="Select filter" value={country ? "Country" : ""} onChange={event => changeAudience({ audienceCountry: event.target.value ? "US" : "" })}><option value="">Search filter...</option><option>Country</option></select>{country && <select aria-label="Country" value={country} onChange={event => changeAudience({ audienceCountry: event.target.value })}>{["US", "GB", "CN", "SG", "DE"].map(value => <option key={value}>{value}</option>)}</select>}<button aria-label="Remove filter" disabled={!country} onClick={() => changeAudience({ audienceCountry: "" })}><X size={15}/></button></div></div><div className="filter-actions"><button onClick={() => changeAudience({ audienceCountry: country || "US" })}><Plus size={14}/> {translate(locale, "Add filter group")}</button><button onClick={() => changeAudience({ audienceExcludeCountry: excludedCountry || "US" })}><Plus size={14}/> {translate(locale, "Add exclusion group")}</button></div>{excludedCountry && <div className="exclusion-group"><b>Exclusion group</b><span>Country is {excludedCountry}</span><select aria-label="Exclude country" value={excludedCountry} onChange={event => changeAudience({ audienceExcludeCountry: event.target.value })}>{["US", "GB", "CN", "SG", "DE"].map(value => <option key={value}>{value}</option>)}</select><button onClick={() => changeAudience({ audienceExcludeCountry: "" })}>Remove</button></div>}
    <div className="audience-summary"><h3>{translate(locale, "Audience Summary")}</h3><p>{audienceSummary(draft)}</p></div><div className="audience-summary"><h3>{translate(locale, "User Lookup")}</h3><p>{translate(locale, "Check if a user matches the segment, filter, and app criteria")}</p><div className={className(moduleStyles.toolbar)}><input id="audience-user-lookup" style={{ minHeight: 36, padding: "0 10px", border: "1px solid #d9d5df", borderRadius: 6 }} placeholder={translate(locale, "Search user ID")} value={lookup} onChange={event => setLookup(event.target.value)} onKeyDown={event => event.key === "Enter" && void runLookup()}/><button className="secondary small" onClick={() => void runLookup()}>{translate(locale, "Lookup User")}</button></div>{lookupResult && <small>{lookupResult}</small>}</div>
    {draft.channel === "email" && <table className="audience-provider"><thead><tr><th>Variant</th><th>Domain</th><th>IP Pool</th><th>Sending Provider</th></tr></thead><tbody><tr><td>Variant 1</td><td>mta-h466.bftmail.com</td><td>PLG_IP_Pool</td><td>SparkPost</td></tr></tbody></table>}
    <Field label={translate(locale, "Send to these users:")}><select value={String(draft.config?.subscribeEligibility ?? "subscribed")} onChange={event => changeAudience({ subscribeEligibility: event.target.value })}><option value="subscribed">users who are subscribed or opted in</option><option value="opted-in">users who are opted in</option><option value="all">all users</option></select></Field>{draft.config?.subscribeEligibility !== "all" && <Field label={translate(locale, "Subscription group")}><select value={String(draft.config?.subscriptionGroupId ?? "")} onChange={event => changeAudience({ subscriptionGroupId: event.target.value || undefined })}><option value="">Workspace subscription status</option>{subscriptionGroups.filter(group => draft.channel === "sms" ? group.channel === "SMS" : draft.channel === "whatsapp" ? group.channel === "WhatsApp" : group.channel === "Email").map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></Field>}<label className="checkline"><input type="checkbox" checked={Boolean(draft.config?.limitVolume)} onChange={event => changeAudience({ limitVolume: event.target.checked })}/>{translate(locale, "Limit send volume")}</label>{Boolean(draft.config?.limitVolume) && <Field label={translate(locale, "Maximum users")}><input type="number" min="1" value={Number(draft.config?.maxUsers ?? 100)} onChange={event => changeAudience({ maxUsers: Number(event.target.value) })}/></Field>}<label className="checkline"><input type="checkbox" checked={Boolean(draft.config?.rateLimitEnabled)} onChange={event => changeAudience({ rateLimitEnabled: event.target.checked })}/>{translate(locale, "Limit the rate at which this Campaign will send")}</label>{Boolean(draft.config?.rateLimitEnabled) && <Field label={translate(locale, "Messages per minute")}><input type="number" min="1" value={Number(draft.config?.rateLimit ?? 100)} onChange={event => changeAudience({ rateLimit: Number(event.target.value) })}/></Field>}
  </section><section className="editor-card"><h2>{translate(locale, "A/B Testing")} <small>{translate(locale, "Optimize with BrazeAI™")}</small></h2><p>Set your own variant split and control group. All variants send at the date and time you set in Schedule delivery.</p><div className="split-row"><Field label="% Control Group"><input type="number" min="0" max="100" value={split} onChange={event => changeAudience({ controlGroup: Math.min(100, Math.max(0, Number(event.target.value))) })}/></Field>{abVariants.map((variant, index) => <Field key={variant.id} label={`% ${variant.name}`}><input type="number" min="0" max="100" value={variantSplits[index]} onChange={event => changeVariantSplit(index, Number(event.target.value) || 0)}/></Field>)}{!abVariants.length && <Field label="% Variant 1"><input type="number" readOnly value={100 - split}/></Field>}</div>{splitOverflow && <p className="form-error">Control group and variant percentages exceed 100%.</p>}{abVariants.length > 1 && <button className="inline-link" onClick={() => changeAudience({ variantSplits: abVariants.map((_, index) => Math.floor((100 - split) / abVariants.length) + (index === 0 ? (100 - split) % abVariants.length : 0)) })}>Distribute evenly</button>}<button className="inline-link" onClick={() => changeAudience({ controlGroup: 0 })}>Remove Control Group</button></section><section className="editor-card"><h2>{translate(locale, "Suppression Lists")}</h2><p>{translate(locale, "There are no suppression lists applied")}</p></section><section className="editor-card"><h2>{translate(locale, "Total Population")}</h2><div className="population-grid"><div><h3>{translate(locale, "Exact users")}</h3><strong>{estimate ? formatNumber(locale, estimate.reachable) : "…"}</strong><p>{percentage}% of total users</p><div className="population-bar"><span style={{width: `${percentage}%`}}/></div><small>Calculated from local users</small></div><div><h3>{translate(locale, "Channel breakdown")}</h3><table><tbody><tr><th>{channelMeta[draft.channel].title}</th><td/></tr><tr><td>Reachable Users</td><td>{estimate ? formatNumber(locale, estimate.reachable) : "…"}</td></tr><tr><td>% of Workspace</td><td>{percentage}%</td></tr><tr><td>LTV</td><td>--</td></tr></tbody></table></div></div></section></div>;
}
type ConversionEvent = { type: string; app: string; deadline: number; unit: string };
function conversionEvents(draft: Campaign): ConversionEvent[] {
  const stored = draft.config?.conversionEvents;
  if (Array.isArray(stored)) return stored as ConversionEvent[];
  return [{ type: draft.conversion === "Make Purchase" ? "Makes Purchase" : "Starts Session", app: "Users from all apps", deadline: 3, unit: "Days" }];
}
function Conversions({ locale, draft, update }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void }) {
  const events = conversionEvents(draft);
  const saveEvents = (next: ConversionEvent[]) => update({ conversion: next[0]?.type === "Makes Purchase" ? "Make Purchase" : next[0]?.type === "Starts Session" ? "Start Session" : next[0]?.type ?? "Start Session", config: { ...draft.config, conversionEvents: next } });
  const patchEvent = (index: number, patch: Partial<ConversionEvent>) => saveEvents(events.map((event, i) => i === index ? { ...event, ...patch } : event));
  return <div className="editor-body braze-flow"><section className="editor-card"><h2>{translate(locale, "Assign Conversion Events")}</h2><p>{translate(locale, "Define up to 4 conversion events to track for this Campaign. The conversion events must be assigned during Campaign creation, and cannot be changed once a Campaign has launched.")}</p>
    {events.map((event, index) => <div className="braze-conversion" key={index}><div className="conversion-title"><h3>{index === 0 ? "Primary Conversion Event - A" : `Conversion Event - ${String.fromCharCode(65 + index)}`}</h3><button aria-label="Remove Conversion Event" disabled={events.length === 1} onClick={() => saveEvents(events.filter((_, i) => i !== index))}><X size={16}/></button></div><Field label={translate(locale, "Conversion event type")}><select value={event.type} onChange={e => patchEvent(index, { type: e.target.value })}><option>Starts Session</option><option>Makes Purchase</option><option>Performs Custom Event</option><option>Opens Email</option><option>Clicks Email</option></select></Field><Field label={translate(locale, "Apps and websites targeted")}><select value={event.app} onChange={e => patchEvent(index, { app: e.target.value })}><option>Users from all apps</option><option>Demo – Thinkingai</option><option>Web</option></select></Field><Field label={translate(locale, "Conversion deadline")}><small>{translate(locale, "Define the maximum time that may pass between a user entering a Campaign and the conversion.")}</small><div className="conversion-deadline"><input type="number" min="1" value={event.deadline} onChange={e => patchEvent(index, { deadline: Math.max(1, Number(e.target.value) || 1) })}/><select value={event.unit} onChange={e => patchEvent(index, { unit: e.target.value })}><option>Days</option><option>Hours</option><option>Minutes</option></select></div></Field><div className="deadline-summary"><b>{translate(locale, "Conversion deadline")}:</b> {event.deadline} {event.unit.toLowerCase()}</div></div>)}<button className="secondary small" disabled={events.length >= 4} onClick={() => saveEvents([...events, { type: "Starts Session", app: "Users from all apps", deadline: 3, unit: "Days" }])}><Plus size={15}/> {translate(locale, "Add Conversion Event")}</button>
  </section></div>;
}
function Review({ locale, draft, go, issues }: { locale: Locale; draft: Campaign; go: (step: number) => void; issues: string[] }) {
  const delivery = (draft.config?.delivery ?? {}) as Record<string, unknown>;
  const variants = draft.channel === "email" ? emailVariants(draft) : [];
  const whatsappVariants = draft.channel === "whatsapp" ? normalizeWhatsAppVariants(draft) : [];
  const timing = draft.schedule === "One time" ? String(delivery.timing ?? "designated") === "now" ? "Send as soon as Campaign is launched" : delivery.startDate ? `${String(delivery.startDate)} ${String(delivery.sendTime ?? "10:00")}` : "No upcoming messages scheduled." : draft.schedule;
  return <div className="editor-body braze-review"><h2>{translate(locale, "Review Campaign Summary")}</h2><ReviewReach draft={draft}/>{issues.length > 0 && <div className="review-issues" role="alert"><b>{translate(locale, "Complete before launch")}</b>{issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
    <section className="editor-card"><div className="review-card-head"><h3>{translate(locale, "Messages")}</h3><button onClick={() => go(0)}>{translate(locale, "Edit Messages")}</button></div>{variants.length ? variants.map(variant => <div className="review-variant" key={variant.id}><h3>{variant.name} Preview</h3><div><b>From:</b> {variant.sending?.fromName ?? "Powered by Braze"} &lt;{variant.sending?.fromAddress ?? "braze@mta-h466.bftmail.com"}&gt;</div><div><b>Subject:</b> {variant.subject ?? draft.subject ?? ""}</div><div><b>One-click list-unsubscribe:</b> {variant.sending?.unsubscribe ?? "Use workspace default"}</div><p>{variant.editorMode === "html" ? "HTML Code Editor" : variant.editorMode === "plain" ? "Plain-text Editor" : "Drag-And-Drop Editor"}</p><div className="review-email-preview">{hasRenderableContent(variant.rows ?? []) ? rowsToPlainText(variant.rows ?? []).split("\n").map((line, index) => <div key={index}>{line}</div>) : <div>{variant.body ?? draft.body ?? "Email content has not been added."}</div>}</div></div>) : whatsappVariants.length ? <WhatsAppReview variants={whatsappVariants}/> : <div className="review-variant"><h3>Variant 1 Preview</h3><p>{channelMeta[draft.channel].title}</p><p>{draft.subject}</p><p>{draft.body}</p><ChannelConfigReview draft={draft}/></div>}</section>
    <section className="editor-card"><div className="review-card-head"><h3>{translate(locale, "Delivery")}</h3><button onClick={() => go(1)}>{translate(locale, "Edit Delivery")}</button></div><p>{draft.schedule === "One time" ? "Scheduled Entry" : draft.schedule}</p><p>{draft.schedule === "One time" ? "Enter users at designated times" : "Enter users when the selected trigger occurs"}</p><p><b>Next Send Time:</b> {timing}</p><ul><li>{delivery.reeligible ? "Users can re-enter this campaign" : "Users are not eligible to re-enter this campaign"}</li></ul></section>
    <section className="editor-card"><div className="review-card-head"><h3>{translate(locale, "Target Audience")}</h3><button onClick={() => go(2)}>{translate(locale, "Edit Target Audience")}</button></div><h4>{translate(locale, "Audience Summary")}</h4><p>{audienceSummary(draft)}</p><h4>{translate(locale, "Entry Audience")}</h4><ul><li>{draft.config?.rateLimitEnabled ? `Limited to ${String(draft.config.rateLimit ?? 100)} messages per minute` : "No limitations on the rate at which users will receive messages."}</li><li>Workspace Messaging Rate Limits OFF</li></ul><h4>{translate(locale, "Suppression Lists")}</h4><p>There are no suppression lists applied</p><h4>{translate(locale, "Total Population")}</h4><ReviewAudiencePopulation draft={draft}/></section>
    <section className="editor-card"><div className="review-card-head"><h3>{translate(locale, "Conversion Events")}</h3><button onClick={() => go(3)}>{translate(locale, "Edit Conversion Events")}</button></div>{conversionEvents(draft).map((event, index) => <p key={index}><b>{index === 0 ? "Primary Conversion Event - A" : `Conversion Event - ${String.fromCharCode(65 + index)}`}</b><br/>{event.type === "Starts Session" ? "Started Session" : event.type === "Makes Purchase" ? "Made Purchase" : event.type} within {event.deadline} {event.unit}</p>)}</section>
  </div>;
}
function WhatsAppReview({ variants }: { variants: ReturnType<typeof normalizeWhatsAppVariants> }) {
  return <>{variants.map(variant => {
    const template = getWhatsAppTemplate(variant.templateId);
    return <div className="review-variant" key={variant.id}><h3>{variant.name} Preview</h3><div><b>Message type:</b> {variant.mode === "template" ? "Template message" : "Response message"}</div><div><b>Business account:</b> Thinkingai Demo · +1 415 555 0108</div><div><b>Subscription group:</b> {variant.subscriptionGroup}</div>{variant.mode === "template" ? <><div><b>Template:</b> {template.name} · {template.language}</div><div><b>Approval:</b> {template.status} · {template.category}</div>{variant.headerType === "image" && <div><b>Header media:</b> {variant.headerUrl}</div>}</> : <div><b>Conversation window:</b> {variant.conversationWindowOpen ? "Open (simulated)" : "Closed"} · {variant.responseLayout.replace("_", " ")}</div>}<div className="review-email-preview"><small>Rendered message</small><div>{renderWhatsAppVariant(variant)}</div>{variant.mode === "template" && template.footer && <small>{template.footer}</small>}</div></div>;
  })}</>;
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
function CollectionPage({ title, page, notify, openPage }: { title: string; page: string; notify: (x: string) => void; openPage: (x: string) => void }) { const [rows, setRows] = useState([`${title} default`, `${title} lifecycle`, `${title} production`]); const [query, setQuery] = useState(""); const visible = rows.filter(x => x.toLowerCase().includes(query.toLowerCase())); const kind = page.includes("analytics") || title.includes("Report") || title.includes("Performance") ? "report" : page.includes("settings") || page === "settings" ? "settings" : "resource";
  if (kind === "report") return <ReportPage title={title} notify={notify}/>;
  return <section className="page-content"><div className="page-heading"><div><div className="title-line"><h1>{title}</h1><span className="access-pill">Limited access</span></div><p>{collectionDescription(title)}</p></div><div className="heading-actions"><button className="secondary" onClick={() => notify("Export prepared in the local activity log.")}>Export</button><button className="primary" onClick={() => setRows(r => [`${title} ${r.length + 1}`, ...r])}><Plus size={16}/> Create {singular(title)}</button></div></div>{page === "segments" && <SegmentBuilder notify={notify}/>} {page === "landing-pages" && <LandingPreview/>} {page === "messaging-diagnostics" && <Diagnostics/>} {page === "search-users" && <UserSearch/>} {page === "catalogs" && <CatalogPreview/>} {page === "approval-workflow" && <ApprovalSettings notify={notify}/>} {kind === "settings" && <SettingsPanel title={title} notify={notify}/>}<div className="list-toolbar"><div className="filter-search"><Search size={15}/><input placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={e => setQuery(e.target.value)}/></div><button className="secondary"><Filter size={15}/> Filters</button><button className="secondary"><Grid2X2 size={15}/> Columns</button></div><div className="generic-list">{visible.map((row, i) => <div className="generic-row" key={row}><span className="resource-avatar">{title[0]}</span><div><b>{row}</b><small>{i === 0 ? "Active · Updated just now" : "Draft · Updated Sep 15, 2026"}</small></div><span className="row-detail">{kind === "settings" ? "Workspace default" : i % 2 ? "Lifecycle Marketing" : "Demo – Thinkingai"}</span><button className="icon-button" onClick={() => notify(`${row} was opened in the local demo.`)}><MoreHorizontal size={18}/></button></div>)}</div>{page === "content-calendar" && <CalendarGrid openPage={openPage}/>}</section>; }

function collectionDescription(title: string) { const map: Record<string,string> = { "Segments": "Split your audience into segments to target a specific list of users.", "Feature Flags": "Remotely turn native functionality on or off for a selection of users.", "Landing Pages": "Build standalone web pages that drive conversions and grow your subscriber list.", "Media Library": "Store and reuse images, video, and files across messages.", "Message Activity Log": "Review the local message events created by simulated campaign delivery.", "Custom Attributes": "Manage the custom attributes collected from your users.", "Technology Partners": "Connect Braze to the technologies your team uses." }; return map[title] || `Manage ${title.toLowerCase()} for this workspace.`; }
function singular(title: string) { return title.endsWith("s") ? title.slice(0,-1) : title; }
function ReportPage({ title, notify }: { title:string; notify:(x:string)=>void }) { const [range, setRange] = useState("Last 30 days"); return <section className="page-content"><div className="page-heading"><div><h1>{title}</h1><p>Analyze locally generated delivery and engagement events.</p></div><div className="heading-actions"><select className="date-select" value={range} onChange={e=>setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select><button className="primary" onClick={()=>notify("Report definition saved.")}><Plus size={15}/> Create report</button></div></div><div className="metric-grid">{[["Delivered", "38,420", "+12.4%"],["Engagement", "4,972", "+8.1%"],["Conversions", "1,018", "+5.2%"],["Unsubscribes", "63", "-1.4%"]].map(([label,value,change])=><div className="metric" key={label}><small>{label}</small><b>{value}</b><span>{change}</span></div>)}</div><section className="chart-card"><div><h2>Campaign performance</h2><p>{range} · modeled local event data</p></div><div className="bar-chart">{[34,51,42,72,59,84,68,92,75,100,81,87].map((h,i)=><span key={i} style={{height:`${h}%`}}/>)}</div></section></section>; }
function CanvasPage({ notify }: { notify: (x:string)=>void }) { const [nodes,setNodes] = useState(["Audience entry", "Delay · 1 day", "Email message"]); const [selected,setSelected]=useState(2); return <section className="canvas-page"><div className="page-heading"><div><h1>Canvas</h1><p>Build and simulate a customer journey.</p></div><div className="heading-actions"><button className="secondary" onClick={()=>notify("Canvas saved.")}>Save Draft</button><button className="primary" onClick={()=>notify("Canvas launched. 124 local users entered the journey.")}>Launch Canvas</button></div></div><div className="canvas-shell"><aside><h3>Steps</h3>{["Audience Paths", "Message", "Delay", "Action Paths", "Update User"].map(x=><button key={x} onClick={()=>setNodes(n=>[...n,x])}><Plus size={14}/>{x}</button>)}<hr/><h3>Inspector</h3><p>{nodes[selected] || "Select a node"}</p><label>Step name<input value={nodes[selected] || ""} onChange={e=>setNodes(n=>n.map((x,i)=>i===selected?e.target.value:x))}/></label></aside><div className="journey-canvas"><div className="zoom-control">− &nbsp; 100% &nbsp; +</div>{nodes.map((node,i)=><button key={`${node}-${i}`} className={className("journey-node", selected===i&&"selected")} style={{left:`${110+i*205}px`,top:`${210+(i%2)*84}px`}} onClick={()=>setSelected(i)}>{i>0&&<i/>}{i===0?<Users size={18}/>:i===1?<CalendarDays size={18}/>:<Mail size={18}/>}<span>{node}</span></button>)}</div></div></section>; }
function GettingStarted({ locale, openPage }: { locale: Locale; openPage:(p:string)=>void }) { const [done,setDone]=useState([false,false,false]); const tasks=[["Get to know the Braze dashboard","Explore key features and create your first content.","campaigns"],["Send your first live email campaign","Create a campaign and send a simulated test.","campaigns"],["Scale your strategy","Build a segment and an automated journey.","segments"]]; return <section className="page-content getting"><div className="page-heading"><div><h1>{translate(locale, "Your getting started checklist")}</h1><p>{translate(locale, "Explore Braze features in the demo workspace, then switch into the live workspace to launch a campaign.")}</p></div></div><section className="checklist"><div className="progress-line"><span style={{width:`${done.filter(Boolean).length/3*100}%`}}/></div><b>{formatNumber(locale, done.filter(Boolean).length)} {translate(locale, "of")} 3 {translate(locale, "milestones completed")}</b>{tasks.map(([title,desc,target],i)=><div className="check-item" key={title}><button className={className("task-check",done[i]&&"done")} aria-label={translate(locale, "Toggle milestone")} onClick={()=>setDone(d=>d.map((x,index)=>index===i?!x:x))}>{done[i]&&"✓"}</button><div><h3>{translate(locale, title)}</h3><p>{translate(locale, desc)}</p></div><button className="secondary" onClick={()=>openPage(target)}>{translate(locale, "Begin")}</button></div>)}</section></section>; }
function Performance({ locale, campaigns: _campaigns }: { locale: Locale; campaigns:Campaign[] }) { return <LiveReportPage locale={locale} title="Performance Overview" />; }
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

type Overview = { delivered: number; opened: number; clicked: number; suppressed: number; unreachable: number; deferred?: number; frequency_capped?: number; channels?: Record<string, Record<string, number>>; campaigns?: Array<{ campaign_id: string; name: string; channel: string; delivered: number; opened: number; clicked: number; failed: number }>; series: { date: string; delivered: number }[] };

// Per-report metric subsets and dimension tables so each report shows distinct data.
const reportConfigs: Record<string, { metrics: string[]; note: string; dimension?: "campaigns" | "channels" | "control" | "segments" | "saved" }> = {
  "Performance Overview": { metrics: ["Delivered", "Opened", "Clicked", "Suppressed", "Unreachable"], note: "", dimension: "campaigns" },
  "Email Performance": { metrics: ["Delivered", "Opened", "Clicked", "Suppressed"], note: "Email-channel events only.", dimension: "channels" },
  "Push Performance": { metrics: ["Delivered", "Opened", "Failed"], note: "Push-channel events only.", dimension: "channels" },
  "SMS/MMS/RCS Performance": { metrics: ["Delivered", "Failed", "Suppressed"], note: "SMS-channel events only.", dimension: "channels" },
  "Engagement Reports": { metrics: ["Delivered", "Opened", "Clicked"], note: "Open and click rates relative to deliveries.", dimension: "campaigns" },
  "Conversions": { metrics: ["Delivered", "Clicked"], note: "Click-attributed conversions per campaign.", dimension: "campaigns" },
  "Revenue Report": { metrics: ["Delivered", "Clicked"], note: "Revenue is modeled from click-attributed orders (average order value $86).", dimension: "campaigns" },
  "Global Control Group Report": { metrics: ["Delivered", "Opened", "Clicked"], note: "Treatment deliveries vs. the Global Control Group holdout.", dimension: "control" },
  "Segment Insights": { metrics: ["Delivered", "Opened", "Clicked"], note: "Reachability per sample and custom segment.", dimension: "segments" },
  "Custom Events Report": { metrics: ["Delivered", "Opened", "Clicked", "Failed"], note: "Local message-event type distribution.", dimension: "channels" },
  "Dashboard Builder": { metrics: ["Delivered", "Opened", "Clicked"], note: "Saved report definitions from the Report Builder.", dimension: "saved" },
  "Global Control Group Report ": { metrics: [], note: "", dimension: "control" },
};

function ChannelMetric({ overview, channel, metric }: { overview: Overview | null; channel: string; metric: string }) {
  const bucket = overview?.channels?.[channel] ?? {};
  const key = metric.toLowerCase();
  return Number(bucket[key] ?? 0);
}

function LiveReportPage({ locale, title }: { locale: Locale; title: string }) {
  const [range, setRange] = useState("30");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [gcgPercent, setGcgPercent] = useState(0);
  const [savedReports, setSavedReports] = useState<Array<{ id: string; name: string; data: { metrics?: string[]; range?: string } }>>([]);
  useEffect(() => { void fetch(`/api/reports/overview?days=${range}`).then(response => response.json()).then(setOverview); }, [range]);
  useEffect(() => {
    void fetch("/api/campaigns?limit=1000&status=All&sort=edited").then(r => r.json()).then(d => setCampaigns(d.data ?? []));
    void fetch("/api/resources/global-control-group").then(r => r.json()).then(d => { const record = (d.data ?? [])[0]; if (record) setGcgPercent(Number(record.data.percentage ?? 0)); });
    void fetch("/api/resources/report-builder").then(r => r.json()).then(d => setSavedReports((d.data ?? []).slice(0, 6)));
  }, []);
  const config = reportConfigs[title] ?? { metrics: ["Delivered", "Opened", "Clicked", "Suppressed", "Unreachable"], note: "", dimension: undefined as (typeof reportConfigs)[string]["dimension"] };
  const delivered = overview?.delivered ?? 0; const opened = overview?.opened ?? 0; const clicked = overview?.clicked ?? 0;
  const allValues: Record<string, number> = { Delivered: delivered, Opened: opened, Clicked: clicked, Suppressed: overview?.suppressed ?? 0, Unreachable: overview?.unreachable ?? 0, Failed: overview?.channels ? Object.values(overview.channels).reduce((sum, bucket) => sum + (bucket.failed ?? 0), 0) : 0 };
  const channelFor: Record<string, string> = { "Email Performance": "email", "Push Performance": "push", "SMS/MMS/RCS Performance": "sms" };
  const metricValue = (metric: string) => channelFor[title] ? ChannelMetric({ overview, channel: channelFor[title], metric }) : allValues[metric] ?? 0;
  const metricTotal = channelFor[title] ? ChannelMetric({ overview, channel: channelFor[title], metric: "Delivered" }) || 1 : delivered || 1;
  const max = Math.max(...(overview?.series.map(point => point.delivered) ?? [1]), 1);
  const channelBuckets = Object.entries(overview?.channels ?? {}).filter(([, bucket]) => Object.values(bucket).some(count => count > 0));
  const controlShare = (total: number) => total ? Math.round(total * gcgPercent / 100) : 0;
  return <section className="page-content"><div className="page-heading"><div><h1>{translate(locale, title)}</h1><p>{translate(locale, config.note || "Metrics are calculated from local execution runs and message events.")}</p></div><select className="date-select" value={range} onChange={event => setRange(event.target.value)}><option value="7">{translate(locale, "Last 7 days")}</option><option value="30">{translate(locale, "Last 30 days")}</option><option value="90">{translate(locale, "Last 90 days")}</option></select></div>
    <div className="metric-grid">{config.metrics.map(metric => { const value = metricValue(metric); return <div className="metric" key={metric}><small>{translate(locale, metric)}</small><b>{formatNumber(locale, value)}</b><span>{value ? `${Math.round(value / metricTotal * 100)}% ${translate(locale, "of delivered")}` : translate(locale, "No executions yet")}</span></div>; })}</div>
    <section className="chart-card"><div><h2>{translate(locale, "Delivery runs")}</h2><p>{translate(locale, "Each bar is a completed local Campaign or Canvas execution snapshot.")}</p></div><div className="bar-chart" aria-label={translate(locale, "Delivery run chart")}>{overview?.series.length ? overview.series.map((point, index) => <span key={`${point.date}-${index}`} title={`${formatNumber(locale, point.delivered)} ${translate(locale, "Delivered").toLowerCase()}`} style={{ height: `${Math.max(8, point.delivered / max * 100)}%` }}/>) : <p className="empty-inline">{translate(locale, "Launch a Campaign or Canvas to create report data.")}</p>}</div></section>
    {config.dimension === "campaigns" && <section className="chart-card"><div><h2>Campaign breakdown</h2><p>Top campaigns by deliveries in the selected range.</p></div><div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Channel</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>CTR</th></tr></thead><tbody>{overview?.campaigns?.length ? overview.campaigns.map(row => <tr key={row.campaign_id}><td>{row.name ?? row.campaign_id}</td><td>{row.channel}</td><td>{formatNumber(locale, row.delivered)}</td><td>{formatNumber(locale, row.opened)}</td><td>{formatNumber(locale, row.clicked)}</td><td>{row.delivered ? `${Math.round(row.clicked / row.delivered * 100)}%` : "—"}</td></tr>) : <tr><td colSpan={6}>No campaign activity in this range.</td></tr>}</tbody></table></div></section>}
    {config.dimension === "channels" && <section className="chart-card"><div><h2>Channel comparison</h2><p>Event counts per channel for cross-channel context.</p></div><div className="table-wrap"><table><thead><tr><th>Channel</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Failed</th></tr></thead><tbody>{channelBuckets.length ? channelBuckets.map(([channel, bucket]) => <tr key={channel}><td style={{ textTransform: "capitalize" }}>{channel}</td><td>{formatNumber(locale, bucket.delivered ?? 0)}</td><td>{formatNumber(locale, bucket.opened ?? 0)}</td><td>{formatNumber(locale, bucket.clicked ?? 0)}</td><td>{formatNumber(locale, bucket.failed ?? 0)}</td></tr>) : <tr><td colSpan={5}>No channel events in this range.</td></tr>}</tbody></table></div></section>}
    {config.dimension === "control" && <section className="chart-card"><div><h2>Treatment vs. control</h2><p>Global Control Group holds {gcgPercent}% of the workspace out of campaigns.</p></div><div className="table-wrap"><table><thead><tr><th>Group</th><th>Users</th><th>Expected deliveries</th></tr></thead><tbody>
      <tr><td>Treatment group</td><td>{formatNumber(locale, campaignsWithSends(overview) || 0)}</td><td>{formatNumber(locale, delivered)}</td></tr>
      <tr><td>Global Control Group ({gcgPercent}%)</td><td>{formatNumber(locale, controlShare(1_000))}</td><td>0 (held out)</td></tr>
    </tbody></table></div></section>}
    {config.dimension === "segments" && <SegmentInsightsTable locale={locale} delivered={delivered}/>}
    {config.dimension === "saved" && <section className="chart-card"><div><h2>Saved report definitions</h2><p>Open the Report Builder to edit these.</p></div>{savedReports.length ? <div className="table-wrap"><table><thead><tr><th>Report</th><th>Metrics</th><th>Range</th></tr></thead><tbody>{savedReports.map(report => <tr key={report.id}><td>{report.name}</td><td>{(report.data.metrics ?? []).join(", ")}</td><td>{String(report.data.range ?? "30")}d</td></tr>)}</tbody></table></div> : <p className="empty-inline">No saved reports yet.</p>}</section>}
  </section>;
}

function campaignsWithSends(overview: Overview | null) {
  return overview?.campaigns?.length ?? 0;
}

function SegmentInsightsTable({ locale, delivered }: { locale: Locale; delivered: number }) {
  const [rows, setRows] = useState<Array<{ name: string; matching: number; reachable: number; total: number }>>([]);
  useEffect(() => {
    void (async () => {
      const names = [...new Set([...sampleSegments.map(segment => segment.name), "All Users"])];
      const results = await Promise.all(names.map(name => fetch(`/api/audience/estimate?audience=${encodeURIComponent(name)}`).then(r => r.json()).then(data => ({ name, ...data })).catch(() => ({ name, matching: 0, reachable: 0, total: 0 }))));
      setRows(results);
    })();
  }, []);
  return <section className="chart-card"><div><h2>Segment reach</h2><p>Estimated audience per segment against {formatNumber(locale, delivered)} recent deliveries.</p></div><div className="table-wrap"><table><thead><tr><th>Segment</th><th>Matching</th><th>Reachable</th><th>% of workspace</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{formatNumber(locale, row.matching)}</td><td>{formatNumber(locale, row.reachable)}</td><td>{row.total ? `${Math.round(row.reachable / row.total * 100)}%` : "—"}</td></tr>)}</tbody></table></div></section>;
}

function LiveDemoLab({ locale, notify }: { locale: Locale; notify: (message: string) => void }) {
  const [working, setWorking] = useState<string | null>(null);
  const [state, setState] = useState<{ simulatedTime: string; pendingReceipts: number } | null>(null);
  useEffect(() => { void fetch("/api/demo").then(response => response.json()).then(setState).catch(() => {}); }, []);
  const actions = [["advance", "Advance demo clock", "Move the local demo clock forward by one day"], ["receipts", "Generate delivery receipts", "Write eligible open and click events from completed deliveries"], ["failure", "Inject a failure", "Write a rate-limit failure into the activity log"], ["reset", "Reset sample data", "Restore campaigns, resources, users and local events"]] as const;
  const run = async (action: string) => { setWorking(action); try { const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Demo action failed."); setState(result.state); notify(result.message); } catch (cause) { notify(cause instanceof Error ? cause.message : "Demo action failed."); } finally { setWorking(null); } };
  return <section className="page-content"><div className="page-heading"><div><h1>{translate(locale, "Demo Lab")}</h1><p>{translate(locale, "Control the same SQLite data that powers campaign execution, activity, and reports.")}</p></div></div>{state && <div className="demo-state"><b>{translate(locale, "Demo clock")}: {formatDate(locale, state.simulatedTime, { dateStyle: "medium", timeStyle: "short" })}</b><span>{formatNumber(locale, state.pendingReceipts)} {translate(locale, "deliveries awaiting receipt generation")}</span><small>{translate(locale, "The clock is a local simulation; it does not trigger scheduled campaigns.")}</small></div>}<div className="lab-grid">{actions.map(([action, title, description]) => <button key={action} className="lab-action" disabled={working !== null} onClick={() => void run(action)}><Zap size={20}/><b>{translate(locale, working === action ? "Working…" : title)}</b><small>{translate(locale, description)}</small></button>)}</div></section>;
}

function ActivityLogPage({ locale }: { locale: Locale }) {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [eventType, setEventType] = useState("all");
  const [channel, setChannel] = useState("all");
  const [search, setSearch] = useState("");
  useEffect(() => { void fetch("/api/activity").then(response => response.json()).then(result => setEvents(result.data)); }, []);
  const visible = events.filter(event => (eventType === "all" || event.event_type === eventType) && (channel === "all" || event.channel === channel) && (!search || String(event.campaign_name ?? "").toLowerCase().includes(search.toLowerCase()) || String(event.user_id ?? "").toLowerCase().includes(search.toLowerCase())));
  const detail = (event: Record<string, unknown>) => { try { const data = JSON.parse(String(event.data_json ?? "{}")) as { webhook?: { attempts?: Array<{ statusCode?: number; outcome?: string; error?: string }> } }; const attempt = data.webhook?.attempts?.at(-1); return attempt ? `${attempt.statusCode ?? "—"} ${attempt.outcome ?? ""}${attempt.error ? ` · ${attempt.error}` : ""}` : "—"; } catch { return "—"; } };
  return <section className="page-content"><div className="page-heading"><div><h1>{translate(locale, "Message Activity Log")}</h1><p>{translate(locale, "Local test, delivery, engagement, suppression and failure events.")}</p></div></div><div className="filters"><label>{translate(locale, "Event")}<select value={eventType} onChange={event => setEventType(event.target.value)}><option value="all">All events</option><option value="delivered">Delivered</option><option value="opened">Opened</option><option value="clicked">Clicked</option><option value="failed">Failed</option><option value="suppressed">Suppressed</option><option value="test">Test</option></select></label><label>{translate(locale, "Channel")}<select value={channel} onChange={event => setChannel(event.target.value)}><option value="all">All channels</option><option value="email">Email</option><option value="push">Push</option><option value="iam">In-app message</option><option value="webhook">Webhook</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label><div className="filter-search"><Search size={15}/><input aria-label={translate(locale, "Search")} placeholder={translate(locale, "Search")} value={search} onChange={event => setSearch(event.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>{translate(locale, "Event")}</th><th>{translate(locale, "Campaign")}</th><th>{translate(locale, "Channel")}</th><th>{translate(locale, "User")}</th><th>Response</th><th>{translate(locale, "Timestamp")}</th></tr></thead><tbody>{visible.length ? visible.map(event => <tr key={String(event.id)}><td><span className={className("status", String(event.event_type) === "failed" ? "stopped" : "active")}>{translate(locale, String(event.event_type))}</span></td><td>{String(event.campaign_name ?? event.campaign_id)}</td><td>{translate(locale, String(event.channel))}</td><td>{String(event.user_id)}</td><td className="activity-detail">{detail(event)}</td><td>{formatDate(locale, String(event.created_at), { dateStyle: "medium", timeStyle: "short" })}</td></tr>) : <tr><td colSpan={6}>{translate(locale, "No message events have been recorded.")}</td></tr>}</tbody></table></div></section>;
}

function ModuleWorkspace({ locale, title, page, notify, openPage }: { locale: Locale; title: string; page: string; notify: (message: string) => void; openPage: (page: string) => void }) {
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
  return <section className="page-content module-workspace"><div className="page-heading"><div><div className="title-line"><h1>{translate(locale, title)}</h1><span className="access-pill">{translate(locale, "Limited access")}</span></div><p>{translate(locale, moduleDescription(domain, title))}</p></div><div className="heading-actions"><button className="secondary" onClick={() => void exportResources()}>{translate(locale, "Export")}</button><button className="primary" onClick={() => setCreating(true)}><Plus size={16}/> {translate(locale, "Create")} {translate(locale, singular(title))}</button></div></div><DomainConfiguration locale={locale} domain={domain} page={page} openPage={openPage} notify={notify}/><PersistentResourceList locale={locale} page={page} title={title} notify={notify} creating={creating} setCreating={setCreating}/></section>;
}

function moduleDescription(domain: string, title: string) { const copy: Record<string, string> = { audience: "Define users, subscriptions, eligibility, and audience controls used by local campaign execution.", content: "Manage reusable message content, templates, media, catalogs, and promotion data.", integrations: "Configure local representations of partner connections, data sharing, and delivery logs.", data: "Define the data schema and ingestion inputs that power targeting and personalization.", settings: "Configure workspace defaults, governance, channel settings, and local access controls.", messaging: "Configure message assets, entry rules, and delivery diagnostics." }; return copy[domain] ?? `Manage ${title.toLowerCase()} for this workspace.`; }

function DomainConfiguration({ locale, domain, page, openPage, notify }: { locale: Locale; domain: string; page: string; openPage: (page: string) => void; notify: (message: string) => void }) {
  if (page === "segments") return <section className="domain-config"><h2>{translate(locale, "Segment builder")}</h2><div className="filter-row"><select><option>{translate(locale, "Custom attribute")}</option><option>{translate(locale, "Event")}</option><option>{translate(locale, "Subscription")}</option></select><select><option>country</option><option>lifecycle</option></select><select><option>equals US</option><option>equals Recent Purchasers</option></select></div><div className="audience-meter"><div className="meter-ring"><span>{formatNumber(locale, 1000)}</span></div><b>{translate(locale, "Local users available for estimates")}</b><button className="secondary small" onClick={() => notify(translate(locale, "Segment condition saved to the local workspace."))}>{translate(locale, "Estimate audience")}</button></div></section>;
  if (domain === "content") return <section className="domain-config content-config"><div className="content-thumbnail"/><div><h2>{translate(locale, page === "catalogs" ? "Catalog schema" : "Reusable content")}</h2><p>{translate(locale, page === "catalogs" ? "sku, name, price, image, inventory and custom product fields are available to local Liquid previews." : "Resources created here can be selected by the matching campaign composer.")}</p><button className="secondary small" onClick={() => openPage(page === "catalogs" ? "campaigns" : "email-templates")}>{translate(locale, "Open related workspace")}</button></div></section>;
  if (domain === "integrations") return <section className="domain-config integration-config"><ShieldCheck size={22}/><div><h2>{translate(locale, "Connection status")}</h2><p>{translate(locale, "Local simulation is enabled. Connection tests render a deterministic success or failure result and do not call external systems.")}</p></div><button className="secondary small" onClick={() => notify(translate(locale, "Local connection test succeeded. No external request was sent."))}>{translate(locale, "Test connection")}</button></section>;
  if (domain === "data") return <section className="domain-config"><h2>{translate(locale, "Data definition")}</h2><div className="schema-fields"><span>first_name <i>string</i></span><span>country <i>string</i></span><span>language <i>string</i></span><span>Make Purchase <i>event</i></span></div></section>;
  if (domain === "settings") return <section className="domain-config"><h2>{translate(locale, "Workspace default")}</h2><Toggle title={translate(locale, "Use workspace default")} help={translate(locale, "Apply this setting to new local resources and campaigns.")} checked/><button className="primary small" onClick={() => notify(`${page} saved in local SQLite audit log.`)}>{translate(locale, "Save changes")}</button></section>;
  return <section className="domain-config"><h2>{translate(locale, "Workspace configuration")}</h2><div className="form-grid"><Field label={translate(locale, "Status")}><select><option>{translate(locale, "Active")}</option><option>{translate(locale, "Draft")}</option></select></Field><Field label={translate(locale, "Owner")}><select><option>Lifecycle Marketing</option><option>Growth</option></select></Field></div><button className="secondary small" onClick={() => notify(translate(locale, "Messaging configuration saved."))}>{translate(locale, "Save configuration")}</button></section>;
}

function PersistentResourceList({ locale, page, title, notify, creating, setCreating }: { locale: Locale; page: string; title: string; notify: (message: string) => void; creating: boolean; setCreating: (value: boolean) => void }) {
  const [rows, setRows] = useState<{ id: string; name: string; status: string; description: string; updatedAt: string }[]>([]); const [query, setQuery] = useState(""); const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null); const [editName, setEditName] = useState(""); const [editDescription, setEditDescription] = useState("");
  const load = async () => { const response = await fetch(`/api/resources/${page}?q=${encodeURIComponent(query)}`); if (response.ok) { const result = await response.json(); setRows(result.data); } };
  useEffect(() => { void load(); }, [page, query]);
  const create = async () => { if (!name.trim()) return; const response = await fetch(`/api/resources/${page}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: description.trim() || `Local ${title.toLowerCase()} resource` }) }); if (response.ok) { setName(""); setDescription(""); setCreating(false); await load(); notify(`${title} resource saved to local SQLite.`); } };
  const remove = async (id: string) => { const response = await fetch(`/api/resources/${page}?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (response.ok) { await load(); notify(`${title} resource removed.`); } };
  const beginEdit = (row: { id: string; name: string; description: string }) => { setEditingId(row.id); setEditName(row.name); setEditDescription(row.description); };
  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const response = await fetch(`/api/resources/${page}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, name: editName.trim(), description: editDescription }) });
    if (response.ok) { setEditingId(null); await load(); notify(`${title} resource updated.`); }
  };
  return <section className="resource-workspace"><div className="list-toolbar"><div className="filter-search"><Search size={15}/><input aria-label={translate(locale, "Search")} placeholder={`${translate(locale, "Search")} ${translate(locale, title)}`} value={query} onChange={event => setQuery(event.target.value)}/></div><button className="secondary" onClick={() => setCreating(!creating)}><Plus size={15}/> {translate(locale, "Create")}</button></div>{creating && <div className="resource-create"><input id="resource-name" autoFocus placeholder={`${translate(locale, "Name")} · ${translate(locale, singular(title))}`} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void create(); }}/><input placeholder={translate(locale, "Description")} value={description} onChange={event => setDescription(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void create(); }}/><button className="primary small" onClick={() => void create()}>{translate(locale, "Save")}</button></div>}<div className="resource-cards">{rows.length ? rows.map(row => editingId === row.id ? <article key={row.id} className="resource-editing"><input value={editName} onChange={event => setEditName(event.target.value)} aria-label={translate(locale, "Name")}/><input value={editDescription} onChange={event => setEditDescription(event.target.value)} aria-label={translate(locale, "Description")}/><button className="primary small" onClick={() => void saveEdit()}>{translate(locale, "Save")}</button><button className="secondary small" onClick={() => setEditingId(null)}>{translate(locale, "Cancel")}</button></article> : <article key={row.id}><div className="resource-avatar">{row.name[0]}</div><div><b>{row.name}</b><p>{row.description}</p><small>{translate(locale, row.status)} · {formatDate(locale, row.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</small></div><button className="icon-button" aria-label={translate(locale, "Edit")} onClick={() => beginEdit(row)}><FileCode2 size={17}/></button><button className="icon-button" aria-label={translate(locale, "Archive")} onClick={() => void remove(row.id)}><Trash2 size={18}/></button></article>) : <div className="empty-inline">{translate(locale, "No results found")}</div>}</div></section>;
}
