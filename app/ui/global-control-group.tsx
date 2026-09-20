import { Info } from "lucide-react";
import { formatNumber, translate, type Locale } from "@/lib/i18n";
import styles from "./global-control-group.module.css";

const audienceMetrics = [
  ["All users", 1642],
  ["Global Control Group", null],
  ["Treatment group", null],
  ["Treatment sample", null],
] as const;

export default function GlobalControlGroup({ locale }: { locale: Locale }) {
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
              <input aria-label={translate(locale, "Global Control Group percentage")} type="number" min={1} max={15} disabled />
              <span>%</span>
            </label>
            <span>{translate(locale, "of all users to the Global Control Group")}</span>
          </div>

          <div className={styles.metrics}>
            {audienceMetrics.map(([label, value]) => <div key={label}>
              <span className={styles.metricLabel}>{translate(locale, label)}</span>
              <strong>{value === null ? "--" : formatNumber(locale, value)}</strong>
            </div>)}
          </div>
        </div>

        <div className={styles.estimateNotice}>
          <span className={styles.noticeIcon}><Info size={17}/></span>
          <span>{translate(locale, "Audience counts are estimates.")}</span>
        </div>

        <div className={styles.actions}>
          <button type="button" disabled>{translate(locale, "Cancel")}</button>
          <button type="button" className={styles.save} disabled>{translate(locale, "Save")}</button>
        </div>
      </div>

      <div className={styles.divider}/>

      <div className={styles.section}>
        <h2>{translate(locale, "Exclusion settings")}</h2>
        <p>{translate(locale, "Users in the Global Control Group will be eligible to receive messages from campaigns and Canvases with any specific tags added here.")}</p>
        <label className={styles.tagsLabel} htmlFor="global-control-tags">{translate(locale, "Tags")}</label>
        <div className={styles.exclusionRow}>
          <input id="global-control-tags" disabled placeholder={translate(locale, "Add tags")} />
          <button type="button" disabled>{translate(locale, "Update exclusions")}</button>
        </div>
      </div>
    </section>
  </section>;
}
