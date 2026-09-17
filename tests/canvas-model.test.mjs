import { test } from "node:test";
import { deepEqual, ok } from "node:assert/strict";
import { initialCanvasGraph, validateCanvasGraph } from "../lib/canvas-model.ts";

const clone = () => structuredClone(initialCanvasGraph);

test("seed journey is launchable", () => {
  deepEqual(validateCanvasGraph(clone()), []);
});

test("unconnected action path cannot launch", () => {
  const graph = clone();
  graph.nodes.push({ id: "branch", label: "Country path", kind: "branch", x: 200, y: 300, config: { attribute: "country", value: "US" } });
  const issues = validateCanvasGraph(graph);
  ok(issues.some(issue => issue.includes("two routes")));
  ok(issues.some(issue => issue.includes("Connect every step")));
});

test("cycle and missing message content are rejected", () => {
  const graph = clone();
  graph.edges.push(["email", "delay"]);
  graph.nodes.find(node => node.id === "email").config.message = "";
  const issues = validateCanvasGraph(graph);
  ok(issues.some(issue => issue.includes("Remove loops")));
  ok(issues.some(issue => issue.includes("Configure a channel and message")));
});

test("only action paths can fan out", () => {
  const graph = clone();
  graph.edges.push(["entry", "email"]);
  ok(validateCanvasGraph(graph).some(issue => issue.includes("only one outgoing route")));
});
