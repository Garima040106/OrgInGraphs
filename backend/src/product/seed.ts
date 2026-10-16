import type { GraphEdge, GraphNode, SeedData } from '../types/seed.js';

const GRAPH_DOMAIN = 'product-progress' as const;
const SOURCE_SYSTEM = 'seed' as const;

const node = (type: GraphNode['type'], id: string, properties: Record<string, unknown>): GraphNode => ({
  type,
  id,
  properties: {
    id,
    graphDomain: GRAPH_DOMAIN,
    sourceSystem: SOURCE_SYSTEM,
    sourceRecordId: id,
    ...properties
  }
});

const edge = (from: string, to: string, type: string, properties: Record<string, unknown> = {}): GraphEdge => ({
  from,
  to,
  type,
  properties: { graphDomain: GRAPH_DOMAIN, sourceSystem: SOURCE_SYSTEM, ...properties }
});

const dateAt = (start: Date, offsetDays: number) => {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const addRecord = (nodes: GraphNode[], type: GraphNode['type'], id: string, props: Record<string, unknown>) => {
  nodes.push(node(type, id, props));
};

/** Deterministic fictional product history; it references the existing Hirenova employee/team IDs. */
export function generateProductSeedData(companyStartDate = process.env.COMPANY_START_DATE ?? '2026-01-01'): SeedData {
  const end = new Date(`${companyStartDate}T00:00:00Z`);
  if (Number.isNaN(end.valueOf())) throw new Error('COMPANY_START_DATE must be an ISO date');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 155);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  addRecord(nodes, 'Product', 'product-orbit', {
    name: 'Orbit Checkout',
    status: 'active',
    priority: 'P0',
    description: 'Fictional checkout orchestration product for reliable payment experiences.',
    createdAt: dateAt(start, 0), updatedAt: companyStartDate
  });
  addRecord(nodes, 'ProductModule', 'module-payment-methods', { name: 'Payment Methods', status: 'active', createdAt: dateAt(start, 2), updatedAt: companyStartDate });
  addRecord(nodes, 'ProductModule', 'module-risk-controls', { name: 'Risk Controls', status: 'active', createdAt: dateAt(start, 5), updatedAt: companyStartDate });
  addRecord(nodes, 'ProductModule', 'module-checkout-ui', { name: 'Checkout UI', status: 'active', createdAt: dateAt(start, 8), updatedAt: companyStartDate });
  edges.push(edge('product-orbit', 'module-payment-methods', 'HAS_MODULE'), edge('product-orbit', 'module-risk-controls', 'HAS_MODULE'), edge('product-orbit', 'module-checkout-ui', 'HAS_MODULE'));

  addRecord(nodes, 'Feature', 'feature-smart-retry', { name: 'Smart payment retry', status: 'in-progress', priority: 'P0', ownerId: 'emp-03', createdAt: dateAt(start, 18), updatedAt: dateAt(start, 102) });
  addRecord(nodes, 'Feature', 'feature-wallet-routing', { name: 'Wallet routing rules', status: 'released', priority: 'P1', ownerId: 'emp-12', createdAt: dateAt(start, 12), updatedAt: dateAt(start, 120) });
  addRecord(nodes, 'FeatureRequest', 'request-saved-cards', { title: 'Remember preferred cards', status: 'triaged', priority: 'P1', requestedBy: 'emp-47', createdAt: dateAt(start, 28), updatedAt: dateAt(start, 44) });
  addRecord(nodes, 'FeatureRequest', 'request-receipt-locale', { title: 'Localized payment receipts', status: 'accepted', priority: 'P2', requestedBy: 'emp-51', createdAt: dateAt(start, 34), updatedAt: dateAt(start, 60) });
  edges.push(edge('module-payment-methods', 'feature-smart-retry', 'HAS_FEATURE'), edge('module-payment-methods', 'feature-wallet-routing', 'HAS_FEATURE'), edge('module-checkout-ui', 'request-saved-cards', 'HAS_FEATURE'), edge('module-checkout-ui', 'request-receipt-locale', 'HAS_FEATURE'), edge('emp-03', 'feature-smart-retry', 'OWNED_BY'), edge('emp-12', 'feature-wallet-routing', 'OWNED_BY'));

  const tickets = [
    ['ticket-retry-policy', 'Add retry policy evaluator', 'in-progress', 'P0', 'emp-04', 42],
    ['ticket-wallet-fallback', 'Add wallet fallback routing', 'done', 'P1', 'emp-13', 54],
    ['ticket-receipt-locale', 'Prepare locale-aware receipt template', 'todo', 'P2', 'emp-21', 72]
  ] as const;
  for (const [id, title, status, priority, assigneeId, day] of tickets) {
    addRecord(nodes, 'Ticket', id, { title, status, priority, assigneeId, createdAt: dateAt(start, day), updatedAt: dateAt(start, day + 20) });
    edges.push(edge(assigneeId, id, 'ASSIGNED_TO'));
  }
  edges.push(edge('feature-smart-retry', 'ticket-retry-policy', 'HAS_TICKET'), edge('feature-wallet-routing', 'ticket-wallet-fallback', 'HAS_TICKET'), edge('request-receipt-locale', 'ticket-receipt-locale', 'HAS_TICKET'), edge('ticket-retry-policy', 'ticket-wallet-fallback', 'DEPENDS_ON'));

  addRecord(nodes, 'Task', 'task-idempotency-audit', { title: 'Audit retry idempotency boundaries', status: 'done', priority: 'P0', assigneeId: 'emp-02', createdAt: dateAt(start, 38), updatedAt: dateAt(start, 49) });
  addRecord(nodes, 'Bug', 'bug-double-retry', { title: 'Retry can submit twice after timeout', status: 'resolved', priority: 'P0', severity: 'critical', assigneeId: 'emp-05', createdAt: dateAt(start, 61), updatedAt: dateAt(start, 78), resolvedAt: dateAt(start, 78) });
  addRecord(nodes, 'Bug', 'bug-wallet-timeout', { title: 'Wallet fallback timeout shown as decline', status: 'open', priority: 'P1', severity: 'major', assigneeId: 'emp-14', createdAt: dateAt(start, 91), updatedAt: dateAt(start, 110) });
  edges.push(edge('feature-smart-retry', 'task-idempotency-audit', 'HAS_TICKET'), edge('emp-02', 'task-idempotency-audit', 'ASSIGNED_TO'), edge('ticket-retry-policy', 'bug-double-retry', 'RELATED_TO'), edge('ticket-wallet-fallback', 'bug-wallet-timeout', 'RELATED_TO'), edge('emp-05', 'bug-double-retry', 'ASSIGNED_TO'), edge('emp-14', 'bug-wallet-timeout', 'ASSIGNED_TO'));

  addRecord(nodes, 'PullRequest', 'product-pr-retry-engine', { title: 'Introduce retry policy engine', status: 'merged', priority: 'P0', authorId: 'emp-04', repositoryId: 'payment-core', createdAt: dateAt(start, 82), updatedAt: dateAt(start, 96), mergedAt: dateAt(start, 96) });
  addRecord(nodes, 'PullRequest', 'product-pr-wallet-routing', { title: 'Route wallet fallbacks by issuer', status: 'open', priority: 'P1', authorId: 'emp-13', repositoryId: 'payment-core', createdAt: dateAt(start, 105), updatedAt: dateAt(start, 128) });
  addRecord(nodes, 'Commit', 'commit-retry-policy', { title: 'Add bounded retry policy', sha: 'synthetic-retry-001', authorId: 'emp-04', committedAt: dateAt(start, 93), createdAt: dateAt(start, 93), updatedAt: dateAt(start, 93) });
  addRecord(nodes, 'Commit', 'commit-wallet-fallback', { title: 'Add issuer fallback table', sha: 'synthetic-wallet-001', authorId: 'emp-13', committedAt: dateAt(start, 124), createdAt: dateAt(start, 124), updatedAt: dateAt(start, 124) });
  addRecord(nodes, 'Review', 'review-retry-engine', { title: 'Retry engine review', status: 'approved', reviewerId: 'emp-06', createdAt: dateAt(start, 94), updatedAt: dateAt(start, 95) });
  edges.push(edge('ticket-retry-policy', 'product-pr-retry-engine', 'IMPLEMENTS'), edge('bug-double-retry', 'product-pr-retry-engine', 'FIXES'), edge('product-pr-retry-engine', 'commit-retry-policy', 'INCLUDES'), edge('emp-04', 'product-pr-retry-engine', 'CREATED'), edge('emp-06', 'product-pr-retry-engine', 'REVIEWS'), edge('review-retry-engine', 'product-pr-retry-engine', 'REVIEWS'), edge('ticket-wallet-fallback', 'product-pr-wallet-routing', 'IMPLEMENTS'), edge('product-pr-wallet-routing', 'commit-wallet-fallback', 'INCLUDES'), edge('emp-13', 'product-pr-wallet-routing', 'CREATED'));

  addRecord(nodes, 'Release', 'release-orbit-2025-12', { name: 'Orbit Checkout 2025.12', status: 'released', priority: 'P0', version: '2025.12.0', releasedAt: dateAt(start, 118), createdAt: dateAt(start, 112), updatedAt: dateAt(start, 118) });
  addRecord(nodes, 'Release', 'release-orbit-2026-01', { name: 'Orbit Checkout 2026.01', status: 'planned', priority: 'P1', version: '2026.01.0', targetDate: companyStartDate, createdAt: dateAt(start, 145), updatedAt: companyStartDate });
  edges.push(edge('product-orbit', 'release-orbit-2025-12', 'HAS_RELEASE'), edge('product-orbit', 'release-orbit-2026-01', 'HAS_RELEASE'), edge('release-orbit-2025-12', 'product-pr-retry-engine', 'INCLUDES'), edge('release-orbit-2026-01', 'product-pr-wallet-routing', 'INCLUDES'));

  addRecord(nodes, 'Comment', 'comment-retry-observability', { body: 'Please add a metric for policy fallbacks before the next release.', authorId: 'emp-09', createdAt: dateAt(start, 98), updatedAt: dateAt(start, 98) });
  addRecord(nodes, 'Decision', 'decision-retry-cap', { title: 'Cap automatic retries at two attempts', status: 'accepted', deciderId: 'emp-01', createdAt: dateAt(start, 70), updatedAt: dateAt(start, 71) });
  addRecord(nodes, 'Activity', 'activity-retry-shipped', { activityType: 'release_update', message: 'Retry policy engine is included in the December release.', actorId: 'emp-01', occurredAt: dateAt(start, 119), createdAt: dateAt(start, 119), updatedAt: dateAt(start, 119) });
  addRecord(nodes, 'Activity', 'activity-wallet-risk', { activityType: 'status_update', message: 'Wallet fallback remains in validation pending issuer timeout tests.', actorId: 'emp-12', occurredAt: dateAt(start, 133), createdAt: dateAt(start, 133), updatedAt: dateAt(start, 133) });
  edges.push(edge('emp-09', 'comment-retry-observability', 'CREATED'), edge('comment-retry-observability', 'product-pr-retry-engine', 'COMMENTED_ON'), edge('emp-01', 'decision-retry-cap', 'MADE_DECISION'), edge('decision-retry-cap', 'feature-smart-retry', 'RELATED_TO'), edge('activity-retry-shipped', 'release-orbit-2025-12', 'ACTIVITY_ON'), edge('emp-01', 'activity-retry-shipped', 'PERFORMED_BY'), edge('activity-wallet-risk', 'feature-wallet-routing', 'ACTIVITY_ON'), edge('emp-12', 'activity-wallet-risk', 'PERFORMED_BY'));

  // Shared employee/team references are deliberately additive; no reporting or org edges are changed.
  edges.push(edge('payments', 'product-orbit', 'WORKS_ON'), edge('eng', 'module-payment-methods', 'WORKS_ON'));
  return { nodes, edges, companyStartDate };
}
