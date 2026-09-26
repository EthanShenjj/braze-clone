"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Mail } from "lucide-react";
import type { PreferenceBlockConfig, PreferenceCenterConfig } from "@/lib/preference-center-model";
import styles from "./preference-center-public.module.css";

type Group = { id: string; name: string; description: string; state: "subscribed" | "unsubscribed" };
type Payload = { center: { name: string; description: string; config: PreferenceCenterConfig }; user: { id: string; email: string; firstName: string }; groups: Group[] };

export default function PreferenceCenterPublic({ centerId, userId, token, locale }: { centerId: string; userId: string; token: string; locale: string }) {
  const [data, setData] = useState<Payload | null>(null); const [states, setStates] = useState<Record<string, boolean>>({}); const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "success" | "error" | "unavailable">("loading");
  useEffect(() => {
    if (!userId || !token) { setPhase("unavailable"); return; }
    const controller = new AbortController();
    void fetch(`/api/preference-centers/${centerId}/public?user=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async response => response.ok ? response.json() as Promise<Payload> : Promise.reject(new Error("unavailable")))
      .then(result => { setData(result); setStates(Object.fromEntries(result.groups.map(group => [group.id, group.state === "subscribed"]))); setPhase("ready"); })
      .catch(() => { if (!controller.signal.aborted) setPhase("unavailable"); });
    return () => controller.abort();
  }, [centerId, token, userId]);
  const copy = useMemo(() => data ? { ...data.center.config.copy, ...(data.center.config.locales[locale] ?? {}) } : null, [data, locale]);
  const submit = async () => {
    if (!data) return; setPhase("saving");
    try {
      const response = await fetch(`/api/preference-centers/${centerId}/public`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, token, states }) });
      if (!response.ok) throw new Error("save failed"); setPhase("success");
    } catch { setPhase("error"); }
  };
  if (phase === "loading") return <PageShell><div className={styles.state}><LoaderCircle className={styles.spin} size={24}/><p>Loading your preferences…</p></div></PageShell>;
  if (phase === "unavailable") return <PageShell><div className={styles.state}><CircleAlert size={28}/><h1>This preference center link is unavailable</h1><p>It may be expired, inactive, or missing recipient information.</p></div></PageShell>;
  if (!data || !copy) return null;
  const style = { "--pc-page": data.center.config.design.pageBackground, "--pc-surface": data.center.config.design.surfaceBackground, "--pc-accent": data.center.config.design.accentColor, "--pc-text": data.center.config.design.textColor, "--pc-width": `${data.center.config.design.contentWidth}px`, fontFamily: data.center.config.design.fontFamily } as CSSProperties;
  if (phase === "success") return <PageShell style={style}><div className={styles.state}><CheckCircle2 size={34}/><h1>{copy.successTitle}</h1><p>{copy.successBody}</p><small>Updated for {data.user.email}</small></div></PageShell>;
  return <PageShell style={style}><article className={styles.document}>
    {data.center.config.blocks.map(block => <PublicBlock key={block.id} block={block} groups={data.groups} states={states} setStates={setStates} config={data.center.config} copy={copy} disabled={phase === "saving"} submit={submit}/>) }
    {phase === "error" && <p className={styles.error}><CircleAlert size={16}/>{copy.errorBody}</p>}
    <footer>Preference center for {data.user.firstName} · <a href="https://www.braze.com/docs/user_guide/message_building_by_channel/email/preference_center/" target="_blank">Privacy choices</a></footer>
  </article></PageShell>;
}

function PageShell({ children, style }: { children: ReactNode; style?: CSSProperties }) { return <main className={styles.page} style={style}>{children}</main>; }
function PublicBlock({ block, groups, states, setStates, config, copy, disabled, submit }: { block: PreferenceBlockConfig; groups: Group[]; states: Record<string, boolean>; setStates: Dispatch<SetStateAction<Record<string, boolean>>>; config: PreferenceCenterConfig; copy: PreferenceCenterConfig["copy"]; disabled: boolean; submit: () => void }) {
  const style = { textAlign: block.style?.align, color: block.style?.color, background: block.style?.background, paddingBlock: block.style?.paddingY ? `${block.style.paddingY}px` : undefined, fontSize: block.style?.fontSize ? `${block.style.fontSize}px` : undefined } as CSSProperties;
  if (block.type === "image") return <div className={styles.brand} style={style}><span>t</span><b>{block.content}</b></div>;
  if (block.type === "title") return <h1 className={styles.title} style={style}>{block.content}</h1>;
  if (block.type === "paragraph") return <p className={styles.copy} style={style}>{block.content}</p>;
  if (block.type === "divider") return <hr className={styles.divider}/>;
  if (block.type === "spacer") return <div className={styles.spacer} aria-hidden/>;
  if (block.type === "button") return <div className={styles.buttonWrap} style={style}><button onClick={submit} disabled={disabled}>{disabled ? <LoaderCircle className={styles.spin} size={17}/> : block.content || copy.submitLabel}</button></div>;
  const chooseAll = (value: boolean) => setStates(Object.fromEntries(groups.map(group => [group.id, value])));
  return <section className={styles.preferences}><h2>{copy.preferenceTitle}</h2><p>{copy.preferenceHelp}</p>{config.showGlobalControls && <label className={styles.global}><input type="checkbox" checked={groups.length > 0 && groups.every(group => states[group.id])} onChange={event => chooseAll(event.target.checked)}/><span>{copy.subscribeAllLabel}</span></label>}{groups.map(group => <label className={styles.group} key={group.id}><input type="checkbox" checked={Boolean(states[group.id])} onChange={event => setStates(current => ({ ...current, [group.id]: event.target.checked }))}/><span><b>{group.name}</b>{config.showDescriptions && <small>{group.description}</small>}</span></label>)}{config.showGlobalControls && <label className={styles.global}><input type="checkbox" checked={groups.length > 0 && groups.every(group => !states[group.id])} onChange={event => chooseAll(!event.target.checked)}/><span>{copy.unsubscribeAllLabel}</span></label>}</section>;
}
