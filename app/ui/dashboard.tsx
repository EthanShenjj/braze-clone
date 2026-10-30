"use client";

import TagPicker from "./tag-picker";
import FidelityCampaignList from "./campaign-list";
import CampaignAnalytics from "./campaign-analytics";
import CampaignBrief from "./campaign-brief";
import CampaignChannelIcon from "./campaign-channel-icon";
import CampaignOperator from "./campaign-operator";
import { ApiCampaignEditor, FeatureExperimentEditor } from "./special-campaign-editors";
import type { OperatorPlan } from "@/lib/campaign-operator-model";
import { campaignPreviewDraft } from "@/lib/campaign-preview-model";
import { campaignStepIssues } from "@/lib/campaign-progress";
import { resolveConversionEvents, campaignScheduleSummary } from "@/lib/campaign-form-model";
import fidelityStyles from "./campaign-fidelity.module.css";
import { CampaignMessageEditor, CampaignMessagesReview } from "./campaign-message-editor";
import { emailSendingCapabilities } from "@/lib/email-sending-access";
import { emailCustomHeaders, emailExtras, type EmailKeyValue } from "@/lib/email-fidelity-model";
import { EmailAttachments,type EmailAttachment } from "./email-source-tools";
import CampaignSchedule from "./campaign-schedule";
import CampaignTeamPicker from "./campaign-team-picker";
import CampaignConversions from "./campaign-conversions";
import CampaignAudience, { WorkspacePolicySummary, CampaignAudienceStatistics } from "./campaign-audience";
import { multichannelChannels, type MessageDraft } from "@/lib/campaign-shared";
import { campaignVariants, allocation, variantLimit } from "@/lib/campaign-shared";
import { NativeMessagePreview, type TestRequest } from "./message-controls";
import { preservePrimaryEmailDesign } from "@/lib/unlayer-template";
import { SupplementaryWorkspace } from "./workspace-pages";
import AnalyticsWorkspace from "./analytics-workspace";
import TemplateWorkspace from "./template-workspace";
import tagStyles from "./tags.module.css";
import { requestAppNavigation, registerUnsavedNavigation } from "@/lib/unsaved-navigation";
import { useEffect, useMemo, useState, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import emailStarterStyles from "./email-starter.module.css";
import brazeSendingStyles from "./braze-sending.module.css";
import pushStyles from "./push-editor.module.css";
import CanvasWorkspace from "./canvas-workspace";
import LiveUserSearch from "./live-user-search";
import CatalogWorkspace from "./catalog-workspace";
import GlobalControlGroup from "./global-control-group";
import { PreferenceCenterWorkspace, SubscriptionGroupWorkspace } from "./subscription-group-workspace";
import { variantsFor as inAppVariants } from "@/lib/in-app-model";
import InAppSchedule from "./in-app-schedule";
import InAppCampaignCompose from "./in-app-message";
import WebhookEditor from "./webhook-editor";
import WhatsAppEditor from "./whatsapp-editor";
import SmsCampaignComposer from "./sms-editor";
import EmailPreferencesWorkspace from "./email-preferences";
import { emailPreferenceCampaignDefaults, type EmailPreferences } from "@/lib/email-preferences";
import { EmailMessageEditor, EmailTemplateGallery, PersonalizationMenu, TestModal, type EmailCampaignLike } from "./email-dnd-editor";
import moduleStyles from "./module-workspaces.module.css";
import {
  ApisIdentifiersWorkspace, BrandGuidelinesWorkspace, ContentBlocksWorkspace, FrequencyCappingWorkspace, ImportUsersWorkspace,
  LocationsWorkspace, MediaLibraryWorkspace, NotificationsMenu, ProfileMenu, PromotionCodesWorkspace, QueryBuilderWorkspace,
  SegmentExtensionsWorkspace, SegmentsWorkspace, SuppressionListsWorkspace, TagManagementWorkspace,
  TourModal, WorkspaceSearch, field, CustomAttributesWorkspace, CustomEventsWorkspace,
} from "./module-workspaces";
import { emailLocales, hasRenderableContent, rowsToPlainText, type EmailBlock, type EmailRow, type EmailStyle } from "@/lib/email-editor-model";
import { normalizeWebhookVariants } from "@/lib/webhook-model";
import { pageFromPath, pageKeyForDrawerItem, routeForPage } from "@/lib/navigation";
import { campaignValidationIssues } from "@/lib/campaign-validation";
import { formatDate, formatNumber, localeNames, normalizeLocale, supportedLocales, translate, withLocale, type Locale } from "@/lib/i18n";
import { sampleSegments } from "@/lib/sample-segments";
import {
  Activity, ArrowDown, ArrowUp, Bell, Bot, Box, CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Check, CircleHelp, Code2, Copy, Database, Eye, FileCode2, Flag, Filter, Grid2X2, Image,
  Globe2, LayoutDashboard, Languages, LineChart, List, LockKeyhole, Mail, MapPin, MessageCircle, MoreHorizontal,
  MousePointerClick, Plus, Search, Send, Settings, Share2, ShieldCheck, Smartphone,
  Sparkles, Tags, Trash2, Type, Users, Video, Webhook, X, Zap
} from "lucide-react";

type Channel = "email" | "push" | "iam" | "content" | "banner" | "sms" | "webhook" | "whatsapp" | "line" | "multichannel" | "operator" | "feature" | "api";
type CampaignStatus = "Draft" | "Active" | "Stopped" | "Archived" | "Idle";
type Campaign = { id: string; name: string; channel: Channel; status: CampaignStatus; schedule: string; sent: number; edited: string; subject?: string; body?: string; audience?: string; conversion?: string; config?: Record<string, unknown> };
export type EmailEditorMode = "operator" | "drag" | "html" | "plain" | "template";
type EmailSending = { headers?: EmailKeyValue[]; extras?: EmailKeyValue[]; customizeReplyTo?: boolean; preheader: string; whitespace: boolean; replyTo: string; bcc: string; unsubscribe: string; fromName?: string; fromAddress?: string; ipPool?: string; openTracking?: boolean; clickTracking?: boolean; gaEnabled?: boolean; utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string; subjectTranslations?: Record<string, string>; preheaderTranslations?: Record<string, string> };
type EmailVariant = { config?:Record<string,unknown>; id: string; name: string; subject?: string; body?: string; editorMode?: EmailEditorMode; rows?: EmailRow[]; sending?: EmailSending; style?: EmailStyle; editorEngine?: string; grapesProject?: Record<string, unknown>; grapesSchemaVersion?: number; grapesMigration?: Record<string, unknown>; mjml?: string; beefreeJson?: Record<string, unknown>; beefreeVersion?: number; unlayerJson?: Record<string, unknown>; unlayerVersion?: string; unlayerMigration?: Record<string, unknown> };

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
  return <div className="variant-header"><h3>{translate(locale, "Variants")}</h3><div className="real-tabs">{variants.map((item, index) => <button key={item.id} className={className(selected === index && "selected")} onClick={() => onSelect(index)}>{item.name}</button>)}<button className="plus-tab" aria-label={translate(locale, "Add variant")} disabled={variants.length >= variantLimit} onClick={onAdd}><Plus size={16}/></button></div></div>;
}

const nav = [
  { group: "Quick links", items: [["Canvas", "canvas", Grid2X2], ["Campaigns", "campaigns", LayoutDashboard], ["Segments", "segments", Users]] },
  { group: "", items: [["Getting Started", "getting-started", Flag], ["Performance Overview", "performance", LineChart], ["AI Decisioning", "ai-decisioning", Sparkles], ["Agent Console", "agents", Bot], ["Messaging", "messaging", MessageCircle], ["Audience", "audience", Users], ["Content", "content", Box], ["Analytics", "analytics", LineChart], ["Partner Integrations", "partners", Zap], ["Data Settings", "data", Database], ["Settings", "settings", Settings]] }
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
  const navigationApproved = useRef(false);
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => normalizeLocale(searchParams.get("locale")));
  const [page, setPage] = useState(() => pageFromPath(pathname));
  const [drawer, setDrawer] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [createAnchor, setCreateAnchor] = useState<CSSProperties | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [viewing, setViewing] = useState<Campaign | null>(null);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [campaignWorkspaces, setCampaignWorkspaces] = useState<Array<{id:string;name:string;current?:boolean}>>([]);
  const workspaceId=searchParams.get("workspace")??"local";
  const campaignView=searchParams.get("view");
  const [toast, setToast] = useState("");
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const refreshCampaigns = async () => {
    const response = await fetch(`/api/campaigns?${new URLSearchParams({ limit: "1000", status: "All", sort: "edited",includeArchived:"true",workspace:workspaceId })}`);
    if (response.ok) { const result = await response.json(); setCampaigns(result.data); }
  };
  useEffect(() => { void refreshCampaigns(); }, [page,workspaceId]);
  useEffect(()=>{void fetch('/api/campaign-workspaces').then(response=>response.ok?response.json():{data:[]}).then(result=>setCampaignWorkspaces(result.data??[])).catch(()=>{});},[]);
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
    const controller=new AbortController();
    const storedDraft = window.sessionStorage.getItem(`braze:draft:${campaignId}`);
    if (storedDraft) {
      try { setEditing(JSON.parse(storedDraft) as Campaign); } catch { window.sessionStorage.removeItem(`braze:draft:${campaignId}`); }
    }
    void fetch(`/api/campaigns/${campaignId}`,{signal:controller.signal}).then(response => response.ok ? response.json() : null).then(record => {
      if(controller.signal.aborted)return;
      if (record) { if(campaignView==="analytics"){setViewing(record);setEditing(null);}else{setEditing(record);setViewing(null);} window.sessionStorage.removeItem(`braze:draft:${campaignId}`); }
      else if (!storedDraft) { setEditing(null); setToast("Campaign draft could not be found."); }
    }).catch(()=>{if(!controller.signal.aborted)setToast("Campaign could not be loaded.");});
    return ()=>controller.abort();
  }, [pathname,campaignView]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(id); }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(open => !open); }
      if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); setProfileOpen(false); setCreateAnchor(null); setWorkspaceMenu(false); setDrawer(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function openPage(key: string) {
    if (!navigationApproved.current) { requestAppNavigation(() => { navigationApproved.current = true; openPage(key); navigationApproved.current = false; }); return; }
    setCreateAnchor(null); setDrawer(null); setEditing(null); setViewing(null); setPage(key); router.push(`${withLocale(routeForPage(key), locale)}&workspace=${encodeURIComponent(workspaceId)}`);
  }
  function changeLocale(nextLocale: Locale) {
    if (!navigationApproved.current) { requestAppNavigation(() => { navigationApproved.current = true; changeLocale(nextLocale); navigationApproved.current = false; }); return; }
    setLocale(nextLocale);
    const params = new URLSearchParams(searchParams.toString());
    params.set("locale", nextLocale);
    router.replace(`${pathname}?${params.toString()}`);
  }
  function openCampaignChannel(channel: Channel) {
    if (!navigationApproved.current) { requestAppNavigation(() => { navigationApproved.current = true; openCampaignChannel(channel); navigationApproved.current = false; }); return; }
    setCreateAnchor(null); setDrawer(null); setEditing(null); setViewing(null); setPage("campaigns");
    router.push(`${withLocale(routeForPage("campaigns"), locale)}&channel=${encodeURIComponent(channel)}&workspace=${encodeURIComponent(workspaceId)}`);
  }
  async function start(channel: Channel) {
    if (!navigationApproved.current) { requestAppNavigation(() => { navigationApproved.current = true; void start(channel).finally(() => { navigationApproved.current = false; }); }); return; }
    if(channel==='operator'){setCreateAnchor(null);setDrawer(null);setOperatorOpen(true);return;}
    const id = `cmp_${crypto.randomUUID().slice(0, 8)}`;
    const item: Campaign = { id, name: `New Campaign - ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`, channel, status: "Draft", schedule: "One time", sent: 0, edited: new Date().toISOString(), audience: "All Users", conversion: "Start Session",config:{workspaceId} };
    setCreateAnchor(null); setDrawer(null);
    window.sessionStorage.setItem(`braze:draft:${id}`, JSON.stringify(item));
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
    if (!response.ok) { setEditing(item); setToast("Draft is open, but could not be saved yet."); return; }
    const saved = await response.json() as Campaign;
    setCampaigns(current => [saved, ...current.filter(campaign => campaign.id !== saved.id)]);
    setEditing(saved);setViewing(null);
    router.push(withLocale(`/engagement/campaigns/${id}?step=compose&workspace=${encodeURIComponent(workspaceId)}`, locale));
  }
  async function saveCampaign(next: Campaign, publish = false, silent = false) {
    const savedResponse = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!savedResponse.ok) {const error=await savedResponse.json().catch(()=>({}));setToast(error.error??"Unable to save campaign."); return false; }
    const saved = await savedResponse.json() as Campaign;
    if (publish) {
      const launched = await fetch(`/api/campaigns/${saved.id}/launch`, { method: "POST" });
      if (!launched.ok) { setToast("Campaign saved, but launch validation failed."); return false; }
      const result = await launched.json(); setEditing(current=>current?.id===next.id?result.campaign:current); setToast(result.run.queued?`Campaign activated: ${result.run.queued} deliveries queued.`:`Campaign processed: ${result.run.delivered} delivered, ${result.run.accepted??0} accepted, ${result.run.prepared??0} prepared, ${result.run.available??0} available to SDK.`);
    } else { setEditing(current=>current?.id===next.id?saved:current); if (!silent) setToast("Draft saved."); }
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
    const response = await fetch(`/api/campaigns/${campaign.id}/copy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({workspaceId:campaign.config?.workspaceId??workspaceId}) });
    if (!response.ok) { setToast("Unable to duplicate campaign."); return; }
    const saved = await response.json() as Campaign;
    await refreshCampaigns(); openCampaign(saved);
  }
  function openCampaign(campaign: Campaign,forceEdit=false) {
    if (!navigationApproved.current) { requestAppNavigation(() => { navigationApproved.current = true; openCampaign(campaign,forceEdit); navigationApproved.current = false; }); return; }
    if(!campaign.channel){void fetch(`/api/campaigns/${campaign.id}`).then(response=>response.ok?response.json():null).then(record=>record?openCampaign(record,forceEdit):setToast("Campaign could not be found."));return;}
    const details=!forceEdit&&campaign.status!=="Draft";
    setViewing(details?campaign:null);setEditing(details?null:campaign);setPage("campaigns");
    router.push(withLocale(`/engagement/campaigns/${campaign.id}?${details?"view=analytics":"step=compose"}&workspace=${encodeURIComponent(String(campaign.config?.workspaceId??workspaceId))}`, locale));
  }
  async function createOperatorDraft(plan:OperatorPlan) {
    const id=`cmp_${crypto.randomUUID().slice(0,8)}`;
    const item:Campaign={id,name:plan.goal.slice(0,120)||"New Campaign",channel:"multichannel",status:"Draft",schedule:plan.schedule??"One time",sent:0,edited:new Date().toISOString(),audience:plan.audience??"All Users",conversion:"Start Session",config:{workspaceId,channelValues:{channels:plan.channels,rule:"Send all channels at once"},multichannelMessages:plan.messages,operatorGoal:plan.goal,campaignBrief:plan.brief}};
    const response=await fetch('/api/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
    if(!response.ok){const data=await response.json();setToast(data.error??"Could not create the draft.");return false;}
    const saved=await response.json();await refreshCampaigns();setOperatorOpen(false);openCampaign(saved,true);return true;
  }
  function selectCampaignWorkspace(id:string){requestAppNavigation(()=>{setWorkspaceMenu(false);setEditing(null);setViewing(null);setPage("campaigns");router.push(`${withLocale(routeForPage('campaigns'),locale)}&workspace=${encodeURIComponent(id)}`);});}


  return <div className={className("app-shell", (compact || operatorOpen) && "compact", operatorOpen && "operator-open", page === "campaigns" && "campaigns-fidelity-shell", page === "email-preferences" && !editing && "email-preferences-shell", page === "global-control-group" && "global-control-shell")}>
    <aside className="sidebar">
      {page === "campaigns" || page === "email-preferences" ? <button type="button" className="sidebar-collapse" aria-label={compact ? "Expand menu" : "Minimize menu"} aria-expanded={!compact} onClick={() => setCompact(!compact)}>{page === "campaigns" ? <img src="/braze-campaigns/minimize.svg" alt=""/> : <ChevronLeft size={20}/>}</button> : <div className="brand-mark">b</div>}
      <button className="workspace" aria-label="Select workspace" aria-expanded={workspaceMenu} onClick={() => setWorkspaceMenu(!workspaceMenu)}>{page === "campaigns" ? <span className="campaign-workspace-avatar" aria-hidden="true"><img src="/braze-campaigns/brand.svg" alt=""/></span> : <ChevronLeft size={16}/>}<span>{campaignWorkspaces.find(workspace=>workspace.id===workspaceId)?.name??"Demo – Thinkingai"}</span>{page === "campaigns" && <ChevronDown className="campaign-workspace-chevron" size={17}/>}</button>{workspaceMenu&&<div className="campaign-workspace-menu" role="menu">{campaignWorkspaces.map(workspace=><button key={workspace.id} role="menuitemradio" aria-checked={workspace.id===workspaceId} onClick={()=>selectCampaignWorkspace(workspace.id)}>{workspace.name}</button>)}<button role="menuitem" onClick={()=>{setCompact(!compact);setWorkspaceMenu(false);}}>Minimize menu</button></div>}
      <nav className="sidebar-navigation" aria-label="Side navigation">{nav.map(section => <div className="nav-section" key={section.group}>
        {section.group && <span className="nav-caption">{translate(locale, section.group)}</span>}
        {section.items.map(([label, key, Icon]) => <button key={key} aria-label={translate(locale, ["campaigns", "email-preferences"].includes(page) && label === "Performance Overview" ? "Home" : label)} aria-current={page===key?"page":undefined} className={className("nav-item", (page === "campaigns" ? drawer ? drawer === key : key === "messaging" : page === key || drawer === key || key === "settings" && page === "email-preferences") && "active")} onClick={() => key in drawers ? setDrawer(drawer === key ? null : key) : openPage(key)}>{page === "campaigns" ? <img className="campaign-nav-icon" src={`/braze-campaigns/${({canvas:"canvas",campaigns:"campaigns",segments:"segments","getting-started":"getting-started",performance:"home","ai-decisioning":"ai-decisioning",agents:"agent-console",messaging:"messaging",audience:"audience",content:"content",analytics:"analytics",partners:"partners",data:"data",settings:"settings"})[key]}.svg`} alt=""/> : <Icon size={17}/>}<span>{translate(locale, ["campaigns", "email-preferences"].includes(page) && label === "Performance Overview" ? "Home" : label)}</span></button>)}
      </div>)}</nav>
      <div className="brand-word">{page === "campaigns" ? <button type="button" className="campaign-brand-home" aria-label="Home" onClick={()=>openPage("performance")}><img src="/braze-campaigns/brand.svg" alt="Braze"/></button> : ["email-preferences", "global-control-group"].includes(page) ? <img src="/braze-email-preferences/braze-logo.svg" alt="Braze"/> : "braze"}</div>
    </aside>
    <main className="main-area">
      <div className="trial">◷ &nbsp;{translate(locale, "8 days left in your free trial.")} <button>{translate(locale, "Connect with sales")}</button></div>
      <header className="topbar"><button className="search-button" onClick={() => setSearchOpen(true)}><Search size={16}/> {translate(locale, "Search workspace")} <kbd>⌘K</kbd></button><div className="top-actions"><button className="icon-ghost" title={translate(locale, "Take a tour")} onClick={() => setTourOpen(true)}><>{page === "campaigns" ? <img src="/braze-campaigns/support.svg" alt=""/> : <CircleHelp size={18}/>}</></button>{page === "campaigns" ? <span className="campaign-community" title="Community"><img src="/braze-campaigns/community.svg" alt="Community"/></span> : <Users size={18}/>} <span className="language-menu"><button className="icon-ghost" aria-label={translate(locale, "Language")} aria-expanded={languageOpen} onClick={() => setLanguageOpen(!languageOpen)}><>{page === "campaigns" ? <img src="/braze-campaigns/language.svg" alt=""/> : <Globe2 size={18}/>}</></button>{languageOpen && <div role="menu" aria-label="Language">{supportedLocales.map(value => <button role="menuitemradio" aria-checked={locale === value} key={value} onClick={() => { changeLocale(value); setLanguageOpen(false); }}>{localeNames[value]}</button>)}</div>}</span><span className="anchor"><button className="icon-ghost" aria-label="Notifications" onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }}><>{page === "campaigns" ? <img src="/braze-campaigns/notifications.svg" alt=""/> : <Bell size={18}/>}</></button><NotificationsMenu locale={locale} open={notificationsOpen} onClose={() => setNotificationsOpen(false)} openPage={openPage}/></span><span className="anchor"><button className="profile" aria-label="Profile" aria-expanded={profileOpen} onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }}>{page === "campaigns" ? <img src="/braze-campaigns/profile.svg" alt=""/> : "S"}</button><ProfileMenu locale={locale} open={profileOpen} onClose={() => setProfileOpen(false)} notify={setToast} openPage={openPage}/><ChevronDown size={17}/></span><button className="operator-trigger" aria-label="Open BrazeAI Operator" onClick={() => setOperatorOpen(!operatorOpen)}><>{page === "campaigns" ? <img src="/braze-campaigns/operator.svg" alt=""/> : <Sparkles size={17}/>}</></button></div></header>
      {!['catalogs', 'global-control-group'].includes(page) && <div className="page-tabs"><button className={className("page-tab", !editing && !viewing && "selected")} onClick={() => openPage(editing||viewing ? "campaigns" : page)}>{editing||viewing ? translate(locale, "Campaigns") : translate(locale, page === "performance" ? "Performance Overview" : page === "agents" ? "Agent Console" : page === "partners" ? "Partner Integrations" : page === "data" ? "Data Settings" : titleFrom(page))}</button>{(editing||viewing) && <button className="page-tab selected">{viewing?"Details for":translate(locale, "Edit")} '{(editing??viewing)?.name}' <X size={14} onClick={() => openPage("campaigns")}/></button>}</div>}
      {viewing ? <CampaignAnalytics campaign={viewing} onEdit={()=>openCampaign(viewing,true)} onRefresh={()=>void refreshCampaigns()} notify={setToast}/> : editing ? <CampaignEditor locale={locale} key={editing.id} campaign={editing} onSave={saveCampaign} onClose={() => openPage("campaigns")} notify={setToast}/> : <PageContent onRefresh={refreshCampaigns} locale={locale} page={page} campaigns={campaigns} openPage={openPage} onEdit={openCampaign} onCreate={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setCreateAnchor({ position: "fixed", top: rect.bottom + 6, left: Math.max(16, rect.right - 325), zIndex: 61 }); }} onStop={stopCampaign} onArchive={archiveCampaign} onDuplicate={duplicateCampaign} notify={setToast} onTour={() => setTourOpen(true)} />}
    </main>
    {drawer && <NavigationDrawer locale={locale} name={titleFrom(drawer)} items={drawers[drawer]} activePage={page} close={() => setDrawer(null)} open={openPage} openCampaignChannel={openCampaignChannel} />}
    {createAnchor && <CreateMenu locale={locale} anchor={createAnchor} campaigns={campaigns} start={start} close={() => setCreateAnchor(null)} />}
    {operatorOpen && <CampaignOperator key={workspaceId} close={() => setOperatorOpen(false)} createDraft={createOperatorDraft} />}
    {searchOpen && <WorkspaceSearch locale={locale} open onClose={() => setSearchOpen(false)} openPage={openPage} openCampaign={(id, name) => openCampaign({ id, name } as Campaign)}/>}
    {tourOpen && <TourModal open locale={locale} onClose={() => setTourOpen(false)}/>}
    {toast && <div className="toast"><ShieldCheck size={18}/><span>{translate(locale, toast)}</span><button aria-label={translate(locale, "Close")} onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>;
}

function NavigationDrawer({ locale, name, items, activePage, close, open, openCampaignChannel }: { locale: Locale; name: string; items: string[]; activePage: string; close: () => void; open: (page: string) => void; openCampaignChannel: (channel: Channel) => void }) {
  const [channelsOpen, setChannelsOpen] = useState(false);
  const channels: Channel[] = ["multichannel", "email", "iam", "push", "banner", "content", "sms", "webhook", "whatsapp", "line"];
  return <div className="drawer-backdrop" onMouseDown={close}><section className="nav-drawer" onMouseDown={e => e.stopPropagation()}><header><h2>{translate(locale, name)}</h2><button type="button" aria-label={translate(locale, "Close navigation")} onClick={close}><X size={18}/></button></header><div className="drawer-list">{items.map((item, index) => { const key = pageKeyForDrawerItem(item); return <div key={item}><button type="button" aria-current={activePage === key ? "page" : undefined} onClick={() => open(key)}><span className="drawer-icon">{item==="Campaigns"?<CampaignChannelIcon channel="campaign" size={34}/>:index % 3 === 0 ? <Grid2X2 size={18}/> : index % 3 === 1 ? <Activity size={18}/> : <Settings size={18}/>}</span><span><b>{translate(locale, item)}</b><small>{translate(locale, drawerDescription(item))}</small></span><ChevronRight size={16}/></button>{name === "Messaging" && item === "Campaigns" && <div className="drawer-channel-group"><button type="button" className="drawer-channel-toggle" aria-expanded={channelsOpen} onClick={() => setChannelsOpen(!channelsOpen)}>{translate(locale, channelsOpen?"Hide by channel":"View by channel")} <ChevronDown size={14} className={channelsOpen ? "open" : ""}/></button>{channelsOpen && <div className="drawer-channel-list">{channels.map(channel => <button type="button" key={channel} onClick={() => openCampaignChannel(channel)}><CampaignChannelIcon channel={channel}/>{translate(locale, channel==="iam"?"In-App Message":channel==="push"?"Push Notification":channelMeta[channel].title)}</button>)}</div>}</div>}</div>; })}</div></section></div>;
}

function drawerDescription(name: string) {
  const descriptions: Record<string, string> = { "Campaigns":"Manage existing campaigns or create a new one. Recommended for single messages.", "Content Calendar": "View upcoming scheduled campaigns and related analytics", "Messaging Diagnostics": "Troubleshoot why messages did not send", "Segments": "Split your audience into targeted groups", "Catalogs": "Manage non-user data such as products", "Report Builder": "Build and save performance reports", "Email Preferences": "Manage sending and subscription settings" };
  return descriptions[name] || "Manage this area for this workspace";
}

function CreateMenu({ locale, anchor, campaigns, start, close }: { locale: Locale; anchor: CSSProperties; campaigns:Campaign[]; start: (channel: Channel) => void; close: () => void }) {
  const standard: Channel[] = ["email", "push", "iam", "content", "banner", "sms", "webhook", "whatsapp", "line"];
  return <div className="create-popover-layer" style={{ position: "fixed", inset: 0, zIndex: 60 }} onMouseDown={close}><section className="create-menu" style={{...anchor,maxHeight:`min(374px, calc(100dvh - ${Number(anchor.top??120)+16}px))`,overflowY:"auto",overscrollBehavior:"contain"}} onMouseDown={e => e.stopPropagation()}><button className="create-option operator-option" onClick={() => start("operator")}><Sparkles size={17}/><span><b>{translate(locale, "Create with Operator")}</b></span></button><p>{translate(locale, "MESSAGE ONE OR MORE CHANNELS")}</p><button className="create-option" onClick={() => start("multichannel")}><span><b>{translate(locale, "Multichannel")}</b></span></button><p>{translate(locale, "SINGLE CHANNEL")}</p>{standard.map(channel => { const meta = channelMeta[channel]; return <button className="create-option" key={channel} onClick={() => start(channel)}><span><b>{translate(locale, meta.title)}</b><small>{channel === "iam" ? `(${campaigns.filter(c=>c.channel===channel&&c.status==="Active").length} / 200 ${translate(locale, "Active").toLowerCase()})` : channel === "content" ? `(${campaigns.filter(c=>c.channel===channel&&c.status==="Active").length} / 500 ${translate(locale, "Active").toLowerCase()})` : channel === "banner" ? `(${campaigns.filter(c=>c.channel===channel&&c.status==="Active").length} / 200 ${translate(locale, "Active").toLowerCase()})` : ""}</small></span></button>; })}<p>{translate(locale, "FEATURE FLAGS")}</p><button className="create-option" onClick={() => start("feature")}><span><b>{translate(locale, "Feature flag experiment")}</b><small>({campaigns.filter(c=>c.channel==="feature"&&c.status==="Active").length} / 1 {translate(locale, "Active").toLowerCase()})</small></span></button><p>{translate(locale, "TRACK MESSAGES SENT VIA API")}</p><button className="create-option" onClick={() => start("api")}><span><b>{translate(locale, "API campaign")}</b></span></button></section></div>;
}

function Operator({ locale, close, start }: { locale: Locale; close: () => void; start: (channel: Channel) => void }) {
  const [prompt, setPrompt] = useState("");
  return <aside className="operator"><header><h2><Sparkles size={16}/> BrazeAI Operator™</h2><button aria-label={translate(locale, "Close")} onClick={close}><X size={17}/></button></header><div className="operator-chat">{translate(locale, "What kind of campaign would you like to create?")}</div><div className="operator-chat">{translate(locale, "I can choose channels, draft copy, and configure targeting for a local campaign draft.")}</div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={translate(locale, "Ask Operator to create a campaign…")}/><button className="primary" style={{marginTop:10,width:"100%"}} onClick={() => { start("operator"); }}>{translate(locale, "Generate campaign plan")}</button></aside>;
}

function PageContent({ onRefresh, locale, page, campaigns, openPage, onEdit, onCreate, onStop, onArchive, onDuplicate, notify, onTour }: { onRefresh: () => Promise<void>; locale: Locale; page: string; campaigns: Campaign[]; openPage: (p: string) => void; onEdit: (c: Campaign) => void; onCreate: (event: ReactMouseEvent<HTMLButtonElement>) => void; onStop: (id: string) => void; onArchive: (id: string) => Promise<boolean>; onDuplicate: (campaign: Campaign) => Promise<void>; notify: (m: string) => void; onTour: () => void }) {
  if (page === "campaigns") return <FidelityCampaignList onRefresh={onRefresh} locale={locale} campaigns={campaigns} onEdit={onEdit} onCreate={onCreate} onStop={onStop} onArchive={onArchive} onDuplicate={onDuplicate} onTour={onTour} notify={notify}/>;
  if (page === "canvas") return <CanvasWorkspace locale={locale} notify={notify}/>;
  if (page === "demo-lab") return <LiveDemoLab locale={locale} notify={notify}/>;
  if (page === "segments") return <SegmentsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "segment-extensions") return <SegmentExtensionsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "suppression-lists") return <SuppressionListsWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "media-library") return <MediaLibraryWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "promotion-codes") return <PromotionCodesWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "brand-guidelines") return <BrandGuidelinesWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "query-builder") return <QueryBuilderWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "frequency-capping-rules") return <FrequencyCappingWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "tag-management") return <TagManagementWorkspace key={page} locale={locale} notify={notify}/>;
  if (page === "custom-attributes") return <CustomAttributesWorkspace key={page} locale={locale}/>;
  if (page === "email-preferences") return <EmailPreferencesWorkspace notify={notify}/>;
  if (["report-builder", "custom-events-report", "global-control-group-report", "engagement-reports", "revenue-report", "segment-insights", "dashboard-builder", "email-performance", "push-performance", "sms-mms-rcs-performance", "conversions"].includes(page)) return <AnalyticsWorkspace key={page} page={page} notify={notify}/>;
  if (page === "search-users") return <LiveUserSearch locale={locale} notify={notify}/>;
  if (page === "global-control-group") return <GlobalControlGroup locale={locale} notify={notify}/>;
  if (page === "catalogs") return <CatalogWorkspace locale={locale} notify={notify}/>;
  if (page === "subscription-group-management") return <SubscriptionGroupWorkspace locale={locale} notify={notify}/>;
  if (page === "email-preference-centers") return <PreferenceCenterWorkspace locale={locale} notify={notify}/>;
  if (["email-templates", "push-templates", "in-app-message-templates", "webhook-templates", "canvas-templates", "banner-templates", "email-link-templates"].includes(page)) return <TemplateWorkspace key={page} locale={locale} notify={notify} page={page}/>;
  return <SupplementaryWorkspace key={page} page={page} notify={notify} openPage={openPage}/>;
}

function CampaignEditor({ locale, campaign, onSave, onClose, notify = () => {} }: { locale: Locale; campaign: Campaign; onSave: (c: Campaign, publish?: boolean, silent?: boolean) => Promise<boolean>; onClose: () => void; notify?: (message: string) => void }) {
  const [draft, setDraft] = useState(campaign); const [step, setStep] = useState(0); const [variant, setVariant] = useState(0); const [testOpen, setTestOpen] = useState(false); const [testRequest,setTestRequest]=useState<TestRequest>({});
  const draftRef=useRef(draft);draftRef.current=draft;
  const editorText = (text: string) => locale === "zh-CN" && campaign.channel === "iam" ? ({ "Schedule Delivery": "安排交付", "Assign Conversions": "分配转换", "Review Summary": "审查摘要", "Limited access": "访问受限", "Schedule": "日程", "Review": "审查" } as Record<string, string>)[text] ?? translate(locale, text) : translate(locale, text);
  const steps = ["Compose Messages", "Schedule Delivery", "Target Audiences", "Assign Conversions", "Review Summary"];
  // config is shallow-merged so concurrent editors (e.g. a template submission
  // followed by a variant patch) never drop each other's keys.
  const update = (patch: Partial<Campaign>) => setDraft(d => { const next={ ...d, ...patch, config: patch.config ? { ...d.config, ...patch.config } : d.config }; const before=campaignVariants(d).length,count=campaignVariants(next).length; if(before!==count)next.config={...next.config,variantSplits:Array.from({length:count},()=>(100-Number(next.config?.controlGroup??20))/count)}; draftRef.current=next;return next; });
  const launchIssues = campaignValidationIssues(draft);
  const saveMessage = async (patch: Partial<Campaign>) => {
    const current=draftRef.current;
    const next = { ...current, ...patch, config:patch.config?{...current.config,...patch.config}:current.config };
    draftRef.current=next;
    setDraft(next);
    const ok=await onSave(next);if(ok)setAutosaveBaseline(JSON.stringify(next));return ok;
  };
  // Autosave: non-email channels have no per-editor save flow, so persist drafts quietly as they change.
  const [autosaveBaseline, setAutosaveBaseline] = useState(() => JSON.stringify(campaign));
  useEffect(() => {
    const serialized = JSON.stringify(draft);
    if (serialized === autosaveBaseline) return;
    const timer = window.setTimeout(() => { void onSave(draft, false, true).then(ok => { if(ok)setAutosaveBaseline(serialized);else notify("Autosave failed — use Save Draft."); }); }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, autosaveBaseline, onSave, notify]);
  useEffect(()=>{
    if(JSON.stringify(draft)===autosaveBaseline)return;
    const release=registerUnsavedNavigation(action=>{const current=draftRef.current;void onSave(current,false,true).then(ok=>{if(ok){setAutosaveBaseline(JSON.stringify(current));action();}else notify("Save failed. Your changes remain open.");});});
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",unload);return()=>{release();window.removeEventListener("beforeunload",unload);};
  },[draft,autosaveBaseline,onSave,notify]);
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
  const stepIssues=campaignStepIssues(draft);
  const limitedAccess=draft.config?.access!=="full";
  if(draft.channel==="api")return <ApiCampaignEditor campaign={draft} locale={locale} onSave={async patch=>saveMessage(patch as Partial<Campaign>)} onClose={onClose} notify={notify}/>;
  if(draft.channel==="feature")return <FeatureExperimentEditor campaign={draft} locale={locale} onSave={async patch=>saveMessage(patch as Partial<Campaign>)} onClose={onClose} notify={notify}/>;
  const ChannelIcon = channelMeta[draft.channel].icon;
  return <section className={className("editor-page", draft.channel === "sms" && "sms-editor-page", draft.channel === "iam" && step === 1 && "iam-delivery-editor")}>
    <div className="editor-access"><LockKeyhole size={11}/> {limitedAccess?editorText("Limited access"):"Full access"}</div>
    <nav className="editor-steps" aria-label={translate(locale, "Campaign steps")}>{steps.map((item, i) => <button key={item} className={className("editor-step", step === i && "current", i<4 && !stepIssues[i].length && "complete", step>i && Boolean(stepIssues[i].length) && "invalid")} onClick={() => goToStep(i)}><span>{i<4&&!stepIssues[i].length ? "✓" : i + 1}</span><b>{editorText(item)}</b></button>)}</nav>
    {step === 0 && (
      <Compose locale={locale} draft={draft} update={update} saveEmail={saveMessage} variant={variant} setVariant={setVariant} openTest={request => { setTestRequest(request??{}); void saveMessage({}).then(ok => { if (ok) setTestOpen(true); }); }}/>
    )}
    {step === 1 && <Schedule locale={locale} draft={draft} update={update}/>}
    {step === 2 && <Audience locale={locale} draft={draft} update={update}/>}
    {step === 3 && <Conversions locale={locale} draft={draft} update={update}/>}
    {step === 4 && <Review locale={locale} draft={draft} go={goToStep} issues={launchIssues}/>}
    <footer className="editor-footer">
      <button className="footer-arrow" aria-label={translate(locale, "Back")} disabled={step === 0} onClick={() => goToStep(step - 1)}><ChevronLeft size={17}/></button>
      <div className="editor-footer-steps">{["Compose", "Schedule", "Target", "Assign", "Review"].map((name, i) => <button key={name} className={className("footer-step", step === i && "current", i<4 && !stepIssues[i].length && "complete", step>i && Boolean(stepIssues[i].length) && "invalid")} onClick={() => goToStep(i)}><span>{i<4&&!stepIssues[i].length ? "✓" : i + 1}</span>{editorText(name)}</button>)}</div>
      <button className="footer-arrow" aria-label={translate(locale, "Forward")} disabled={step === steps.length - 1} onClick={() => goToStep(step + 1)}><ChevronRight size={17}/></button>
      <button className="footer-save" onClick={() => void saveMessage({})}>{translate(locale, "Save Draft")}</button>
      {step === 4 && !limitedAccess && <button className="primary footer-launch" disabled={Boolean(launchIssues.length) || draft.status === "Active"} onClick={() => void onSave(draft, true)}>{translate(locale, draft.status === "Active" ? "Campaign Active" : "Launch Campaign")}</button>}
    </footer>
    {testOpen && <TestModal locale={locale} draft={campaignPreviewDraft(draft)} variantIndex={variant} initialRecipient={testRequest.recipient} initialVariantId={testRequest.variantId} close={() => setTestOpen(false)}/>}
    <button className="editor-close-shortcut" onClick={onClose}>{translate(locale, "Close editor")}</button>
  </section>
}

function Compose({ locale, draft, update, saveEmail, variant, setVariant, openTest, notify = () => {} }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void; saveEmail: (p: Partial<Campaign>) => Promise<boolean>; variant: number; setVariant: (x: number) => void; openTest: (request?: TestRequest) => void; notify?: (message: string) => void }) {
  const channel = draft.channel;
  if (channel === "email") return <EmailCompose locale={locale} draft={draft} update={update} saveEmail={saveEmail} variant={variant} setVariant={setVariant} openTest={openTest}/>;
  return <ChannelCompose locale={locale} draft={draft} update={update} saveCampaign={saveEmail} openTest={openTest} notify={notify}/>;
}

function ChannelCompose({ locale, draft, update, openTest, saveCampaign, notify = () => {} }: { saveCampaign: (patch: Partial<Campaign>) => Promise<boolean>; locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest: (request?: TestRequest) => void; notify?: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  if (draft.channel === "iam") return <div className="editor-body email-compose-page"><InAppCampaignCompose draft={draft} update={update} saveCampaign={saveCampaign} notify={notify}/></div>;
  if (draft.channel === "sms") return <div className="editor-body email-compose-page"><EmailCampaignDetails locale={locale} draft={draft} update={update} copied={copied} setCopied={setCopied}/><SmsCampaignComposer draft={draft} update={update} openTest={openTest}/></div>;
  return <div className="editor-body email-compose-page"><EmailCampaignDetails locale={locale} draft={draft} update={update} copied={copied} setCopied={setCopied}/>{draft.channel === "push" ? <CampaignMessageEditor draft={draft} update={patch=>update(patch as Partial<Campaign>)} openTest={openTest}/> : <section className="braze-section channel-workspace"><div className="card-heading"><div><h2>{translate(locale, "Compose")} {translate(locale, channelMeta[draft.channel].title)}</h2>{draft.channel !== "whatsapp" && <p>{translate(locale, channelMeta[draft.channel].description)}</p>}</div>{draft.channel !== "webhook" && <button disabled={["multichannel","operator"].includes(draft.channel)&&!((channelValues(draft).channels as unknown[]|undefined)?.length)} className="secondary" onClick={()=>openTest?.()}>{translate(locale, "Preview and test")}</button>}</div><ChannelFields locale={locale} draft={draft} update={update} saveCampaign={saveCampaign} openTest={openTest} notify={notify}/></section>}</div>;
}

function EmailCompose({ locale, draft, update, saveEmail, variant, setVariant, openTest }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void; saveEmail: (p: Partial<Campaign>) => Promise<boolean>; variant: number; setVariant: (x: number) => void; openTest: (request?: TestRequest) => void }) {
  const variants = emailVariants(draft);
  const current = variants[variant] ?? variants[0];
  const currentSubject = current.subject ?? (variant === 0 ? draft.subject : undefined);
  const currentBody = current.body ?? (variant === 0 ? draft.body : undefined);
  const savedEditorMode = current.editorMode ?? (variant === 0 ? draft.config?.emailEditorMode as EmailEditorMode | undefined : undefined);
  const savedRows = current.rows ?? (variant === 0 && Array.isArray(draft.config?.emailRows) ? draft.config.emailRows as EmailRow[] : []);
  const savedStyle = current.style ?? (variant === 0 ? draft.config?.emailStyle as EmailStyle | undefined : undefined);
  const savedSending = current.sending ?? (variant === 0 ? draft.config?.emailSending as EmailSending | undefined : undefined);
  const savedEditorEngine = current.editorEngine ?? (variant === 0 ? draft.config?.emailEditorEngine as string | undefined : undefined);
  const savedGrapesProject = current.grapesProject ?? (variant === 0 ? draft.config?.emailGrapesProject as Record<string, unknown> | undefined : undefined);
  const savedGrapesSchemaVersion = current.grapesSchemaVersion ?? (variant === 0 ? draft.config?.emailGrapesSchemaVersion as number | undefined : undefined);
  const savedGrapesMigration = current.grapesMigration ?? (variant === 0 ? draft.config?.emailGrapesMigration as Record<string, unknown> | undefined : undefined);
  const savedMjml = current.mjml ?? (variant === 0 ? draft.config?.emailMjml as string | undefined : undefined);
  const savedBeefreeJson = current.beefreeJson ?? (variant === 0 ? draft.config?.emailBeefreeJson as Record<string, unknown> | undefined : undefined);
  const savedBeefreeVersion = current.beefreeVersion ?? (variant === 0 && typeof draft.config?.emailBeefreeVersion === "number" ? draft.config.emailBeefreeVersion : undefined);
  const savedUnlayerJson = current.unlayerJson ?? (variant === 0 ? draft.config?.emailUnlayerJson as Record<string, unknown> | undefined : undefined);
  const savedUnlayerVersion = current.unlayerVersion ?? (variant === 0 ? draft.config?.emailUnlayerVersion as string | undefined : undefined);
  const savedUnlayerMigration = current.unlayerMigration ?? (variant === 0 ? draft.config?.emailUnlayerMigration as Record<string, unknown> | undefined : undefined);
  const variantDraft: Campaign = { ...draft, subject: currentSubject, body: currentBody, config: { ...Object.fromEntries(Object.entries(draft.config??{}).filter(([key])=>variant===0||!key.startsWith("email"))),...current.config, emailEditorMode: savedEditorMode, emailRows: savedRows, emailStyle: savedStyle, emailSending: savedSending, emailEditorEngine: savedEditorEngine, emailGrapesProject: savedGrapesProject, emailGrapesSchemaVersion: savedGrapesSchemaVersion, emailGrapesMigration: savedGrapesMigration, emailMjml: savedMjml, emailBeefreeJson: savedBeefreeJson, emailBeefreeVersion: savedBeefreeVersion, emailUnlayerJson: savedUnlayerJson, emailUnlayerVersion: savedUnlayerVersion, emailUnlayerMigration: savedUnlayerMigration } };
  const [showSending, setShowSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [emailStart, setEmailStart] = useState(() => !currentSubject && !currentBody && !savedRows.length && !currentBody);
  const [emailEditor, setEmailEditor] = useState<EmailEditorMode | null>(null);
  useEffect(() => { setEmailStart(!currentSubject && !currentBody && !savedRows.length); setEmailEditor(null); }, [variant]);
  const variantPatch = (patch: Partial<Campaign>) => {
    const next = [...variants];
    next[variant] = { ...current,config:Object.fromEntries(Object.entries({...current.config,...patch.config}).filter(([key])=>key.startsWith("email"))), subject: patch.subject ?? currentSubject, body: patch.body ?? currentBody, editorMode: (patch.config?.emailEditorMode as EmailEditorMode | undefined) ?? savedEditorMode, rows: Array.isArray(patch.config?.emailRows) ? patch.config.emailRows as EmailRow[] : savedRows, style: patch.config?.emailStyle as EmailStyle | undefined ?? savedStyle, sending: (patch.config?.emailSending as EmailSending | undefined) ?? savedSending, editorEngine: (patch.config?.emailEditorEngine as string | undefined) ?? savedEditorEngine, grapesProject: (patch.config?.emailGrapesProject as Record<string, unknown> | undefined) ?? savedGrapesProject, grapesSchemaVersion: patch.config?.emailGrapesSchemaVersion as number | undefined ?? savedGrapesSchemaVersion, grapesMigration: patch.config?.emailGrapesMigration as Record<string, unknown> | undefined ?? savedGrapesMigration, mjml: (patch.config?.emailMjml as string | undefined) ?? savedMjml, beefreeJson: (patch.config?.emailBeefreeJson as Record<string, unknown> | undefined) ?? savedBeefreeJson, beefreeVersion: (patch.config?.emailBeefreeVersion as number | undefined) ?? savedBeefreeVersion, unlayerJson: (patch.config?.emailUnlayerJson as Record<string, unknown> | undefined) ?? savedUnlayerJson, unlayerVersion: (patch.config?.emailUnlayerVersion as string | undefined) ?? savedUnlayerVersion, unlayerMigration: (patch.config?.emailUnlayerMigration as Record<string, unknown> | undefined) ?? savedUnlayerMigration };
    const config = { ...preservePrimaryEmailDesign(draft.config ?? {}, patch.config ?? {}, variant), variants: next, ...(variant === 0 ? { emailEditorMode: next[0].editorMode, emailRows: next[0].rows, emailStyle: next[0].style, emailSending: next[0].sending, emailEditorEngine: next[0].editorEngine, emailGrapesProject: next[0].grapesProject, emailGrapesSchemaVersion: next[0].grapesSchemaVersion, emailGrapesMigration: next[0].grapesMigration, emailMjml: next[0].mjml, emailBeefreeJson: next[0].beefreeJson, emailBeefreeVersion: next[0].beefreeVersion, emailUnlayerJson: next[0].unlayerJson, emailUnlayerVersion: next[0].unlayerVersion, emailUnlayerMigration: next[0].unlayerMigration } : {}) };
    return variant === 0 ? { ...patch, config } : { config };
  };
  const updateVariant = (patch: Partial<Campaign>) => update(variantPatch(patch));
  const saveVariant = (patch: Partial<Campaign>) => saveEmail(variantPatch(patch));
  const addVariant = () => { if(variants.length>=8)return; const next = [...variants, { id: `var_${crypto.randomUUID().slice(0, 8)}`, name: `Variant ${variants.length + 1}` }]; update({ config: { ...draft.config, variants: next } }); setVariant(next.length - 1); };
  if (showSending) return <EmailSendingEditor locale={locale} draft={variantDraft} sending={savedSending} save={saveVariant} onClose={() => setShowSending(false)} onOpenContent={() => { setShowSending(false); setEmailEditor(savedEditorMode ?? "html"); }} onOpenTest={openTest}/>;
  if (emailEditor) return <EmailMessageEditor locale={locale} key={`${current.id}-${emailEditor}`} mode={emailEditor} variantName={current.name} draft={variantDraft} save={saveVariant} onClose={() => { setEmailEditor(null); setEmailStart(false); }} onSendingSettings={() => { setEmailEditor(null); setEmailStart(false); setShowSending(true); }} onModeChange={mode => setEmailEditor(mode)} onOpenTest={openTest} />;
  if (emailStart) return <EmailStart locale={locale} draft={draft} update={update} importHtml={body => updateVariant({ body, config: { emailEditorMode: "html" } })} variants={variants} variant={variant} setVariant={setVariant} addVariant={addVariant} copied={copied} setCopied={setCopied} onStart={setEmailEditor} />;
  const subject = currentSubject ?? "";
  const fromName = savedSending?.fromName ?? "Powered by Braze";
  const fromAddress = savedSending?.fromAddress ?? "braze@mta-h466.bftmail.com";
  const hasRows = savedEditorEngine !== "grapesjs-mjml" && savedRows.length > 0;
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
        : savedEditorMode==="plain"?<pre style={{whiteSpace:"pre-wrap"}}>{currentBody||"No content yet."}</pre>:<iframe title="Saved email content" sandbox="" style={{width:"100%",minHeight:360,border:0}} srcDoc={currentBody||"<p>No content yet.</p>"}/>}</article></div>
      <div className="email-actions"><button className="secondary" onClick={() => setGalleryOpen(!galleryOpen)}>{translate(locale, "Choose New Template")}</button><button className="secondary" onClick={()=>openTest?.()}>{translate(locale, "Preview and test")}</button></div>
      {galleryOpen && <EmailTemplateGallery locale={locale} onApply={template => {
        if (template.config) updateVariant({ subject: template.subject, body: template.html ?? template.plain, config: { ...template.config, emailEditorMode: template.editor === "Drag-and-Drop Editor" ? "drag" : template.editor === "Plain-text Editor" ? "plain" : "html" } });
        else if (template.rows) updateVariant({ subject: template.subject, config: { emailEditorMode: "drag", emailRows: template.rows, emailStyle: savedStyle } });
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
  return <iframe key={block.id} title="Email content block" sandbox="" style={{width:"100%",border:0}} srcDoc={block.text}/>;
}

function EmailCampaignDetails({ locale, draft, update, copied, setCopied }: { locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; copied: boolean; setCopied: (copied: boolean) => void }) {
  const description = typeof draft.config?.description === "string" ? draft.config.description : "";
  const tags = Array.isArray(draft.config?.tags) ? draft.config.tags as string[] : [];
  const [showDescription, setShowDescription] = useState(Boolean(description));
  return <section className="braze-section campaign-details-section">
    <h2>{translate(locale, "Campaign Details")}</h2>
    <div className="form-grid">
      <div className="campaign-name-line"><Field label={translate(locale, "Campaign Name")}><input value={draft.name} onChange={event => update({ name: event.target.value })} placeholder={translate(locale, "Enter Campaign Name")}/></Field></div>
      <CampaignTeamPicker value={String(draft.config?.team??"")} onChange={team=>update({config:{...draft.config,team}})}/>
    </div>
    {showDescription ? <Field label={translate(locale, "Description")}><textarea value={description} onChange={event => update({ config: { ...draft.config, description: event.target.value } })} placeholder={translate(locale, "Enter a description")}/></Field> : <button className="inline-link" onClick={() => setShowDescription(true)}><Plus size={16}/> {translate(locale, "Add description")}</button>}
    <TagPicker value={tags} onChange={tags => update({ config: { ...draft.config, tags } })} locale={locale}/>

    <CampaignBrief draft={draft} update={patch=>update(patch as Partial<Campaign>)}/>
    <div className="campaign-id-line"><Field label={translate(locale, "Campaign ID")}><input value={String(draft.config?.apiIdentifier??draft.id)} readOnly title={String(draft.config?.apiIdentifier??draft.id)}/></Field><button className="copy-id" onClick={() => { void navigator.clipboard?.writeText(String(draft.config?.apiIdentifier??draft.id)); setCopied(true); }}><Copy size={17}/>{translate(locale, copied ? "Copied" : "Copy")}</button></div>
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

function EmailSendingEditor({ locale, draft, sending, save, onClose, onOpenContent, onOpenTest }: { locale: Locale; draft: Campaign; sending?: EmailSending; save: (patch: Partial<Campaign>) => Promise<boolean>; onClose: () => void; onOpenContent: () => void; onOpenTest: () => void }) {
  const touchedDefaults = useRef({identity:false,ipPool:false,replyTo:false,bcc:false});
  const [workspacePreferences, setWorkspacePreferences] = useState<EmailPreferences | null>(null);
  useEffect(() => { let active = true; void fetch("/api/email-preferences").then(response => response.ok ? response.json() : null).then(result => { if (active && result?.data) { const preferences=result.data as EmailPreferences;setWorkspacePreferences(preferences);const defaults=emailPreferenceCampaignDefaults(preferences).emailSending;const sender=preferences.sending.senders.find(row=>`${row.localPart}@${row.domain}`===(sending?.fromAddress??defaults.fromAddress));if(!sending?.fromAddress&&!touchedDefaults.current.identity)setIdentity(defaults.fromAddress);if(!sending?.ipPool&&!touchedDefaults.current.ipPool)setIpPool(sender?.ipPool??defaults.ipPool);if(!sending?.replyTo&&!touchedDefaults.current.replyTo)setReplyTo(defaults.replyTo??'Exclude reply-to and send replies to "from" address');if(!sending?.bcc&&!touchedDefaults.current.bcc)setBcc(defaults.bcc??"No BCC address"); } }).catch(() => {}); return () => { active = false; }; }, []);
  const identityOptions = [...new Map([
    ...(workspacePreferences?.sending.senders ?? []).map(sender => ({ name: sender.displayName, address: `${sender.localPart}@${sender.domain}` })),
    ...(workspacePreferences?.sending.requireListedAddresses ? [] : verifiedIdentities),
    ...(sending?.fromAddress ? [{ name: sending.fromName ?? sending.fromAddress, address: sending.fromAddress }] : []),
  ].map(item => [item.address, item])).values()];
  const replyOptions = [...new Set([...(workspacePreferences?.sending.replyTo ?? []).map(item => item.address), ...(workspacePreferences?.sending.requireListedAddresses ? [] : verifiedIdentities.map(item => item.address)), ...(sending?.replyTo ? [sending.replyTo] : [])])];
  const bccOptions = [...new Set([...(workspacePreferences?.sending.bcc ?? []).map(item => item.address), ...(sending?.bcc && sending.bcc !== "No BCC address" ? [sending.bcc] : [])])];
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [preheader, setPreheader] = useState(sending?.preheader ?? "");
  const [attachments, setAttachments] = useState<EmailAttachment[]>((draft.config?.emailAttachments ?? []) as EmailAttachment[]);
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
  const [headers,setHeaders] = useState<EmailKeyValue[]>(sending?.headers ?? []);
  const [extras,setExtras] = useState<EmailKeyValue[]>(sending?.extras ?? []);
  const [customizeReplyTo,setCustomizeReplyTo] = useState(sending?.customizeReplyTo ?? false);
  const [saveError,setSaveError] = useState("");
  const permissions = emailSendingCapabilities(draft.config, workspacePreferences?.sending.requireListedAddresses);
  const currentIdentity = identityOptions.find(item => item.address === identity) ?? { name: sending?.fromName ?? identity, address: identity };
  const currentSending: EmailSending = { headers,extras,customizeReplyTo,preheader, whitespace, replyTo, bcc, unsubscribe, fromName: currentIdentity.name, fromAddress: currentIdentity.address, ipPool, openTracking, clickTracking, gaEnabled, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, subjectTranslations, preheaderTranslations };
  const insert = (token: string) => { if (insertingInto === "preheader") setPreheader(value => appendPersonalization(value, token)); else setSubject(value => appendPersonalization(value, token)); setInsertingInto(null); };
  const persistSettings = async () => { if(saving)return false; try { emailCustomHeaders(headers);emailExtras(extras);setSaveError("");setSaving(true);const ok=await save({subject,config:{...draft.config,emailSending:currentSending,emailAttachments:attachments}});if(!ok)setSaveError("Settings could not be saved. Try again.");return ok;} catch(error){setSaveError(error instanceof Error?error.message:"Settings could not be saved.");return false;} finally{setSaving(false);} };
  const done = async () => { if(await persistSettings())onClose(); };
  const openContent = () => { void persistSettings().then(ok=>{if(ok)onOpenContent();}); };
  const openTest = () => { void persistSettings().then(ok=>{if(ok)onOpenTest();}); };
  const [aiBusy,setAiBusy] = useState(false);
  const assistSubject = async () => { if(aiBusy)return;setAiBusy(true);setSaveError("");try{const response=await fetch("/api/messages/assist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:`Suggest a concise email subject for ${draft.name}. Current subject: ${subject}. Email content: ${(draft.body??"").slice(0,4000)}`})});const result=await response.json();if(!response.ok)throw Error(result.error??"Content generation failed.");setSubject(String(result.subject));}catch(error){setSaveError(error instanceof Error?error.message:"Content generation failed.");}finally{setAiBusy(false);} };
  const download = () => { const blob = new Blob([draft.body ?? ""], { type: "text/html" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "email-preview.html"; link.click(); URL.revokeObjectURL(link.href); };
  return <section className={brazeSendingStyles.page} aria-label={translate(locale, "Email sending settings")}>
    <header className={brazeSendingStyles.header}><b>{draft.name}</b><button aria-label="BrazeAI Operator"><Sparkles size={19}/></button></header>
    <nav className={brazeSendingStyles.iconRail} aria-label={translate(locale, "Email editor sections")}><button className={brazeSendingStyles.iconActive} title={translate(locale, "Sending settings")}><Mail size={22}/></button><button title={translate(locale, "Content")} onClick={openContent}><FileCode2 size={22}/></button><button title={translate(locale, "Preview & Test")} onClick={openTest}><Eye size={22}/></button></nav>
    <aside className={brazeSendingStyles.sideRail}><div className={brazeSendingStyles.railTitle}>SENDING SETTINGS<button aria-label={translate(locale, "Back to campaign")} onClick={()=>void done()}><ChevronLeft size={15}/></button></div>{(["Sending Info", "Advanced"] as const).map(name => <button key={name} className={section === name ? brazeSendingStyles.navActive : ""} onClick={() => setSection(name)}>{translate(locale, name)}</button>)}<hr className={brazeSendingStyles.navSeparator}/>{(["Personalization", "Languages"] as const).map(name => <button key={name} className={`${brazeSendingStyles.utilityNav} ${section === name ? brazeSendingStyles.navActive : ""}`} onClick={() => setSection(name)}>{name === "Personalization" ? <span className={brazeSendingStyles.personalizationIcon}>+</span> : <Globe2 size={16}/>} {translate(locale, name)}</button>)}<a href={withLocale(routeForPage("email-preferences").replace("sending_configuration", "drag_and_drop_email"), locale)} target="_blank" rel="noopener noreferrer">{translate(locale, "Style Settings")} ↗</a></aside>
    <main className={brazeSendingStyles.formArea}>
      {section === "Sending Info" ? <><h2>{translate(locale, "Sending Info")}</h2><p>You can update the default value of your sending information from <a href={withLocale(routeForPage("email-preferences"), locale)}>Email Settings</a>.</p><label>Subject <button className={brazeSendingStyles.aiButton} title="BrazeAI Operator" disabled={aiBusy} onClick={()=>void assistSubject()}>{aiBusy?"Generating…":"✦"}</button><span className={brazeSendingStyles.liquidInput}><textarea rows={1} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Enter an email subject"/><button title="Add Liquid" aria-label="Personalize subject" onClick={() => setInsertingInto(insertingInto === "subject" ? null : "subject")}>＋ Add Liquid</button></span>{insertingInto === "subject" && <PersonalizationMenu title="Personalize subject" onInsert={insert}/>}</label><label>Preheader <small>(Optional)</small><span className={brazeSendingStyles.liquidInput}><textarea rows={1} value={preheader} onChange={event => setPreheader(event.target.value)} placeholder="Enter an email preheader"/><button title="Add Liquid" aria-label="Personalize preheader" onClick={() => setInsertingInto(insertingInto === "preheader" ? null : "preheader")}>＋ Add Liquid</button></span>{insertingInto === "preheader" && <PersonalizationMenu title="Personalize preheader" onInsert={insert}/>}</label><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={whitespace} onChange={event => setWhitespace(event.target.checked)}/><span>Add whitespace after preheader<small>Prevents most email clients from pulling additional content from your email to fill the remaining preview space</small></span></label><div className={brazeSendingStyles.formDivider}/><h3>From display name + address</h3>{!permissions.from && <div className={brazeSendingStyles.identitySummary}>{currentIdentity.name} &lt;{currentIdentity.address}&gt; | {ipPool}</div>}{permissions.from && <label>From address (verified sending identity)<select value={identity} onChange={event => { touchedDefaults.current.identity=true;setIdentity(event.target.value); }}>{identityOptions.map(item => <option key={item.address} value={item.address}>{item.name} &lt;{item.address}&gt;</option>)}</select></label>}{!permissions.ipPool && <p className={brazeSendingStyles.ipSummary}><b>IP pool:</b> {ipPool}</p>}{permissions.ipPool && <label>IP pool<select value={ipPool} onChange={event => { touchedDefaults.current.ipPool=true;setIpPool(event.target.value); }}>{[...new Set([ipPool, "PLG_IP_Pool", "Transactional_IP_Pool", "Shared_IP_Pool"])].map(pool => <option key={pool}>{pool}</option>)}</select></label>}<label>Reply-to address<select disabled={!permissions.replyTo || customizeReplyTo} value={replyTo} onChange={event => { touchedDefaults.current.replyTo=true;setReplyTo(event.target.value); }}><option value="Exclude reply-to and send replies to &quot;from&quot; address">Exclude reply-to and send replies to "from" address</option>{replyOptions.map(address => <option key={address} value={address}>{address}</option>)}</select></label><label className={brazeSendingStyles.customReply}><input type="checkbox" disabled={!permissions.customReplyTo} checked={customizeReplyTo} onChange={event=>{touchedDefaults.current.replyTo=true;setCustomizeReplyTo(event.target.checked);if(!event.target.checked)setReplyTo('Exclude reply-to and send replies to "from" address');}}/>Customize reply-to address</label>{customizeReplyTo&&<label>Custom reply-to address<input disabled={!permissions.customReplyTo} value={replyTo.startsWith("Exclude reply-to")?"":replyTo} onChange={event=>{touchedDefaults.current.replyTo=true;setReplyTo(event.target.value);}} placeholder="email@example.com"/></label>}<label>BCC address<select disabled={!permissions.bcc} value={bcc} onChange={event => { touchedDefaults.current.bcc=true;setBcc(event.target.value); }}><option disabled={workspacePreferences?.sending.requireBcc} value="No BCC address">No BCC address</option>{workspacePreferences?.sending.defaultBccId && <option value="workspace_default">Workspace default BCC</option>}{bccOptions.map(address => <option key={address} value={address}>{address}</option>)}</select></label><label>One-click list-unsubscribe setting<select value={unsubscribe} onChange={event => setUnsubscribe(event.target.value)}><option>Use workspace default</option><option>Enabled</option><option>Disabled</option></select></label></> : section === "Personalization" ? <><h2>{translate(locale, "Personalization")}</h2><p>Pick a target field, then insert a Liquid variable from any category.</p><div className={brazeSendingStyles.variableButtons}><button className={brazeSendingStyles.variableButton} onClick={() => setInsertingInto("subject")}>Subject</button><button className={brazeSendingStyles.variableButton} onClick={() => setInsertingInto("preheader")}>Preheader</button></div>{insertingInto && <PersonalizationMenu title={`Insert into ${insertingInto}`} onInsert={insert}/>}</> : section === "Languages" ? <><h2>{translate(locale, "Languages")}</h2><p>Provide localized subject lines and preheaders. Users receive the translation matching their language, falling back to the default.</p>{emailLocales.filter(item => item.code !== "en").map(item => <div key={item.code} className={brazeSendingStyles.languageGroup}><h3>{item.label}</h3><label>Subject ({item.label})<input value={subjectTranslations[item.code] ?? ""} onChange={event => setSubjectTranslations({ ...subjectTranslations, [item.code]: event.target.value })} placeholder={subject || "Enter an email subject"}/></label><label>Preheader ({item.label})<input value={preheaderTranslations[item.code] ?? ""} onChange={event => setPreheaderTranslations({ ...preheaderTranslations, [item.code]: event.target.value })} placeholder={preheader || "Enter an email preheader"}/></label></div>)}</> : <><h2>{translate(locale, "Advanced")}</h2><EmailAttachments value={attachments} onChange={setAttachments}/>{([{title:"Email Headers",rows:headers,set:setHeaders,noun:"Header"},{title:"Email Extras",rows:extras,set:setExtras,noun:"Extra"}]).map(group=><section key={group.title} className={brazeSendingStyles.settingGroup}><div className={brazeSendingStyles.sectionTitle}><h3>{group.title}</h3><button onClick={()=>group.set([...group.rows,{key:"",value:""}])}>+ Add New {group.noun}</button></div>{group.rows.length?group.rows.map((row,index)=><div className={brazeSendingStyles.pairRow} key={index}><input aria-label={`${group.noun} key ${index+1}`} placeholder="Key" value={row.key} onChange={event=>group.set(group.rows.map((entry,i)=>i===index?{...entry,key:event.target.value}:entry))}/><input aria-label={`${group.noun} value ${index+1}`} placeholder="Value / Liquid" value={row.value} onChange={event=>group.set(group.rows.map((entry,i)=>i===index?{...entry,value:event.target.value}:entry))}/><button aria-label={`Remove ${group.noun} ${index+1}`} onClick={()=>group.set(group.rows.filter((_,i)=>i!==index))}>×</button></div>):<p className={brazeSendingStyles.emptyState}>You have not yet defined {group.title.toLowerCase()} for this message.<br/>To add a new {group.noun.toLowerCase()}, click &apos;Add New {group.noun}&apos;.</p>}</section>)}<div className={brazeSendingStyles.formDivider}/><h3>Tracking</h3><p>Configure tracking and link behavior for this campaign.</p><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={openTracking} onChange={event => setOpenTracking(event.target.checked)}/><span>Track opens<small>Injects an open-tracking pixel into delivered emails</small></span></label><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={clickTracking} onChange={event => setClickTracking(event.target.checked)}/><span>Track clicks<small>Rewrites links to route through click tracking</small></span></label><div className={brazeSendingStyles.formDivider}/><h3>Google Analytics</h3><label className={brazeSendingStyles.checkbox}><input type="checkbox" checked={gaEnabled} onChange={event => setGaEnabled(event.target.checked)}/><span>Enable Google Analytics tracking<small>Appends UTM parameters to links in this campaign</small></span></label>{gaEnabled && <div className={brazeSendingStyles.utmGrid}><label>utm_source<input value={utmSource} onChange={event => setUtmSource(event.target.value)}/></label><label>utm_medium<input value={utmMedium} onChange={event => setUtmMedium(event.target.value)}/></label><label>utm_campaign<input value={utmCampaign} onChange={event => setUtmCampaign(event.target.value)}/></label><label>utm_term<input value={utmTerm} onChange={event => setUtmTerm(event.target.value)}/></label><label>utm_content<input value={utmContent} onChange={event => setUtmContent(event.target.value)}/></label></div>}<div className={brazeSendingStyles.formDivider}/><label>One-click list-unsubscribe setting<select value={unsubscribe} onChange={event => setUnsubscribe(event.target.value)}><option>Use workspace default</option><option>Enabled</option><option>Disabled</option></select></label></>}
      {saveError&&<p role="alert" className={brazeSendingStyles.error}>{saveError}</p>}
    </main>
    <aside className={brazeSendingStyles.preview}><h2>{translate(locale, "Preview")}</h2><p><b>From:</b> {currentIdentity.name} &lt;{currentIdentity.address}&gt;</p><div className={brazeSendingStyles.previewLabels}><span><b>Subject:</b> {subject}</span><span><b>Preheader:</b> {preheader}</span></div><div className={brazeSendingStyles.previewFrame}>{draft.config?.emailEditorMode === "plain" ? <p>{draft.body}</p> : <NativeMessagePreview draft={draft}/>}</div><small>Actual rendering may not be identical to this preview depending on the user&apos;s environment</small></aside>
    <footer className={brazeSendingStyles.footer}><button onClick={download}>{translate(locale, "Download file")}</button><button className={brazeSendingStyles.done} disabled={saving} onClick={() => void done()}>{translate(locale, saving ? "Saving…" : "Done")}</button></footer>
  </section>;
}


function ChannelFields({ locale, draft, update, saveCampaign, openTest = () => {}, notify = () => {} }: { locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; saveCampaign: (patch: Partial<Campaign>) => Promise<boolean>; openTest?: () => void; notify?: (m: string) => void }) {
  if (["banner","content","line"].includes(draft.channel)) return <CampaignMessageEditor draft={draft} update={patch=>update(patch as Partial<Campaign>)} openTest={openTest}/>;
  const channel = draft.channel;
  if (channel === "push") return <PushFields locale={locale} draft={draft} update={update}/>;
  if (channel === "content") return <ContentCardFields draft={draft} update={update}/>;
  if (channel === "banner") return <BannerFields draft={draft} update={update}/>;
  if (channel === "sms") return <SmsFields draft={draft} update={update}/>;
  if (channel === "webhook") return <WebhookFields draft={draft} update={update} openTest={openTest}/>;
  if (channel === "whatsapp") return <WhatsAppEditor draft={draft} update={update} notify={notify}/>;
  if (channel === "line") return <LineFields draft={draft} update={update}/>;
  if (channel === "multichannel" || channel === "operator") return <MultichannelFields draft={draft} update={update} saveCampaign={saveCampaign} locale={locale}/>;
  if (channel === "feature") return <FeatureFlagFields draft={draft} update={update}/>;
  return <ApiCampaignFields draft={draft} update={update} notify={notify}/>;
}

function channelValues(draft: Campaign): Record<string, unknown> { return (draft.config?.channelValues ?? {}) as Record<string, unknown>; }
function changeChannel(draft: Campaign, update: (patch: Partial<Campaign>) => void, patch: Record<string, unknown>) { update({ config: { ...draft.config, channelValues: { ...channelValues(draft), ...patch } } }); }
function smsEstimate(message: string) { const unicode = /[^\x00-\x7F]/.test(message); const first = unicode ? 70 : 160; const rest = unicode ? 67 : 153; return { encoding: unicode ? "Unicode" : "GSM-7 estimate", segments: message.length <= first ? 1 : Math.ceil(message.length / rest) }; }

function PushFields({ locale, draft, update, openTest }: { locale: Locale; draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest?: () => void }) {
  const values = channelValues(draft);
  const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const [tab, setTab] = useState<"Compose" | "Settings" | "Test">("Compose");
  const [mediaOpen, setMediaOpen] = useState<string | null>(null);
  const [mediaLibrary, setMediaLibrary] = useState<Array<{ id: string; name: string; src: string }>>([]);
  useEffect(() => { if (!mediaOpen) return; void fetch("/api/resources/media").then(r => r.json()).then(d => setMediaLibrary(((d.data ?? []) as Array<{ id: string; name: string; data: { src?: unknown } }>).map(row => ({ id: row.id, name: row.name, src: String(row.data.src ?? "") })).filter(item => item.src))).catch(() => {}); }, [mediaOpen]);
  const [credentials, setCredentials] = useState<{ ios?: string; android?: string }>({});
  useEffect(() => { void fetch("/api/workspace/diagnostics").then(r => r.json()).then(d => setCredentials({ ios: d.credentials?.apns ? "Available" : "Missing", android: d.credentials?.fcm ? "Available" : "Missing" })).catch(() => {}); }, []);
  const pushLanguages: string[] = Array.isArray(values.languages) ? values.languages as string[] : ["English"];
  const activePushLanguage = String(values.activeLanguage ?? pushLanguages[0]);
  const pushContentFor = (lang: string) => ((values.contentByLanguage ?? {}) as Record<string, { title?: string; message?: string }>)[lang] ?? {};
  const currentPushContent = pushContentFor(activePushLanguage);
  const setPushContent = (patch: { title?: string; message?: string }) => set({ contentByLanguage: { ...(values.contentByLanguage ?? {}), [activePushLanguage]: { ...currentPushContent, ...patch } } });
  const languagePool = ["English", "Chinese (Simplified)", "Japanese", "Korean", "Spanish"];
  const title = draft.subject ?? ""; const body = draft.body ?? "";
  const media = (key: string, label: string, help: string) => <div className={pushStyles.asset} key={key}><h4>{label}</h4><div className={pushStyles.assetBox}>{values[key] ? <img src={String(values[key])} alt={`${label} preview`}/> : <Image size={27}/>}<span>{values[key] ? "Image selected" : "Drag and drop an image here"}</span><small>{help}</small><div><button type="button" onClick={() => setMediaOpen(mediaOpen === key ? null : key)}>Add from media library</button><label className={pushStyles.upload}>Upload image<input type="file" accept="image/png,image/jpeg,image/gif" onChange={event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => set({ [key]: String(reader.result) }); reader.readAsDataURL(file); }}/></label></div></div>{mediaOpen === key && <div className={pushStyles.mediaPicker}>{mediaLibrary.map(item => <button key={item.id} onClick={() => { set({ [key]: item.src }); setMediaOpen(null); }}>{item.name}</button>)}<button onClick={() => { set({ [key]: "https://placehold.co/800x400/e9e4f4/5632a6?text=Campaign+image" }); setMediaOpen(null); }}>Campaign image</button><button onClick={() => { set({ [key]: "https://placehold.co/400x400/ebeaf1/342b46?text=Brand" }); setMediaOpen(null); }}>Brand image</button></div>}<Field label="Add from URL"><input value={String(values[key] ?? "")} onChange={event => set({ [key]: event.target.value })} placeholder="Paste URL"/></Field></div>;
  return <section className={className("braze-section", pushStyles.compose)}><div className="card-heading"><h2>Compose push notification</h2>{openTest && <button className="secondary" onClick={()=>openTest?.()}>{translate(locale, "Preview and test")}</button>}</div><div className={pushStyles.warning}>{credentials.ios === "Configured" && credentials.android === "Configured" ? "Push credentials are configured for iOS and Android in Push Settings." : `Push credentials: iOS ${credentials.ios || "missing"} · Android ${credentials.android || "missing"}`} <button type="button" onClick={() => setTab("Settings")}>More Info</button></div>
    <div className={pushStyles.previews}><div><h3>iOS</h3><div className={pushStyles.previewControls}><Field label="Device"><select value={String(values.device ?? "Phone")} onChange={event => set({ device: event.target.value })}><option>Phone</option><option>Tablet</option></select></Field><Field label="Notification State"><select value={String(values.notificationState ?? "Lock screen")} onChange={event => set({ notificationState: event.target.value })}><option>Lock screen</option><option>Notification center</option><option>Banner</option></select></Field></div><div className={pushStyles.phone}><div className={pushStyles.notification}><b>{title || "Title"}</b><p>{body || "Your message will appear here."}</p><small>now</small></div></div></div><div><h3>Android</h3><div className={pushStyles.phone}><div className={pushStyles.notification}><b>{title || "Title"}</b><small>· 9m</small><p>{body || "Your message will appear here."}</p>{Boolean(values.summaryAndroid) && <p>{String(values.summaryAndroid)}</p>}</div></div></div></div><p className={pushStyles.previewNote}>Always test your message on a real device, as actual rendering may vary.</p>
    <div className={pushStyles.tabs} role="tablist">{(["Compose", "Settings", "Test"] as const).map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? pushStyles.active : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === "Compose" && <div className={pushStyles.form}><Field label="Notification type"><select value={String(values.notificationType ?? "Standard push")} onChange={event => set({ notificationType: event.target.value })}><option>Standard push</option><option>Rich push</option></select></Field><h3>Language</h3><div className={className(pushStyles.tabs)} style={{ marginBottom: 10 }}>{pushLanguages.map(lang => <button key={lang} type="button" className={activePushLanguage === lang ? pushStyles.active : ""} onClick={() => set({ activeLanguage: lang })}>{lang}</button>)}{languagePool.some(lang => !pushLanguages.includes(lang)) && <button type="button" onClick={() => { const next = languagePool.find(lang => !pushLanguages.includes(lang)); if (next) set({ languages: [...pushLanguages, next], activeLanguage: next }); }}><Plus size={13}/> Add language</button>}</div>{activePushLanguage !== "English" && <small style={{ color: "#827d8c", display: "block", marginBottom: 8 }}>Content falls back to English when no translation is provided.</small>}<h3>Content{activePushLanguage !== "English" ? ` (${activePushLanguage})` : ""}</h3><Field label="Title"><textarea value={activePushLanguage === "English" ? title : currentPushContent.title ?? ""} onChange={event => activePushLanguage === "English" ? update({ subject: event.target.value }) : setPushContent({ title: event.target.value })} placeholder="Enter notification title"/></Field><Field label="Message"><textarea value={activePushLanguage === "English" ? body : currentPushContent.message ?? ""} onChange={event => activePushLanguage === "English" ? update({ body: event.target.value }) : setPushContent({ message: event.target.value })} placeholder="Enter your message"/><small>{(activePushLanguage === "English" ? body : currentPushContent.message ?? "").length} characters</small></Field><Field label="Summary text (Android) (Optional)"><textarea value={String(values.summaryAndroid ?? "")} onChange={event => set({ summaryAndroid: event.target.value })}/></Field><h3>Interactions</h3><p>Set what happens when a user interacts with a push notification.</p><Field label="On-click behavior"><select value={String(values.clickBehavior ?? "Open app/site")} onChange={event => set({ clickBehavior: event.target.value })}><option>Open app/site</option><option>Deep link</option><option>Open web URL</option><option>None</option></select></Field>{values.clickBehavior === "Deep link" || values.clickBehavior === "Open web URL" ? <Field label="Destination"><input value={String(values.destinationUrl ?? "")} onChange={event => set({ destinationUrl: event.target.value })} placeholder="https:// or app://"/></Field> : null}<label className={pushStyles.check}><input type="checkbox" checked={values.sameForAll !== false} onChange={event => set({ sameForAll: event.target.checked })}/>Same for all platforms</label><h4>Action buttons</h4><label className={pushStyles.check}><input type="checkbox" checked={Boolean(values.allowActions)} onChange={event => set({ allowActions: event.target.checked })}/>Allow users to take actions</label>{Boolean(values.allowActions) && <Field label="Button text"><input value={String(values.buttonText ?? "")} onChange={event => set({ buttonText: event.target.value })} placeholder="Open offer"/></Field>}<h3>Assets</h3>{media("androidIcon", "Push icon image (Android)", "JPG or PNG · 1:1")}{media("iosImage", "iOS notification image", "GIF, JPG, JPEG, or PNG")}{media("androidImage", "Android notification image", "JPG or PNG · 2:1 recommended")}<h3>Sending options</h3><Field label="Push destination"><select value={String(values.pushDestination ?? "All devices")} onChange={event => set({ pushDestination: event.target.value })}><option>All devices</option><option>Most recent device</option></select></Field><Field label="iOS device destinations"><select value={String(values.iosDestinations ?? "All iOS devices")} onChange={event => set({ iosDestinations: event.target.value })}><option>All iOS devices</option><option>Most recent iOS device</option></select></Field><Field label="Android delivery priority"><select value={String(values.androidPriority ?? "Normal")} onChange={event => set({ androidPriority: event.target.value })}><option>Normal</option><option>High</option></select></Field></div>}
    {tab === "Settings" && <div className={pushStyles.form}><h3>Push settings</h3><p>Configure platform-specific delivery options for this local campaign.</p><Field label="iOS interruption level"><select value={String(values.interruptionLevel ?? "Active")} onChange={event => set({ interruptionLevel: event.target.value })}><option>Active</option><option>Passive</option><option>Time Sensitive</option></select></Field><Field label="Notification category"><input value={String(values.category ?? "")} onChange={event => set({ category: event.target.value })}/></Field><Field label="Time to live (seconds)"><input type="number" min="0" value={Number(values.ttl ?? 86400)} onChange={event => set({ ttl: Number(event.target.value) })}/></Field></div>}
    {tab === "Test" && <div className={pushStyles.form}><h3>Test push notification</h3><p>Record a simulated test result in the local activity log. No device is contacted.</p><button className="primary" onClick={()=>openTest?.()}>Preview and test</button></div>}
  </section>;
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
  const sendingNumbers: Array<[string, string]> = [["+1 415 555 0100", "US long code"], ["+1 415 555 0148", "US toll-free"], ["+44 20 7946 0958", "UK long code"]];
  const [mediaLibrary, setMediaLibrary] = useState<Array<{ id: string; name: string; src: string }>>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  useEffect(() => { if (!mediaOpen) return; void fetch("/api/resources/media").then(r => r.json()).then(d => setMediaLibrary(((d.data ?? []) as Array<{ id: string; name: string; data: { src?: unknown } }>).map(row => ({ id: row.id, name: row.name, src: String(row.data.src ?? "") })).filter(item => item.src))).catch(() => {}); }, [mediaOpen]);
  const [smsGroups, setSmsGroups] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => { void fetch("/api/subscription-groups?status=Active").then(r => r.json()).then(d => setSmsGroups(((d.data ?? []) as Array<{ id: string; name: string; channel: string }>).filter(group => group.channel === "SMS").map(group => ({ id: group.id, name: group.name })))).catch(() => {}); }, []);
  // The subscription group chosen here is the one the launch engine reads.
  const activeGroupId = String(values.subscriptionGroupId ?? draft.config?.subscriptionGroupId ?? "");
  const setSubscriptionGroup = (id: string) => {
    const group = smsGroups.find(item => item.id === id);
    update({ config: { ...draft.config, subscriptionGroupId: id || undefined, channelValues: { ...values, subscriptionGroup: group?.name ?? values.subscriptionGroup } } });
  };
  const rcsCards = (Array.isArray(values.rcsCards) && values.rcsCards.length ? values.rcsCards : [{ title: values.rcsCard ? (values.rcsCard as { title?: string }).title ?? "" : "", description: "", mediaUrl: "", replies: "", actions: "" }]) as Array<{ title: string; description: string; mediaUrl: string; replies: string; actions: string }>;
  const setRcsCard = (index: number, patch: Partial<typeof rcsCards[number]>) => set({ rcsCards: rcsCards.map((card, i) => i === index ? { ...card, ...patch } : card) });
  const [smsTemplates, setSmsTemplates] = useState<Array<{ id: string; name: string; data: { body?: string } }>>([]);
  useEffect(() => { void fetch("/api/resources/sms-templates").then(r => r.json()).then(d => setSmsTemplates((d.data ?? []).slice(0, 10))).catch(() => {}); }, []);
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const saveSmsTemplate = async () => {
    const name = templateName.trim() || message.slice(0, 24) || "SMS template";
    await fetch("/api/resources/sms-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: `${message.length} chars`, data: { body: message } }) });
    setSmsTemplates(current => [...current, { id: `new_${Date.now()}`, name, data: { body: message } }]);
    setTemplateName(""); setTemplateSaveOpen(false);
  };
  return <ChannelPanel title="SMS / MMS / RCS" help="Select an approved sender and subscription group before composing."><div className="segmented">{["SMS", "MMS", "RCS"].map(value => <button key={value} className={className(type === value && "selected")} onClick={() => set({ messageType: value })}>{value}</button>)}</div><div className="form-grid"><Field label="Subscription group"><select value={activeGroupId} onChange={event => setSubscriptionGroup(event.target.value)}><option value="">Workspace subscription status</option>{smsGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field><Field label="Sending number"><select value={String(values.sendingNumber ?? sendingNumbers[0][0])} onChange={event => set({ sendingNumber: event.target.value })}>{sendingNumbers.map(([number, label]) => <option key={number} value={number}>{number} · {label}</option>)}</select></Field></div><div className={moduleStyles.toolbar}>{smsTemplates.length > 0 && <select value="" onChange={event => { const tpl = smsTemplates.find(item => item.id === event.target.value); if (tpl?.data.body) update({ body: tpl.data.body }); }}><option value="">Load template…</option>{smsTemplates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}</select>}<button className="secondary small" onClick={() => setTemplateSaveOpen(!templateSaveOpen)}>Save as template</button></div>{templateSaveOpen && <div className={moduleStyles.toolbar}><input value={templateName} onChange={event => setTemplateName(event.target.value)} placeholder="Template name" aria-label="Template name" style={{ minHeight: 34, padding: "0 10px", border: "1px solid #d9d5df", borderRadius: 6 }} /><button className="primary small" disabled={!templateName.trim() && !message} onClick={() => void saveSmsTemplate()}>Save</button></div>}<Field label="Message"><textarea value={message} onChange={event => update({ body: event.target.value })} placeholder="Write your message"/></Field><small>{message.length} characters · {estimate.encoding} · approximately {estimate.segments} segment{estimate.segments !== 1 ? "s" : ""}{values.linkShortening ? " · links shortened" : ""}</small>{type === "MMS" && <div className={moduleStyles.grid2}><div className={moduleStyles.field}><span>MMS subject <small>(optional)</small></span><input value={String(values.mmsSubject ?? "")} onChange={event => set({ mmsSubject: event.target.value })} /></div><div className={moduleStyles.field}><span>Fallback text for non-MMS devices <small>(required)</small></span><textarea value={String(values.mmsFallback ?? "")} onChange={event => set({ mmsFallback: event.target.value })} placeholder="Plain SMS shown when the device cannot receive MMS" style={{ minHeight: 60 }} /></div></div>}{type !== "SMS" && <div className={moduleStyles.field}><span>Media</span><div className={moduleStyles.toolbar}><input value={String(values.mediaUrl ?? "")} onChange={event => set({ mediaUrl: event.target.value })} placeholder="https://... or pick from the media library" style={{ flex: 1, minHeight: 38, padding: "0 10px", border: "1px solid #d9d5df", borderRadius: 6 }} /><button className="secondary small" onClick={() => setMediaOpen(!mediaOpen)}>Media library</button></div>{mediaOpen && <div className={moduleStyles.mediaPicker} style={{ display: "grid", gap: 6, padding: 10, border: "1px solid #e3ddf0", borderRadius: 6, background: "#fbf9ff" }}>{mediaLibrary.length ? mediaLibrary.map(item => <button key={item.id} type="button" onClick={() => { set({ mediaUrl: item.src }); setMediaOpen(false); }} style={{ textAlign: "left" }}>{item.name}</button>) : <small>No library images yet — upload some in Media Library.</small>}</div>}</div>}{type === "RCS" && <>
  <h3 style={{ margin: "14px 0 6px" }}>Rich cards ({rcsCards.length}){rcsCards.length > 1 ? " · carousel" : ""}</h3>
  {rcsCards.map((card, cardIndex) => <div key={cardIndex} style={{ border: "1px solid #e3dfe6", borderRadius: 8, padding: 12, margin: "8px 0" }}>
    <div className={moduleStyles.toolbar} style={{ marginBottom: 8 }}><b style={{ fontSize: 12 }}>Card {cardIndex + 1}</b><span className={moduleStyles.spacer} />{rcsCards.length > 1 && <button className={moduleStyles.iconBtn} aria-label="Remove card" onClick={() => set({ rcsCards: rcsCards.filter((_, i) => i !== cardIndex) })}><X size={13} /></button>}</div>
    <div className={moduleStyles.grid2}><div className={moduleStyles.field}><span>Card title</span><input value={card.title} onChange={event => setRcsCard(cardIndex, { title: event.target.value })} /></div><div className={moduleStyles.field}><span>Card media URL</span><input value={card.mediaUrl} onChange={event => setRcsCard(cardIndex, { mediaUrl: event.target.value })} /></div></div>
    <div className={moduleStyles.field}><span>Card description</span><textarea value={card.description} onChange={event => setRcsCard(cardIndex, { description: event.target.value })} style={{ minHeight: 50 }} /></div>
    <div className={moduleStyles.grid2}><div className={moduleStyles.field}><span>Suggested replies (comma separated)</span><input value={card.replies} onChange={event => setRcsCard(cardIndex, { replies: event.target.value })} placeholder="Yes, notify me, Maybe later" /></div><div className={moduleStyles.field}><span>Suggested actions (label | url per line)</span><textarea value={card.actions} onChange={event => setRcsCard(cardIndex, { actions: event.target.value })} placeholder={"View cart | https://example.com/cart"} style={{ minHeight: 50 }} /></div></div>
    <div className={moduleStyles.card} style={{ padding: 12 }}><b>{card.title || "Rich card title"}</b>{card.mediaUrl && <img src={card.mediaUrl} alt="" style={{ maxWidth: "100%", margin: "8px 0" }} />}<p style={{ margin: "6px 0", fontSize: 12.5 }}>{card.description || "Card description appears here."}</p><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{card.replies.split(",").map(item => item.trim()).filter(Boolean).map(reply => <span key={reply} style={{ border: "1px solid #d9d5df", background: "#fff", color: "#4b4655", padding: "3px 10px", borderRadius: 12, fontSize: 11.5 }}>{reply}</span>)}{card.actions.split("\n").map(line => line.split("|")).filter(parts => parts.length === 2 && parts[0].trim() && parts[1].trim()).map(([label, url]) => <a key={label + url} href={url} style={{ color: "#6736d8", fontSize: 12.5, fontWeight: 700 }}>{label}</a>)}</div></div>
  </div>)}
  {rcsCards.length < 5 && <button className="secondary small" onClick={() => set({ rcsCards: [...rcsCards, { title: "", description: "", mediaUrl: "", replies: "", actions: "" }] })}><Plus size={13} /> Add carousel card</button>}
  </>}<Toggle title="Shorten and track links" help="Wraps links with the click-tracking domain and shortens them before segment counting." value={values.linkShortening === true} onChange={value => set({ linkShortening: value })}/><Toggle title="Append STOP instructions" help="Use the workspace opt-out disclosure." value={values.appendStop !== false} onChange={value => set({ appendStop: value })}/></ChannelPanel>;
}
function WebhookFields({ draft, update, openTest }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; openTest: (request?: TestRequest) => void }) {
  return <WebhookEditor draft={draft} update={update} openTest={openTest}/>;
}
type LineMessage = { id: string; type: "Text" | "Image" | "Flex message" | "Carousel"; text: string; imageUrl: string; altText: string; flexJson: string; cards: Array<{ title: string; description: string; imageUrl: string; url: string }> };

function lineMessages(values: Record<string, unknown>, draft: Campaign): LineMessage[] {
  const stored = values.lineMessages;
  if (Array.isArray(stored) && stored.length) return stored as LineMessage[];
  return [{ id: "line_msg_1", type: (values.messageType as LineMessage["type"]) ?? "Text", text: draft.body ?? "", imageUrl: String(values.imageUrl ?? ""), altText: "LINE image", flexJson: String(values.flexJson ?? ""), cards: [] }];
}

function LineFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const messages = lineMessages(values, draft);
  const setMessages = (next: LineMessage[]) => {
    const first = next[0];
    update({ body: first?.type === "Text" ? first.text : draft.body, config: { ...draft.config, channelValues: { ...values, lineMessages: next, messageType: first?.type ?? "Text", imageUrl: first?.type === "Image" ? first.imageUrl : values.imageUrl, flexJson: first?.type === "Flex message" ? first.flexJson : values.flexJson } } });
  };
  const patchMessage = (index: number, patch: Partial<LineMessage>) => setMessages(messages.map((message, i) => i === index ? { ...message, ...patch } : message));
  const addMessage = (type: LineMessage["type"]) => setMessages([...messages, { id: `line_msg_${Date.now()}`, type, text: "", imageUrl: "", altText: "LINE image", flexJson: type === "Flex message" ? '{"type":"bubble","altText":"Flex message","body":{"type":"box","contents":[{"type":"text","text":"New flex message"}]}}' : "", cards: type === "Carousel" ? [{ title: "Card 1", description: "", imageUrl: "", url: "https://" }] : [] }]);
  const moveMessage = (index: number, direction: -1 | 1) => { const next = [...messages]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setMessages(next); };
  return <ChannelPanel title="LINE message" help="Send a stack of up to 5 messages through a LINE Official Account.">
    <div className="form-grid"><Field label="Official Account"><select value={String(values.officialAccount ?? "Demo – Thinkingai")} onChange={event => set({ officialAccount: event.target.value })}><option>Demo – Thinkingai</option></select></Field><Field label="Action URL"><input value={String(values.actionUrl ?? "")} onChange={event => set({ actionUrl: event.target.value })} placeholder="https://..."/></Field></div>
    <small>{messages.length} message{messages.length !== 1 ? "s" : ""} in this stack (max 5)</small>
    {messages.map((message, index) => <div key={message.id} style={{ border: "1px solid #e3dfe6", borderRadius: 8, padding: 12, margin: "8px 0" }}>
      <div className={moduleStyles.toolbar} style={{ marginBottom: 8 }}><b style={{ fontSize: 12 }}>Message {index + 1}</b><span className={moduleStyles.spacer} />
        <button className={moduleStyles.iconBtn} aria-label="Move message up" disabled={index === 0} onClick={() => moveMessage(index, -1)}><ArrowUp size={13} /></button>
        <button className={moduleStyles.iconBtn} aria-label="Move message down" disabled={index === messages.length - 1} onClick={() => moveMessage(index, 1)}><ArrowDown size={13} /></button>
        <button className={moduleStyles.iconBtn} aria-label="Remove message" disabled={messages.length === 1} onClick={() => setMessages(messages.filter((_, i) => i !== index))}><X size={13} /></button>
      </div>
      <Field label="Message type"><select value={message.type} onChange={event => patchMessage(index, { type: event.target.value as LineMessage["type"] })}><option>Text</option><option>Image</option><option>Flex message</option><option>Carousel</option></select></Field>
      {message.type === "Text" && <Field label="Text"><textarea value={message.text} onChange={event => patchMessage(index, { text: event.target.value })} style={{ minHeight: 60 }} /></Field>}
      {message.type === "Image" && <div className={moduleStyles.grid2}><div className={moduleStyles.field}><span>Image URL</span><input value={message.imageUrl} onChange={event => patchMessage(index, { imageUrl: event.target.value })} placeholder="https://..." /></div><div className={moduleStyles.field}><span>Alt text</span><input value={message.altText} onChange={event => patchMessage(index, { altText: event.target.value })} placeholder="Describe the image" /></div></div>}
      {message.type === "Flex message" && <><Field label="Flex message JSON"><textarea value={message.flexJson} onChange={event => patchMessage(index, { flexJson: event.target.value })} className={moduleStyles.mono} style={{ minHeight: 110 }} /></Field>
        {(() => { try { const flex = JSON.parse(message.flexJson || "{}") as { altText?: string; body?: { contents?: Array<{ text?: string }> } }; return <div className={moduleStyles.card} style={{ padding: 12 }}><b>{String(flex.altText ?? "Flex message")}</b><div style={{ display: "grid", gap: 4, marginTop: 6 }}>{(flex.body?.contents ?? []).map((item, itemIndex) => <span key={itemIndex} style={{ fontSize: 12.5 }}>{String(item.text ?? "")}</span>)}</div></div>; } catch { return <p className="form-error">Flex JSON is invalid — fix the syntax to enable the preview.</p>; } })()}
      </>}
      {message.type === "Carousel" && <>
        {message.cards.map((card, cardIndex) => <div key={cardIndex} style={{ border: "1px dashed #cfc7de", borderRadius: 6, padding: 10, margin: "8px 0" }}>
          <div className={moduleStyles.grid2}><div className={moduleStyles.field}><span>Column {cardIndex + 1} title</span><input value={card.title} onChange={event => patchMessage(index, { cards: message.cards.map((item, i) => i === cardIndex ? { ...item, title: event.target.value } : item) })} /></div><div className={moduleStyles.field}><span>Image URL</span><input value={card.imageUrl} onChange={event => patchMessage(index, { cards: message.cards.map((item, i) => i === cardIndex ? { ...item, imageUrl: event.target.value } : item) })} /></div></div>
          <div className={moduleStyles.grid2}><div className={moduleStyles.field}><span>Description</span><input value={card.description} onChange={event => patchMessage(index, { cards: message.cards.map((item, i) => i === cardIndex ? { ...item, description: event.target.value } : item) })} /></div><div className={moduleStyles.field}><span>Tap URL</span><input value={card.url} onChange={event => patchMessage(index, { cards: message.cards.map((item, i) => i === cardIndex ? { ...item, url: event.target.value } : item) })} /></div></div>
          {message.cards.length > 1 && <button className="text-button" onClick={() => patchMessage(index, { cards: message.cards.filter((_, i) => i !== cardIndex) })}>Remove column</button>}
        </div>)}
        {message.cards.length < 5 && <button className="secondary small" onClick={() => patchMessage(index, { cards: [...message.cards, { title: `Card ${message.cards.length + 1}`, description: "", imageUrl: "", url: "https://" }] })}><Plus size={13} /> Add column</button>}
      </>}
    </div>)}
    {messages.length < 5 && <div className={moduleStyles.toolbar}><button className="secondary small" onClick={() => addMessage("Text")}><Plus size={13} /> Text</button><button className="secondary small" onClick={() => addMessage("Image")}><Plus size={13} /> Image</button><button className="secondary small" onClick={() => addMessage("Flex message")}><Plus size={13} /> Flex</button><button className="secondary small" onClick={() => addMessage("Carousel")}><Plus size={13} /> Carousel</button></div>}
    <div className={moduleStyles.card} style={{ padding: 14, maxWidth: 360 }}><b>Stack preview</b><div style={{ display: "grid", gap: 8, marginTop: 8 }}>{messages.map(message => <div key={message.id} style={{ border: "1px solid #e3dfe6", borderRadius: 10, padding: 10, background: "#f4f1f8", fontSize: 12.5 }}>
      {message.type === "Text" && message.text}
      {message.type === "Image" && (message.imageUrl ? <img src={message.imageUrl} alt={message.altText} style={{ maxWidth: "100%", borderRadius: 6 }} /> : "[image]")}
      {message.type === "Flex message" && (() => { try { const flex = JSON.parse(message.flexJson || "{}") as { altText?: string }; return flex.altText ?? "[flex]"; } catch { return "[invalid flex]"; } })()}
      {message.type === "Carousel" && <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>{message.cards.map(card => <div key={card.title + card.url} style={{ minWidth: 110, border: "1px solid #ddd5e5", borderRadius: 6, padding: 6 }}><b style={{ fontSize: 11 }}>{card.title}</b><div style={{ fontSize: 10.5, color: "#6b6472" }}>{card.description}</div></div>)}</div>}
    </div>)}</div></div>
  </ChannelPanel>;
}

function MultichannelFields({ draft, update, saveCampaign, locale }: { draft: Campaign; update: (patch: Partial<Campaign>) => void; saveCampaign: (patch: Partial<Campaign>) => Promise<boolean>; locale:Locale }) {
  const values=channelValues(draft), labels=(Array.isArray(values.channels)?values.channels as string[]:[]).map(label=>label==="SMS"?"SMS/MMS/RCS":label), messages=(draft.config?.multichannelMessages??{}) as Record<string,Partial<Campaign>>;
  const [addMenu,setAddMenu]=useState(false),[emailVariant,setEmailVariant]=useState(0),[test,setTest]=useState(false),[testRequest,setTestRequest]=useState<TestRequest>({}),[testBusy,setTestBusy]=useState(false),[error,setError]=useState("");
  const choices=Object.entries(multichannelChannels), selected=choices.find(([label,key])=>labels.includes(label)&&key===draft.config?.previewChannel)?.[0]??labels[0], channel=(multichannelChannels as Record<string,string>)[selected];
  const child:Campaign={id:draft.id,name:draft.name,channel:(channel??"email") as Channel,status:"Draft",schedule:draft.schedule,audience:draft.audience,conversion:draft.conversion,sent:0,edited:draft.edited,...messages[channel],subject:messages[channel]?.subject??"",body:messages[channel]?.body??String((values.channelContent as Record<string,unknown>|undefined)?.[selected]??(selected==="SMS/MMS/RCS"?(values.channelContent as Record<string,unknown>|undefined)?.SMS:"")??""),config:{...messages[channel]?.config}};
  const childPatch=(patch:Partial<Campaign>)=>({config:{...draft.config,multichannelMessages:{...messages,[child.channel]:{...child,...patch,config:{...child.config,...patch.config}}}}});
  const patchChild=(patch:Partial<Campaign>)=>update(childPatch(patch));
  const openChannelTest=async(request:TestRequest={})=>{setError("");setTestBusy(true);try{if(await saveCampaign({})){setTestRequest(request);setTest(true);}else setError("Save the Campaign before testing this channel.");}finally{setTestBusy(false);}};
  const toggle=(label:string,enabled:boolean)=>{const key=multichannelChannels[label as keyof typeof multichannelChannels],next=enabled?[...new Set([...labels,label])]:labels.filter(v=>v!==label);update({config:{...draft.config,previewChannel:enabled?key:(multichannelChannels as Record<string,string>)[next[0]],channelValues:{...values,channels:next,rule:"Send all channels at once"},multichannelMessages:{...messages,...(enabled&&!messages[key]?{[key]:{channel:key,name:draft.name,subject:"",body:"",config:{}}}:{})}}});setAddMenu(false);setEmailVariant(0);};
  if(!labels.length)return <section><h2>Messaging channels</h2><p>Select a messaging channel to start composing your Campaign.</p><div className={fidelityStyles.choices}>{choices.map(([label,key])=>{const Icon=channelMeta[key as Channel].icon;return <button className={fidelityStyles.choice} key={key} onClick={()=>toggle(label,true)}><Icon size={28}/><strong>{label}</strong><small>{channelMeta[key as Channel].description}</small></button>;})}</div></section>;
  return <section><h2>Channels</h2><div className={fidelityStyles.row}><div className={fidelityStyles.tabs} role="tablist" aria-label="Campaign channels">{choices.filter(([label])=>labels.includes(label)).map(([label,key])=><button role="tab" aria-selected={selected===label} key={key} onClick={()=>{update({config:{...draft.config,previewChannel:key}});setEmailVariant(0);}}>{label}</button>)}</div><div className={fidelityStyles.anchor}><button className="secondary" aria-expanded={addMenu} onClick={()=>setAddMenu(!addMenu)}><Plus size={15}/> Add channel</button>{addMenu&&<div className={fidelityStyles.popover} role="menu">{choices.filter(([label])=>!labels.includes(label)).map(([label,key])=><button className={fidelityStyles.link} role="menuitem" style={{display:"block",padding:10}} key={key} onClick={()=>toggle(label,true)}>{label}</button>)}{choices.every(([label])=>labels.includes(label))&&<p>All available channels have been added.</p>}</div>}</div></div>{labels.filter(l=>!(l in multichannelChannels)).map(label=><p className="form-error" key={label}>{label} is unavailable in multichannel Campaigns. <button onClick={()=>update({config:{...draft.config,channelValues:{...values,channels:labels.filter(v=>v!==label)}}})}>Remove channel</button></p>)}{channel&&<div key={channel} style={{marginTop:20}}><div className={fidelityStyles.row} style={{justifyContent:"space-between",marginBottom:16}}><h3>{selected}</h3><button className={fidelityStyles.link} onClick={()=>toggle(selected,false)}>Remove channel</button></div>{channel==="email"?<EmailCompose locale={locale} draft={child} update={patchChild} saveEmail={async patch=>saveCampaign(childPatch(patch))} variant={emailVariant} setVariant={setEmailVariant} openTest={request=>void openChannelTest(request)}/>:channel==="sms"?<SmsCampaignComposer draft={child} update={patchChild} openTest={request=>void openChannelTest(request)}/>:channel==="whatsapp"?<WhatsAppEditor draft={child} update={patchChild}/>:channel==="webhook"?<WebhookEditor draft={child} update={patchChild} openTest={()=>void openChannelTest()}/>:<CampaignMessageEditor draft={child} update={patch=>patchChild(patch as Partial<Campaign>)} openTest={request=>void openChannelTest(request)}/>}<button className="secondary" disabled={testBusy} onClick={()=>void openChannelTest()}>{testBusy?"Saving…":"Preview and test channel"}</button></div>}{error&&<p role="alert" className="form-error">{error}</p>}{test&&<TestModal locale={locale} draft={child} variantIndex={emailVariant} initialRecipient={testRequest.recipient} initialVariantId={testRequest.variantId} close={()=>setTest(false)}/>}</section>;
}

function FeatureFlagFields({ draft, update }: { draft: Campaign; update: (patch: Partial<Campaign>) => void }) {
  const values = channelValues(draft); const set = (patch: Record<string, unknown>) => changeChannel(draft, update, patch);
  const [flags, setFlags] = useState<Array<{ id: string; name: string; status: string; data: { flagId: string } }>>([]);
  useEffect(() => { void fetch("/api/resources/feature-flags").then(r => r.json()).then(r => setFlags(r.data ?? [])); }, []);
  return <ChannelPanel title="Feature flag experiment" help="Select a saved flag with 0% global rollout. Experiment assignments are returned by the workspace SDK while the Campaign is active."><div className="form-grid"><Field label="Feature Flag"><select value={draft.subject ?? ""} onChange={event => update({ subject: event.target.value })}><option value="">Select a Feature Flag</option>{flags.filter(f => f.status !== "Archived").map(f => <option key={f.id} value={f.data.flagId}>{f.name} · {f.data.flagId}</option>)}</select></Field><Field label="Rollout"><input type="number" value={Number(values.rollout ?? 50)} min="0" max="100" onChange={event => set({ rollout: Math.min(100, Math.max(0, Number(event.target.value))) })}/></Field></div><Field label="Variant properties (JSON)"><textarea value={draft.body ?? ""} onChange={event => update({ body: event.target.value })} placeholder="{ }"/></Field><Field label="Primary conversion"><select value={draft.conversion ?? "Make Purchase"} onChange={event => update({ conversion: event.target.value })}><option>Make Purchase</option><option>Start Session</option></select></Field></ChannelPanel>;
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
function Schedule({locale,draft,update}:{locale:Locale;draft:Campaign;update:(patch:Partial<Campaign>)=>void}){return draft.channel==="iam"?<InAppSchedule locale={locale} draft={draft} update={update}/>:<div className="editor-body braze-flow"><CampaignSchedule draft={draft} update={patch=>update(patch as Partial<Campaign>)}/></div>;}
function Audience({ draft, update }: { locale: Locale; draft: Campaign; update: (p: Partial<Campaign>) => void }) { return <div className="editor-body braze-flow"><CampaignAudience draft={draft} update={patch=>update(patch as Partial<Campaign>)}/></div>; }

type ConversionEvent = { type: string; app: string; deadline: number; unit: string };
function conversionEvents(draft: Campaign): ConversionEvent[] { return resolveConversionEvents(draft); }

function Conversions({draft,update}:{locale:Locale;draft:Campaign;update:(patch:Partial<Campaign>)=>void}){return <div className="editor-body braze-flow"><CampaignConversions draft={draft} update={patch=>update(patch as Partial<Campaign>)}/></div>;}

function Review({ locale, draft, go, issues }: { locale: Locale; draft: Campaign; go: (step: number) => void; issues: string[] }) {
  return <div className="editor-body braze-review">
    <h2>{translate(locale,"Review Campaign Summary")}</h2><ReviewReach draft={draft}/>
    {issues.length>0&&<div className="review-issues" role="alert"><strong>Complete before launch</strong>{issues.map(issue=><p key={issue}>{issue}</p>)}</div>}
    <CampaignStandards draft={draft}/>
    <section className={fidelityStyles.detail}><div className="review-card-head"><h2>Messages</h2><button className={fidelityStyles.icon} aria-label="Edit Messages" onClick={()=>go(0)}><FileCode2 size={18}/></button></div><CampaignMessagesReview draft={draft}/></section>
    <section className={fidelityStyles.detail}><div className="review-card-head"><h2>Delivery</h2><button className={fidelityStyles.icon} aria-label="Edit Delivery" onClick={()=>go(1)}><FileCode2 size={18}/></button></div><h3>{draft.schedule==="One time"?"Scheduled Entry":draft.schedule==="Action-based"?"Action-Based Entry":"API-Triggered Entry"}</h3><p>{campaignScheduleSummary(draft)}</p></section>
    <section className={fidelityStyles.detail}><div className="review-card-head"><h2>Target Audience</h2><button className={fidelityStyles.icon} aria-label="Edit Target Audience" onClick={()=>go(2)}><FileCode2 size={18}/></button></div><h3>Audience Summary</h3><p>{audienceSummary(draft)}</p><h3>Entry Audience</h3><ul><ReviewWorkspacePolicies/></ul><CampaignAudienceStatistics draft={draft}/></section>
    <section className={fidelityStyles.detail}><div className="review-card-head"><h2>Conversion Events</h2><button className={fidelityStyles.icon} aria-label="Edit Conversion Events" onClick={()=>go(3)}><FileCode2 size={18}/></button></div>{resolveConversionEvents(draft).map((event,index)=><div className="review-conversion" key={index}><strong>{index===0?"Primary Conversion Event - A":`Conversion Event - ${String.fromCharCode(65+index)}`}</strong><p>{event.type}{event.eventName?` (${event.eventName})`:''} within {event.deadline} {event.unit.toLowerCase()}</p></div>)}</section>
  </div>;
}
function CampaignStandards({draft}:{draft:Campaign}){
  const [standards,setStandards]=useState<Array<{id:string;name:string}>>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{const abort=new AbortController();fetch('/api/resources/campaign-standards',{signal:abort.signal}).then(async response=>{if(!response.ok)throw Error('Standards could not be loaded.');return response.json();}).then(result=>setStandards(result.data??[])).catch(cause=>{if(!abort.signal.aborted)setError(cause.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[]);
  return <section className={`${fidelityStyles.detail} campaign-standards`}><h3>Agentic Standards <span className={fidelityStyles.limited}>New</span></h3>{loading?<p role="status">Loading Standards…</p>:error?<p role="alert">{error}</p>:!standards.length?<p>No Standard set up yet. <a className={fidelityStyles.link} href={routeForPage('agents')}>Create one in Agent Console</a></p>:<><p>{standards.map(item=>item.name).join(', ')}</p><a className={fidelityStyles.link} href={`${routeForPage('agents')}?campaign=${encodeURIComponent(draft.id)}`}>Open Standards evaluation</a></>}</section>;
}

function ReviewWorkspacePolicies() {
  const [limits, setLimits] = useState<Record<string, unknown>>(); const [suppressionCount, setSuppressionCount] = useState<number>();
  useEffect(() => { void Promise.all([fetch("/api/resources/messaging-rate-limits").then(r => r.json()), fetch("/api/resources/suppression-lists").then(r => r.json())]).then(([limit, suppression]) => { setLimits(limit.data?.[0]?.data ?? {}); setSuppressionCount(suppression.data?.length ?? 0); }); }, []);
  return <><li>{limits ? limits.enforce ? `Workspace Messaging Rate Limits ON: ${limits.maxPerMinute} per minute, ${limits.maxPerDay} per day` : "Workspace Messaging Rate Limits OFF" : "Loading workspace delivery limits…"}</li><li>{suppressionCount === undefined ? "Loading suppression lists…" : `${suppressionCount} workspace suppression entries apply.`}</li></>;
}
function ReviewReach({ draft }: { draft: Campaign }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { const controller = new AbortController(); const query = new URLSearchParams({ audience: draft.audience ?? "All Users", channel: draft.channel, eligibility: String(draft.config?.subscribeEligibility ?? "subscribed") }); if (draft.config?.audienceCountry) query.set("country", String(draft.config.audienceCountry)); if (draft.config?.audienceExcludeCountry) query.set("excludeCountry", String(draft.config.audienceExcludeCountry)); if (typeof draft.config?.subscriptionGroupId === "string") query.set("subscriptionGroupId", draft.config.subscriptionGroupId); query.set("engagement", "campaign"); if (Array.isArray(draft.config?.tags)) for (const tag of draft.config.tags) if (typeof tag === "string") query.append("tag", tag); fetch(`/api/audience/estimate?${query}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setCount(Number(data.reachable)); }).catch(() => {}); return () => controller.abort(); }, [draft.audience, draft.channel, draft.config?.audienceCountry, draft.config?.audienceExcludeCountry, draft.config?.subscribeEligibility, draft.config?.subscriptionGroupId, draft.config?.tags]);
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
  useEffect(() => { const controller = new AbortController(); const query = new URLSearchParams({ audience: draft.audience ?? "All Users", channel: draft.channel }); if (draft.config?.audienceCountry) query.set("country", String(draft.config.audienceCountry)); if (draft.config?.audienceExcludeCountry) query.set("excludeCountry", String(draft.config.audienceExcludeCountry)); query.set("eligibility", String(draft.config?.subscribeEligibility ?? "subscribed")); if (typeof draft.config?.subscriptionGroupId === "string") query.set("subscriptionGroupId", draft.config.subscriptionGroupId); query.set("engagement", "campaign"); if (Array.isArray(draft.config?.tags)) for (const tag of draft.config.tags) if (typeof tag === "string") query.append("tag", tag); fetch(`/api/audience/estimate?${query}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setEstimate(data); }).catch(() => {}); return () => controller.abort(); }, [draft.audience, draft.channel, draft.config?.audienceCountry, draft.config?.audienceExcludeCountry, draft.config?.subscribeEligibility, draft.config?.subscriptionGroupId, draft.config?.tags]);
  const percentage = estimate?.total ? Math.round(estimate.reachable / estimate.total * 1000) / 10 : 0;
  return <div className="population-grid"><div><h4>Exact users</h4><strong>{estimate?.reachable.toLocaleString() ?? "…"}</strong><p>{percentage}% of total users</p><div className="population-bar"><span style={{ width: `${percentage}%` }}/></div></div><div><h4>Channel breakdown</h4><table><tbody><tr><th>{channelMeta[draft.channel].title}</th><td/></tr><tr><td>Reachable Users</td><td>{estimate?.reachable.toLocaleString() ?? "…"}</td></tr><tr><td>% of Workspace</td><td>{percentage}%</td></tr></tbody></table></div></div>;
}
function Toggle({ title, help, checked = false, value, onChange }: { title: string; help: string; checked?: boolean; value?: boolean; onChange?: (value: boolean) => void }) { const [localValue, setLocalValue] = useState(checked); const active = value ?? localValue; return <div className="toggle-row"><div><b>{title}</b><small>{help}</small></div><button type="button" role="switch" aria-checked={active} aria-label={title} className={className("switch", active && "on")} onClick={() => { if (onChange) onChange(!active); else setLocalValue(!active); }}><i/></button></div>; }

function LiveDemoLab({ locale, notify }: { locale: Locale; notify: (message: string) => void }) {
  const [working, setWorking] = useState<string | null>(null);
  const [state, setState] = useState<{ simulatedTime: string; pendingReceipts: number } | null>(null);
  useEffect(() => { void fetch("/api/demo").then(response => response.json()).then(setState).catch(() => {}); }, []);
  const actions = [["advance", "Advance demo clock", "Move the local demo clock forward by one day"], ["receipts", "Generate delivery receipts", "Write eligible open and click events from completed deliveries"], ["failure", "Inject a failure", "Write a rate-limit failure into the activity log"], ["reset", "Reset sample data", "Restore campaigns, resources, users and local events"]] as const;
  const run = async (action: string) => { setWorking(action); try { const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Demo action failed."); setState(result.state); notify(result.message); } catch (cause) { notify(cause instanceof Error ? cause.message : "Demo action failed."); } finally { setWorking(null); } };
  return <section className="page-content"><div className="page-heading"><div><h1>{translate(locale, "Demo Lab")}</h1><p>{translate(locale, "Control the same SQLite data that powers campaign execution, activity, and reports.")}</p></div></div>{state && <div className="demo-state"><b>{translate(locale, "Demo clock")}: {formatDate(locale, state.simulatedTime, { dateStyle: "medium", timeStyle: "short" })}</b><span>{formatNumber(locale, state.pendingReceipts)} {translate(locale, "deliveries awaiting receipt generation")}</span><small>{translate(locale, "The clock is a local simulation; it does not trigger scheduled campaigns.")}</small></div>}<div className="lab-grid">{actions.map(([action, title, description]) => <button key={action} className="lab-action" disabled={working !== null} onClick={() => void run(action)}><Zap size={20}/><b>{translate(locale, working === action ? "Working…" : title)}</b><small>{translate(locale, description)}</small></button>)}</div></section>;
}
