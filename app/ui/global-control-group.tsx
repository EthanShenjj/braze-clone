"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { formatNumber, translate, type Locale } from "@/lib/i18n";
import styles from "./global-control-group.module.css";

// Editable Global Control Group settings persisted through /api/resources.
type GcgData = { percentage?: number; exclusionTags?: string[]; enabled?: boolean };

export default function GlobalControlGroup({ locale, notify }: { locale: Locale; notify?: (message: string) => void }) {
  const [percentage, setPercentage] = useState(5);
  const [tags, setTags] = useState("");
  const [saved, setSaved] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void fetch("/api/resources/global-control-group").then(r => r.json()).then(result => {
      const record = (result.data ?? [])[0];
      if (record) {
        setResourceId(record.id);
        const data = record.data as GcgData;
        if (typeof data.percentage === "number") setPercentage(data.percentage);
        if (Array.isArray(data.exclusionTags)) setTags(data.exclusionTags.join(", "));
        setSaved(Boolean(data.enabled));
      }
    }).catch(() => {});
    void fetch("/api/audience/estimate?audience=All%20Users&eligibility=all").then(r => r.json()).then(d => setTotal(d.total ?? null)).catch(() => {});
  }, []);

  const save = async () => {
    const data: GcgData = { percentage, enabled: true, exclusionTags: tags.split(",").map(tag => tag.trim()).filter(Boolean) };
    const response = await fetch("/api/resources/global-control-group", {
      method: resourceId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resourceId ? { id: resourceId, name: "Global Control Group", data } : { name: "Global Control Group", description: "Workspace control group settings", data }),
    });
    if (!response.ok) { notify?.("Unable to save the Global Control Group."); return; }
    const record = await response.json();
    setResourceId(record.id);
    setSaved(true);
    setDirty(false);
    notify?.("Global Control Group settings saved.");
  };

  const gcgCount = total !== null ? Math.round(total * percentage / 100) : null;
  const treatment = total !== null && gcgCount !== null ? total - gcgCount : null;
  const audienceMetrics: [string, number | null][] = [
    [translate(locale, "All users"), total],
    [translate(locale, "Global Control Group"), gcgCount],
    [translate(locale, "Treatment group"), treatment],
    [translate(locale, "Treatment sample"), treatment],
  ];

  return <section className={styles.page}>
    <div className={styles.permissionNotice} role="status">
      <span className={styles.noticeIcon}><Info size={17}/></span>
      <span>{translate(locale, "Users with the 'Edit Global Control Group' permission can edit, enable, and disable the Global Control Group.")}</span>
    </div>

    <section className={styles.card}>
      <h1>{translate(locale, "Global Control Group Settings")}</h1>

      <div className={styles.section}>
        <h2>{translate(locale, "Audience settings")}</h2>
        <p>{translate(locale, "Specify the percentage of users to randomly assign to the Global Control Group.")}</p>

        <div className={styles.audiencePanel}>
          <div className={styles.assignment}>
            <span>{translate(locale, "Assign")}</span>
            <label className={styles.percentField}>
              <input aria-label={translate(locale, "Global Control Group percentage")} type="number" min={1} max={15} value={percentage} onChange={event => { setPercentage(Math.min(15, Math.max(1, Number(event.target.value) || 1))); setDirty(true); }} />
              <span>%</span>
            </label>
            <span>{translate(locale, "of all users to the Global Control Group")}</span>
          </div>

          <div className={styles.metrics}>
            {audienceMetrics.map(([label, value]) => <div key={label}>
              <span className={styles.metricLabel}>{label}</span>
              <strong>{value === null ? "--" : formatNumber(locale, value)}</strong>
            </div>)}
          </div>
        </div>

        <div className={styles.estimateNotice}>
          <span className={styles.noticeIcon}><Info size={17}/></span>
          <span>{translate(locale, "Audience counts are estimates.")}</span>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={() => notify?.("Changes discarded.")}>{translate(locale, "Cancel")}</button>
          <button type="button" className={styles.save} onClick={() => void save()}>{saved && !dirty ? translate(locale, "All users") + " ✓" : translate(locale, "Save")}</button>
        </div>
      </div>

      <div className={styles.divider}/>

      <div className={styles.section}>
        <h2>{translate(locale, "Exclusion settings")}</h2>
        <p>{translate(locale, "Users in the Global Control Group will be eligible to receive messages from campaigns and Canvases with any specific tags added here.")}</p>
        <label className={styles.tagsLabel} htmlFor="global-control-tags">{translate(locale, "Tags")}</label>
        <div className={styles.exclusionRow}>
          <input id="global-control-tags" value={tags} onChange={event => { setTags(event.target.value); setDirty(true); }} placeholder={translate(locale, "Add tags")} />
          <button type="button" onClick={() => void save()}>{translate(locale, "Update exclusions")}</button>
        </div>
      </div>
    </section>
  </section>;
}
