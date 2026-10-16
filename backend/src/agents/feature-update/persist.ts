import type { Graph } from 'falkordb';
import { query } from '../../db/falkordb.js';
import type { ValidatedFeatureUpdate } from './validation.js';

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  return value;
}

async function persistenceQuery(graph: Graph, cypher: string, params: Record<string, unknown>, operation: string) {
  try { return await query(graph, cypher, params); }
  catch { throw new Error(`Activity persistence failed during ${operation}.`); }
}

export async function persistFeatureUpdate(graph: Graph, update: ValidatedFeatureUpdate) {
  const properties = withoutUndefined({ ...update, referencesJson: JSON.stringify(update.references) }) as Record<string, unknown>;
  delete properties.references;
  delete (properties as Partial<ValidatedFeatureUpdate>).id;
  await persistenceQuery(graph, 'MERGE (a:Activity {id: $id}) SET a += $properties', { id: update.id, properties }, 'activity merge');
  const links: Array<[string, string | undefined, string]> = [
    ['ACTOR', update.actorId, 'PERFORMED_BY'], ['PRODUCT', update.productId, 'ACTIVITY_ON'],
    ['MODULE', update.moduleId, 'ACTIVITY_ON'], ['FEATURE', update.featureId, 'ACTIVITY_ON'], ['TICKET', update.ticketId, 'ACTIVITY_ON']
  ];
  for (const [, target, type] of links) if (target) await persistenceQuery(graph, `MATCH (a:Activity {id: $fromId}), (b {id: $toId}) MERGE (a)-[r:${type}]->(b) SET r += $properties`, { fromId: update.id, toId: target, properties: { graphDomain: update.graphDomain, sourceSystem: update.sourceSystem } }, 'relationship merge');
  for (const reference of update.references.filter((item) => item.id && item.status === 'resolved')) await persistenceQuery(graph, 'MATCH (a:Activity {id: $fromId}), (b {id: $toId}) MERGE (a)-[r:REFERENCES]->(b) SET r += $properties', { fromId: update.id, toId: reference.id, properties: { graphDomain: update.graphDomain, sourceSystem: update.sourceSystem, verified: false } }, 'reference merge');
  if (update.ticketId && update.newStatus) await persistenceQuery(graph, 'MATCH (n {id: $id}) SET n.status = $status, n.updatedAt = $updatedAt', { id: update.ticketId, status: update.newStatus, updatedAt: update.updatedAt }, 'ticket status update');
  if (update.featureId && update.newStatus) await persistenceQuery(graph, 'MATCH (n {id: $id}) SET n.status = $status, n.updatedAt = $updatedAt', { id: update.featureId, status: update.newStatus, updatedAt: update.updatedAt }, 'feature status update');
}
