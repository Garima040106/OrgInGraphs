import type { Edge, Node } from "@xyflow/react";
import type { GraphResponse } from "@/lib/types";
import { normalizeGraph, type GraphNodeData } from "./normalize";

export function buildInitialGraph(
  graph: GraphResponse,
  graphMode: "team" | "product" = "team",
): { nodes: Node<GraphNodeData>[]; edges: Edge[]; totalEmployees: number } {
  const normalized = normalizeGraph(graph, graphMode);
  return {
    ...normalized,
    totalEmployees: graph.nodes.filter((node) => node.labels.includes("Employee")).length,
  };
}
