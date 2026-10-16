import type { Graph } from 'falkordb';
import { query } from '../db/falkordb.js';
import type { GraphApiEdge, GraphApiNode, EntireGraph } from '../graph/entire.js';
import { productProgressGraphQuery } from './queries.js';

interface FalkorNode { id: number | string; labels?: string[]; properties?: Record<string, unknown>; }
interface FalkorEdge { id?: number | string; relationshipType?: string; sourceId: number | string; destinationId: number | string; properties?: Record<string, unknown>; }
interface ProductGraphRow { n?: FalkorNode; m?: FalkorNode; r?: FalkorEdge; }

/** Maps the allowlisted Product Progress query into the existing graph visualization contract. */
export async function fetchProductProgressGraph(graph: Graph): Promise<EntireGraph> {
  const result = await query(graph, productProgressGraphQuery().cypher, productProgressGraphQuery().params);
  const rows = (result.data ?? []) as ProductGraphRow[];
  const nodes = new Map<string, GraphApiNode>();
  const internalToStable = new Map<string, string>();
  const edges: GraphApiEdge[] = [];

  for (const row of rows) {
    for (const node of [row.n, row.m]) {
      if (!node?.properties || typeof node.properties.id !== 'string') continue;
      const stableId = node.properties.id;
      internalToStable.set(String(node.id), stableId);
      nodes.set(stableId, { id: stableId, labels: node.labels ?? [], properties: node.properties });
    }
  }
  const usedIds = new Set<string>();
  for (const row of rows) {
    const relationship = row.r;
    if (!relationship) continue;
    const source = internalToStable.get(String(relationship.sourceId));
    const target = internalToStable.get(String(relationship.destinationId));
    if (!source || !target || !relationship.relationshipType) continue;
    const baseId = typeof relationship.properties?.id === 'string' && relationship.properties.id.length > 0
      ? relationship.properties.id : `${relationship.relationshipType}:${source}:${target}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}:${suffix++}`;
    usedIds.add(id);
    edges.push({ id, type: relationship.relationshipType, source, target, properties: relationship.properties ?? {} });
  }
  return { nodes: [...nodes.values()], edges };
}
