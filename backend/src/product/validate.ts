import type { SeedData } from '../types/seed.js';

const PRODUCT_DOMAIN = 'product-progress';
const PRODUCT_TYPES = new Set(['Product', 'ProductModule', 'Feature', 'FeatureRequest', 'Ticket', 'Bug', 'Task', 'PullRequest', 'Commit', 'Review', 'Release', 'Comment', 'Decision', 'Activity']);
const SHARED_TYPES = new Set(['Employee', 'Team', 'Department', 'Project']);

export function validateProductSeedData(data: SeedData, organizationIds: Set<string>): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const productIds = new Set<string>();
  for (const n of data.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
    if (!PRODUCT_TYPES.has(n.type)) errors.push(`invalid Product Progress node type: ${n.type}`);
    if (n.properties.graphDomain !== PRODUCT_DOMAIN) errors.push(`${n.id} missing graphDomain=${PRODUCT_DOMAIN}`);
    if (n.properties.sourceSystem !== 'seed') errors.push(`${n.id} is not marked synthetic`);
    for (const key of ['createdAt', 'updatedAt', 'sourceRecordId']) if (!(key in n.properties)) errors.push(`${n.id} missing ${key}`);
    productIds.add(n.id);
  }
  if (productIds.size !== 25) errors.push(`expected 25 Product Progress nodes, found ${productIds.size}`);
  const employeeIds = new Set([...Array(56)].map((_, i) => `emp-${String(i).padStart(2, '0')}`));
  const teamIds = new Set(['eng', 'platform', 'payments', 'product-team', 'design-team', 'security-team', 'success']);
  for (const edge of data.edges) {
    if (!ids.has(edge.from) && !organizationIds.has(edge.from)) errors.push(`invalid edge source: ${edge.from}`);
    if (!ids.has(edge.to) && !organizationIds.has(edge.to)) errors.push(`invalid edge target: ${edge.to}`);
    if (edge.properties?.graphDomain !== PRODUCT_DOMAIN) errors.push(`edge ${edge.from}->${edge.to} missing product graph domain`);
    for (const endpoint of [edge.from, edge.to]) {
      if ((endpoint.startsWith('emp-') && !employeeIds.has(endpoint)) || (endpoint.startsWith('team-') && !teamIds.has(endpoint))) errors.push(`invalid shared organization reference: ${endpoint}`);
    }
  }
  for (const n of data.nodes) {
    for (const key of ['ownerId', 'assigneeId', 'authorId', 'reviewerId', 'actorId', 'deciderId', 'requestedBy']) {
      const value = n.properties[key];
      if (value && !employeeIds.has(String(value))) errors.push(`${n.id} invalid employee reference ${key}=${value}`);
    }
  }
  const connected = new Set<string>();
  for (const e of data.edges) { connected.add(e.from); connected.add(e.to); }
  for (const n of data.nodes) if (!connected.has(n.id) && n.type !== 'Product') errors.push(`disconnected Product Progress node: ${n.id}`);
  if (!data.nodes.some((n) => n.type === 'Product')) errors.push('missing Product root');
  if (!data.nodes.some((n) => n.type === 'Release')) errors.push('missing Release nodes');
  if (!data.nodes.some((n) => n.type === 'Activity')) errors.push('missing Activity nodes');
  return errors;
}

export function validateProductSeedAgainstOrganization(data: SeedData, organizationData: SeedData): string[] {
  const orgIds = new Set(organizationData.nodes.map((node) => node.id));
  return validateProductSeedData(data, orgIds);
}
