"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, Info, X } from "lucide-react";
import { formatNumber, translate, type Locale } from "@/lib/i18n";
import type { GlobalControlCommand, GlobalControlSnapshot } from "@/lib/global-control-model";
import styles from "./global-control-group.module.css";

const metricDescriptions: Record<string, string> = {
  "Global Control Group": "Users withheld from campaigns and Canvases, except tagged exclusions.",
  "Treatment group": "All users outside the Global Control Group.",
  "Treatment sample": "A random sample of non-control users, approximately the size of the control group.",
};

export default function GlobalControlGroup({ locale, notify }: { locale: Locale; notify?: (message: string) => void }) {
  const t = (text: string) => translate(locale, text);
  const [snapshot, setSnapshot] = useState<GlobalControlSnapshot | null>(null);
  const [percentage, setPercentage] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDisable, setConfirmDisable] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError("");
    void fetch("/api/global-control-group", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load Global Control Group settings.");
      setSnapshot(result);
      setPercentage(result.settings.percentage === null ? "" : String(result.settings.percentage));
      setTags(result.settings.exclusionTags);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load settings."); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!picker.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => { if (confirmDisable) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmDisable]);

  const save = async (command: GlobalControlCommand) => {
    if (!snapshot || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/global-control-group", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...command, expectedUpdatedAt: snapshot.updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save Global Control Group settings.");
      setSnapshot(result);
      if (command.action === "update-exclusions") { setTags(result.settings.exclusionTags); setOpen(false); setQuery(""); }
      else setPercentage(result.settings.percentage === null ? "" : String(result.settings.percentage));
      setConfirmDisable(false);
      notify?.(t(command.action === "disable" ? "Global Control Group disabled." : command.action === "update-exclusions" ? "Exclusion settings updated." : "Global Control Group enabled."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save settings."); }
    finally { setBusy(false); }
  };

  const enabled = snapshot?.settings.enabled ?? false;
  const valid = percentage !== "" && Number.isInteger(Number(percentage)) && Number(percentage) >= 1 && Number(percentage) <= 15;
  const percentageDirty = percentage !== (snapshot?.settings.percentage === null || !snapshot ? "" : String(snapshot.settings.percentage));
  const tagsDirty = Boolean(snapshot) && (tags.length !== snapshot!.settings.exclusionTags.length || tags.some(tag => !snapshot!.settings.exclusionTags.includes(tag)));
  const counts = snapshot ? enabled ? snapshot.counts : valid ? { total: snapshot.counts.total, control: Math.round(snapshot.counts.total * Number(percentage) / 100), treatment: snapshot.counts.total - Math.round(snapshot.counts.total * Number(percentage) / 100), sample: Math.round(snapshot.counts.total * Number(percentage) / 100) } : { total: snapshot.counts.total, control: null, treatment: null, sample: null } : null;
  const choices = snapshot?.availableTags.filter(tag => tag.toLowerCase().includes(query.toLowerCase())) ?? [];
  const toggle = (tag: string) => { setTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag]); input.current?.focus(); };

  return <section className={styles.page} aria-busy={!snapshot && !error}>
    <div className={styles.permissionNotice} role="status"><Info size={23}/><span>{t("Users with the 'Edit Global Control Group' permission can edit, enable, and disable the Global Control Group.")}</span></div>
    <section className={styles.card}>
      <div className={styles.heading}><h1>{t("Global Control Group Settings")}</h1>{enabled && <div className={styles.headerActions}><a href="/api/global-control-group/export" download>{t("Export")}</a><button disabled={busy} onClick={() => setConfirmDisable(true)}>{t("Disable Global Control Group")}</button></div>}</div>
      {error && <div className={styles.error} role="alert">{t(error)} <button disabled={busy} onClick={() => { setConfirmDisable(false); setReload(value => value + 1); }}>{t("Reload settings")}</button></div>}
      {!snapshot && !error && <p role="status">{t("Loading settings…")}</p>}
      <div className={styles.section}>
        <h2>{t("Audience settings")}</h2><p>{t("Specify the percentage of users to randomly assign to the Global Control Group.")}</p>
        <div className={styles.audiencePanel}>
          <div className={styles.assignment}><span>{t("Assign")}</span><label className={styles.percentField}><input aria-label={t("Global Control Group percentage")} aria-describedby={percentageDirty && !valid ? "gcg-percentage-error" : undefined} type="number" min={1} max={15} step={1} disabled={!snapshot || enabled || busy} value={percentage} onChange={event => setPercentage(event.target.value)}/><span>%</span></label><span>{t("of all users to the Global Control Group")}</span></div>
          <div className={styles.metrics}>{([ ["All users", counts?.total], ["Global Control Group", counts?.control], ["Treatment group", counts?.treatment], ["Treatment sample", counts?.sample] ] as const).map(([label, value], index) => <div key={label}><span className={styles.metricLabel}>{t(label)}{index > 0 && <Info size={12} aria-label={t(metricDescriptions[label])}><title>{t(metricDescriptions[label])}</title></Info>}</span><strong>{value == null ? "--" : formatNumber(locale, value)}</strong></div>)}</div>
        </div>
        {percentageDirty && !valid && <p className={styles.validation} id="gcg-percentage-error" role="alert">{t("Enter a whole number between 1 and 15.")}</p>}
        <div className={styles.estimateNotice}><Info size={23}/><span>{t("Audience counts are estimates.")}</span></div>
        {enabled ? <p className={styles.hint}>{t("To change the percentage, disable the current Global Control Group and create a new one.")}</p> : <div className={styles.actions}><button disabled={!snapshot || !percentageDirty || busy} onClick={() => setPercentage(snapshot?.settings.percentage === null ? "" : String(snapshot?.settings.percentage ?? ""))}>{t("Cancel")}</button><button className={styles.primary} disabled={!snapshot || !valid || busy} onClick={() => void save({ action: "enable", percentage: Number(percentage) })}>{t(busy ? "Saving…" : "Save")}</button></div>}
      </div>
      <div className={styles.divider}/>
      <div className={styles.section}>
        <h2>{t("Exclusion settings")}</h2><p>{t("Users in the Global Control Group will be eligible to receive messages from campaigns and Canvases with any specific tags added here.")}</p>
        <label className={styles.tagsLabel} htmlFor="global-control-tags">{t("Tags")}</label>
        <div className={styles.picker} ref={picker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
          <div className={styles.tagField}>
            {tags.map(tag => <span className={styles.chip} key={tag}>{tag}<button aria-label={`${t("Remove tag")} ${tag}`} disabled={busy} onClick={() => toggle(tag)}><X size={12}/></button></span>)}
            <input ref={input} id="global-control-tags" role="combobox" aria-expanded={open} aria-controls="global-control-tag-options" aria-autocomplete="list" aria-activedescendant={open && choices.length ? `gcg-tag-${Math.min(activeOption, choices.length - 1)}` : undefined} disabled={!snapshot || busy} placeholder={tags.length ? "" : t("Add tags")} value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActiveOption(0); setOpen(true); }} onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveOption(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
              if (event.key === "Enter") { event.preventDefault(); if (open && choices[activeOption]) toggle(choices[activeOption]); else setOpen(true); }
            }}/><button className={styles.chevron} aria-label={t("Show tags")} disabled={!snapshot || busy} onMouseDown={event => event.preventDefault()} onClick={() => { if (!open) input.current?.focus(); setOpen(!open); }}><ChevronDown size={16}/></button>
          </div>
          {open && <div id="global-control-tag-options" className={styles.tagMenu} role="listbox" aria-multiselectable="true" aria-label={t("Exclusion tags")}>
            {choices.map((tag, index) => <button type="button" role="option" id={`gcg-tag-${index}`} aria-selected={tags.includes(tag)} className={activeOption === index ? styles.highlighted : ""} key={tag} onMouseDown={event => event.preventDefault()} onClick={() => toggle(tag)}>{tag}{tags.includes(tag) && <Check size={14}/>}</button>)}
            {!choices.length && <p>{t(query ? "No tags found." : "No tags on active campaigns or Canvases.")}</p>}
          </div>}
        </div>
        <div className={styles.actions}><button className={styles.primary} disabled={!snapshot || !tagsDirty || busy} onClick={() => void save({ action: "update-exclusions", exclusionTags: tags })}>{t(busy ? "Saving…" : "Update exclusions")}</button></div>
      </div>
    </section>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="gcg-disable-title" onCancel={event => { if (busy) event.preventDefault(); else setConfirmDisable(false); }} onClose={() => setConfirmDisable(false)}>
      <button className={styles.dialogClose} aria-label={t("Close")} disabled={busy} onClick={() => setConfirmDisable(false)}><X size={20}/></button><div className={styles.dialogHeading}><CircleAlert size={36}/><h2 id="gcg-disable-title">{t("You are making changes to Global Messaging Settings")}</h2></div><p>{t("Users in this group will immediately become eligible for campaigns and Canvases. The current group cannot be restored. Export its members before disabling it.")}</p>
      {error && <p role="alert" className={styles.validation}>{t(error)}</p>}
      <div className={styles.actions}><button disabled={busy} onClick={() => setConfirmDisable(false)}>{t("Cancel")}</button><button className={styles.primary} disabled={busy} onClick={() => void save({ action: "disable" })}>{t(busy ? "Saving…" : "Proceed")}</button></div>
    </dialog>
  </section>;
}
