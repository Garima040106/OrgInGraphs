import type { Graph } from 'falkordb';
import { query } from '../../db/falkordb.js';
import type { ValidatedIdentifiedTicket } from './validation.js';

export async function persistTicket(graph: Graph, ticket: ValidatedIdentifiedTicket): Promise<void> {
  const properties = { ...ticket };
  delete (properties as Partial<ValidatedIdentifiedTicket>).id;
  await query(graph, 'MERGE (n:Ticket {id: $id}) SET n += $properties', { id: ticket.id, properties });
  const links: Array<[string, string | undefined, string]> = [
    ['PRODUCT', ticket.productId, 'PART_OF'],
    ['MODULE', ticket.moduleId, 'PART_OF'],
    ['REPORTER', ticket.reporterId, 'REPORTED_BY'],
    ['ASSIGNEE', ticket.assigneeId, 'ASSIGNED_TO']
  ];
  for (const [, target, relationship] of links) {
    if (!target) continue;
    await query(graph, `MATCH (a:Ticket {id: $fromId}), (b {id: $toId}) MERGE (a)-[r:${relationship}]->(b) SET r += $properties`, {
      fromId: ticket.id, toId: target, properties: { graphDomain: ticket.graphDomain, sourceSystem: ticket.sourceSystem }
    });
  }
  for (const reference of ticket.references.filter((item) => item.status === 'resolved' && item.id)) {
    await query(graph, 'MATCH (a:Ticket {id: $fromId}), (b {id: $toId}) MERGE (a)-[r:RELATED_TO]->(b) SET r += $properties', {
      fromId: ticket.id, toId: reference.id, properties: { graphDomain: ticket.graphDomain, sourceSystem: ticket.sourceSystem, referenceKind: reference.kind }
    });
  }
}
