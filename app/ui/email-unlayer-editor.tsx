"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Eye, Mail, RefreshCw, Save } from "lucide-react";
import type { EditorRef, EmailEditorProps } from "react-email-editor";
import { initialUnlayerDesign, unlayerBuilderVersion, unlayerSavePatch } from "@/lib/unlayer-template";
import { loadUnlayerScript, resetUnlayerScript, unlayerEmbedUrl, unlayerScriptLoaded } from "@/lib/unlayer-client";
import { liquidTokens } from "@/lib/email-editor-model";
import { translate, type Locale } from "@/lib/i18n";
import styles from "./email-dnd.module.css";

const Builder = dynamic(() => import("react-email-editor"), { ssr: false });
type Editor = NonNullable<EditorRef["editor"]>;
type CampaignLike = { id: string; name: string; subject?: string; body?: string; config?: Record<string, unknown> };
type SavePatch = { subject?: string; body?: string; config?: Record<string, unknown> };
type SaveState = "saved" | "saving" | "unsaved";
const languages: Record<Locale, string> = { en: "en-US", "zh-CN": "zh-CN", ko: "ko-KR", ja: "ja-JP" };
const embedUrl = unlayerEmbedUrl;

export default function UnlayerEmailEditor({ locale, draft, variantName, save, onClose, onSendingSettings, onOpenTest }: {
  locale: Locale; draft: CampaignLike; variantName: string; save: (patch: SavePatch) => Promise<boolean>;
  onClose: () => void; onSendingSettings: () => void; onOpenTest: () => void;
}) {
  const zh = locale === "zh-CN";
  const [subject, setSubject] = useState(draft.subject ?? ""), [ready, setReady] = useState(false), [saveState, setSaveState] = useState<SaveState>("saved");
  const [scriptReady, setScriptReady] = useState(unlayerScriptLoaded), [started, setStarted] = useState(unlayerScriptLoaded);
  const [loadError, setLoadError] = useState(""), [saveError, setSaveError] = useState(""), [attempt, setAttempt] = useState(0);
  const sdkRef = useRef<Editor | null>(null), editorRef = useRef<EditorRef>(null), active = useRef(false), loaded = useRef(false), revision = useRef(0), pendingSave = useRef<Promise<boolean> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef({ subject, config: draft.config ?? {}, save }); current.current = { subject, config: draft.config ?? {}, save };
  const version = process.env.NEXT_PUBLIC_UNLAYER_BUILDER_VERSION || unlayerBuilderVersion;
  const [initial] = useState(() => { try { return { ...initialUnlayerDesign(draft.config, draft.body), error: "" }; } catch (e) { return { design: null, imported: false, error: e instanceof Error ? e.message : "Unable to load the saved design." }; } });
  const options = useMemo<EmailEditorProps["options"]>(() => {
    const project = process.env.NEXT_PUBLIC_UNLAYER_PROJECT_ID;
    const projectId = project ? Number(project) : undefined;
    const mergeTags = Object.fromEntries(liquidTokens.map((token, index) => [`token_${index}`, { name: `${token.category} · ${token.label}`, value: token.value }]));
    return { displayMode: "email", version, locale: languages[locale], ...(projectId && Number.isSafeInteger(projectId) && projectId > 0 ? { projectId } : {}), appearance: { theme: "modern_light", panels: { tools: { dock: "right" } } }, mergeTags, features: { smartMergeTags: false } };
  }, [locale, version]);

  useEffect(() => {
    active.current = true; loaded.current = false; sdkRef.current = null; setReady(false); setLoadError(initial.error); setSaveError("");
    const project = process.env.NEXT_PUBLIC_UNLAYER_PROJECT_ID;
    if (project && (!Number.isSafeInteger(Number(project)) || Number(project) <= 0)) setLoadError("NEXT_PUBLIC_UNLAYER_PROJECT_ID must be a positive integer.");
    timeoutRef.current = setTimeout(() => { if (active.current && !loaded.current && !initial.error && (started || !unlayerScriptLoaded())) setLoadError(zh ? "Unlayer 加载超时，请检查网络后重试。" : "Unlayer did not finish loading. Check your connection and try again."); }, 60_000);
    const scriptError = (event: Event) => { const target = event.target; if (target instanceof HTMLScriptElement && target.src.startsWith(embedUrl)) { target.dataset.unlayerFailed = "true"; setLoadError(zh ? "无法加载 Unlayer，请检查网络后重试。" : "Unable to load Unlayer. Check your connection and try again."); } };
    window.addEventListener("error", scriptError, true);
    return () => { active.current = false; loaded.current = false; sdkRef.current = null; clearTimeout(timeoutRef.current); window.removeEventListener("error", scriptError, true); };
  }, [attempt, initial.error, locale, started, zh]);
  useEffect(() => {
    let cancelled = false;
    void loadUnlayerScript().then(() => { if (!cancelled) setScriptReady(true); }).catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Unable to load Unlayer."); });
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => { if (saveState === "saved") return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [saveState]);

  const markDirty = () => { if (!loaded.current || !active.current) return; revision.current++; setSaveState(previous => previous === "saving" ? previous : "unsaved"); };
  const onReady: NonNullable<EmailEditorProps["onReady"]> = editor => {
    if (!active.current || editorRef.current?.editor !== editor || !initial.design) return;
    sdkRef.current = editor;
    editor.setSpecialLinks([{ name: "Unsubscribe", href: "{{${unsubscribe_url}}}", target: "_blank" }, { name: "Preference center", href: "{{${preference_center_url}}}", target: "_blank" }]);
    editor.addEventListener("design:loaded", () => { if (!active.current || sdkRef.current !== editor) return; clearTimeout(timeoutRef.current); loaded.current = true; setReady(true); setLoadError(""); editor.removeEventListener("design:loaded"); });
    editor.addEventListener("design:updated", markDirty);
    try { editor.loadDesign(initial.design as Parameters<Editor["loadDesign"]>[0]); } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load the saved design."); }
  };

  const persist = useCallback((): Promise<boolean> => {
    if (pendingSave.current) return pendingSave.current;
    const editor = sdkRef.current;
    if (!editor || !loaded.current || !active.current) return Promise.resolve(false);
    const task = (async () => {
      setSaveState("saving"); setSaveError(""); const savedRevision = revision.current;
      try {
        const exported = await new Promise<{ design: unknown; html: string }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(zh ? "导出超时，设计仍保留在编辑器中，请重试。" : "Export timed out. Your design is still in the editor; try saving again.")), 15_000);
          try { editor.exportHtml(data => { clearTimeout(timeout); if (!active.current) { reject(new Error("The editor was closed before export finished.")); return; } resolve(data); }, { cleanup: true, minify: false, inlineStyles: true }); } catch (error) { clearTimeout(timeout); reject(error); }
        });
        const config = { ...current.current.config };
        if (initial.imported && !config.emailUnlayerMigration) config.emailUnlayerMigration = { source: String(config.emailEditorEngine ?? "html"), mode: "html-block", originalHtml: draft.body ?? "" };
        const ok = await current.current.save(unlayerSavePatch(config, current.current.subject, exported, version));
        if (!active.current) return ok;
        const clean = revision.current === savedRevision;
        setSaveState(ok && clean ? "saved" : "unsaved");
        if (!ok) setSaveError(zh ? "保存失败，请重试。" : "Unable to save the design. Try again.");
        else if (!clean) setSaveError(zh ? "仍有较新的修改未保存，请再次保存。" : "Newer edits are not saved yet. Save again before leaving.");
        return ok && clean;
      } catch (error) { if (active.current) { setSaveState("unsaved"); setSaveError(error instanceof Error ? error.message : "Unable to save the design."); } return false; }
    })();
    pendingSave.current = task; void task.finally(() => { if (pendingSave.current === task) pendingSave.current = null; }); return task;
  }, [draft.body, initial.imported, version, zh]);
  const saveThen = async (next: () => void) => { if (await persist()) next(); };
  const retry = () => {
    resetUnlayerScript();
    setScriptReady(unlayerScriptLoaded()); setStarted(true); setAttempt(count => count + 1);
  };
  const status = saveState === "saving" ? (zh ? "正在保存…" : "Saving…") : saveState === "unsaved" ? (zh ? "有未保存的修改" : "Unsaved changes") : (zh ? "已保存" : "All changes saved");
  return <section className={styles.unlayerPage} aria-label="Unlayer drag-and-drop email editor">
    <header className={styles.unlayerHeader}>
      <button type="button" className={styles.unlayerBack} disabled={saveState === "saving"} onClick={() => ready ? void saveThen(onClose) : onClose()}><ChevronLeft size={16}/>{translate(locale, "Back")}</button>
      <div className={styles.unlayerIdentity}><b>Unlayer</b><span>{draft.name} · {variantName}</span></div>
      <label className={styles.unlayerSubject}><span>{translate(locale, "Subject line")}</span><input aria-label={translate(locale, "Subject line")} disabled={!ready} value={subject} onChange={event => { setSubject(event.target.value); revision.current++; setSaveState(previous => previous === "saving" ? previous : "unsaved"); }} placeholder={zh ? "添加邮件主题" : "Add a subject line"}/></label>
      <span className={styles.unlayerSaveState} role="status">{status}</span>
      <button type="button" className={styles.unlayerAction} disabled={!ready || saveState === "saving"} onClick={() => void saveThen(onOpenTest)}><Eye size={14}/>{translate(locale, "Preview and test")}</button>
      <button type="button" className={styles.unlayerAction} disabled={!ready || saveState === "saving"} onClick={() => void saveThen(onSendingSettings)}><Mail size={14}/>{translate(locale, "Sending settings")}</button>
      <button type="button" className={styles.unlayerSave} disabled={!ready || saveState === "saving"} onClick={() => void persist()}><Save size={14}/>{translate(locale, "Save")}</button>
    </header>
    <div className={styles.unlayerHost}>{started && scriptReady && !initial.error && <Builder key={`${attempt}-${locale}`} ref={editorRef} minHeight="100%" style={{ height: "100%", width: "100%" }} options={options} onReady={onReady} scriptUrl={embedUrl}/>}</div>
    {initial.imported && ready && <div className={styles.unlayerMigration} role="note">{zh ? "原邮件已作为 HTML 内容块导入，可编辑其代码或添加新的内容块。原始设计数据已保留。" : "Your existing email was imported as an HTML block. Edit its code or add new content blocks. The original design is preserved."}</div>}
    {saveError && <div className={styles.unlayerSaveError} role="alert">{saveError}</div>}
    {!ready && !loadError && !initial.error && <div className={styles.unlayerStatus} role="status">{scriptReady && !started ? <><strong>{zh ? "Unlayer 已准备就绪" : "Unlayer is ready"}</strong><button type="button" onClick={() => setStarted(true)}>{zh ? "启动邮件编辑器" : "Open email editor"}</button></> : <><span className={styles.unlayerSpinner}/>{zh ? "正在加载 Unlayer 编辑器…" : "Loading Unlayer editor…"}</>}</div>}
    {(loadError || initial.error) && <div className={styles.unlayerStatus} role="alert"><strong>{zh ? "无法打开邮件编辑器" : "Unable to open the email editor"}</strong><p>{loadError || initial.error}</p>{!initial.error && <button type="button" onClick={retry}><RefreshCw size={14}/>{zh ? "重试" : "Try again"}</button>}</div>}
  </section>;
}
