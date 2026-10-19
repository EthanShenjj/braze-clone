import { test } from "node:test";
import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { createBrowserCanvas, duplicateBrowserCanvas, getBrowserCanvas, listBrowserCanvases, patchBrowserCanvas, saveBrowserGraph } from "../lib/canvas-browser-store.ts";

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
