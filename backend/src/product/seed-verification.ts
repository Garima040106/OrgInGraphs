import type { Graph } from 'falkordb';
import { query, rows } from '../db/falkordb.js';
import type { SeedData } from '../types/seed.js';

export type ProductSeedVerification = {
  nodeCount: number;
  relationshipCount: number;
};

/** Read-after-write check for the selected graph. It never mutates graph data. */
export async function verifyProductSeed(graph: Graph, expected: SeedData): Promise<ProductSeedVerification> {
  const nodeResult = await query(graph, "MATCH (n) WHERE n.graphDomain = 'product-progress' RETURN n.id AS id");
  const relationshipResult = await query(graph, "MATCH ()-[r]->() WHERE r.graphDomain = 'product-progress' RETURN count(r) AS count");
  const actualIds = new Set(rows(nodeResult).map((row) => String(row.id)));
  const expectedIds = new Set(expected.nodes.map((node) => node.id));
  const missing = [...expectedIds].filter((id) => !actualIds.has(id));
  const nodeCount = actualIds.size;
  const relationshipCount = Number(rows(relationshipResult)[0]?.count ?? 0);
  if (nodeCount !== expected.nodes.length || missing.length || relationshipCount < expected.edges.length) {
    const details = [
      `expected ${expected.nodes.length} seeded Product Progress nodes, found ${nodeCount}`,
      `expected at least ${expected.edges.length} seeded Product Progress relationships, found ${relationshipCount}`,
      missing.length ? `missing IDs: ${missing.slice(0, 5).join(', ')}` : ''
    ].filter(Boolean).join('; ');
    throw new Error(`Product Progress seed verification failed: ${details}`);
  }
  return { nodeCount, relationshipCount };
}
