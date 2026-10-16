import type { Graph } from 'falkordb';
import { query } from '../../db/falkordb.js';
import type { ValidatedFeatureUpdate } from './validation.js';

export async function persistFeatureUpdate(graph: Graph, update: ValidatedFeatureUpdate) {
  const properties = { ...update };
  delete (properties as Partial<ValidatedFeatureUpdate>).id;
  await query(graph, 'MERGE (a:Activity {id: $id}) SET a += $properties', { id: update.id, properties });
  const links: Array<[string, string | undefined, string]> = [
    ['ACTOR', update.actorId, 'PERFORMED_BY'], ['PRODUCT', update.productId, 'ACTIVITY_ON'],
    ['MODULE', update.moduleId, 'ACTIVITY_ON'], ['FEATURE', update.featureId, 'ACTIVITY_ON'], ['TICKET', update.ticketId, 'ACTIVITY_ON']
  ];
  for (const [, target, type] of links) if (target) await query(graph, `MATCH (a:Activity {id: $fromId}), (b {id: $toId}) MERGE (a)-[r:${type}]->(b) SET r += $properties`, { fromId: update.id, toId: target, properties: { graphDomain: update.graphDomain, sourceSystem: update.sourceSystem } });
  for (const reference of update.references.filter((item) => item.id && item.status === 'resolved')) await query(graph, 'MATCH (a:Activity {id: $fromId}), (b {id: $toId}) MERGE (a)-[r:REFERENCES]->(b) SET r += $properties', { fromId: update.id, toId: reference.id, properties: { graphDomain: update.graphDomain, sourceSystem: update.sourceSystem, verified: false } });
  if (update.ticketId && update.newStatus) await query(graph, 'MATCH (n {id: $id}) SET n.status = $status, n.updatedAt = $updatedAt', { id: update.ticketId, status: update.newStatus, updatedAt: update.updatedAt });
  if (update.featureId && update.newStatus) await query(graph, 'MATCH (n {id: $id}) SET n.status = $status, n.updatedAt = $updatedAt', { id: update.featureId, status: update.newStatus, updatedAt: update.updatedAt });
}
