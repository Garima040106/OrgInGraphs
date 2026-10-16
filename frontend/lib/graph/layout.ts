import type { Edge, Node } from "@xyflow/react";
import type { GraphResponse } from "@/lib/types";
import { normalizeGraph, type GraphNodeData } from "./normalize";

export function buildInitialGraph(
  graph: GraphResponse,
): { nodes: Node<GraphNodeData>[]; edges: Edge[]; totalEmployees: number } {
  const normalized = normalizeGraph(graph);
  return {
    ...normalized,
    totalEmployees: graph.nodes.filter((node) => node.labels.includes("Employee")).length,
  };
}
