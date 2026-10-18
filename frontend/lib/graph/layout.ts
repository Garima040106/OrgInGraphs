import type { Edge, Node } from "@xyflow/react";
import type { GraphResponse } from "@/lib/types";
import { graphRootId, normalizeGraph, normalizeVisibleGraph, type GraphNodeData } from "./normalize";

export function buildInitialGraph(
  graph: GraphResponse,
  graphMode: "team" | "product" = "team",
): { nodes: Node<GraphNodeData>[]; edges: Edge[]; totalEmployees: number } {
  const rootId = graphRootId(graph);
  const normalized = graphMode === "product"
    ? normalizeVisibleGraph(graph, rootId ? new Set([rootId]) : new Set(), [], rootId, graphMode)
    : normalizeGraph(graph, graphMode);
  return {
    ...normalized,
    totalEmployees: graph.nodes.filter((node) => node.labels.includes("Employee")).length,
  };
}
