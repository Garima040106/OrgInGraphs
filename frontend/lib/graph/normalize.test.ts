import assert from "node:assert/strict";
import test from "node:test";
import {
  getChildNodeIds,
  initialVisibleIds,
  normalizeVisibleGraph,
  organizationGraph,
  visibleIdsForExpanded,
} from "./normalize";
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

const orgHierarchyGraph: GraphResponse = {
  nodes: [
    { id: "comp", labels: ["Company"], properties: { id: "comp", name: "Hirenova Corp" } },
    { id: "dept-eng", labels: ["Department"], properties: { id: "dept-eng", name: "Engineering", employeeCount: 2 } },
    { id: "dept-des", labels: ["Department"], properties: { id: "dept-des", name: "Design", employeeCount: 1 } },
    { id: "dept-empty", labels: ["Department"], properties: { id: "dept-empty", name: "Security", employeeCount: 0 } },
    { id: "emp-alice", labels: ["Employee"], properties: { id: "emp-alice", name: "Alice", departmentId: "dept-eng", jobTitle: "Staff Engineer" } },
    { id: "emp-bob", labels: ["Employee"], properties: { id: "emp-bob", name: "Bob", departmentId: "dept-eng", jobTitle: "Senior Engineer" } },
    { id: "emp-carol", labels: ["Employee"], properties: { id: "emp-carol", name: "Carol", departmentId: "dept-des", jobTitle: "Lead Designer" } },
  ],
  edges: [
    { id: "comp-eng", type: "HAS_DEPARTMENT", source: "comp", target: "dept-eng", properties: {} },
    { id: "comp-des", type: "HAS_DEPARTMENT", source: "comp", target: "dept-des", properties: {} },
    { id: "comp-empty", type: "HAS_DEPARTMENT", source: "comp", target: "dept-empty", properties: {} },
    { id: "alice-works-in", type: "WORKS_IN", source: "emp-alice", target: "dept-eng", properties: {} },
    { id: "bob-works-in", type: "WORKS_IN", source: "emp-bob", target: "dept-eng", properties: {} },
    { id: "carol-works-in", type: "WORKS_IN", source: "emp-carol", target: "dept-des", properties: {} },
    // Reverse/peer edge that should NOT cause circular or reverse expansion:
    { id: "bob-reports-alice", type: "REPORTS_TO", source: "emp-bob", target: "emp-alice", properties: {} },
  ],
};

test("initial graph contains exactly the selected root", () => {
  assert.deepEqual([...initialVisibleIds(graph)], ["root"]);
  assert.deepEqual([...initialVisibleIds(orgHierarchyGraph)], ["comp"]);
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
  const mixed = {
    ...graph,
    nodes: [...graph.nodes, { id: "product", labels: ["Product"], properties: { id: "product", name: "Orbit Checkout" } }],
    edges: [...graph.edges, { id: "product-edge", type: "HAS_MODULE", source: "root", target: "product", properties: {} }],
  };
  const organization = organizationGraph(mixed);
  assert.ok(!organization.nodes.some((node) => node.id === "product"));
  assert.ok(!organization.edges.some((edge) => edge.id === "product-edge"));
});

test("a Product Progress-only response cannot select a Task as the Team Progress root", () => {
  const productOnly: GraphResponse = {
    nodes: [
      {
        id: "task-idempotency-audit",
        labels: ["Task"],
        properties: { id: "task-idempotency-audit", graphDomain: "product-progress", title: "Audit retry idempotency boundaries" },
      },
    ],
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
  assert.equal(normalized.edges[0].type, "default");
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

// --- NEW COMPREHENSIVE TESTS FOR STRICT HIERARCHY, LEAF NODES, AND DETERMINISTIC BEZIER LAYOUT ---

test("strictly enforces one-directional Organization -> Department -> Employee expansion", () => {
  // Step 1: Initial state only contains Company root
  const initial = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set());
  assert.deepEqual(new Set(initial), new Set(["comp"]));

  // Step 2: Expanding Company root reveals only its child Departments
  const afterComp = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp"]));
  assert.deepEqual(new Set(afterComp), new Set(["comp", "dept-eng", "dept-des", "dept-empty"]));

  // Step 3: Expanding Engineering Department reveals only its Employees
  const afterEng = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp", "dept-eng"]));
  assert.deepEqual(new Set(afterEng), new Set(["comp", "dept-eng", "dept-des", "dept-empty", "emp-alice", "emp-bob"]));

  // Step 4: Expanding Design Department reveals Carol
  const afterBoth = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp", "dept-eng", "dept-des"]));
  assert.deepEqual(new Set(afterBoth), new Set(["comp", "dept-eng", "dept-des", "dept-empty", "emp-alice", "emp-bob", "emp-carol"]));
});

test("expanding an employee or leaf node does not re-expand ancestors or create reverse branches", () => {
  // Alice is an employee (leaf node). Expanding Alice MUST NOT add anything new or re-expand ancestors
  const expanded = new Set(["comp", "dept-eng", "emp-alice"]);
  const visible = visibleIdsForExpanded(orgHierarchyGraph, "comp", expanded);

  assert.deepEqual(
    new Set(visible),
    new Set(["comp", "dept-eng", "dept-des", "dept-empty", "emp-alice", "emp-bob"]),
  );

  // Check getChildNodeIds directly on leaf nodes:
  assert.deepEqual(getChildNodeIds(orgHierarchyGraph, "emp-alice"), []);
  assert.deepEqual(getChildNodeIds(orgHierarchyGraph, "emp-bob"), []);
  assert.deepEqual(getChildNodeIds(orgHierarchyGraph, "emp-carol"), []);

  // Normalization must not create reverse edges or duplicate nodes
  const normalized = normalizeVisibleGraph(orgHierarchyGraph, visible);
  assert.equal(normalized.nodes.length, 6);
  // All edge sources must be ancestors, and edge targets must be descendants
  for (const edge of normalized.edges) {
    assert.equal(edge.sourceHandle, "source-right");
    assert.equal(edge.targetHandle, "target-left");
    assert.equal(edge.type, "default");
    const sourceNode = normalized.nodes.find((n) => n.id === edge.source)!;
    const targetNode = normalized.nodes.find((n) => n.id === edge.target)!;
    assert.ok(targetNode.position.x > sourceNode.position.x, "Child node must be strictly to the right of parent");
  }
});

test("handles multiple departments and multiple employees with non-overlapping layout and smooth edges", () => {
  const visible = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp", "dept-eng", "dept-des"]));
  const normalized = normalizeVisibleGraph(orgHierarchyGraph, visible);

  // Verify node counts
  assert.equal(normalized.nodes.length, 7);

  // Group nodes by hierarchy column
  const compNode = normalized.nodes.find((n) => n.id === "comp")!;
  const engNode = normalized.nodes.find((n) => n.id === "dept-eng")!;
  const desNode = normalized.nodes.find((n) => n.id === "dept-des")!;
  const emptyNode = normalized.nodes.find((n) => n.id === "dept-empty")!;
  const aliceNode = normalized.nodes.find((n) => n.id === "emp-alice")!;
  const bobNode = normalized.nodes.find((n) => n.id === "emp-bob")!;
  const carolNode = normalized.nodes.find((n) => n.id === "emp-carol")!;

  // Horizontal separation between levels
  assert.ok(engNode.position.x > compNode.position.x);
  assert.equal(engNode.position.x, desNode.position.x);
  assert.equal(engNode.position.x, emptyNode.position.x);
  assert.ok(aliceNode.position.x > engNode.position.x);
  assert.equal(aliceNode.position.x, bobNode.position.x);
  assert.equal(aliceNode.position.x, carolNode.position.x);

  // Sibling vertical separation
  assert.ok(Math.abs(engNode.position.y - desNode.position.y) >= 125, "Departments must have distinct vertical positions");
  assert.ok(Math.abs(desNode.position.y - emptyNode.position.y) >= 125, "Departments must have distinct vertical positions");
  assert.ok(Math.abs(aliceNode.position.y - bobNode.position.y) >= 125, "Employees under same dept must have distinct vertical positions");
  assert.ok(Math.abs(bobNode.position.y - carolNode.position.y) >= 125, "Employees across depts must maintain separation");

  // Every edge must be soft, smooth Bezier curve (type === 'default') with correct handles
  for (const edge of normalized.edges) {
    assert.equal(edge.type, "default");
    assert.equal(edge.sourceHandle, "source-right");
    assert.equal(edge.targetHandle, "target-left");
  }

  // Engineering edges must only connect to engineering employees
  const engEdges = normalized.edges.filter((e) => e.source === "dept-eng");
  assert.equal(engEdges.length, 2);
  assert.deepEqual(new Set(engEdges.map((e) => e.target)), new Set(["emp-alice", "emp-bob"]));

  // Design edges must only connect to design employees
  const desEdges = normalized.edges.filter((e) => e.source === "dept-des");
  assert.equal(desEdges.length, 1);
  assert.equal(desEdges[0].target, "emp-carol");
});

test("repeated expansion, collapse, and re-expansion returns identical deterministic positions", () => {
  // First expansion
  const visible1 = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp", "dept-eng"]));
  const layout1 = normalizeVisibleGraph(orgHierarchyGraph, visible1);
  const posAlice1 = layout1.nodes.find((n) => n.id === "emp-alice")!.position;
  const posBob1 = layout1.nodes.find((n) => n.id === "emp-bob")!.position;

  // Collapse dept-eng
  const visibleCollapsed = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp"]));
  assert.ok(!visibleCollapsed.has("emp-alice"));
  assert.ok(!visibleCollapsed.has("emp-bob"));

  // Re-expand dept-eng
  const visible2 = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp", "dept-eng"]));
  const layout2 = normalizeVisibleGraph(orgHierarchyGraph, visible2);
  const posAlice2 = layout2.nodes.find((n) => n.id === "emp-alice")!.position;
  const posBob2 = layout2.nodes.find((n) => n.id === "emp-bob")!.position;

  // Positions must be identical and deterministic
  assert.deepEqual(posAlice1, posAlice2);
  assert.deepEqual(posBob1, posBob2);
});

test("empty-child cases: expanding a department with no employees does not fail or produce reverse branches", () => {
  // dept-empty has no employees
  assert.deepEqual(getChildNodeIds(orgHierarchyGraph, "dept-empty"), []);

  const visibleBefore = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp"]));
  const visibleAfter = visibleIdsForExpanded(orgHierarchyGraph, "comp", new Set(["comp", "dept-empty"]));

  // Expanding empty department should not add any child nodes or re-expand ancestors
  assert.deepEqual(visibleBefore, visibleAfter);

  const normalized = normalizeVisibleGraph(orgHierarchyGraph, visibleAfter);
  const emptyNode = normalized.nodes.find((n) => n.id === "dept-empty");
  assert.ok(emptyNode);
  assert.equal(emptyNode.data.hasChildren, false);
});
