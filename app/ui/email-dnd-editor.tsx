"use client";

// Row-based email editors replicating the Braze builder: drag-and-drop rows and
// blocks, per-kind properties, rich text, languages, link management, template
// gallery and an all-channel preview/test modal.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, ChevronLeft, Code2, Copy, Eraser, Eye, Facebook, FileCode2,
  Film, GripVertical, Image as ImageIcon, Instagram, Italic, LayoutDashboard, Linkedin, Link2,
  List as ListIcon, ListOrdered, Mail, Menu as MenuIcon, Minus, Moon, Monitor, MousePointerClick, Music2, Plus, Redo2,
  Share2, Smartphone, Sparkles, Square, Strikethrough, Grid2X2 as DividerIcon, Trash2, Type, Twitter,
  Underline, Undo2, Upload, X, Youtube,
} from "lucide-react";
import styles from "./email-dnd.module.css";
import {
  blockText, defaultBlock, defaultStyle, downloadHtmlFile, emailFontFamilies, emailLocales, emailTemplates, escapeHtml,
  extractLinks, liquidIssues, liquidTokens, makeCell, makeRow, newId, normalizeRows, normalizeStyle,
  resolveLiquidPreview, rowsToPlainText, type EmailBlock, type EmailBlockKind, type EmailEditorLocale, type EmailLink,
  type EmailRow, type EmailStyle, type MenuItem, type PreviewUser, type SocialItem,
} from "@/lib/email-editor-model";
import { getWhatsAppTemplate, normalizeWhatsAppVariants, renderWhatsAppVariant } from "@/lib/whatsapp-model";
import { translate, type Locale } from "@/lib/i18n";

export type EmailCampaignLike = { id: string; name: string; subject?: string; body?: string; channel?: string; config?: Record<string, unknown> };
export type SavePatch = { subject?: string; body?: string; config?: Record<string, unknown> };
type EditorMode = "operator" | "drag" | "html" | "plain" | "template";

const className = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(" ");

type VariantConfig = { id: string; name: string; subject?: string; body?: string; editorMode?: string; rows?: unknown; sending?: Record<string, unknown> };

export function emailVariantList(draft: EmailCampaignLike): VariantConfig[] {
  const stored = draft.config?.variants;
  return Array.isArray(stored) && stored.length ? stored as VariantConfig[] : [{ id: "var_1", name: "Variant 1" }];
}

function variantRows(draft: EmailCampaignLike, variantIndex = 0): EmailRow[] {
  const variants = emailVariantList(draft);
  const current = variants[variantIndex] ?? variants[0];
  return normalizeRows(current?.rows ?? draft.config?.emailRows, current?.rows ? undefined : draft.config?.emailBlocks);
}

function variantBody(draft: EmailCampaignLike) {
  const first = emailVariantList(draft)[0];
  return first?.body ?? draft.body ?? "";
}

// --- Generic editor chrome --------------------------------------------------

function useAutoSave(save: () => Promise<boolean>, deps: unknown[]) {
  const [state, setState] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveRef = useRef(save);
  saveRef.current = save;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState("unsaved");
    const timer = window.setTimeout(async () => { setState("saving"); if (await saveRef.current()) setState("saved"); }, 1400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function saveStateLabel(state: "saved" | "saving" | "unsaved") {
  return state === "saving" ? "Saving…" : state === "unsaved" ? "Unsaved changes" : "All changes saved";
}

// --- Rich text --------------------------------------------------------------

function RichText({ html, editable, onCommit, style, className: css, onFocus }: { html: string; editable: boolean; onCommit: (html: string) => void; style?: CSSProperties; className?: string; onFocus?: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const committed = useRef(html);
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html && document.activeElement !== el) { el.innerHTML = html; committed.current = html; }
  }, [html]);
  return <div
    ref={ref}
    className={css}
    style={style}
    contentEditable={editable}
    suppressContentEditableWarning
    onFocus={onFocus}
    onBlur={event => {
      const next = event.currentTarget.innerHTML;
      if (next !== committed.current) { committed.current = next; onCommit(next); }
    }}
  />;
}

// --- Personalization menu ---------------------------------------------------

export function PersonalizationMenu({ title, onInsert }: { title: string; onInsert: (token: string) => void }) {
  const categories = useMemo(() => {
    const map = new Map<string, typeof liquidTokens>();
    for (const token of liquidTokens) map.set(token.category, [...(map.get(token.category) ?? []), token]);
    return [...map.entries()];
  }, []);
  return <div role="dialog" aria-label={title}>
    <b>{title}</b>
    {categories.map(([category, tokens]) => <div className={styles.tokenGroup} key={category}>
      <b>{category}</b>
      {tokens.map(token => <button type="button" key={token.label} title={token.help} onClick={() => onInsert(token.value)}>
        {token.label}<code>{token.value}</code>
      </button>)}
    </div>)}
  </div>;
}

// --- Export -----------------------------------------------------------------

function alignValue(align?: string) { return align === "center" ? "center" : align === "right" ? "right" : "left"; }

function blockToHtml(block: EmailBlock, locale: EmailEditorLocale, style: EmailStyle) {
  const text = blockText(block, locale);
  const s = block.style ?? {};
  const align = alignValue(s.align);
  const font = s.fontFamily ?? style.fontFamily;
  const linkColor = style.linkColor;
  switch (block.kind) {
    case "Title": return `<h1 style="margin:0 0 16px;text-align:${align};font-family:${font};font-size:${s.fontSize ?? 34}px;line-height:1.2;color:${s.color ?? "#2e3c47"}">${text}</h1>`;
    case "Paragraph": return `<p style="margin:0 0 15px;text-align:${align};font-family:${font};font-size:${s.fontSize ?? 15}px;line-height:${s.lineHeight ?? 1.5};color:${s.color ?? style.textColor}">${text}</p>`;
    case "List": {
      const items = text.split("\n").filter(Boolean).map(item => `<li style="margin:0 0 6px">${escapeHtml(item)}</li>`).join("");
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag} style="margin:0 0 16px;padding-left:24px;text-align:${align};font-family:${font};font-size:${s.fontSize ?? 15}px;color:${s.color ?? style.textColor}">${items}</${tag}>`;
    }
    case "Button": return `<div style="text-align:${align};margin:0 0 16px"><a href="${escapeHtml(block.href ?? "#")}"${s.target ? ' target="_blank"' : ""} style="display:inline-block;padding:${s.padding ?? 12}px 22px;border-radius:${s.radius ?? 4}px;background:${s.bgColor ?? "#6136cc"};color:${s.color ?? "#fff"};font-family:${font};font-size:${s.fontSize ?? 14}px;font-weight:700;text-decoration:none">${text}</a></div>`;
    case "Divider": return `<hr style="margin:${s.padding ?? 20}px 0;border:0;border-top:${s.thickness ?? 1}px solid ${s.color ?? "#dcd9e0"}"/>`;
    case "Spacer": return `<div style="height:${s.height ?? 44}px"></div>`;
    case "Image": return `<div style="text-align:${align};margin:0 0 16px"><img src="${escapeHtml(block.src ?? "")}" alt="${escapeHtml(block.alt ?? "")}" style="width:${block.width ?? 100}%;max-width:100%;border-radius:${s.radius ?? 0}px"/>${block.href ? `<a href="${escapeHtml(block.href)}" style="display:block;margin-top:6px;color:${linkColor}">${escapeHtml(block.href)}</a>` : ""}</div>`;
    case "Video": return `<div style="margin:0 0 16px;text-align:center"><a href="${escapeHtml(block.href ?? "#")}"><img src="${escapeHtml(block.src ?? "")}" alt="${escapeHtml(block.alt ?? "Video")}" style="max-width:100%"/></a></div>`;
    case "Social": {
      const items = (block.items ?? []) as SocialItem[];
      return `<div style="text-align:${align};margin:0 0 16px">${items.map(item => `<a href="${escapeHtml(item.href)}" style="display:inline-block;margin:0 8px;color:${linkColor};text-decoration:none">${item.network}</a>`).join("")}</div>`;
    }
    case "Menu": {
      const items = (block.items ?? []) as MenuItem[];
      return `<div style="text-align:${align};margin:0 0 16px">${items.map(item => `<a href="${escapeHtml(item.href)}" style="margin:0 12px;color:${linkColor};text-decoration:none;font-weight:600">${escapeHtml(item.label)}</a>`).join("")}</div>`;
    }
    case "HTML": return text;
  }
}

function rowsToExportHtml(rows: EmailRow[], style: EmailStyle, locale: EmailEditorLocale) {
  const body = rows.map(row => `<tr><td style="padding:${row.padding ?? 10}px;${row.bg ? `background:${row.bg};` : ""}"><table role="presentation" width="100%" style="border-collapse:collapse"><tr>${row.cells.map(cell => `<td width="${cell.width}%" style="vertical-align:top;padding:0 8px">${cell.blocks.map(block => blockToHtml(block, locale, style)).join("")}</td>`).join("")}</tr></table></td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head><body style="margin:0;background:${style.canvasBg};color:${style.textColor}"><div style="max-width:${style.contentWidth}px;margin:0 auto;background:${style.contentBg};font-family:${style.fontFamily}"><table role="presentation" width="100%" style="border-collapse:collapse">${body}</table></div></body></html>`;
}

// --- Canvas block rendering -------------------------------------------------

const socialIcons = { Facebook, X: Twitter, Instagram, LinkedIn: Linkedin, YouTube: Youtube, TikTok: Music2 } as const;

function CanvasBlockBody({ block, locale, style }: { block: EmailBlock; locale: EmailEditorLocale; style: EmailStyle }) {
  const s = block.style ?? {};
  const align = alignValue(s.align);
  const common: CSSProperties = { textAlign: align, fontFamily: s.fontFamily ?? style.fontFamily, color: s.color ?? style.textColor };
  const linkStyle = { color: style.linkColor } as CSSProperties;
  switch (block.kind) {
    case "Title": return <RichText html={blockText(block, locale)} editable={false} onCommit={() => {}} style={{ ...common, fontSize: s.fontSize ?? 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 16px" }} />;
    case "Paragraph": return <RichText html={blockText(block, locale)} editable={false} onCommit={() => {}} style={{ ...common, fontSize: s.fontSize ?? 15, lineHeight: s.lineHeight ?? 1.5, margin: "0 0 15px" }} />;
    case "List": {
      const items = blockText(block, locale).split("\n").filter(Boolean).map((item, index) => <li key={index} style={{ margin: "0 0 6px" }}>{item}</li>);
      return block.ordered
        ? <ol style={{ ...common, margin: "0 0 16px", paddingLeft: 24, fontSize: s.fontSize ?? 15, textAlign: align }}>{items}</ol>
        : <ul style={{ ...common, margin: "0 0 16px", paddingLeft: 24, fontSize: s.fontSize ?? 15, textAlign: align }}>{items}</ul>;
    }
    case "Button": return <div style={{ textAlign: align, margin: "0 0 16px" }}><span className={styles.buttonBlock} style={{ padding: `${s.padding ?? 12}px 22px`, borderRadius: s.radius ?? 4, background: s.bgColor ?? "#6136cc", color: s.color ?? "#ffffff", fontSize: s.fontSize ?? 14 }}>{blockText(block, locale)}</span></div>;
    case "Divider": return <hr style={{ margin: `${s.padding ?? 20}px 0`, border: 0, borderTop: `${s.thickness ?? 1}px solid ${s.color ?? "#dcd9e0"}` }} />;
    case "Spacer": return <div style={{ height: s.height ?? 44, background: "#f5f3f855", display: "grid", placeItems: "center", color: "#b3aec2", fontSize: 11 }}>Spacer · {s.height ?? 44}px</div>;
    case "Image": return <div style={{ textAlign: align, margin: "0 0 16px" }}>{block.src
      ? <img src={block.src} alt={block.alt ?? ""} style={{ width: `${block.width ?? 100}%`, maxWidth: "100%", borderRadius: s.radius ?? 0 }} />
      : <div style={{ display: "grid", placeItems: "center", gap: 8, minHeight: 120, border: "1px dashed #bbb6c4", borderRadius: 6, color: "#8d8698" }}><ImageIcon size={26} /><span>Add an image URL</span></div>}
      {block.href && <a href={block.href} style={{ ...linkStyle, display: "block", marginTop: 6, fontSize: 12, wordBreak: "break-all" }}>{block.href}</a>}
    </div>;
    case "Video": return <div style={{ margin: "0 0 16px", textAlign: "center" }}><img src={block.src} alt={block.alt ?? "Video"} style={{ maxWidth: "100%", borderRadius: 6 }} /></div>;
    case "Social": return <div className={styles.socialRow} style={{ justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", margin: "0 0 16px" }}>
      {((block.items ?? []) as SocialItem[]).map((item, index) => {
        const Icon = socialIcons[item.network] ?? Share2;
        return <a key={`${item.network}-${index}`} href={item.href} title={item.href} style={{ color: style.linkColor }}><Icon size={22} /></a>;
      })}
    </div>;
    case "Menu": return <nav className={styles.menuRow} style={{ justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", margin: "0 0 16px" }}>
      {((block.items ?? []) as MenuItem[]).map((item, index) => <a key={`${item.label}-${index}`} href={item.href}>{item.label}</a>)}
    </nav>;
    case "HTML": return <div className={styles.htmlBlock}><pre>{block.text}</pre></div>;
  }
}

// --- Drag & drop editor -----------------------------------------------------

type DragPayload =
  | { type: "new"; kind: EmailBlockKind }
  | { type: "block"; rowId: string; cellId: string; blockId: string }
  | { type: "row"; rowId: string };

type Selection = { rowId: string; cellId?: string; blockId?: string } | null;

const blockCatalog: { section: string; kinds: EmailBlockKind[] }[] = [
  { section: "BASIC BLOCKS", kinds: ["Title", "Paragraph", "List", "Button", "Divider", "Spacer"] },
  { section: "MEDIA", kinds: ["Image", "Video", "Social"] },
  { section: "ADVANCED", kinds: ["HTML", "Menu"] },
];

const kindIcons: Record<EmailBlockKind, typeof Type> = {
  Title: Type, Paragraph: FileCode2, List: ListIcon, Button: MousePointerClick, Divider: DividerIcon, Spacer: Square,
  Image: ImageIcon, Video: Film, Social: Share2, HTML: Code2, Menu: MenuIcon,
};

const mediaLibrary = [
  "https://placehold.co/600x320/e9e4f4/5632a6?text=Campaign+hero",
  "https://placehold.co/600x320/dff0e6/2f6b43?text=New+arrivals",
  "https://placehold.co/600x320/fdeaea/9a3b42?text=Last+chance",
  "https://placehold.co/600x200/e4ecfa/2b5aa6?text=Banner",
];

export function BrazeEmailDndEditor({ locale, draft, variantName, save, onClose, onSendingSettings, onOpenTest }: {
  locale: Locale;
  draft: EmailCampaignLike;
  variantName: string;
  save: (patch: SavePatch) => Promise<boolean>;
  onClose: () => void;
  onSendingSettings: () => void;
  onOpenTest: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [rows, setRows] = useState<EmailRow[]>(() => variantRows(draft));
  const [style, setStyle] = useState<EmailStyle>(() => normalizeStyle(draft.config?.emailStyle));
  const hasSavedStyle = Boolean(draft.config?.emailStyle);
  useEffect(() => {
    if (hasSavedStyle) return;
    void fetch("/api/resources/brand-guidelines").then(r => r.json()).then(d => {
      const record = (d.data ?? [])[0] as { data?: Record<string, unknown> } | undefined;
      if (!record?.data) return;
      setStyle(current => ({
        ...current,
        fontFamily: typeof record.data!.font === "string" ? record.data!.font : current.fontFamily,
        linkColor: typeof record.data!.linkColor === "string" ? record.data!.linkColor : current.linkColor,
        textColor: typeof record.data!.textColor === "string" ? record.data!.textColor : current.textColor,
      }));
    }).catch(() => {});
  }, [hasSavedStyle]);
  const [selection, setSelection] = useState<Selection>(null);
  const [rightTab, setRightTab] = useState<"content" | "rows" | "settings">("content");
  const [leftMode, setLeftMode] = useState<"content" | "links" | "personalization" | "languages">("content");
  const [editingLocale, setEditingLocale] = useState<EmailEditorLocale>("en");
  const [desktop, setDesktop] = useState(true);
  const [richFocus, setRichFocus] = useState(false);
  const [linkDialog, setLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [operatorOpen, setOperatorOpen] = useState(false);

  const dragRef = useRef<DragPayload | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const past = useRef<{ rows: EmailRow[]; style: EmailStyle }[]>([]);
  const future = useRef<{ rows: EmailRow[]; style: EmailStyle }[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const selectedBlock = useMemo(() => {
    for (const row of rows) for (const cell of row.cells) for (const block of cell.blocks) if (selection?.blockId === block.id) return { row, cell, block };
    return null;
  }, [rows, selection]);
  const selectedRow = useMemo(() => rows.find(row => row.id === selection?.rowId && !selection?.blockId), [rows, selection]);

  const snapshot = () => { past.current = [...past.current.slice(-49), { rows, style }]; future.current = []; setHistoryTick(t => t + 1); };
  const commitRows = (next: EmailRow[]) => { snapshot(); setRows(next); };
  const commitStyle = (next: EmailStyle) => { snapshot(); setStyle(next); };
  const undo = () => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current = [...future.current, { rows, style }];
    setRows(previous.rows); setStyle(previous.style);
    setSelection(null); setHistoryTick(t => t + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current, { rows, style }];
    setRows(next.rows); setStyle(next.style);
    setSelection(null); setHistoryTick(t => t + 1);
  };
  useEffect(() => { void historyTick; }, [historyTick]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBlock = (blockId: string, patch: Partial<EmailBlock>) => setRows(current => current.map(row => ({
    ...row,
    cells: row.cells.map(cell => ({ ...cell, blocks: cell.blocks.map(block => block.id === blockId ? { ...block, ...patch } : block) })),
  })));
  const updateBlockStyle = (blockId: string, patch: Partial<EmailBlock["style"]>) => setRows(current => current.map(row => ({
    ...row,
    cells: row.cells.map(cell => ({ ...cell, blocks: cell.blocks.map(block => block.id === blockId ? { ...block, style: { ...block.style, ...patch } } : block) })),
  })));
  const updateBlockText = (blockId: string, text: string) => {
    if (editingLocale === "en") updateBlock(blockId, { text });
    else setRows(current => current.map(row => ({
      ...row,
      cells: row.cells.map(cell => ({ ...cell, blocks: cell.blocks.map(block => block.id === blockId ? { ...block, translations: { ...(block.translations ?? {}), [editingLocale]: text } } : block) })),
    })));
  };

  const addBlockToCell = (rowId: string, cellId: string, kind: EmailBlockKind) => {
    const block = defaultBlock(kind);
    commitRows(rows.map(row => row.id !== rowId ? row : { ...row, cells: row.cells.map(cell => cell.id !== cellId ? cell : { ...cell, blocks: [...cell.blocks, block] }) }));
    setSelection({ rowId, cellId, blockId: block.id });
  };
  const addBlockRow = (kind: EmailBlockKind) => { const row = makeRow(1, [defaultBlock(kind)]); commitRows([...rows, row]); setSelection({ rowId: row.id, cellId: row.cells[0].id, blockId: row.cells[0].blocks[0].id }); };
  const removeBlock = (blockId: string) => {
    commitRows(rows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell, blocks: cell.blocks.filter(block => block.id !== blockId) })) })).filter(row => row.cells.some(cell => cell.blocks.length)));
    setSelection(null);
  };
  const duplicateBlock = (blockId: string) => {
    commitRows(rows.map(row => ({ ...row, cells: row.cells.map(cell => {
      const index = cell.blocks.findIndex(block => block.id === blockId);
      if (index < 0) return cell;
      const copy = { ...cell.blocks[index], id: newId("block") };
      return { ...cell, blocks: [...cell.blocks.slice(0, index + 1), copy, ...cell.blocks.slice(index + 1)] };
    }) })));
  };
  const moveBlock = (blockId: string, direction: -1 | 1) => {
    const next = rows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell, blocks: [...cell.blocks] })) }));
    for (const row of next) for (const cell of row.cells) {
      const index = cell.blocks.findIndex(block => block.id === blockId);
      if (index < 0) continue;
      const target = index + direction;
      if (target < 0 || target >= cell.blocks.length) continue;
      [cell.blocks[index], cell.blocks[target]] = [cell.blocks[target], cell.blocks[index]];
      commitRows(next);
      return;
    }
  };
  const removeCell = (rowId: string, cellId: string) => {
    commitRows(rows.map(row => row.id !== rowId ? row : { ...row, cells: row.cells.filter(cell => cell.id !== cellId) }).filter(row => row.cells.length));
    setSelection(null);
  };
  const addColumn = (rowId: string) => {
    commitRows(rows.map(row => {
      if (row.id !== rowId || row.cells.length >= 4) return row;
      const cells = [...row.cells, makeCell(0)];
      const even = Math.floor(100 / cells.length);
      cells.forEach((cell, index) => { cell.width = index === cells.length - 1 ? 100 - even * (cells.length - 1) : even; });
      return { ...row, cells };
    }));
  };
  const setCellWidth = (rowId: string, cellId: string, width: number) => {
    commitRows(rows.map(row => row.id !== rowId ? row : { ...row, cells: row.cells.map(cell => cell.id === cellId ? { ...cell, width: Math.min(100, Math.max(5, width)) } : cell) }));
  };
  const addRow = (columns: number) => { const row = makeRow(columns); commitRows([...rows, row]); setSelection({ rowId: row.id }); };

  // Drag & drop ---------------------------------------------------------------
  const readPayload = (event: ReactDragEvent): DragPayload | null => {
    const kind = event.dataTransfer.getData("application/x-braze-new");
    if (kind) return { type: "new", kind: kind as EmailBlockKind };
    if (dragRef.current) return dragRef.current;
    return null;
  };
  const detachBlock = (payload: Exclude<DragPayload, { type: "new" } | { type: "row" }>, source: EmailRow[]) =>
    source.map(row => row.id !== payload.rowId ? row : { ...row, cells: row.cells.map(cell => cell.id !== payload.cellId ? cell : { ...cell, blocks: cell.blocks.filter(block => block.id !== payload.blockId) }) });

  const dropBlockIntoCell = (rowId: string, cellId: string, payload: DragPayload, beforeBlockId?: string) => {
    if (payload.type === "new") { addBlockToCell(rowId, cellId, payload.kind); return; }
    if (payload.type !== "block") return;
    if (payload.blockId === beforeBlockId) return;
    const moved = rows.flatMap(row => row.cells).flatMap(cell => cell.blocks).find(block => block.id === payload.blockId);
    if (!moved) return;
    let next = detachBlock(payload, rows);
    next = next.map(row => {
      if (row.id !== rowId) return row;
      const cells = row.cells.map(cell => {
        if (cell.id !== cellId) return cell;
        const blocks = [...cell.blocks];
        const index = beforeBlockId ? blocks.findIndex(block => block.id === beforeBlockId) : -1;
        if (index >= 0) blocks.splice(index, 0, moved); else blocks.push(moved);
        return { ...cell, blocks };
      });
      return { ...row, cells };
    }).filter(row => row.cells.some(cell => cell.blocks.length || row.id === rowId));
    snapshot(); setRows(next);
    setSelection({ rowId, cellId, blockId: moved.id });
  };

  const dropRow = (payload: DragPayload, beforeRowId: string | null) => {
    if (payload.type !== "row") return;
    const fromIndex = rows.findIndex(row => row.id === payload.rowId);
    if (fromIndex < 0) return;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    const targetIndex = beforeRowId ? next.findIndex(row => row.id === beforeRowId) : next.length;
    next.splice(targetIndex < 0 ? next.length : targetIndex, 0, moved);
    if (next.some((row, index) => row.id !== rows[index]?.id)) { snapshot(); setRows(next); }
  };

  const onCellDrop = (rowId: string, cellId: string) => (event: ReactDragEvent) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readPayload(event);
    setDropHint(null);
    if (payload) dropBlockIntoCell(rowId, cellId, payload);
  };

  const persist = () => save({
    subject,
    body: rowsToPlainText(rows, editingLocale),
    config: { ...draft.config, emailEditorMode: "drag", emailRows: rows, emailStyle: style, emailBlocks: [] },
  });
  const autoSaveState = useAutoSave(persist, [rows, style, subject]);
  const saveAndClose = async () => { if (await persist()) onClose(); };
  const saveAndSending = async () => { if (await persist()) onSendingSettings(); };

  const download = () => downloadHtmlFile("email.html", rowsToExportHtml(rows, style, editingLocale));

  const links: EmailLink[] = useMemo(() => extractLinks(rows), [rows]);
  const updateLink = (link: EmailLink, href: string) => {
    const [blockId, rest] = [link.key.split(":")[0], link.key.split(":").slice(1).join(":")];
    if (!rest) { updateBlock(blockId, { href }); return; }
    if (rest.startsWith("a:")) {
      const previous = link.href;
      updateBlock(blockId, { text: (rows.flatMap(row => row.cells).flatMap(cell => cell.blocks).find(block => block.id === blockId)?.text ?? "").replace(`href="${previous}"`, `href="${href}"`) });
      return;
    }
    const index = Number(rest);
    setRows(current => current.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell, blocks: cell.blocks.map(block => {
      if (block.id !== blockId || !block.items) return block;
      const items = block.items.map((item, i) => i === index ? { ...item, href } : item);
      return { ...block, items };
    }) })) })));
  };

  const linksCount = links.length;
  const localeInfo = emailLocales.find(item => item.code === editingLocale);
  const translatedCount = rows.flatMap(row => row.cells).flatMap(cell => cell.blocks).filter(block => editingLocale !== "en" && block.translations?.[editingLocale]).length;

  const execute = (command: string, value?: string) => { document.execCommand(command, false, value); };
  const applyLink = () => { if (linkUrl && linkUrl !== "https://") execute("createLink", linkUrl); setLinkDialog(false); };

  const renderRow = (row: EmailRow, rowIndex: number) => <div key={row.id} className={className(styles.rowShell, selection?.rowId === row.id && !selection?.blockId && styles.rowSelected)}>
    <div className={styles.rowTools}>
      <button draggable aria-label="Drag row" onDragStart={event => { dragRef.current = { type: "row", rowId: row.id }; event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragRef.current = null; setDropHint(null); }}><GripVertical size={13} /></button>
      <button aria-label="Move row up" disabled={rowIndex === 0} onClick={() => { const next = [...rows]; [next[rowIndex - 1], next[rowIndex]] = [next[rowIndex], next[rowIndex - 1]]; commitRows(next); }}><ArrowUp size={13} /></button>
      <button aria-label="Move row down" disabled={rowIndex === rows.length - 1} onClick={() => { const next = [...rows]; [next[rowIndex + 1], next[rowIndex]] = [next[rowIndex], next[rowIndex + 1]]; commitRows(next); }}><ArrowDown size={13} /></button>
      <button aria-label="Duplicate row" onClick={() => { const copy: EmailRow = { id: newId("row"), bg: row.bg, padding: row.padding, cells: row.cells.map(cell => ({ ...cell, id: newId("cell"), blocks: cell.blocks.map(block => ({ ...block, id: newId("block") })) })) }; commitRows([...rows.slice(0, rowIndex + 1), copy, ...rows.slice(rowIndex + 1)]); }}><Copy size={13} /></button>
      <button aria-label="Delete row" onClick={() => { commitRows(rows.filter(item => item.id !== row.id)); setSelection(null); }}><Trash2 size={13} /></button>
    </div>
    <div
      className={className(styles.rowDropLine, dropHint === `above:${row.id}` && styles.active)}
      onDragOver={event => { if (dragRef.current?.type === "row") { event.preventDefault(); setDropHint(`above:${row.id}`); } }}
      onDrop={event => { event.preventDefault(); const payload = dragRef.current; setDropHint(null); if (payload) dropRow(payload, row.id); }}
    />
    <div className={styles.rowInner} style={{ background: row.bg, padding: row.padding }} onClick={() => setSelection({ rowId: row.id })}>
      <div style={{ display: "flex", width: "100%" }}>
        {row.cells.map(cell => <div
          key={cell.id}
          className={className(styles.cell, dropHint === `cell:${cell.id}` && styles.cellDrop)}
          style={{ width: `${cell.width}%` }}
          onDragOver={event => { if (dragRef.current?.type !== "row") { event.preventDefault(); event.stopPropagation(); setDropHint(`cell:${cell.id}`); } }}
          onDrop={onCellDrop(row.id, cell.id)}
        >
          {cell.blocks.length === 0 && <div className={styles.cellEmpty}>Drag a block here</div>}
          {cell.blocks.map(block => <div
            key={block.id}
            className={className(styles.blockShell, selection?.blockId === block.id && styles.blockSelected)}
          >
            <div className={styles.blockTools}>
              <button className={styles.drag} draggable aria-label="Drag block" onDragStart={event => { dragRef.current = { type: "block", rowId: row.id, cellId: cell.id, blockId: block.id }; event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragRef.current = null; setDropHint(null); }}><GripVertical size={12} /></button>
              <button aria-label="Move block up" onClick={() => moveBlock(block.id, -1)}><ArrowUp size={12} /></button>
              <button aria-label="Move block down" onClick={() => moveBlock(block.id, 1)}><ArrowDown size={12} /></button>
              <button aria-label="Duplicate block" onClick={() => duplicateBlock(block.id)}><Copy size={12} /></button>
              <button aria-label="Delete block" onClick={() => removeBlock(block.id)}><Trash2 size={12} /></button>
            </div>
            <div
              className={styles.blockWrap}
              onClick={event => { event.stopPropagation(); setSelection({ rowId: row.id, cellId: cell.id, blockId: block.id }); }}
              onDragOver={event => { if (dragRef.current?.type === "block" || dragRef.current?.type === "new") { event.preventDefault(); event.stopPropagation(); setDropHint(`block:${block.id}`); } }}
              onDrop={event => { event.preventDefault(); event.stopPropagation(); const payload = dragRef.current; setDropHint(null); if (payload) dropBlockIntoCell(row.id, cell.id, payload, block.id); }}
            >
              <div className={styles.blockBody}>
                {["Title", "Paragraph", "List"].includes(block.kind)
                  ? <RichText
                      className={styles.richText}
                      html={blockText(block, editingLocale)}
                      editable={selection?.blockId === block.id}
                      onCommit={next => updateBlockText(block.id, next)}
                      onFocus={() => setRichFocus(true)}
                      style={{
                        ...block.kind === "Title"
                          ? { fontSize: block.style?.fontSize ?? 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 16px", textAlign: alignValue(block.style?.align) }
                          : block.kind === "List"
                            ? { fontSize: block.style?.fontSize ?? 15, textAlign: alignValue(block.style?.align) }
                            : { fontSize: block.style?.fontSize ?? 15, lineHeight: block.style?.lineHeight ?? 1.5, margin: "0 0 15px", textAlign: alignValue(block.style?.align) },
                        fontFamily: block.style?.fontFamily ?? style.fontFamily,
                        color: block.style?.color ?? style.textColor,
                        ["--link-color" as string]: style.linkColor,
                      }}
                    />
                  : <CanvasBlockBody block={block} locale={editingLocale} style={style} />}
              </div>
            </div>
          </div>)}
          <button className={styles.cellAdd} title={translate(locale, "Add content block")} onClick={event => { event.stopPropagation(); addBlockToCell(row.id, cell.id, "Paragraph"); }}><Plus size={14} /></button>
        </div>)}
      </div>
    </div>
    <div
      className={className(styles.rowDropLine, dropHint === `below:${row.id}` && styles.active)}
      onDragOver={event => { if (dragRef.current?.type === "row") { event.preventDefault(); setDropHint(`below:${row.id}`); } }}
      onDrop={event => { event.preventDefault(); const payload = dragRef.current; setDropHint(null); if (payload) dropRow(payload, rows[rowIndex + 1]?.id ?? null); }}
    />
  </div>;

  return <section className={styles.page} aria-label={translate(locale, "Braze drag-and-drop email editor")}>
    <header className={styles.header}>
      <button className={styles.headerButton} onClick={() => void saveAndClose()}><ChevronLeft size={15} /> {translate(locale, "Back to campaign")}</button>
      <div className={styles.headerTitle}><b>{draft.name}</b><small>{variantName}</small></div>
      <span className={styles.saveState}>{saveStateLabel(autoSaveState)}</span>
      <button className={styles.headerButton} onClick={undo} disabled={!past.current.length} title={translate(locale, "Undo")}><Undo2 size={14} /></button>
      <button className={styles.headerButton} onClick={redo} disabled={!future.current.length} title={translate(locale, "Redo")}><Redo2 size={14} /></button>
      <button className={styles.headerButton} onClick={onOpenTest}><Eye size={14} /> {translate(locale, "Preview and test")}</button>
      <button className={styles.headerButton} aria-label="BrazeAI Operator" onClick={() => setOperatorOpen(!operatorOpen)}><Sparkles size={15} /></button>
    </header>
    <nav className={styles.iconRail} aria-label={translate(locale, "Email editor sections")}>
      <button title={translate(locale, "Sending settings")} onClick={() => void saveAndSending()}><Mail size={21} /></button>
      <button className={styles.iconActive} title={translate(locale, "Content")}><FileCode2 size={21} /></button>
      <button title={translate(locale, "Preview & Test")} onClick={onOpenTest}><Eye size={21} /></button>
    </nav>
    <aside className={styles.leftRail}>
      <div className={styles.leftTitle}>{translate(locale, "CONTENT")}<button aria-label={translate(locale, "Back to campaign")} onClick={() => void saveAndClose()}><ChevronLeft size={15} /></button></div>
      {(["content", "links", "personalization", "languages"] as const).map(mode => <button key={mode} className={leftMode === mode ? styles.leftActive : ""} onClick={() => setLeftMode(mode)}>
        {translate(locale, { content: "Content Build", links: "Link Management", personalization: "Personalization", languages: "Languages" }[mode])}
        {mode === "links" && linksCount ? ` (${linksCount})` : ""}
      </button>)}
      {leftMode === "links" && <div className={styles.leftPanel}><b>{translate(locale, "Link Management")}</b>
        {links.length ? links.map(link => <div className={styles.linkRow} key={link.key}>
          <span className={styles.linkKind}>{link.kind}</span>
          <label>{link.label || "Link"}</label>
          <input value={link.href} onChange={event => updateLink(link, event.target.value)} placeholder="https://"/>
        </div>) : <p>No links yet. Add a button, image link, or in-text link.</p>}
      </div>}
      {leftMode === "personalization" && <div className={styles.leftPanel}><PersonalizationMenu title={translate(locale, "Personalization")} onInsert={token => {
        const target = selectedBlock ?? null;
        if (target) updateBlockText(target.block.id, `${blockText(target.block, editingLocale)} ${token}`);
        else {
          const block = { ...defaultBlock("Paragraph"), text: token };
          const next = rows.length ? [...rows] : [makeRow(1)];
          next[next.length - 1] = { ...next[next.length - 1], cells: next[next.length - 1].cells.map((cell, index) => index === next[next.length - 1].cells.length - 1 ? { ...cell, blocks: [...cell.blocks, block] } : cell) };
          commitRows(next);
        }
      }} /></div>}
      {leftMode === "languages" && <div className={styles.leftPanel}>
        <b>{translate(locale, "Languages")}</b>
        {emailLocales.map(item => <button type="button" key={item.code} className={className(styles.localeRow, editingLocale === item.code && styles.localeActive)} onClick={() => setEditingLocale(item.code)}>
          <span>{item.label}</span><span className={className(styles.dot, (item.code === "en" || rows.flatMap(row => row.cells).flatMap(cell => cell.blocks).some(block => block.translations?.[item.code])) && styles.done)} />
        </button>)}
        <p className={styles.localeHint}>{editingLocale === "en" ? "English is the default locale." : `Editing ${localeInfo?.label}. Content falls back to English when no translation exists. ${translatedCount} block(s) translated.`}</p>
      </div>}
      <small>{translate(locale, "Create with Operator")}</small>
      <button onClick={() => { const block = { ...defaultBlock("Paragraph"), text: "A fresh offer, just for you, {{${first_name} | default: 'there'}}." }; const row = makeRow(1, [block]); commitRows([...rows, row]); }}>✎ &nbsp; {translate(locale, "Copy")}</button>
      <button className={styles.styleLink} onClick={() => { setSelection(null); setRightTab("settings"); }}>{translate(locale, "Style Settings")} ↗</button>
    </aside>
    <main className={styles.canvasArea}>
      <div className={styles.deviceModes}>
        <button className={desktop ? styles.deviceActive : ""} title="Desktop" onClick={() => setDesktop(true)}><Monitor size={15} /></button>
        <button className={!desktop ? styles.deviceActive : ""} title="Mobile" onClick={() => setDesktop(false)}><Smartphone size={15} /></button>
      </div>
      {richFocus && selectedBlock && ["Title", "Paragraph", "List"].includes(selectedBlock.block.kind) && <div className={styles.textToolbar}>
        <button title="Bold" onMouseDown={event => event.preventDefault()} onClick={() => execute("bold")}><Bold size={14} /></button>
        <button title="Italic" onMouseDown={event => event.preventDefault()} onClick={() => execute("italic")}><Italic size={14} /></button>
        <button title="Underline" onMouseDown={event => event.preventDefault()} onClick={() => execute("underline")}><Underline size={14} /></button>
        <button title="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => execute("strikeThrough")}><Strikethrough size={14} /></button>
        <span className={styles.sep} />
        <button title="Insert link" onMouseDown={event => event.preventDefault()} onClick={() => setLinkDialog(!linkDialog)}><Link2 size={14} /></button>
        <button title="Unlink" onMouseDown={event => event.preventDefault()} onClick={() => execute("unlink")}><Eraser size={14} /></button>
        <span className={styles.sep} />
        <button title="Ordered list" onMouseDown={event => event.preventDefault()} onClick={() => selectedBlock && updateBlock(selectedBlock.block.id, { ordered: !selectedBlock.block.ordered })}><ListOrdered size={14} /></button>
        <button title="Align left" onMouseDown={event => event.preventDefault()} onClick={() => selectedBlock && updateBlockStyle(selectedBlock.block.id, { align: "left" })}><AlignLeft size={14} /></button>
        <button title="Align center" onMouseDown={event => event.preventDefault()} onClick={() => selectedBlock && updateBlockStyle(selectedBlock.block.id, { align: "center" })}><AlignCenter size={14} /></button>
        <button title="Align right" onMouseDown={event => event.preventDefault()} onClick={() => selectedBlock && updateBlockStyle(selectedBlock.block.id, { align: "right" })}><AlignRight size={14} /></button>
        {linkDialog && <span className={styles.sep} />}
        {linkDialog && <input autoFocus style={{ height: 26, border: "1px solid #d9d5df", borderRadius: 4, padding: "0 8px", fontSize: 12 }} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} onKeyDown={event => event.key === "Enter" && applyLink()} />}
        {linkDialog && <button onMouseDown={event => event.preventDefault()} onClick={applyLink}>Apply</button>}
      </div>}
      <div
        className={styles.emailCanvas}
        style={{ ["--canvas-width" as string]: desktop ? `${style.contentWidth}px` : "360px", background: style.contentBg, maxWidth: desktop ? style.contentWidth : 360, fontFamily: style.fontFamily, color: style.textColor, position: "relative" }}
        onDragOver={event => { if (dragRef.current?.type === "row" || dragRef.current?.type === "new") event.preventDefault(); }}
        onDrop={event => {
          event.preventDefault();
          const payload = dragRef.current;
          setDropHint(null);
          if (!payload) return;
          if (payload.type === "new") addBlockRow(payload.kind);
          if (payload.type === "row") dropRow(payload, null);
        }}
      >
        {rows.length ? rows.map(renderRow) : <div className={styles.dropZone}>{translate(locale, "Drag content here to build your email")}</div>}
        {operatorOpen && <div className={styles.leftPanel} style={{ position: "absolute", right: 12, top: 12, width: 260, boxShadow: "0 8px 24px #2b213d26", zIndex: 9 }}>
          <b>{translate(locale, "Create with Operator")}</b>
          <p>Generate a section of copy for this email.</p>
          <button onClick={() => { const row = makeRow(1, [{ ...defaultBlock("Title"), text: "Your September offer is here" }, { ...defaultBlock("Paragraph"), text: "Hi {{${first_name} | default: 'there'}}, use code SEPTEMBER20 for 20% off this month's featured collection." }]); commitRows([...rows, row]); setOperatorOpen(false); }}>Generate offer copy</button>
          <button onClick={() => { const row = makeRow(1, [{ ...defaultBlock("Paragraph"), text: "You are receiving this email because you subscribed to updates." }]); commitRows([...rows, row]); setOperatorOpen(false); }}>Generate footer copy</button>
          <button onClick={() => setOperatorOpen(false)}>Close</button>
        </div>}
      </div>
    </main>
    <aside className={styles.rightPanel}>
      <div className={styles.rightTabs}>{(["content", "rows", "settings"] as const).map(name => <button key={name} className={className(rightTab === name && !selectedBlock && !selectedRow && styles.rightActive)} onClick={() => { setSelection(null); setRightTab(name); }}>{translate(locale, name.toUpperCase())}</button>)}</div>
      {selectedBlock ? <BlockProperties
        key={selectedBlock.block.id}
        locale={locale}
        block={selectedBlock.block}
        style={style}
        onPatch={patch => updateBlock(selectedBlock.block.id, patch)}
        onPatchStyle={patch => updateBlockStyle(selectedBlock.block.id, patch)}
        onDelete={() => removeBlock(selectedBlock.block.id)}
        onDuplicate={() => duplicateBlock(selectedBlock.block.id)}
        onClose={() => setSelection(null)}
      /> : selectedRow ? <RowProperties
        row={selectedRow}
        onPatch={patch => commitRows(rows.map(item => item.id === selectedRow.id ? { ...item, ...patch } : item))}
        onSetCellWidth={(cellId, width) => setCellWidth(selectedRow.id, cellId, width)}
        onAddColumn={() => addColumn(selectedRow.id)}
        onRemoveCell={cellId => removeCell(selectedRow.id, cellId)}
        onClose={() => setSelection(null)}
      /> : rightTab === "content" ? <div className={styles.catalogPane}>
        {blockCatalog.map(section => <div key={section.section}>
          <h3>{translate(locale, section.section)}</h3>
          <div className={styles.blockCatalog}>{section.kinds.map(kind => { const Icon = kindIcons[kind]; return <button draggable key={kind} onDragStart={event => { dragRef.current = { type: "new", kind }; event.dataTransfer.setData("application/x-braze-new", kind); }} onDragEnd={() => { dragRef.current = null; }} onClick={() => addBlockRow(kind)}><Icon size={27} /><span>{translate(locale, kind.toUpperCase())}</span></button>; })}</div>
        </div>)}
      </div> : rightTab === "rows" ? <div className={styles.catalogPane}>
        <h3>{translate(locale, "ROWS")}</h3>
        <p>Drag a layout into your email, then drop blocks into its columns.</p>
        <div className={styles.rowCatalog}>{[1, 2, 3, 4].map(columns => <button key={columns} onClick={() => addRow(columns)}>{columns} column{columns > 1 ? "s" : ""}<span>{Array.from({ length: columns }, (_, index) => <i key={index} />)}</span></button>)}</div>
      </div> : <div className={styles.catalogPane}>
        <h3>{translate(locale, "SETTINGS")}</h3>
        <label className={styles.settingField}>Canvas background<input type="color" value={style.canvasBg} onChange={event => setStyle({ ...style, canvasBg: event.target.value })} /></label>
        <label className={styles.settingField}>Content area background<input type="color" value={style.contentBg} onChange={event => setStyle({ ...style, contentBg: event.target.value })} /></label>
        <label className={styles.settingField}>Global font family<select value={style.fontFamily} onChange={event => setStyle({ ...style, fontFamily: event.target.value })}>{emailFontFamilies.map(font => <option key={font} value={font}>{font.split(",")[0].replaceAll("'", "")}</option>)}</select></label>
        <label className={styles.settingField}>Link color<input type="color" value={style.linkColor} onChange={event => setStyle({ ...style, linkColor: event.target.value })} /></label>
        <label className={styles.settingField}>Text color<input type="color" value={style.textColor} onChange={event => setStyle({ ...style, textColor: event.target.value })} /></label>
        <label className={styles.settingField}>Content width <input type="number" min="320" max="800" value={style.contentWidth} onChange={event => setStyle({ ...style, contentWidth: Math.min(800, Math.max(320, Number(event.target.value) || 600)) })} /></label>
      </div>}
    </aside>
    <footer className={styles.footer}>
      <button className={styles.download} onClick={download}>{translate(locale, "Download file")}</button>
      <button className={styles.done} onClick={() => void saveAndClose()}>{translate(locale, "Done")}</button>
    </footer>
  </section>;
}

// --- Property panels ---------------------------------------------------------

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.propertyRow}><span>{label}</span>{children}</div>;
}

function Stepper({ value, onChange, min = 0, max = 200, suffix }: { value: number; onChange: (value: number) => void; min?: number; max?: number; suffix?: string }) {
  return <span className={styles.stepper}>
    <button type="button" onClick={() => onChange(Math.max(min, value - 1))}><Minus size={12} /></button>
    <span>{value}{suffix}</span>
    <button type="button" onClick={() => onChange(Math.min(max, value + 1))}><Plus size={12} /></button>
  </span>;
}

function AlignPicker({ value, onChange }: { value: "left" | "center" | "right" | undefined; onChange: (value: "left" | "center" | "right") => void }) {
  return <span className={styles.alignButtons}>
    {(["left", "center", "right"] as const).map(align => <button key={align} type="button" className={value === align ? styles.alignActive : ""} onClick={() => onChange(align)}>{align === "left" ? <AlignLeft size={14} /> : align === "center" ? <AlignCenter size={14} /> : <AlignRight size={14} />}</button>)}
  </span>;
}

function BlockProperties({ locale, block, style, onPatch, onPatchStyle, onDelete, onDuplicate, onClose }: {
  locale: Locale; block: EmailBlock; style: EmailStyle;
  onPatch: (patch: Partial<EmailBlock>) => void;
  onPatchStyle: (patch: Partial<EmailBlock["style"]>) => void;
  onDelete: () => void; onDuplicate: () => void; onClose: () => void;
}) {
  const s = block.style ?? {};
  const socialItems = ((block.items ?? []) as SocialItem[]).slice();
  const menuItems = ((block.items ?? []) as MenuItem[]).slice();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [library, setLibrary] = useState<Array<{ id: string; name: string; src: string }>>([]);
  useEffect(() => {
    if (!mediaOpen) return;
    void fetch("/api/resources/media").then(r => r.json()).then(d => setLibrary(((d.data ?? []) as Array<{ id: string; name: string; data: { src?: unknown } }>).map(row => ({ id: row.id, name: row.name, src: String(row.data.src ?? "") })).filter(item => item.src))).catch(() => {});
  }, [mediaOpen]);
  const uploadImage = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onPatch({ src: String(reader.result) });
    reader.readAsDataURL(file);
  };
  return <div className={styles.properties}>
    <div className={styles.propertyHead}><b>{block.kind.toUpperCase()} PROPERTIES</b>
      <button title="Delete" onClick={onDelete}><Trash2 size={15} /></button>
      <button title="Duplicate" onClick={onDuplicate}><Copy size={15} /></button>
      <button title="Close" onClick={onClose}><X size={16} /></button>
    </div>
    {(block.kind === "Button" || block.kind === "Image" || block.kind === "Video" || block.kind === "Menu") && <PropertyRow label="Link URL">
      <input type="url" value={block.href ?? ""} onChange={event => onPatch({ href: event.target.value })} placeholder="https://" />
    </PropertyRow>}
    {(block.kind === "Button" || block.kind === "Image") && <div className={styles.toggleRow}><span>Open in new window</span><input type="checkbox" checked={Boolean(s.target)} onChange={event => onPatchStyle({ target: event.target.checked })} /></div>}
    {block.kind === "Button" && <>
      <div className={styles.propertyColumn}><span>Button text</span><input type="text" value={blockText(block, "en")} onChange={event => onPatch({ text: event.target.value })} /></div>
      <PropertyRow label="Background color"><input type="color" value={s.bgColor ?? "#6136cc"} onChange={event => onPatchStyle({ bgColor: event.target.value })} /></PropertyRow>
      <PropertyRow label="Text color"><input type="color" value={s.color ?? "#ffffff"} onChange={event => onPatchStyle({ color: event.target.value })} /></PropertyRow>
      <PropertyRow label="Border radius"><Stepper value={s.radius ?? 4} max={40} onChange={value => onPatchStyle({ radius: value })} /></PropertyRow>
      <PropertyRow label="Padding"><Stepper value={s.padding ?? 12} max={40} onChange={value => onPatchStyle({ padding: value })} /></PropertyRow>
      <PropertyRow label="Font size"><Stepper value={s.fontSize ?? 14} min={10} max={28} onChange={value => onPatchStyle({ fontSize: value })} /></PropertyRow>
      <PropertyRow label="Align"><AlignPicker value={s.align} onChange={align => onPatchStyle({ align })} /></PropertyRow>
    </>}
    {block.kind === "Image" && <>
      <div className={styles.propertyColumn}><span>Image URL</span><input type="text" value={block.src ?? ""} onChange={event => onPatch({ src: event.target.value })} placeholder="https://" /></div>
      <div className={styles.propertyColumn}>
        <button type="button" className={styles.addItemButton} onClick={() => setMediaOpen(!mediaOpen)}><ImageIcon size={13} /> Add from media library</button>
        <label className={styles.mediaPicker} style={{ display: mediaOpen ? undefined : "none" }}>
          {library.map(item => <button type="button" key={item.id} onClick={() => { onPatch({ src: item.src }); setMediaOpen(false); }}><ImageIcon size={13} /> {item.name}</button>)}
          {mediaLibrary.map(src => <button type="button" key={src} onClick={() => { onPatch({ src }); setMediaOpen(false); }}><ImageIcon size={13} /> {src.split("text=")[1]?.replaceAll("+", " ") ?? "Media"}</button>)}
          <label className={styles.upload}><Upload size={13} /> Upload image<input type="file" accept="image/*" hidden onChange={event => uploadImage(event.target.files)} /></label>
        </label>
      </div>
      <div className={styles.propertyColumn}><span>Alt text</span><input type="text" value={block.alt ?? ""} onChange={event => onPatch({ alt: event.target.value })} /></div>
      <PropertyRow label="Width %"><Stepper value={block.width ?? 100} min={10} max={100} suffix="%" onChange={value => onPatch({ width: value })} /></PropertyRow>
      <PropertyRow label="Border radius"><Stepper value={s.radius ?? 0} max={40} onChange={value => onPatchStyle({ radius: value })} /></PropertyRow>
      <PropertyRow label="Align"><AlignPicker value={s.align} onChange={align => onPatchStyle({ align })} /></PropertyRow>
    </>}
    {block.kind === "Video" && <>
      <div className={styles.propertyColumn}><span>Video thumbnail URL</span><input type="text" value={block.src ?? ""} onChange={event => onPatch({ src: event.target.value })} /></div>
      <div className={styles.propertyColumn}><span>Video link</span><input type="url" value={block.href ?? ""} onChange={event => onPatch({ href: event.target.value })} /></div>
      <div className={styles.propertyColumn}><span>Alt text</span><input type="text" value={block.alt ?? ""} onChange={event => onPatch({ alt: event.target.value })} /></div>
    </>}
    {block.kind === "Divider" && <>
      <PropertyRow label="Color"><input type="color" value={s.color ?? "#dcd9e0"} onChange={event => onPatchStyle({ color: event.target.value })} /></PropertyRow>
      <PropertyRow label="Thickness"><Stepper value={s.thickness ?? 1} min={1} max={12} onChange={value => onPatchStyle({ thickness: value })} /></PropertyRow>
      <PropertyRow label="Padding"><Stepper value={s.padding ?? 20} max={60} onChange={value => onPatchStyle({ padding: value })} /></PropertyRow>
    </>}
    {block.kind === "Spacer" && <PropertyRow label="Height"><Stepper value={s.height ?? 44} min={8} max={160} suffix="px" onChange={value => onPatchStyle({ height: value })} /></PropertyRow>}
    {block.kind === "List" && <>
      <div className={styles.toggleRow}><span>Ordered list</span><input type="checkbox" checked={Boolean(block.ordered)} onChange={event => onPatch({ ordered: event.target.checked })} /></div>
      <PropertyRow label="Font size"><Stepper value={s.fontSize ?? 15} min={10} max={28} onChange={value => onPatchStyle({ fontSize: value })} /></PropertyRow>
      <PropertyRow label="Text color"><input type="color" value={s.color ?? style.textColor} onChange={event => onPatchStyle({ color: event.target.value })} /></PropertyRow>
      <PropertyRow label="Align"><AlignPicker value={s.align} onChange={align => onPatchStyle({ align })} /></PropertyRow>
      <div className={styles.propertyColumn}><span>Items (one per line)</span><textarea value={blockText(block, "en")} onChange={event => onPatch({ text: event.target.value })} /></div>
    </>}
    {block.kind === "Social" && <div className={styles.propertyColumn}><span>Social links</span>
      {socialItems.map((item, index) => <div className={styles.itemEditorRow} key={`${item.network}-${index}`}>
        <select value={item.network} onChange={event => { socialItems[index] = { ...item, network: event.target.value as SocialItem["network"] }; onPatch({ items: socialItems }); }}>
          {(["Facebook", "X", "Instagram", "LinkedIn", "YouTube", "TikTok"] as const).map(network => <option key={network}>{network}</option>)}
        </select>
        <input type="url" value={item.href} onChange={event => { socialItems[index] = { ...item, href: event.target.value }; onPatch({ items: socialItems }); }} />
        <button title="Remove" onClick={() => onPatch({ items: socialItems.filter((_, i) => i !== index) })}><X size={13} /></button>
      </div>)}
      <button type="button" className={styles.addItemButton} onClick={() => onPatch({ items: [...socialItems, { network: "Facebook", href: "https://" }] })}><Plus size={12} /> Add social link</button>
    </div>}
    {block.kind === "Menu" && <div className={styles.propertyColumn}><span>Menu items</span>
      {menuItems.map((item, index) => <div className={styles.itemEditorRow} key={index}>
        <input type="text" value={item.label} onChange={event => { menuItems[index] = { ...item, label: event.target.value }; onPatch({ items: menuItems }); }} />
        <input type="url" value={item.href} onChange={event => { menuItems[index] = { ...item, href: event.target.value }; onPatch({ items: menuItems }); }} />
        <button title="Remove" onClick={() => onPatch({ items: menuItems.filter((_, i) => i !== index) })}><X size={13} /></button>
      </div>)}
      <button type="button" className={styles.addItemButton} onClick={() => onPatch({ items: [...menuItems, { label: "New item", href: "https://" }] })}><Plus size={12} /> Add menu item</button>
      <PropertyRow label="Align"><AlignPicker value={s.align} onChange={align => onPatchStyle({ align })} /></PropertyRow>
    </div>}
    {block.kind === "HTML" && <div className={styles.propertyColumn}><span>Custom HTML</span><textarea value={block.text} onChange={event => onPatch({ text: event.target.value })} style={{ fontFamily: "monospace" }} /></div>}
    {(block.kind === "Title" || block.kind === "Paragraph") && <>
      {block.kind === "Title" && <PropertyRow label="Heading">
        <select value={String(s.fontSize ?? 34)} onChange={event => onPatchStyle({ fontSize: Number(event.target.value) })}>
          <option value="34">H1 · 34px</option><option value="28">H2 · 28px</option><option value="22">H3 · 22px</option>
        </select>
      </PropertyRow>}
      <PropertyRow label="Font family"><select value={s.fontFamily ?? style.fontFamily} onChange={event => onPatchStyle({ fontFamily: event.target.value })}>{emailFontFamilies.map(font => <option key={font} value={font}>{font.split(",")[0].replaceAll("'", "")}</option>)}</select></PropertyRow>
      <PropertyRow label="Font size"><Stepper value={s.fontSize ?? (block.kind === "Title" ? 34 : 15)} min={10} max={64} onChange={value => onPatchStyle({ fontSize: value })} /></PropertyRow>
      <PropertyRow label="Text color"><input type="color" value={s.color ?? (block.kind === "Title" ? "#2e3c47" : style.textColor)} onChange={event => onPatchStyle({ color: event.target.value })} /></PropertyRow>
      {block.kind === "Paragraph" && <PropertyRow label="Line height"><Stepper value={Math.round((s.lineHeight ?? 1.5) * 10)} min={10} max={30} onChange={value => onPatchStyle({ lineHeight: value / 10 })} /></PropertyRow>}
      <PropertyRow label="Align"><AlignPicker value={s.align} onChange={align => onPatchStyle({ align })} /></PropertyRow>
      <div className={styles.propertyColumn}><span>Content ({block.kind === "Title" ? "supports Liquid" : "rich text — edit on canvas"})</span><textarea value={blockText(block, "en").replace(/<[^>]+>/g, "")} onChange={event => onPatch({ text: escapeHtml(event.target.value) })} /></div>
    </>}
  </div>;
}

function RowProperties({ row, onPatch, onSetCellWidth, onAddColumn, onRemoveCell, onClose }: {
  row: EmailRow;
  onPatch: (patch: Partial<EmailRow>) => void;
  onSetCellWidth: (cellId: string, width: number) => void;
  onAddColumn: () => void;
  onRemoveCell: (cellId: string) => void;
  onClose: () => void;
}) {
  return <div className={styles.properties}>
    <div className={styles.propertyHead}><b>ROW PROPERTIES</b><button title="Close" onClick={onClose}><X size={16} /></button></div>
    <PropertyRow label="Row background"><input type="color" value={row.bg ?? "#ffffff"} onChange={event => onPatch({ bg: event.target.value })} /></PropertyRow>
    <PropertyRow label="Padding"><Stepper value={row.padding ?? 10} max={60} suffix="px" onChange={padding => onPatch({ padding })} /></PropertyRow>
    <div className={styles.propertyColumn}><span>Columns ({row.cells.length})</span>
      <button type="button" className={styles.addItemButton} disabled={row.cells.length >= 4} onClick={onAddColumn}><Plus size={12} /> Add column</button>
      {row.cells.map(cell => <div className={styles.cellWidths} key={cell.id}>
        <label>Column width
          <input type="number" min={5} max={100} value={cell.width} onChange={event => onSetCellWidth(cell.id, Number(event.target.value) || cell.width)} />
          <span>{cell.width}%</span>
          {row.cells.length > 1 && <button type="button" onClick={() => onRemoveCell(cell.id)} title="Remove column"><Trash2 size={12} /></button>}
        </label>
      </div>)}
    </div>
  </div>;
}

// --- Template gallery ---------------------------------------------------------

type GalleryTemplate = (typeof emailTemplates)[number];

export function EmailTemplateGallery({ locale, onApply, onClose }: { locale: Locale; onApply: (template: GalleryTemplate) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [workspaceTemplates, setWorkspaceTemplates] = useState<GalleryTemplate[]>([]);
  const [editorFilter, setEditorFilter] = useState<"All" | "Drag-and-Drop Editor" | "HTML Editor" | "Plain-text Editor">("All");
  const [selectedId, setSelectedId] = useState(emailTemplates[0]?.id ?? "");
  useEffect(() => {
    void fetch("/api/resources/email-templates").then(r => r.json()).then(d => setWorkspaceTemplates(((d.data ?? []) as Array<{ id: string; name: string; description: string; data: { subject?: string; body?: string } }>).map(row => ({
      id: row.id, name: `${row.name} (workspace)`, editor: "HTML Editor" as const, category: "Workspace",
      subject: String(row.data.subject ?? ""), preheader: "", description: row.description || "Saved in Templates", html: String(row.data.body ?? ""),
    })))).catch(() => {});
  }, []);
  const templates = [...workspaceTemplates, ...emailTemplates];
  const filtered = templates.filter(template =>
    (editorFilter === "All" || template.editor === editorFilter) &&
    `${template.name} ${template.category} ${template.subject}`.toLowerCase().includes(query.toLowerCase()));
  const selected = filtered.find(template => template.id === selectedId) ?? filtered[0];
  return <div className={styles.galleryOverlay} onMouseDown={onClose}>
    <div className={styles.gallery} onMouseDown={event => event.stopPropagation()}>
      <div className={styles.galleryHead}>
        <h2>{translate(locale, "Choose a template")}</h2>
        <button className={styles.testModalClose} style={{ position: "static" }} onClick={onClose} aria-label={translate(locale, "Close")}><X size={17} /></button>
      </div>
      <div className={styles.galleryFilters}>
        <span className={styles.search}><Eye size={14} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={translate(locale, "Search")} aria-label={translate(locale, "Search")} /></span>
        {(["All", "Drag-and-Drop Editor", "HTML Editor", "Plain-text Editor"] as const).map(filter => <button key={filter} className={className(styles.chip, editorFilter === filter && styles.chipActive)} onClick={() => setEditorFilter(filter)}>{filter.replace(" Editor", "")}</button>)}
      </div>
      <div className={styles.galleryBody}>
        <div className={styles.galleryList}>
          <div className={styles.galleryGrid}>
            {filtered.map(template => <button key={template.id} className={className(styles.galleryCard, selected?.id === template.id && styles.cardActive)} onClick={() => setSelectedId(template.id)}>
              <span className={styles.editorTag}>{template.editor.replace(" Editor", "")}</span>
              <b>{template.name}</b>
              <small>{template.category} · {template.subject}</small>
              <small>{template.description}</small>
            </button>)}
            {!filtered.length && <p className={styles.catalogPane}>No templates match this search.</p>}
          </div>
        </div>
        <div className={styles.galleryPreview}>
          {selected && <>
            <h3>{selected.name}</h3>
            <p className={styles.meta}>{selected.editor} · {selected.category}</p>
            <div className={styles.previewFrame}>
              <p className={styles.pTitle}>{selected.subject}</p>
              {selected.preheader && <p className={styles.pText}>{selected.preheader}</p>}
              {selected.rows && selected.rows.map(row => row.cells.map(cell => cell.blocks.map(block => {
                const rendered = <CanvasBlockBody key={block.id} block={block} locale="en" style={defaultStyle()} />;
                return <div key={block.id}>{rendered}</div>;
              })))}
              {selected.html && <pre>{selected.html.slice(0, 700)}{selected.html.length > 700 ? "…" : ""}</pre>}
              {selected.plain && <pre>{selected.plain}</pre>}
            </div>
          </>}
        </div>
      </div>
      <div className={styles.galleryFooter}>
        <button className={styles.cancel} onClick={onClose}>{translate(locale, "Cancel")}</button>
        <button className={styles.apply} disabled={!selected} onClick={() => selected && onApply(selected)}>{translate(locale, "Apply template")}</button>
      </div>
    </div>
  </div>;
}

// --- Preview & test modal ------------------------------------------------------

export function TestModal({ locale, draft, variantIndex = 0, close }: { locale: Locale; draft: EmailCampaignLike; variantIndex?: number; close: () => void }) {
  const [mode, setMode] = useState<"random" | "existing" | "custom">("existing");
  const [recipient, setRecipient] = useState(draft.channel === "webhook" ? "user_1" : draft.channel === "whatsapp" ? "+1 415 555 0138" : "marketing.qa@example.com");
  const [customUser, setCustomUser] = useState('{\n  "user_id": "custom_1",\n  "email": "custom@example.com",\n  "first_name": "Custom",\n  "language": "en"\n}');
  const [previewUser, setPreviewUser] = useState<PreviewUser>({ first_name: "Sofia", last_name: "Chen", email: "sofia@example.com", language: "en", country: "US" });
  const [variantId, setVariantId] = useState("");
  const [testLocale, setTestLocale] = useState("en");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dark, setDark] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  const variants = emailVariantList(draft);
  const isEmail = draft.channel === "email";
  const isWhatsapp = draft.channel === "whatsapp";
  const current = variants[variantIndex] ?? variants[0];
  const rows = isEmail ? variantRows(draft, variantIndex) : [];
  const htmlBody = isEmail && !rows.length ? variantBody(draft) : "";
  const plainBody = isEmail && !rows.length && !htmlBody ? variantBody(draft) : "";
  const sendingInfo = (current?.sending ?? draft.config?.emailSending) as Record<string, unknown> | undefined;
  const localeAliases: Record<string, string> = { zh: "zh-CN", "zh-cn": "zh-CN", zh_cn: "zh-CN", en_us: "en" };
  const normalizedTestLocale = localeAliases[testLocale.toLowerCase()] ?? testLocale;
  const subjectTranslations = (sendingInfo?.subjectTranslations ?? {}) as Record<string, string>;
  const preheaderTranslations = (sendingInfo?.preheaderTranslations ?? {}) as Record<string, string>;
  const subjectLine = subjectTranslations[normalizedTestLocale] ?? current?.subject ?? draft.subject ?? "";
  const preheader = preheaderTranslations[normalizedTestLocale] ?? String(sendingInfo?.preheader ?? "");
  const whatsappVariants = isWhatsapp ? normalizeWhatsAppVariants(draft as never) : [];
  const whatsappVariant = whatsappVariants.find(item => item.id === (variantId || current?.id)) ?? whatsappVariants[0];

  const applyPreviewUser = (user: Record<string, unknown>) => setPreviewUser({
    ...user,
    first_name: String(user.first_name ?? user.firstName ?? "there"),
    last_name: String(user.last_name ?? user.lastName ?? ""),
    email: String(user.email ?? ""),
    language: String(user.language ?? testLocale),
    country: String(user.country ?? ""),
  });

  const pickRandom = async () => {
    try {
      const response = await fetch("/api/users?limit=1");
      const payload = await response.json();
      const user = payload?.data?.[0];
      if (user) { applyPreviewUser({ ...user, first_name: user.firstName }); setRecipient(user.email ?? user.id); }
    } catch { /* keep sample user */ }
  };

  const send = async () => {
    setState("sending"); setError("");
    let parsedCustom: Record<string, unknown> = {};
    if (mode === "custom") { try { parsedCustom = JSON.parse(customUser) as Record<string, unknown>; } catch { setState("error"); setError("Custom user attributes must be valid JSON."); return; } }
    const response = await fetch(`/api/campaigns/${draft.id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient, mode, customUser: parsedCustom, variantId: variantId || current?.id, locale: testLocale }) });
    const payload = await response.json().catch(() => ({}));
    setResult(payload);
    setError(response.ok ? "" : String(payload.error ?? "The test request failed."));
    setState(response.ok ? "sent" : "error");
  };

  const webhook = result?.webhook as { delivered?: boolean; attempts?: Array<{ statusCode?: number | null; outcome?: string; responseBody?: string; error?: string; durationMs?: number }>; url?: string; method?: string } | undefined;
  const attempt = webhook?.attempts?.at(-1);

  const frameStyle = { maxWidth: device === "mobile" ? 340 : 600, width: "100%", margin: "0 auto" } as CSSProperties;
  const rowsHtml = `<table role="presentation" width="100%" style="border-collapse:collapse">${rows.map(row => `<tr><td style="padding:${row.padding ?? 10}px;${row.bg ? `background:${row.bg};` : ""}"><table role="presentation" width="100%" style="border-collapse:collapse"><tr>${row.cells.map(cell => `<td width="${cell.width}%" style="vertical-align:top;padding:0 8px">${cell.blocks.map(block => blockToHtml(block, "en", defaultStyle())).join("")}</td>`).join("")}</tr></table></td></tr>`).join("")}</table>`;

  return <div className={styles.modalBackdrop} onMouseDown={close}>
    <section className={styles.testModal} onMouseDown={event => event.stopPropagation()}>
      <button className={styles.testModalClose} onClick={close} aria-label={translate(locale, "Close")}><X size={17} /></button>
      <div className={styles.testBody}>
        <h2>{translate(locale, "Preview and test")}</h2>
        <p>{draft.channel === "webhook" ? "Send a real request through the protected webhook delivery service and inspect the endpoint response." : isWhatsapp ? "Simulate a WhatsApp test delivery in the local activity log. No Meta API or device is contacted." : "Preview with sample user data, then write a test delivery event to the local activity log."}</p>
        <div className={styles.testGrid}>
          <label className={styles.testField}>{translate(locale, "Preview as")}
            <select value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
              <option value="random">Random user</option>
              <option value="existing">Existing user</option>
              <option value="custom">Custom user</option>
            </select>
          </label>
          {mode === "existing" && <label className={styles.testField}>Email or external user ID
            <input value={recipient} onChange={event => setRecipient(event.target.value)} />
          </label>}
          {mode === "random" && <button type="button" className={styles.sendButton} style={{ alignSelf: "end" }} onClick={() => void pickRandom()}>Load random user</button>}
          {mode === "custom" && <label className={styles.testField}>Custom user attributes
            <textarea value={customUser} onChange={event => setCustomUser(event.target.value)} aria-label="Custom user attributes" />
          </label>}
          {(variants.length > 1 || whatsappVariants.length > 1) && <label className={styles.testField}>Variant
            <select value={variantId || current?.id} onChange={event => setVariantId(event.target.value)}>
              {isWhatsapp
                ? whatsappVariants.map(variant => <option key={variant.id} value={variant.id}>{variant.name}</option>)
                : variants.map(variant => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
            </select>
          </label>}
          <label className={styles.testField}>Locale<input value={testLocale} onChange={event => setTestLocale(event.target.value)} /></label>
        </div>
        {mode === "custom" && <button type="button" className={styles.sendButton} style={{ marginBottom: 14 }} onClick={() => { try { applyPreviewUser(JSON.parse(customUser) as Record<string, unknown>); } catch { /* ignore */ } }}>Apply custom user to preview</button>}
        {isEmail && <>
          <div className={styles.deviceToggle}>
            <button className={device === "desktop" ? styles.deviceActive : ""} onClick={() => setDevice("desktop")}><Monitor size={13} /> Desktop</button>
            <button className={device === "mobile" ? styles.deviceActive : ""} onClick={() => setDevice("mobile")}><Smartphone size={13} /> Mobile</button>
            <button className={dark ? styles.deviceActive : ""} onClick={() => setDark(!dark)}><Moon size={13} /> Dark mode</button>
          </div>
          {rows.length
            ? <div className={className(styles.emailTestFrame, device === "mobile" && styles.mobile, dark && styles.darkMode)} style={frameStyle} dangerouslySetInnerHTML={{ __html: rowsHtml }} />
            : htmlBody
              ? <div className={className(styles.emailTestFrame, device === "mobile" && styles.mobile, dark && styles.darkMode)} style={frameStyle} dangerouslySetInnerHTML={{ __html: resolveLiquidPreview(htmlBody, previewUser, "en") }} />
              : <div className={className(styles.emailTestFrame, device === "mobile" && styles.mobile, dark && styles.darkMode)} style={frameStyle}>
                  <p className={styles.tFrom}>From: Powered by Braze &lt;braze@mta-h466.bftmail.com&gt;</p>
                  <p className={styles.tSubject}>{resolveLiquidPreview(subjectLine, previewUser, "en")}</p>
                  {preheader && <p className={styles.tPreheader}>{resolveLiquidPreview(preheader, previewUser, "en")}</p>}
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{resolveLiquidPreview(plainBody, previewUser, "en")}</pre>
                </div>}
        </>}
        {isWhatsapp && whatsappVariant && <div className={styles.emailTestFrame} style={frameStyle}>
          <div>{renderWhatsAppVariant(whatsappVariant)}</div>
          {whatsappVariant.mode === "template" && getWhatsAppTemplate(whatsappVariant.templateId).footer && <small>{getWhatsAppTemplate(whatsappVariant.templateId).footer}</small>}
        </div>}
        <div style={{ marginTop: 16 }}>
          <button className={styles.sendButton} disabled={state === "sending"} onClick={() => void send()}>{state === "sending" ? "Sending…" : isWhatsapp ? "Record simulated test" : "Send test"}</button>
        </div>
        {state === "sent" && !webhook && <div className={styles.testSuccess}><Eye size={16} /><span>{isWhatsapp ? "Simulated WhatsApp test recorded" : "Test delivery recorded"} for {recipient}.</span></div>}
        {state === "sent" && webhook && <div className={className(webhook.delivered ? styles.testSuccess : styles.testError, styles.webhookResult)}>
          <b>{attempt?.statusCode ? `${attempt.statusCode} ${attempt.outcome}` : attempt?.outcome ?? "failed"}</b>
          <span>{webhook.method} {webhook.url}</span>
          <small>{attempt?.durationMs ?? 0} ms</small>
          {attempt?.responseBody && <pre>{attempt.responseBody}</pre>}
          {attempt?.error && <pre>{attempt.error}</pre>}
        </div>}
        {state === "error" && <p className={styles.testError}>{error || "The test request failed."}</p>}
      </div>
    </section>
  </div>;
}

// --- Shared message editor (html / plain / template / operator) -----------------

export function EmailMessageEditor({ locale, mode, variantName, draft, save, onClose, onSendingSettings, onModeChange, onOpenTest }: {
  locale: Locale;
  mode: EditorMode;
  variantName: string;
  draft: EmailCampaignLike;
  save: (patch: SavePatch) => Promise<boolean>;
  onClose: () => void;
  onSendingSettings: () => void;
  onModeChange: (mode: EditorMode) => void;
  onOpenTest: () => void;
}) {
  if (mode === "drag") return <BrazeEmailDndEditor locale={locale} draft={draft} variantName={variantName} save={save} onClose={onClose} onSendingSettings={onSendingSettings} onOpenTest={onOpenTest} />;
  return <GeneralEmailEditor locale={locale} mode={mode} variantName={variantName} draft={draft} save={save} onClose={onClose} onSendingSettings={onSendingSettings} onModeChange={onModeChange} onOpenTest={onOpenTest} />;
}

function GeneralEmailEditor({ locale, mode, variantName, draft, save, onClose, onSendingSettings, onModeChange, onOpenTest }: {
  locale: Locale; mode: Exclude<EditorMode, "drag">; variantName: string; draft: EmailCampaignLike;
  save: (patch: SavePatch) => Promise<boolean>; onClose: () => void; onSendingSettings: () => void;
  onModeChange: (mode: EditorMode) => void; onOpenTest: () => void;
}) {
  const sending = (draft.config?.emailSending ?? {}) as Record<string, unknown>;
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [preheader, setPreheader] = useState(typeof sending.preheader === "string" ? sending.preheader : "");
  const [body, setBody] = useState(variantBody(draft));
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(mode === "template");
  const [operatorPrompt, setOperatorPrompt] = useState("Create a warm welcome email with a first-purchase offer.");
  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const labels: Record<EditorMode, string> = { operator: "Create with Operator", drag: "Drag-and-drop editor", html: "HTML code editor", plain: "Plain-text editor", template: "Templates" };

  const insertAtCursor = (token: string) => {
    const el = codeRef.current;
    if (!el) { setBody(value => value + token); return; }
    const start = el.selectionStart ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(el.selectionEnd ?? start)}`;
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
  };

  const persist = () => save({ subject, body, config: { ...draft.config, emailEditorMode: mode, emailSending: { ...sending, preheader } } });
  const autoSaveState = useAutoSave(persist, [subject, preheader, body]);
  const saveAndClose = async () => { if (await persist()) onClose(); };
  const saveAndSending = async () => { if (await persist()) onSendingSettings(); };
  const issues = mode === "html" ? liquidIssues(body) : [];

  const applyTemplate = (template: (typeof emailTemplates)[number]) => {
    if (template.rows) {
      void save({ subject: template.subject, body: rowsToPlainText(template.rows), config: { ...draft.config, emailEditorMode: "drag", emailRows: template.rows, emailStyle: normalizeStyle(draft.config?.emailStyle), emailSending: { ...sending, preheader: template.preheader } } });
      onModeChange("drag");
    } else if (template.html) {
      setSubject(template.subject); setPreheader(template.preheader); setBody(template.html);
      onModeChange("html");
    } else if (template.plain) {
      setSubject(template.subject); setPreheader(template.preheader); setBody(template.plain);
      onModeChange("plain");
    }
    setGalleryOpen(false);
  };

  const generateOperator = () => {
    const row = makeRow(1, [
      { ...defaultBlock("Image"), src: "https://placehold.co/600x280/e9e4f4/5632a6?text=" + encodeURIComponent(operatorPrompt.slice(0, 28)) },
      { ...defaultBlock("Title"), text: "Your first order offer" },
      { ...defaultBlock("Paragraph"), text: "Welcome! Use code WELCOME10 for 10% off your first purchase. This offer is ready whenever you are." },
      { ...defaultBlock("Button"), text: "Start shopping", href: "https://example.com/start" },
    ]);
    void save({ subject: "Your first order offer", body: rowsToPlainText([row]), config: { ...draft.config, emailEditorMode: "drag", emailRows: [row], emailStyle: normalizeStyle(draft.config?.emailStyle) } });
    onModeChange("drag");
  };

  return <section className={styles.genPage} aria-label={translate(locale, labels[mode])}>
    <header className={styles.genHeader}>
      <button className={styles.back} onClick={() => void saveAndClose()}><ChevronLeft size={16} /> {translate(locale, "Back to campaign")}</button>
      <div className={styles.title}><b>{translate(locale, labels[mode])}</b><small>{draft.name} · {variantName} · {saveStateLabel(autoSaveState)}</small></div>
      <button className={styles.action} onClick={onOpenTest}><Eye size={14} /> {translate(locale, "Preview and test")}</button>
      <button className={styles.action} onClick={() => void saveAndSending()}><Mail size={14} /> {translate(locale, "Sending settings")}</button>
      <button className={styles.action + " " + styles.primary} onClick={() => void saveAndClose()}>{translate(locale, "Save")}</button>
    </header>
    <div className={styles.genBody}>
      <main className={styles.genMain}>
        <div className={styles.genCanvasLabel}>{translate(locale, "Email preview")} · {mode === "plain" ? "plain text" : "600 px"}</div>
        {mode === "html" && <article className={styles.emailFrame} dangerouslySetInnerHTML={{ __html: resolveLiquidPreview(body || "<p style='color:#9a93a8'>Start typing HTML on the left to see it rendered here.</p>") }} />}
        {mode === "plain" && <article className={styles.plainFrame}>{resolveLiquidPreview(body || "Write your plain-text email on the left.")}</article>}
        {(mode === "template" || mode === "operator") && <article className={styles.emailFrame}>
          <p className={styles.tSubject}>{subject || "Message preview"}</p>
          <div style={{ display: "grid", placeItems: "center", minHeight: 180, border: "1px dashed #c9c2d8", borderRadius: 8, color: "#8d8698", fontSize: 13, padding: 20, textAlign: "center" }}>
            {mode === "template" ? "Pick a template from the gallery to load it into the right editor." : "Describe the email and generate a draft."}
          </div>
        </article>}
      </main>
      <aside className={styles.genSide}>
        <h2>{translate(locale, labels[mode])}</h2>
        <p>{mode === "html" ? "Edit your email source. The central canvas renders the current message with Liquid resolved."
          : mode === "plain" ? "Write the plain-text version. Users on clients without HTML rendering receive exactly this."
          : mode === "template" ? "Choose a template, then make changes in the editor."
          : "Describe the email you want to create."}</p>
        {(mode === "html" || mode === "plain") && <>
          <label className={styles.genField}>{translate(locale, "Subject line")}<input value={subject} onChange={event => setSubject(event.target.value)} /></label>
          <label className={styles.genField}>{translate(locale, "Preheader")}<input value={preheader} onChange={event => setPreheader(event.target.value)} /></label>
          <label className={styles.genField}>{mode === "html" ? "HTML source" : "Plain text"}<textarea ref={codeRef} aria-label={mode === "html" ? "Email HTML source" : "Email plain-text source"} className={mode === "html" ? styles.codeArea : undefined} value={body} onChange={event => setBody(event.target.value)} /></label>
          <button type="button" className={styles.personalizationToggle} onClick={() => setPersonalizationOpen(!personalizationOpen)}><Sparkles size={13} /> {translate(locale, "Personalization")}</button>
          {personalizationOpen && <div className={styles.leftPanel} style={{ marginTop: 10 }}><PersonalizationMenu title={mode === "html" ? "Insert into HTML" : "Insert into plain text"} onInsert={insertAtCursor} /></div>}
          {mode === "html" && (issues.length
            ? <div className={styles.liquidIssues}><b>Liquid checks</b>{issues.map(issue => <div key={issue}>• {issue}</div>)}</div>
            : <div className={styles.liquidOk}>Liquid checks passed.</div>)}
          <div className={styles.modeNote}>Personalization, content blocks, and link tracking are available in this local editor.</div>
        </>}
        {mode === "operator" && <>
          <label className={styles.genField}>Prompt<textarea value={operatorPrompt} onChange={event => setOperatorPrompt(event.target.value)} /></label>
          <button type="button" className={styles.sendButton} onClick={generateOperator}><Sparkles size={14} /> {translate(locale, "Generate email")}</button>
        </>}
        {mode === "template" && <button type="button" className={styles.sendButton} onClick={() => setGalleryOpen(true)}><LayoutDashboard size={14} /> {translate(locale, "Choose a template")}</button>}
      </aside>
    </div>
    {galleryOpen && <EmailTemplateGallery locale={locale} onApply={applyTemplate} onClose={() => setGalleryOpen(false)} />}
  </section>;
}
