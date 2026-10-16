import type { Graph } from 'falkordb';
import { query, rows } from '../../db/falkordb.js';
import type { ReferenceCandidate } from './types.js';

export async function resolveReference(graph: Graph | undefined, kind: ReferenceCandidate['kind'], text: string): Promise<ReferenceCandidate> {
  if (!graph) return { kind, text, status: 'unresolved' };
  const result = kind === 'employee'
    ? await query(graph, 'MATCH (n:Employee) WHERE n.id = $text OR toLower(n.name) = toLower($text) OR toLower(n.email) = toLower($text) RETURN n', { text })
    : kind === 'product'
      ? await query(graph, 'MATCH (n:Product) WHERE n.graphDomain = $domain AND (n.id = $text OR toLower(n.name) = toLower($text)) RETURN n', { text, domain: 'product-progress' })
      : kind === 'module'
        ? await query(graph, 'MATCH (n:ProductModule) WHERE n.graphDomain = $domain AND (n.id = $text OR toLower(n.name) = toLower($text)) RETURN n', { text, domain: 'product-progress' })
        : await query(graph, 'MATCH (n) WHERE n.graphDomain = $domain AND (n:Ticket OR n:Bug OR n:Feature OR n:FeatureRequest) AND (n.id = $text OR toLower(n.title) = toLower($text)) RETURN n', { text, domain: 'product-progress' });
  const candidates = rows(result).map((row) => row.n?.id).filter((id): id is string => typeof id === 'string');
  if (candidates.length === 1) return { kind, text, id: candidates[0], status: 'resolved' };
  if (candidates.length > 1) return { kind, text, status: 'ambiguous', candidates };
  return { kind, text, status: 'unresolved' };
}
