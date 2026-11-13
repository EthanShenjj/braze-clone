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

test("global subscription updates accept only explicit booleans", () => {
  const graph = clone();
  graph.nodes[1] = { id: "delay", label: "Global status", kind: "update", x: 360, y: 190, config: { attribute: "subscribed", value: "treu" } };
  deepEqual(validateCanvasGraph(graph), ["Set subscribed to true or false on “Global status”."]);
  graph.nodes[1].config.value = "false";
  deepEqual(validateCanvasGraph(graph), []);
});

test("Agent configuration and variant weights validate without a blanket unsupported-component guard", () => {
  const graph = clone();
  graph.nodes.push({ id: "agent", label: "Agent Step", kind: "agent", x: 600, y: 600 });
  graph.edges.push(["email", "agent"]);
  ok(validateCanvasGraph(graph).some(issue => issue.includes("Choose an agent")));
  graph.nodes.at(-1).config={agentId:'configured-agent',outputVariable:'offer',outputType:'String'};
  deepEqual(validateCanvasGraph(graph),[]);
  graph.variants = [{ id: "one", name: "Variant 1", weight: 50 }, { id: "two", name: "Variant 2", weight: 50 }];
  deepEqual(validateCanvasGraph(graph),[]);
  graph.variants[1].weight=40;
  ok(validateCanvasGraph(graph).some(issue=>issue.includes('total 100')));
});
