"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Info, Send, Sparkles, X } from "lucide-react";
import type { CanvasNode } from "@/lib/canvas-model";
import { normalizeWhatsAppVariants, renderWhatsAppVariant, customWhatsAppTemplates, validateWhatsAppCampaign } from "@/lib/whatsapp-model";
import CanvasWhatsAppComposer from "./canvas-whatsapp-composer";
import styles from "./canvas-sms-editor.module.css";

type Config = NonNullable<CanvasNode["config"]>;
export default function CanvasWhatsAppEditor({ node, canvasId, connected, onDone, testAvailable = true, onOtherChannel }: {
  node: CanvasNode; canvasId: string; connected: boolean; onDone: (config: Config) => void; testAvailable?: boolean; onOtherChannel?: (channel: string, config: Config) => void;
}) {
  const [config, setConfig] = useState<Config>({ ...node.config, channel: "whatsapp" });
  const [section, setSection] = useState("channels");
  const [review, setReview] = useState(false);
  const patch = (values: Config) => setConfig(current => ({ ...current, ...values }));
  const panel = useRef<HTMLDivElement>(null);
  const draft = { body: config.message, config };
  const variants = normalizeWhatsAppVariants(draft);
  const issues = validateWhatsAppCampaign(draft);
  const incomplete = !config.subscriptionGroupId || !config.whatsappVariants || config.whatsappSetupStage === "type" || issues.length > 0;
  const done = () => onDone({ ...config, message: renderWhatsAppVariant(variants[0], customWhatsAppTemplates(draft)), whatsappVariants: !config.whatsappVariants ? variants.map(v => ({ ...v, mode: "template", templateId: "" })) : variants });
  useEffect(() => {
    const overflow = document.body.style.overflow;
    const focused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; focused?.focus(); };
  }, []);
  useEffect(() => {
    if (JSON.stringify(config) === JSON.stringify(node.config ?? {})) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [config, node.config]);
  if (typeof document === "undefined") return null;
  return createPortal(<div className={styles.backdrop} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); if (review) setReview(false); else done(); }
    if (event.key === "Tab" && panel.current) {
      const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select:not(:disabled), a[href]')).filter(element => element.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><div className={styles.dialog} style={{maxWidth:1234}} role="dialog" aria-modal="true" aria-label={`${node.label} WhatsApp step editor`} tabIndex={-1} ref={panel}>
    <aside className={styles.stepColumn}><div className={styles.stepCard}><div className={styles.stepName}>{node.label}</div>{!connected && <div className={styles.disconnected}>DISCONNECTED</div>}<div className={`${styles.stepMessage} ${incomplete ? styles.incomplete : ""}`}>{incomplete && <div className={styles.incompleteTitle}><Info size={12}/> Incomplete Messages</div>}<button onClick={() => setSection("channels")}><Send size={16}/> Messages</button><div><img width="15" height="17" alt="" src="/braze-whatsapp/whatsapp.svg"/></div></div><p><ArrowDown size={18}/><span>All users who enter this step advance to the next step</span></p></div><button className={styles.done} onClick={done}>Done</button></aside>
    <main className={styles.main} style={{minHeight:section === "delivery" ? 636 : 0, marginRight:section === "delivery" || !config.subscriptionGroupId ? 0 : -4}}><header className={styles.header}>Set up Messages<button aria-label="BrazeAI Operator" aria-expanded={review} onClick={() => setReview(!review)}><Sparkles size={23}/></button></header><div className={styles.body}>
      <nav className={styles.tabs} role="tablist" aria-label="Message step"><button role="tab" aria-selected={section === "channels"} onClick={() => setSection("channels")}>Messaging channels</button><button role="tab" aria-selected={section === "delivery"} onClick={() => setSection("delivery")}>Delivery settings</button></nav>
      {section === "delivery" ? <div className={styles.delivery} style={{fontSize:14}}>
        <h3>Delivery Schedule</h3><p>Deliver this message <b>when users enter this step.</b></p>
        <label className={styles.check}><input type="checkbox" checked={Boolean(config.intelligentTiming)} onChange={event => patch({ intelligentTiming: event.target.checked })}/> Using Intelligent Timing <Info size={14}/></label>
        <div className={styles.indented}><b style={{fontSize:13}}>Select a time to send messages when a user&apos;s profile does not have enough data to calculate an optimal time:</b>
          <label className={styles.check} style={{maxWidth:510}}><input type="radio" name="wa-fallback" disabled={!config.intelligentTiming} checked={config.timingFallback !== "custom"} onChange={() => patch({ timingFallback: "popular" })}/> the most popular time to use the app amongst all users</label>
          <label className={styles.check} style={{maxWidth:390}}><input type="radio" name="wa-fallback" disabled={!config.intelligentTiming} checked={config.timingFallback === "custom"} onChange={() => patch({ timingFallback: "custom" })}/> a specific custom fallback time (in the user&apos;s local time zone)</label>
          <input aria-label="Custom fallback time" style={{borderColor:!config.intelligentTiming || config.timingFallback !== "custom" ? "#dedee0" : undefined}} type="time" disabled={!config.intelligentTiming || config.timingFallback !== "custom"} value={String(config.timingTime ?? "17:00")} onInput={event => patch({ timingTime: event.currentTarget.value })} onChange={event => patch({ timingTime: event.target.value })}/>
        </div><hr/><h3>Delivery validations</h3><p>Double-check that your audience meets your delivery criteria at message send. For in-app messages, delivery validations are checked when the user enters the step, not when the message is displayed.</p>
        <label className={styles.check}><input className={styles.switch} type="checkbox" checked={Boolean(config.deliveryValidation)} onChange={event => patch({ deliveryValidation: event.target.checked })}/><span>Validate audience at message send<small>Recommended if you&apos;re using quiet hours, Intelligent Timing, or rate limiting.</small></span></label>
      </div> : <CanvasWhatsAppComposer config={config} patch={patch} canvasId={canvasId} nodeId={node.id} testAvailable={testAvailable} onChannel={channel => onOtherChannel?.(channel, config)}/>}
    </div></main>
    {review && <div className={styles.liquidBackdrop} onClick={() => setReview(false)}><section className={styles.liquidPanel} role="dialog" aria-label="Message review" onClick={event => event.stopPropagation()}><button className={styles.textButton} aria-label="Close message review" onClick={() => setReview(false)}><X size={18}/></button><h4>Message review</h4><p>Local formatting and configuration checks</p>{incomplete ? <ul>{!config.subscriptionGroupId && <li>Select a subscription group.</li>}{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>Message content and subscription group are configured.</p>}</section></div>}

  </div></div>, document.body);
}
