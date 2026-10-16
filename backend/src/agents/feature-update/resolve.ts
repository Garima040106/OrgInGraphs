import type { Graph } from 'falkordb';
import { query, rows } from '../../db/falkordb.js';
import type { UpdateReference } from './types.js';

const domain = 'product-progress';

export async function resolveUpdateReference(graph: Graph | undefined, reference: UpdateReference['kind'], text: string): Promise<UpdateReference> {
  if (!graph) return { kind: reference, text, status: 'unresolved', verified: false };
  const label = reference === 'pull-request' ? 'PullRequest' : reference === 'commit' ? 'Commit' : reference === 'release' ? 'Release' : reference === 'ticket' ? 'Ticket|Bug|Feature|FeatureRequest' : reference === 'feature' ? 'Feature|FeatureRequest' : '';
  if (!label) return { kind: reference, text, status: 'unresolved', verified: false };
  const result = await query(graph, `MATCH (n) WHERE n.graphDomain = $domain AND (n:${label}) AND (n.id = $text OR toLower(n.title) = toLower($text) OR toLower(n.name) = toLower($text)) RETURN n`, { domain, text });
  const candidates = rows(result).map((row) => row.n?.id).filter((id): id is string => typeof id === 'string');
  if (candidates.length === 1) return { kind: reference, text, id: candidates[0], status: 'resolved', verified: false };
  if (candidates.length > 1) return { kind: reference, text, status: 'ambiguous', verified: false, candidates };
  return { kind: reference, text, status: 'unresolved', verified: false };
}

export async function resolveActor(graph: Graph | undefined, text: string) {
  if (!graph) return { text, status: 'unresolved' as const };
  const result = await query(graph, 'MATCH (n:Employee) WHERE n.id = $text OR toLower(n.name) = toLower($text) OR toLower(n.email) = toLower($text) RETURN n', { text });
  const candidates = rows(result).map((row) => row.n?.id).filter((id): id is string => typeof id === 'string');
  if (candidates.length === 1) return { text, id: candidates[0], status: 'resolved' as const };
  if (candidates.length > 1) return { text, status: 'ambiguous' as const, candidates };
  return { text, status: 'unresolved' as const };
}
