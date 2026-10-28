import type { Component, Editor } from "grapesjs";

/** Bridge the palette's pointer gesture into the same-origin canvas. Native HTML
 * drag events and parent pointer coordinates differ across iframe boundaries. */
export function beginPaletteDrag(editor: Editor, id: string, event: PointerEvent, done: () => void) {
  const block = editor.Blocks.get(id), frame = editor.Canvas.getFrameEl();
  if (!block || !frame || event.button !== 0) return;
  const content = block.getContent();
  if (!content || typeof content === "function") return;
  const sourceX = event.clientX, sourceY = event.clientY;
  const previousPointerEvents = frame.style.pointerEvents, previousCursor = document.body.style.cursor;
  let moving = false, target: { parent: Component; index: number; x: number; y: number; width: number; createRow: boolean } | undefined;
  const indicator = document.createElement("div");
  indicator.setAttribute("aria-hidden", "true");
  Object.assign(indicator.style, { position: "fixed", pointerEvents: "none", height: "3px", background: "#7030c8", zIndex: "9999", boxShadow: "0 0 0 2px #ffffff", display: "none" });
  const isRow = id.startsWith("braze-row-");
  const move = (pointer: PointerEvent) => {
    if (!moving && Math.hypot(pointer.clientX - sourceX, pointer.clientY - sourceY) < 5) return;
    if (!moving) { moving = true; frame.style.pointerEvents = "none"; document.body.append(indicator); document.body.style.cursor = "grabbing"; }
    pointer.preventDefault(); target = undefined; indicator.style.display = "none";
    const bounds = frame.getBoundingClientRect(), x = pointer.clientX - bounds.left, y = pointer.clientY - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;
    const doc = editor.Canvas.getDocument(); if (!doc) return;
    const hit = doc.elementFromPoint(x, y), body = editor.getWrapper()?.findType("mj-body")[0];
    if (!body) return;
    let column: Component | undefined;
    body.onAll(component => { if (component.get("type") === "mj-column" && component.getEl()?.contains(hit)) column = component; });
    const parent = isRow || !column ? body : column;
    if (!parent) return;
    const children = parent.components().models;
    let index = children.length;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getEl()?.getBoundingClientRect();
      if (rect && y < rect.top + rect.height / 2) { index = i; break; }
    }
    const parentRect = parent.getEl()?.getBoundingClientRect();
    const beforeRect = children[index]?.getEl()?.getBoundingClientRect();
    const lastRect = children.at(-1)?.getEl()?.getBoundingClientRect();
    if (!parentRect) return;
    target = { parent, index, x: bounds.left + parentRect.left, y: bounds.top + (beforeRect?.top ?? lastRect?.bottom ?? parentRect.top), width: parentRect.width, createRow: !isRow && !column };
    Object.assign(indicator.style, { display: "block", left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px` });
  };
  const cleanup = () => { frame.style.pointerEvents = previousPointerEvents; document.body.style.cursor = previousCursor; indicator.remove(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("keydown", key); document.removeEventListener("pointercancel", cleanup); window.removeEventListener("blur", cleanup); };
  const up = () => {
    cleanup();
    if (!moving || !target) return;
    let parent = target.parent;
    if (target.createRow) parent = parent.append('<mj-section padding="0px"><mj-column padding="0px"></mj-column></mj-section>', { at: target.index })[0]?.findType("mj-column")[0];
    if (!parent) return;
    const added = parent.append(content, target.createRow ? {} : { at: target.index })[0];
    if (added) editor.select(added);
    done();
  };
  const key = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") cleanup(); };
  document.addEventListener("pointermove", move, { passive: false }); document.addEventListener("pointerup", up, { once: true }); document.addEventListener("keydown", key); document.addEventListener("pointercancel", cleanup, { once: true }); window.addEventListener("blur", cleanup, { once: true });
  return cleanup;
}
