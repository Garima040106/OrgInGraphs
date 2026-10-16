import type { Graph } from 'falkordb';
import { query, rows } from '../db/falkordb.js';
import {
  PRODUCT_NODE_LABELS,
  PRODUCT_PROGRESS_NODE_LABELS,
  PRODUCT_RELATIONSHIPS,
  productNodeLabel,
  productRelationship,
  type ProductProgressNodeLabel,
  type ProductRelationship
} from './schema.js';

const labels = PRODUCT_NODE_LABELS.map((label) => `n:${label}`).join(' OR ');
const progressLabels = PRODUCT_PROGRESS_NODE_LABELS.map((label) => `n:${label}`).join(' OR ');
const relationshipTypes = PRODUCT_RELATIONSHIPS.join('|');
const graphDomain = 'product-progress';

export interface ProductProgressNode {
  id: string;
  labels?: string[];
  properties?: Record<string, unknown>;
}

export interface ProductProgressEdge {
  id?: string | number;
  relationshipType?: string;
  sourceId: string | number;
  destinationId: string | number;
  properties?: Record<string, unknown>;
}

/** Returns only product-domain nodes; reusable org nodes are added through product relationships below. */
export function productNodesQuery(label?: ProductProgressNodeLabel) {
  if (label) {
    const safeLabel = productNodeLabel(label);
    return {
      cypher: `MATCH (n:${safeLabel}) WHERE n.graphDomain = $graphDomain RETURN n ORDER BY n.id`,
      params: { graphDomain }
    } as const;
  }
  return {
    cypher: `MATCH (n) WHERE (${labels}) AND n.graphDomain = $graphDomain RETURN n ORDER BY n.id`,
    params: { graphDomain }
  } as const;
}

/** Returns product relationships and only the reusable organization endpoints they explicitly connect. */
export function productProgressGraphQuery() {
  return {
    cypher: `
      MATCH (n)-[r:${relationshipTypes}]->(m)
      WHERE (${progressLabels})
        AND (any(label IN labels(m) WHERE label IN $allowedLabels))
        AND (any(label IN labels(n) WHERE label IN $allowedLabels))
        AND (n.graphDomain = $graphDomain OR m.graphDomain = $graphDomain)
      RETURN n, r, m
    `.replace(/\s+/g, ' ').trim(),
    params: { allowedLabels: [...PRODUCT_PROGRESS_NODE_LABELS], graphDomain }
  } as const;
}

export async function fetchProductNodes(graph: Graph, label?: ProductProgressNodeLabel) {
  const request = productNodesQuery(label);
  return rows(await query(graph, request.cypher, request.params)).map((row) => row.n as ProductProgressNode);
}

export async function fetchProductProgressRelationships(graph: Graph) {
  const request = productProgressGraphQuery();
  return rows(await query(graph, request.cypher, request.params));
}

export function productEntityQuery(label: ProductProgressNodeLabel, id: string) {
  const safeLabel = productNodeLabel(label);
  return {
    cypher: `MATCH (n:${safeLabel} {id: $id}) WHERE n.graphDomain = $graphDomain RETURN n`,
    params: { id, graphDomain }
  } as const;
}

export function productRelationshipQuery(type: ProductRelationship, fromId: string, toId: string) {
  const safeType = productRelationship(type);
  return {
    cypher: `MATCH (a {id: $fromId}), (b {id: $toId}) MATCH (a)-[r:${safeType}]->(b) RETURN r`,
    params: { fromId, toId }
  } as const;
}
