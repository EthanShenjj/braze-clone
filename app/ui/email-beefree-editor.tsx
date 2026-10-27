"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Eye, Mail, RefreshCw, Save } from "lucide-react";
import type BeefreeSDK from "@beefree.io/sdk";
import type { IBeeConfig, IToken } from "@beefree.io/sdk/dist/types/bee";
import { blankBeefreeTemplate } from "@/lib/beefree-template";
import { liquidTokens } from "@/lib/email-editor-model";
import { translate, type Locale } from "@/lib/i18n";
import styles from "./email-dnd.module.css";

type CampaignLike = { id: string; name: string; subject?: string; body?: string; config?: Record<string, unknown> };
type SavePatch = { subject?: string; body?: string; config?: Record<string, unknown> };
type SaveState = "saved" | "saving" | "unsaved";

function initialTemplate(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {}
  }
  return blankBeefreeTemplate;
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error && value.message ? value.message : fallback;
}

const languageByLocale: Record<Locale, string> = { en: "en-US", "zh-CN": "zh-CN", ko: "ko-KR", ja: "ja-JP" };

export default function BeefreeEmailEditor({ locale, draft, variantName, save, onClose, onSendingSettings, onOpenTest }: {
  locale: Locale;
  draft: CampaignLike;
  variantName: string;
  save: (patch: SavePatch) => Promise<boolean>;
  onClose: () => void;
  onSendingSettings: () => void;
  onOpenTest: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const sdkRef = useRef<BeefreeSDK | null>(null);
  const templateRef = useRef(initialTemplate(draft.config?.emailBeefreeJson));
  const subjectRef = useRef(subject);
  subjectRef.current = subject;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");

    async function initialize() {
      try {
        const tokenResponse = await fetch("/api/beefree/token", { method: "POST", headers: { Accept: "application/json" } });
        const tokenPayload = await tokenResponse.json().catch(() => ({})) as Partial<IToken> & { error?: string };
        if (!tokenResponse.ok) throw new Error(tokenPayload.error || "Beefree authentication failed.");
        if (!tokenPayload.access_token || tokenPayload.v2 !== true) throw new Error("Beefree returned an invalid authentication token.");

        const { default: Beefree } = await import("@beefree.io/sdk");
        if (cancelled) return;
        const sdk = new Beefree(tokenPayload as IToken);
        sdkRef.current = sdk;
        const config: IBeeConfig = {
          container: "beefree-email-editor",
          language: languageByLocale[locale],
          trackChanges: true,
          preventClose: true,
          sidebarPosition: "right",
          defaultColors: ["#ffffff", "#101b24", "#6736d8", "#f4f2f7", "#1871d8"],
          mergeTags: liquidTokens.map(token => ({ name: `${token.category} · ${token.label}`, value: token.value })),
          specialLinks: [
            { label: "Unsubscribe", link: "{{${unsubscribe_url}}}", type: "unsubscribe" },
            { label: "Preference center", link: "{{${preference_center_url}}}", type: "preference_center" },
          ],
          onReady: () => { if (!cancelled) { setReady(true); setSaveState("saved"); } },
          onChange: () => { if (!cancelled) setSaveState("unsaved"); },
          onError: event => { if (!cancelled) setError(event.message || "The Beefree editor reported an error."); },
        };
        await sdk.start(config, templateRef.current, "", { shared: false });
      } catch (reason) {
        if (!cancelled) setError(errorMessage(reason, "The Beefree editor could not be loaded."));
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      sdkRef.current = null;
      const host = document.getElementById("beefree-email-editor");
      if (host) host.replaceChildren();
    };
  }, [attempt, locale]);

  const persist = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk || !ready) return false;
    setSaveState("saving");
    setError("");
    try {
      const response = await sdk.save();
      const design: unknown = JSON.parse(response.data.json);
      if (!design || typeof design !== "object" || Array.isArray(design)) throw new Error("Beefree returned an invalid design document.");
      const ok = await save({
        subject: subjectRef.current,
        body: response.data.html,
        config: {
          ...draft.config,
          emailEditorMode: "drag",
          emailEditorEngine: "beefree",
          emailBeefreeJson: design as Record<string, unknown>,
          emailBeefreeVersion: response.data.version,
        },
      });
      setSaveState(ok ? "saved" : "unsaved");
      if (!ok) setError("The campaign could not save the Beefree design. Try again.");
      return ok;
    } catch (reason) {
      setSaveState("unsaved");
      setError(errorMessage(reason, "The Beefree design could not be saved."));
      return false;
    }
  }, [draft.config, ready, save]);

  const saveThen = async (action: () => void) => { if (await persist()) action(); };
  const stateLabel = saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "All changes saved";

  return <section className={styles.beefreePage} aria-label="Beefree drag-and-drop email editor">
    <header className={styles.beefreeHeader}>
      <button type="button" className={styles.beefreeBack} disabled={saveState === "saving"} onClick={() => ready ? void saveThen(onClose) : onClose()}><ChevronLeft size={16}/> {translate(locale, "Back")}</button>
      <div className={styles.beefreeIdentity}><b>Beefree</b><span>{draft.name} · {variantName}</span></div>
      <label className={styles.beefreeSubject}><span>{translate(locale, "Subject line")}</span><input value={subject} onChange={event => { setSubject(event.target.value); setSaveState("unsaved"); }} placeholder="Add a subject line"/></label>
      <span className={styles.beefreeSaveState} role="status">{stateLabel}</span>
      <button type="button" className={styles.beefreeAction} disabled={!ready || saveState === "saving"} onClick={() => void saveThen(onOpenTest)}><Eye size={14}/> {translate(locale, "Preview and test")}</button>
      <button type="button" className={styles.beefreeAction} disabled={!ready || saveState === "saving"} onClick={() => void saveThen(onSendingSettings)}><Mail size={14}/> {translate(locale, "Sending settings")}</button>
      <button type="button" className={styles.beefreeSave} disabled={!ready || saveState === "saving"} onClick={() => void persist()}><Save size={14}/> {translate(locale, "Save")}</button>
    </header>
    <div id="beefree-email-editor" className={styles.beefreeHost}/>
    {!ready && !error && <div className={styles.beefreeStatus} role="status"><span className={styles.beefreeSpinner}/>Loading Beefree editor…</div>}
    {error && <div className={styles.beefreeStatus} role="alert"><strong>Beefree could not start</strong><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14}/> Try again</button></div>}
  </section>;
}
