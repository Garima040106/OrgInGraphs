import type { Graph } from 'falkordb';
import { query } from '../db/falkordb.js';

export interface GraphApiNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GraphApiEdge {
  id: string;
  type: string;
  source: string;
  target: string;
  properties: Record<string, unknown>;
}

export interface EntireGraph {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
}

interface FalkorNode {
  id: number | string;
  labels?: string[];
  properties?: Record<string, unknown>;
}

interface FalkorEdge {
  id: number | string;
  relationshipType?: string;
  sourceId: number | string;
  destinationId: number | string;
  properties?: Record<string, unknown>;
}

interface QueryRow {
  n?: FalkorNode;
  r?: FalkorEdge;
}

function nodeId(node: FalkorNode): string {
  const id = node.properties?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Graph node is missing its stable id property');
  }
  return id;
}

export async function fetchEntireGraph(graph: Graph): Promise<EntireGraph> {
  const nodeResult = await query(graph, 'MATCH (n) RETURN n');
  const nodeRows = (nodeResult.data ?? []) as QueryRow[];
  const nodes: GraphApiNode[] = [];
  const internalToStable = new Map<string, string>();
  const seenNodes = new Set<string>();

  for (const row of nodeRows) {
    if (!row.n) continue;
    const stableId = nodeId(row.n);
    internalToStable.set(String(row.n.id), stableId);
    if (!seenNodes.has(stableId)) {
      seenNodes.add(stableId);
      nodes.push({
        id: stableId,
        labels: row.n.labels ?? [],
        properties: row.n.properties ?? {}
      });
    }
  }

  const relationshipResult = await query(graph, 'MATCH ()-[r]->() RETURN r');
  const relationshipRows = (relationshipResult.data ?? []) as QueryRow[];
  const usedEdgeIds = new Set<string>();
  const endpointCounts = new Map<string, number>();
  const edges: GraphApiEdge[] = [];

  for (const row of relationshipRows) {
    if (!row.r) continue;
    const source = internalToStable.get(String(row.r.sourceId));
    const target = internalToStable.get(String(row.r.destinationId));
    const type = row.r.relationshipType;
    if (!source || !target || !type) {
      throw new Error('Graph relationship references an unknown node or type');
    }

    const baseId = typeof row.r.properties?.id === 'string' && row.r.properties.id.length > 0
      ? row.r.properties.id
      : `${type}:${source}:${target}`;
    const occurrence = (endpointCounts.get(baseId) ?? 0) + 1;
    endpointCounts.set(baseId, occurrence);
    let edgeId = occurrence === 1 ? baseId : `${baseId}:${occurrence}`;
    while (usedEdgeIds.has(edgeId)) {
      edgeId = `${baseId}:${(endpointCounts.get(baseId) ?? occurrence) + 1}`;
      endpointCounts.set(baseId, (endpointCounts.get(baseId) ?? occurrence) + 1);
    }
    usedEdgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      type,
      source,
      target,
      properties: row.r.properties ?? {}
    });
  }

  return { nodes, edges };
}
