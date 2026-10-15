import { FalkorDB, type Graph } from 'falkordb';
import { env } from '../config/env.js';
import type { GraphNode, SeedData } from '../types/seed.js';

export async function connectGraph(): Promise<{ db: FalkorDB; graph: Graph }> {
  if (!env.FALKORDB_PASSWORD || env.FALKORDB_HOST === 'your-falkordb-cloud-host') throw new Error('FalkorDB credentials are not configured');
  const db = await FalkorDB.connect({ socket:{host:env.FALKORDB_HOST,port:env.FALKORDB_PORT,tls:env.FALKORDB_TLS === 'true',connectTimeout:10000}, ...(env.FALKORDB_USERNAME ? {username:env.FALKORDB_USERNAME} : {}), password:env.FALKORDB_PASSWORD });
  return { db, graph: db.selectGraph(env.FALKORDB_DATABASE) };
}
export async function query(graph: Graph, cypher: string, params: Record<string, unknown> = {}) { return graph.query(cypher,{params: params as Record<string, string | number | boolean | null>}); }
export async function seedGraph(graph: Graph, data: SeedData) {
  for (const n of data.nodes) { const props=JSON.stringify(n.properties); await query(graph,`MERGE (n:${n.type} {id: $id}) SET n += $properties`,{id:n.id,properties:JSON.parse(props)}); }
  for (const e of data.edges) await query(graph,`MATCH (a {id:$from}), (b {id:$to}) MERGE (a)-[r:${e.type}]->(b) SET r += $properties`,{from:e.from,to:e.to,properties:e.properties ?? {}});
}
export function rows(result: {headers?: string[];data?: unknown[]}) {
  return (result.data ?? []).map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key,
        value && typeof value === 'object' && 'properties' in value
          ? (value as { properties: Record<string, unknown> }).properties
          : value
      ]));
    }
    return Object.fromEntries((result.headers ?? []).map((h, i) => [h, (row as unknown[])[i]]));
  }) as Array<Record<string, any>>;
}
