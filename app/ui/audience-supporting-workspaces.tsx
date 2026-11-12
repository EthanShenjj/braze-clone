"use client";

import { useState } from "react";
import { Eye, Info, MessageCircle, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import styles from "./audience-supporting-workspaces.module.css";
import FullLiveManageAudienceWorkspace from "./audience-manage-workspace";

type SupportingProps = { locale?: Locale; notify?: (message: string) => void; openPage?: (page: string) => void; onOpenWorkspace?: () => void };

function EmptyRecordsIllustration() {
  return <img className={styles.recordsIllustration} src="/braze-audience/empty-records.svg" alt=""/>;
}

function PermissionIllustration() {
  return <img className={styles.permissionIllustration} src="/braze-audience/no-permissions.svg" alt=""/>;
}

export function FullImportUsersWorkspace({ onOpenWorkspace }: SupportingProps) {
  const [tour, setTour] = useState(true);
  return <section className={`${styles.page} ${styles.importPage}`}>
    <div className={styles.importPermission}><PermissionIllustration/><h2>You need &quot;View Import Users&quot; or &quot;Import Users&quot; permission to access the page.</h2><p>Contact your company&apos;s administrator to update your permission</p></div>
    {tour && <aside className={styles.importTour} aria-label="Upload data in the live workspace"><button className={styles.tourClose} aria-label="Close" onClick={() => setTour(false)}><X size={21}/></button><h2>Upload data in the live workspace</h2><p>CSV uploads are only supported in the live workspace. Switch to your live workspace to start exploring Braze with your own data.</p><button className={styles.tourDone} onClick={() => { setTour(false); onOpenWorkspace?.(); }}>Got it</button></aside>}
  </section>;
}

export function FullManageAudienceWorkspace({ notify }: SupportingProps) {
  return <FullLiveManageAudienceWorkspace notify={notify}/>;
}

export function DemoManageAudienceWorkspace({ notify }: SupportingProps) {
  const [tab, setTab] = useState<"Merge users" | "Delete users">("Merge users");
  return <section className={`${styles.page} ${styles.managePage}`}>
    <h1>Manage Audience</h1>
    <div className={styles.feedback}><MessageCircle size={18}/><span>Have feedback on this feature?</span><button onClick={() => notify?.("Contact your Braze representative to share feedback on Manage Audience.")}>Send us your thoughts</button></div>
    <div className={styles.tabs} role="tablist" aria-label="Manage Audience">{(["Merge users", "Delete users"] as const).map(value => <button role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{value}</button>)}</div>
    {tab === "Merge users" ? <section className={styles.mergeCard}>
      <div className={styles.cardTitle}><h2>Merge users</h2><span className={styles.viewOnly}><Eye size={13}/>View only</span></div>
      <p className={styles.muted}>Merges and previews from the last 30 days are listed</p>
      <h3 className={styles.noResultsTitle}>No Results Found</h3>
      <table className={styles.mergeTable}><thead><tr><th aria-label="Details"/><th>Run date <Info size={11}/></th><th>Requester</th><th>Type</th><th>Status <Info size={11}/></th><th>Profiles<br/>previewed <Info size={11}/></th><th>Profiles<br/>merged <Info size={11}/></th></tr></thead><tbody><tr><td colSpan={7}><div className={styles.noRecords}><EmptyRecordsIllustration/><strong>No results found</strong></div></td></tr></tbody></table>
    </section> : <section className={styles.permission} role="tabpanel"><PermissionIllustration/><h2>You need &quot;View User Deletion Records&quot; permissions to access this page</h2><p>Contact your company&apos;s administrator to update your permission.</p></section>}
  </section>;
}

const extensionFeatures = [
  ["Target customers within a broader timeframe", "Engage customers based on specific actions they took in the past two years to get a holistic view into their long-term actions and behaviors."],
  ["Get granular with custom event properties", "Make your messaging even more personalized by adding event properties, like the exact product that was viewed, to your segmentation criteria."],
  ["Unlock new segmentation use cases", "Segment your audience on additional data types and order of events using SQL advanced segmentation to describe the relationship of data."],
] as const;
const audienceCapabilities = [
  ["Segments", "Create tailored audiences using customers’ demographic, behavioral, and technical characteristics and actions.", "segments"],
  ["Segment Insights", "Compare how one segment is performing against other segments across a range of KPIs.", "segment-insights"],
  ["Predictive Events", "Identify and engage customers based on their likelihood to make a purchase or perform any other high value action.", "predictive-events"],
] as const;

export function FullSegmentExtensionsWorkspace({ openPage }: SupportingProps) {
  return <section className={styles.extensionPage}>
    <div className={styles.extensionHero}><span className={styles.paidPlan}>AVAILABLE FOR PAID PLANS</span><h1>Build more precise<br/>audiences with Segment<br/>Extensions</h1><a className={styles.primary} href="https://www.braze.com/company/contact-sales" target="_blank" rel="noreferrer">Connect with sales</a></div>
    <div className={styles.extensionFeatures}>{extensionFeatures.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div>
    <img className={styles.extensionFeatureVisual} src="/braze-audience/extensions-feature.png" alt=""/>
    <section className={styles.capabilities}><img className={styles.capabilityVisual} src="/braze-audience/extensions-capabilities.png" alt="Explore our other audience capabilities"/><h2>Explore our other audience capabilities</h2><div className={styles.capabilityGrid}>{audienceCapabilities.map(([title, description, page]) => <article key={title}><h3>{title}</h3><p>{description}</p>{page === "predictive-events" ? <a href="https://dashboard-09.braze.com/engagement/predictions/predictions/6af4374b46d3080087f1c558?modelType=%22purchase%22" target="_blank" rel="noreferrer">{title} ↗</a> : <button onClick={() => openPage?.(page)}>{title}<span aria-hidden="true"> ↗</span></button>}</article>)}</div></section>
    <section className={styles.caseStudies}><h2>See how others are reaching customers in Braze</h2><div>{[["Email", "Retention", "Showmax", "3"], ["Email", "Braze Alloys", "Yonder", "4"]].map(([channel, category, brand, minutes]) => <article key={brand}><img className={styles.caseStudyVisual} src={`/braze-audience/case-study-${brand.toLowerCase()}.svg`} alt="torchie"/><p><span>{channel}</span><span>{category}</span></p><h3>Read the case study: {brand}</h3><small>{minutes} minute read</small></article>)}</div></section>
    <section className={styles.bonfire}><img src="/braze-audience/bonfire-banner.png" alt="Banner Image"/><h3>Got a Braze question? Crowdsource advice from Braze Bonfire.</h3><a className={styles.primary} href="https://community.braze.com/" target="_blank" rel="noreferrer">Join the conversation</a></section>
  </section>;
}
