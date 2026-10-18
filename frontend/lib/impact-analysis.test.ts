import assert from "node:assert/strict";
import test from "node:test";
import { combineImpactGraphs, decisionMetrics, getImpactDecisions } from "./impact-analysis";

test("derives decision relationships and supported metrics from graph data", () => {
  const graph = combineImpactGraphs([{ nodes: [
    { id: "decision", labels: ["Decision"], properties: { title: "Use retries", status: "accepted", validFrom: "2026-01-01" } },
    { id: "employee", labels: ["Employee"], properties: { name: "Ava" } },
    { id: "project", labels: ["Project"], properties: { name: "Payments" } },
  ], edges: [
    { id: "owner", type: "MADE_DECISION", source: "employee", target: "decision", properties: {} },
    { id: "project-link", type: "RELATED_TO", source: "decision", target: "project", properties: {} },
  ] }]);
  const decisions = getImpactDecisions(graph);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].owner?.id, "employee");
  assert.deepEqual(decisionMetrics(decisions), { total: 1, withOutcome: 1, unresolved: 0, affectedEntities: 2 });
});

test("does not invent metrics for an empty graph", () => {
  const decisions = getImpactDecisions({ nodes: [], edges: [] });
  assert.deepEqual(decisionMetrics(decisions), { total: 0, withOutcome: 0, unresolved: 0, affectedEntities: 0 });
});
