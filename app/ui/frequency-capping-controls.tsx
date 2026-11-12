"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { audienceWorkspaceId } from "@/lib/audience-navigation";
import { subscribeTagChanges } from "@/lib/tag-client";
import { frequencyChannelLabels, frequencyPolicy, frequencyWindowLabel, type FrequencyPolicy, type FrequencySnapshot } from "@/lib/frequency-capping-model";
import styles from "./frequency-capping.module.css";
export function useFrequencyWorkspace() {
  const path = usePathname(), params = useSearchParams();
  return params.get("workspaceId") || params.get("workspace") || path.match(/\/global-message-settings\/([^/]+)/)?.[1] || audienceWorkspaceId(path, params);
}
export function publishFrequencyChanges(workspaceId: string) {
  window.dispatchEvent(new CustomEvent("braze:frequency-changed", { detail: { workspaceId } }));
  try { localStorage.setItem("braze:frequency-changed", JSON.stringify({ workspaceId, nonce: crypto.randomUUID() })); } catch {}
}
export function useFrequencySnapshot(workspaceId: string, listen = true) {
  const [snapshot, setSnapshot] = useState<FrequencySnapshot | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), request = useRef(0), controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const version = ++request.current; controller.current?.abort(); const current = new AbortController(); controller.current = current; setLoading(true); setError("");
    try { const response = await fetch(`/api/frequency-capping?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: current.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load frequency rules."); if (request.current === version) setSnapshot(data); return data as FrequencySnapshot; }
    catch (failure) { if (request.current === version && !current.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load frequency rules."); return null; }
    finally { if (request.current === version) setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { setSnapshot(null); void reload(); return () => { request.current++; controller.current?.abort(); }; }, [reload]);
  useEffect(() => {
    if (!listen) return;
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.workspaceId === workspaceId) void reload(); };
    const storage = (event: StorageEvent) => { if (event.key !== "braze:frequency-changed" || !event.newValue) return; try { if (JSON.parse(event.newValue).workspaceId === workspaceId) void reload(); } catch {} };
    const focus = () => void reload();
    window.addEventListener("braze:frequency-changed", changed); window.addEventListener("storage", storage); window.addEventListener("focus", focus);
    const release = subscribeTagChanges(detail => { if (detail.workspaceId === workspaceId) void reload(); });
    return () => { window.removeEventListener("braze:frequency-changed", changed); window.removeEventListener("storage", storage); window.removeEventListener("focus", focus); release(); };
  }, [workspaceId, listen, reload]);
  return { snapshot, setSnapshot, loading, error, reload };
}
export function FrequencyCappingSummary({ workspaceId }: { workspaceId: string }) {
  const state = useFrequencySnapshot(workspaceId);
  return <div><h3>Frequency Capping</h3>{state.error ? <p role="alert">{state.error} <button type="button" onClick={() => void state.reload()}>Retry</button></p> : !state.snapshot ? <p>Loading frequency rules…</p> : <p>{state.snapshot.settings.rules.length ? `${state.snapshot.settings.rules.length} workspace rule(s). Frequency capping is ${state.snapshot.settings.enabled ? "enabled" : "disabled"}.` : "You have not created any Frequency Capping rules."}</p>}<a href={`/frequency-capping-rules?workspaceId=${encodeURIComponent(workspaceId)}`}>Manage frequency capping rules</a></div>;
}
export default function FrequencyCappingControls({ workspaceId, value, onChange, entity = "Campaign", supported = true }: { workspaceId: string; value: Record<string, unknown>; onChange: (patch: FrequencyPolicy) => void; entity?: "Campaign" | "Canvas"; supported?: boolean }) {
  const { snapshot, error, reload } = useFrequencySnapshot(workspaceId), policy = frequencyPolicy(value), id = `frequency-count-${entity.toLowerCase()}`;
  return <section className={styles.policy} aria-label={`${entity} Frequency Capping`}><h3>Frequency Capping</h3>
    {!supported ? <p>This channel is not subject to global frequency capping.</p> : <>
      {error ? <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => void reload()}>Retry</button></p> : !snapshot ? <p>Loading frequency rules…</p> : <>
        {!snapshot.settings.rules.length ? <p>You have not created any Frequency Capping rules.</p> : <>
          {!snapshot.settings.enabled && <p className={styles.notice}>Workspace frequency capping is off. This {entity}&apos;s preference will apply when it is enabled.</p>}
          <label className={styles.check}><input type="checkbox" checked={policy.frequencyCapping} onChange={e => onChange({ ...policy, frequencyCapping: e.target.checked, excludeFromFrequencyCount: !e.target.checked })}/>Apply frequency capping to this {entity}</label>
          {!policy.frequencyCapping && <fieldset className={styles.count}><legend>Frequency capping send limit</legend><label className={styles.check}><input type="radio" name={id} checked={!policy.excludeFromFrequencyCount} onChange={() => onChange({ ...policy, excludeFromFrequencyCount: false })}/>Count this {entity} toward the frequency capping send limit</label><label className={styles.check}><input type="radio" name={id} checked={policy.excludeFromFrequencyCount} onChange={() => onChange({ ...policy, excludeFromFrequencyCount: true })}/>Don&apos;t count this {entity} toward the frequency capping send limit</label></fieldset>}
          <details><summary>{snapshot.settings.rules.length} workspace frequency rule(s)</summary><ul>{snapshot.settings.rules.map(rule => <li key={rule.id}>No more than {rule.messages} {frequencyChannelLabels[rule.type]} send(s) every {frequencyWindowLabel(rule.seconds)}{rule.tagId ? ` · Tag: ${snapshot.availableTags.find(tag => tag.id === rule.tagId)?.name ?? "Unavailable tag"}` : ""}{rule.categoryId ? ` · Category: ${snapshot.settings.categories.find(c => c.id === rule.categoryId)?.name ?? "Unavailable category"}` : ""}</li>)}</ul></details>
        </>}
        {snapshot.settings.categories.length > 0 && <label className={styles.field}>Message category<select value={policy.frequencyCategoryId} onChange={e => onChange({ ...policy, frequencyCategoryId: e.target.value })}><option value="">No category</option>{snapshot.settings.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        <p className={styles.help}>Applicable rules share each user&apos;s quota across campaigns and Canvas message steps.{entity === "Canvas" ? " Capped messages are skipped and the user advances to the next step." : ""}</p>
      </>}
      <a href={`/frequency-capping-rules?workspaceId=${encodeURIComponent(workspaceId)}`}>Manage frequency capping rules</a>
    </>}
  </section>;
}
