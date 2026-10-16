import { useCallback, useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { GraphResponse } from "@/lib/types";
import { graphRootId, normalizeVisibleGraph, visibleIdsForExpanded, type GraphNodeData } from "./normalize";

export function useExpandableGraph(graph: GraphResponse, initialNodes: Node<GraphNodeData>[], initialEdges: Edge[]) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandingId, setExpandingId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setExpandedIds(new Set());
    setExpandingId(null);
  }, [initialEdges, initialNodes]);

  useEffect(reset, [reset]);

  const toggle = useCallback((id: string) => {
    if (expandingId) return false;
    setExpandingId(id);
    const nextExpanded = new Set(expandedIds);
    if (nextExpanded.has(id)) nextExpanded.delete(id);
    else nextExpanded.add(id);
    const visible = visibleIdsForExpanded(graph, graphRootId(graph), nextExpanded);
    const retained = new Set([...nextExpanded].filter((candidate) => visible.has(candidate)));
    const normalized = normalizeVisibleGraph(graph, visible, nodes, id);
    setExpandedIds(retained);
    setNodes(normalized.nodes);
    setEdges(normalized.edges);
    setExpandingId(null);
    return true;
  }, [expandingId, expandedIds, graph, nodes]);

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
