import assert from "node:assert/strict";
import test from "node:test";
import { initialVisibleIds, normalizeVisibleGraph, organizationGraph, visibleIdsForExpanded } from "./normalize";
import type { GraphResponse } from "@/lib/types";

const graph: GraphResponse = {
  nodes: [
    { id: "root", labels: ["Company"], properties: { id: "root", name: "Hirenova" } },
    { id: "dept", labels: ["Department"], properties: { id: "dept", name: "Engineering" } },
    { id: "team", labels: ["Team"], properties: { id: "team", name: "Engineering Team" } },
    { id: "employee", labels: ["Employee"], properties: { id: "employee", name: "Ava" } },
  ],
  edges: [
    { id: "root-dept", type: "HAS_DEPARTMENT", source: "root", target: "dept", properties: {} },
    { id: "dept-team", type: "HAS_TEAM", source: "dept", target: "team", properties: {} },
    { id: "team-employee", type: "MEMBER_OF", source: "employee", target: "team", properties: {} },
  ],
};

test("initial graph contains exactly the selected root", () => {
  assert.deepEqual([...initialVisibleIds(graph)], ["root"]);
});

test("expansion reveals the next layer without duplicate nodes or unrelated edges", () => {
  const visible = visibleIdsForExpanded(graph, "root", new Set(["root", "dept"]));
  const normalized = normalizeVisibleGraph(graph, visible);
  assert.deepEqual(new Set(normalized.nodes.map((node) => node.id)), new Set(["root", "dept", "team"]));
  assert.equal(normalized.nodes.length, 3);
  assert.equal(normalized.edges.length, 2);
});

test("collapsing a node removes all descendants while retaining the root view", () => {
  const visible = visibleIdsForExpanded(graph, "root", new Set());
  assert.deepEqual([...visible], ["root"]);
});

test("organization normalization excludes Product Progress records and relationships", () => {
  const mixed = { ...graph,
    nodes: [...graph.nodes, { id: "product", labels: ["Product"], properties: { id: "product", name: "Orbit Checkout" } }],
    edges: [...graph.edges, { id: "product-edge", type: "HAS_MODULE", source: "root", target: "product", properties: {} }],
  };
  const organization = organizationGraph(mixed);
  assert.ok(!organization.nodes.some((node) => node.id === "product"));
  assert.ok(!organization.edges.some((edge) => edge.id === "product-edge"));
});

test("a Product Progress-only response cannot select a Task as the Team Progress root", () => {
  const productOnly: GraphResponse = {
    nodes: [{ id: "task-idempotency-audit", labels: ["Task"], properties: { id: "task-idempotency-audit", graphDomain: "product-progress", title: "Audit retry idempotency boundaries" } }],
    edges: [],
  };
  const organization = organizationGraph(productOnly);
  assert.deepEqual(organization, { nodes: [], edges: [] });
});

test("graph modes select independent roots", () => {
  const product: GraphResponse = {
    nodes: [
      { id: "product", labels: ["Product"], properties: { id: "product", name: "Orbit Checkout", graphDomain: "product-progress" } },
      { id: "feature", labels: ["Feature"], properties: { id: "feature", title: "CSV export", graphDomain: "product-progress" } },
    ],
    edges: [{ id: "product-feature", type: "HAS_FEATURE", source: "product", target: "feature", properties: {} }],
  };
  assert.equal([...initialVisibleIds(graph)][0], "root");
  assert.equal([...initialVisibleIds(product)][0], "product");
  assert.deepEqual([...initialVisibleIds(product)], ["product"]);
});

test("visible normalization removes duplicate edges", () => {
  const duplicateGraph = { ...graph, edges: [...graph.edges, { ...graph.edges[0] }] };
  const normalized = normalizeVisibleGraph(duplicateGraph, new Set(["root", "dept"]));
  assert.equal(normalized.edges.length, 1);
});

test("layout places children to the right and connects at node boundaries", () => {
  const normalized = normalizeVisibleGraph(graph, new Set(["root", "dept"]));
  const root = normalized.nodes.find((node) => node.id === "root")!;
  const child = normalized.nodes.find((node) => node.id === "dept")!;
  assert.ok(child.position.x > root.position.x);
  assert.equal(normalized.edges[0].sourceHandle, "source-right");
  assert.equal(normalized.edges[0].targetHandle, "target-left");
});

test("new nodes avoid existing node bounding boxes", () => {
  const normalized = normalizeVisibleGraph(graph, new Set(["root", "dept", "team", "employee"]));
  const positions = normalized.nodes.map((node) => node.position);
  for (let index = 0; index < positions.length; index += 1) {
    for (let other = index + 1; other < positions.length; other += 1) {
      assert.ok(Math.abs(positions[index].x - positions[other].x) >= 240 || Math.abs(positions[index].y - positions[other].y) >= 125);
    }
  }
});
