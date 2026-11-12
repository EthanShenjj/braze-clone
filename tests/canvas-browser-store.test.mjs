import { test } from "node:test";
import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { createBrowserCanvas, duplicateBrowserCanvas, getBrowserCanvas, listBrowserCanvases, patchBrowserCanvas, reconcileBrowserCanvasTags, resolveBrowserCanvasTagRenames, saveBrowserGraph, tagBrowserCanvases } from "../lib/canvas-browser-store.ts";

function storage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("browser Canvas drafts survive reads, edits, graph saves, and duplication", () => {
  storage();
  const created = createBrowserCanvas({ name: "Test journey" });
  equal(listBrowserCanvases().length, 1);
  equal(getBrowserCanvas(created.id).graph.nodes.length, 1);
  patchBrowserCanvas(created.id, { name: "Edited journey", tags: ["welcome"] });
  const graph = { nodes: [{ id: "entry", label: "Audience entry", kind: "entry", x: 0, y: 0 }], edges: [] };
  saveBrowserGraph(created.id, graph);
  deepEqual(getBrowserCanvas(created.id).graph, graph);
  const copy = duplicateBrowserCanvas(created.id);
  equal(copy.name, "Edited journey copy");
  deepEqual(getBrowserCanvas(copy.id).graph, graph);
  ok(copy.id !== created.id);
});

test("duplicate active names are rejected without losing existing drafts", () => {
  storage();
  createBrowserCanvas({ name: "Journey" });
  throws(() => createBrowserCanvas({ name: "journey" }), /already exists/);
  equal(listBrowserCanvases().length, 1);
});

test("registry renames update persisted browser draft tags and future duplicates without editing journey data", () => {
  storage();
  const created = createBrowserCanvas({ name: "Renamed tag journey", tags: ["Old", "Current", "Unrelated"] });
  const before = getBrowserCanvas(created.id);
  const result = reconcileBrowserCanvasTags({ Old: "Current" });
  deepEqual(result[0].tags, ["Current", "Unrelated"]);
  const after = getBrowserCanvas(created.id);
  deepEqual(after.graph, before.graph);
  deepEqual(after.canvas, { ...before.canvas, tags: ["Current", "Unrelated"] });
  deepEqual(duplicateBrowserCanvas(created.id).tags, ["Current", "Unrelated"]);
});

test("deleted registry names remain removable and no-op reconciliation does not write storage", () => {
  storage();
  const created = createBrowserCanvas({ name: "Deleted tag journey", tags: ["Deleted", "Keep"] });
  const before = getBrowserCanvas(created.id);
  globalThis.localStorage.setItem = () => { throw new Error("Unexpected write"); };
  deepEqual(reconcileBrowserCanvasTags({ Deleted: null })[0], before.canvas);
  deepEqual(getBrowserCanvas(created.id), before);
});

test("in-progress Canvas tag changes follow renames without removing unknown or deleted selections", () => {
  const selected = ["Old", "Current", "Deleted", "Unsaved"];
  deepEqual(resolveBrowserCanvasTagRenames(selected, { Old: "Current", Deleted: null }), ["Current", "Deleted", "Unsaved"]);
  deepEqual(selected, ["Old", "Current", "Deleted", "Unsaved"]);
});

test("Canvas Tag as replaces the full set for selected browser drafts and supports removing all tags", () => {
  storage();
  const first = createBrowserCanvas({ name: "One", tags: ["Old"] });
  const second = createBrowserCanvas({ name: "Two", tags: ["Other"] });
  const unselected = createBrowserCanvas({ name: "Untouched", tags: ["Keep"] });
  const before = getBrowserCanvas(first.id);
  const result = tagBrowserCanvases([first.id, second.id, first.id], [" New ", "New"]);
  equal(result.length, 2);
  for (const item of result) deepEqual(item.tags, ["New"]);
  deepEqual(getBrowserCanvas(first.id).graph, before.graph);
  deepEqual(getBrowserCanvas(unselected.id).canvas, unselected);
  tagBrowserCanvases([first.id, second.id], []);
  for (const id of [first.id, second.id]) deepEqual(getBrowserCanvas(id).canvas.tags, []);
});

test("Canvas Tag as validates every selected draft and the tag limit before one storage write", () => {
  storage();
  const first = createBrowserCanvas({ name: "One", tags: ["Original"] });
  const second = createBrowserCanvas({ name: "Two", tags: ["Preserve"] });
  const before = listBrowserCanvases();
  throws(() => tagBrowserCanvases([first.id, "missing"], ["New"]), /no longer available/);
  throws(() => tagBrowserCanvases([first.id, second.id], Array.from({ length: 176 }, (_, index) => `Tag ${index}`)), /175/);
  throws(() => tagBrowserCanvases([], []), /at least one/);
  deepEqual(listBrowserCanvases(), before);
  let writes = 0;
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (...args) => { writes++; original(...args); };
  tagBrowserCanvases([first.id, second.id], ["Applied"]);
  equal(writes, 1);
});

test("browser Canvas lists, same-name drafts, edits and duplicates stay in their workspace", () => {
  storage();
  const local = createBrowserCanvas({ name: "Shared journey", tags: ["Local"] });
  const remote = createBrowserCanvas({ name: "Shared journey", tags: ["Remote"], workspaceId: "team-b" });
  equal(local.workspaceId, "local");
  deepEqual(listBrowserCanvases().map(item => item.id), [local.id]);
  deepEqual(listBrowserCanvases("team-b").map(item => item.id), [remote.id]);
  equal(getBrowserCanvas(remote.id, "local"), null);
  throws(() => patchBrowserCanvas(remote.id, { name: "Wrong edit" }, "local"), /not found/);
  throws(() => patchBrowserCanvas(remote.id, { workspaceId: "local" }, "team-b"), /cannot move/);
  const copy = duplicateBrowserCanvas(remote.id, "team-b");
  equal(copy.workspaceId, "team-b");
  equal(listBrowserCanvases("team-b").length, 2);
  deepEqual(listBrowserCanvases().map(item => item.id), [local.id]);
});

test("browser tag renames and bulk replacement cannot cross workspace boundaries", () => {
  storage();
  const local = createBrowserCanvas({ name: "Local journey", tags: ["Old"] });
  const remote = createBrowserCanvas({ name: "Remote journey", tags: ["Old"], workspaceId: "team-b" });
  reconcileBrowserCanvasTags({ Old: "Renamed" }, "team-b");
  deepEqual(getBrowserCanvas(local.id).canvas.tags, ["Old"]);
  deepEqual(getBrowserCanvas(remote.id).canvas.tags, ["Renamed"]);
  throws(() => tagBrowserCanvases([local.id, remote.id], ["Cross scope"], "team-b"), /no longer available/);
  deepEqual(getBrowserCanvas(local.id).canvas.tags, ["Old"]);
  deepEqual(getBrowserCanvas(remote.id).canvas.tags, ["Renamed"]);
  tagBrowserCanvases([remote.id], ["Applied"], "team-b");
  deepEqual(getBrowserCanvas(remote.id).canvas.tags, ["Applied"]);
  deepEqual(getBrowserCanvas(local.id).canvas.tags, ["Old"]);
});

test("legacy browser drafts without a workspace remain local", () => {
  storage();
  const created = createBrowserCanvas({ name: "Legacy journey", tags: ["Old"] });
  const stored = JSON.parse(localStorage.getItem("braze-canvas-browser-drafts-v1"));
  delete stored[0].canvas.workspaceId;
  localStorage.setItem("braze-canvas-browser-drafts-v1", JSON.stringify(stored));
  equal(listBrowserCanvases().length, 1);
  equal(listBrowserCanvases("team-b").length, 0);
  equal(getBrowserCanvas(created.id, "local").canvas.id, created.id);
  reconcileBrowserCanvasTags({ Old: "Renamed" });
  deepEqual(getBrowserCanvas(created.id, "local").canvas.tags, ["Renamed"]);
});
