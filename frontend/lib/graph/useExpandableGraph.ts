import { useCallback, useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { GraphResponse } from "@/lib/types";
import { graphRootId, normalizeVisibleGraph, visibleIdsForExpanded, type GraphNodeData } from "./normalize";

export function useExpandableGraph(
  graph: GraphResponse,
  initialNodes: Node<GraphNodeData>[],
  initialEdges: Edge[],
  graphMode: "team" | "product" = "team",
) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    graphMode === "product" ? new Set(initialNodes.map((n) => n.id)) : new Set(),
  );
  const [expandingId, setExpandingId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setExpandedIds(graphMode === "product" ? new Set(initialNodes.map((n) => n.id)) : new Set());
    setExpandingId(null);
  }, [initialEdges, initialNodes, graphMode]);

  useEffect(reset, [reset]);

  const toggle = useCallback((id: string) => {
    if (expandingId) return false;
    setExpandingId(id);
    const nextExpanded = new Set(expandedIds);
    if (nextExpanded.has(id)) nextExpanded.delete(id);
    else nextExpanded.add(id);
    const visible =
      graphMode === "product" && nextExpanded.size === initialNodes.length
        ? new Set(graph.nodes.map((n) => n.id))
        : visibleIdsForExpanded(graph, graphRootId(graph), nextExpanded);
    const retained = new Set([...nextExpanded].filter((candidate) => visible.has(candidate)));
    const normalized = normalizeVisibleGraph(graph, visible, nodes, id, graphMode);
    setExpandedIds(retained);
    setNodes(normalized.nodes);
    setEdges(normalized.edges);
    setExpandingId(null);
    return true;
  }, [expandingId, expandedIds, graph, nodes, graphMode, initialNodes.length]);

  const replace = useCallback((nextNodes: Node<GraphNodeData>[], nextEdges: Edge[]) => {
    setNodes(nextNodes);
    setEdges(nextEdges);
    setExpandedIds(new Set());
  }, []);

  return useMemo(() => ({
    nodes,
    edges,
    expandedIds,
    expandingId,
    toggle,
    replace,
    reset,
  }), [nodes, edges, expandedIds, expandingId, toggle, replace, reset]);
}
