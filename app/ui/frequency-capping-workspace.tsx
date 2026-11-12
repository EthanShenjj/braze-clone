"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { frequencyChannels, frequencyChannelLabels, frequencyWindowLabel, validateFrequencySettings, type FrequencyRule, type FrequencySettings } from "@/lib/frequency-capping-model";
import { publishFrequencyChanges, useFrequencySnapshot, useFrequencyWorkspace } from "./frequency-capping-controls";
import { useUnsavedChanges } from "./workspace-unsaved";
import styles from "./frequency-capping.module.css";
function WindowField({ rule, change }: { rule: FrequencyRule; change: (patch: Partial<FrequencyRule>) => void }) {
  const [unit, setUnit] = useState(rule.seconds % 604800 === 0 ? 604800 : rule.seconds % 86400 === 0 ? 86400 : 60);
  return <div className={styles.window}><input aria-label="Window count" type="number" min="1" step="1" max={Math.floor(2592000 / unit)} value={rule.seconds / unit} onChange={e => change({ seconds: Number(e.target.value) * unit })}/><select aria-label="Window unit" value={unit} onChange={e => { const next = Number(e.target.value); change({ seconds: rule.seconds / unit * next }); setUnit(next); }}><option value="60">Minutes</option><option value="86400">Days</option><option value="604800">Weeks</option></select></div>;
}
export default function FrequencyCappingWorkspace({ notify }: { locale: Locale; notify: (message: string) => void }) {
  const workspaceId = useFrequencyWorkspace(), state = useFrequencySnapshot(workspaceId, false), [draft, setDraft] = useState<FrequencySettings | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [categoryName, setCategoryName] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => { setDraft(state.snapshot ? structuredClone(state.snapshot.settings) : null); setError(""); }, [state.snapshot]);
  const dirty = Boolean(draft && state.snapshot && JSON.stringify(draft) !== JSON.stringify(state.snapshot.settings));
  useUnsavedChanges(dirty);
  const patch = (value: Partial<FrequencySettings>) => setDraft(current => current ? { ...current, ...value } : current);
  const save = async () => {
    if (!draft || !state.snapshot || busy) return;
    try {
      validateFrequencySettings(draft, state.snapshot.capabilities.maxRules); setBusy(true); setError("");
      const response = await fetch("/api/frequency-capping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, settings: draft, expectedUpdatedAt: state.snapshot.updatedAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to save frequency rules.");
      state.setSnapshot(result); publishFrequencyChanges(workspaceId); notify("Frequency capping rules saved.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save frequency rules."); } finally { setBusy(false); }
  };
  const addCategory = () => { const name = categoryName.trim(); if (!draft || !name) return; if (draft.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { setError("A category with this name already exists."); return; } patch({ categories: [...draft.categories, { id: crypto.randomUUID(), name }] }); setCategoryName(""); };
  const update = (id: string, value: Partial<FrequencyRule>) => draft && patch({ rules: draft.rules.map(rule => rule.id === id ? { ...rule, ...value } : rule) });
  return <section className={`page-content ${styles.workspace}`}><div className={styles.heading}><div><h1>Frequency Capping Rules</h1><p>Limit how often users receive messages across campaigns and Canvas steps.</p></div>{state.snapshot?.capabilities.canEdit === false && <span className={styles.badge}>View only</span>}</div>
    {state.error && <div role="alert" className={styles.error}>{state.error} <button onClick={() => void state.reload()}>Retry</button></div>}
    {!state.snapshot && !state.error && <p>Loading frequency rules…</p>}
    {state.snapshot && draft && <>
      <fieldset className={styles.card} disabled={busy || state.loading || !state.snapshot.capabilities.canEdit}>
        <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })}/>Enable workspace frequency capping</label><span>{draft.rules.length} / {state.snapshot.capabilities.maxRules} rules</span></div>
        <p className={styles.help}>Every applicable rule must be satisfied. Windows support minutes, days and weeks, up to 30 days. Daily windows use the recipient&apos;s local calendar.</p>
        {!draft.rules.length && <div className={styles.empty}>You have not yet defined any frequency limits. Select Add rule to create one.</div>}
        {draft.rules.map((rule, index) => <section className={styles.rule} key={`${state.snapshot?.updatedAt}:${revision}:${rule.id}`} aria-label={`Frequency rule ${index + 1}`}><div className={styles.toolbar}><h3>Rule {index + 1}</h3><button className={styles.remove} aria-label={`Delete rule ${index + 1}`} onClick={() => patch({ rules: draft.rules.filter(row => row.id !== rule.id) })}>Delete rule</button></div><div className={styles.fields}>
          <label className={styles.field}>Channel<select value={rule.type} onChange={e => update(rule.id, { type: e.target.value as FrequencyRule["type"] })}>{frequencyChannels.map(channel => <option key={channel} value={channel}>{frequencyChannelLabels[channel]}</option>)}</select></label>
          <label className={styles.field}>Maximum messages per user<input type="number" min="1" step="1" value={rule.messages} onChange={e => update(rule.id, { messages: Number(e.target.value) })}/></label>
          <div className={styles.field}>Every<WindowField rule={rule} change={value => update(rule.id, value)}/></div>
        </div><div className={styles.fields}><label className={styles.field}>Tag filter (optional)<select value={rule.tagId ?? ""} onChange={e => update(rule.id, { tagId: e.target.value || undefined })}><option value="">All tags</option>{rule.tagId && !state.snapshot?.availableTags.some(tag => tag.id === rule.tagId) && <option value={rule.tagId}>Unavailable tag — choose another</option>}{state.snapshot?.availableTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label className={styles.field}>Category filter (optional)<select value={rule.categoryId ?? ""} onChange={e => update(rule.id, { categoryId: e.target.value || undefined })}><option value="">All categories</option>{draft.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
          <p className={styles.help}>No more than {rule.messages} {frequencyChannelLabels[rule.type]} send(s) per user every {frequencyWindowLabel(rule.seconds)}. Selected filters combine with AND.</p>
        </section>)}
        <button className="secondary" disabled={draft.rules.length >= state.snapshot.capabilities.maxRules} onClick={() => patch({ rules: [...draft.rules, { id: crypto.randomUUID(), type: "any", messages: 3, seconds: 86400 }] })}>+ Add rule</button>
        <details className={styles.categories}><summary>Message categories ({draft.categories.length})</summary><p className={styles.help}>Assign these categories to campaigns and Canvases to scope frequency rules.</p><ul>{draft.categories.map(category => <li key={category.id}>{category.name}</li>)}</ul><div className={styles.window}><input aria-label="New message category" placeholder="Category name" maxLength={100} value={categoryName} onChange={e => setCategoryName(e.target.value)}/><button className="secondary" disabled={!categoryName.trim()} onClick={addCategory}>Add category</button></div></details>
      </fieldset>
      {error && <div role="alert" className={styles.error}>{error} <button type="button" onClick={() => { if (!dirty || window.confirm("Discard unsaved rules and reload saved settings?")) void state.reload(); }}>Reload saved rules</button></div>}
      <div className={styles.footer}><button className="secondary" disabled={!dirty || busy} onClick={() => { setDraft(structuredClone(state.snapshot!.settings)); setRevision(value => value + 1); setError(""); }}>Revert</button><button className="primary" disabled={!dirty || busy || state.loading || !state.snapshot.capabilities.canEdit} onClick={() => void save()}>{busy ? "Saving…" : "Save rules"}</button>{dirty && <span className={styles.help}>Unsaved changes</span>}</div>
    </>}
  </section>;
}
