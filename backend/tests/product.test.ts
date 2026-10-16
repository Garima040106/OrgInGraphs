import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_NODE_LABELS,
  PRODUCT_PROGRESS_NODE_LABELS,
  PRODUCT_PROVENANCE,
  PRODUCT_RELATIONSHIPS,
  productNodeLabel,
  productRelationship
} from '../src/product/schema.js';
import {
  productEntityQuery,
  productNodesQuery,
  productProgressGraphQuery,
  productRelationshipQuery
} from '../src/product/queries.js';
import { generateProductSeedData } from '../src/product/seed.js';
import { verifyProductSeed } from '../src/product/seed-verification.js';
import { generateSeedData } from '../src/seed/generate.js';
import { validateProductSeedAgainstOrganization } from '../src/product/validate.js';

test('Product Progress schema reuses organization labels without adding Employee variants', () => {
  assert.deepEqual(PRODUCT_NODE_LABELS, [
    'Product', 'ProductModule', 'Feature', 'FeatureRequest', 'Ticket', 'Bug', 'Release',
    'PullRequest', 'Commit', 'Comment', 'Decision', 'Activity', 'Review', 'Task'
  ]);
  assert.deepEqual(PRODUCT_PROGRESS_NODE_LABELS.slice(-4), ['Employee', 'Department', 'Team', 'Project']);
  assert.equal(PRODUCT_PROVENANCE.syntheticSourceSystem, 'seed');
  assert.equal(PRODUCT_PROVENANCE.graphDomain, 'product-progress');
  assert.ok(PRODUCT_PROVENANCE.requiredFields.includes('sourceRecordId'));
});

test('Product Progress query builders use allowlisted labels, relationships, and parameters', () => {
  const graph = productProgressGraphQuery();
  assert.match(graph.cypher, /MATCH \(n\)-\[r:HAS_MODULE\|.*ACTIVITY_ON\|.*CREATED\]->\(m\)/);
  assert.match(graph.cypher, /allowedLabels/);
  assert.match(graph.cypher, /graphDomain/);
  assert.ok(!graph.cypher.includes('emp-'));
  assert.deepEqual(graph.params.allowedLabels, [...PRODUCT_PROGRESS_NODE_LABELS]);

  const nodes = productNodesQuery();
  assert.match(nodes.cypher, /Product/);
  assert.match(nodes.cypher, /PullRequest/);
  assert.ok(!nodes.cypher.includes('Employee) RETURN'));

  const entity = productEntityQuery('Bug', 'bug-001');
  assert.equal(entity.cypher, 'MATCH (n:Bug {id: $id}) WHERE n.graphDomain = $graphDomain RETURN n');
  assert.deepEqual(entity.params, { id: 'bug-001', graphDomain: 'product-progress' });

  const relationship = productRelationshipQuery('FIXES', 'pr-001', 'bug-001');
  assert.match(relationship.cypher, /\$fromId/);
  assert.match(relationship.cypher, /\$toId/);
  assert.deepEqual(relationship.params, { fromId: 'pr-001', toId: 'bug-001' });
});

test('Product Progress rejects labels and relationships outside its schema', () => {
  assert.throws(() => productNodeLabel('Company'), /Unsupported Product Progress node label/);
  assert.throws(() => productRelationship('HAS_DEPARTMENT'), /Unsupported Product Progress relationship/);
});

test('Product Progress seed is deterministic, connected, and preserves organization references', () => {
  const first = generateProductSeedData('2026-01-01');
  const second = generateProductSeedData('2026-01-01');
  assert.deepEqual(first, second);
  assert.equal(first.nodes.length, 25);
  assert.equal(first.nodes.filter((node) => node.properties.graphDomain === 'product-progress').length, 25);
  assert.equal(first.nodes.filter((node) => node.properties.sourceSystem === 'seed').length, 25);
  assert.deepEqual(validateProductSeedAgainstOrganization(first, generateSeedData()), []);
  assert.equal(new Set(first.nodes.map((node) => node.id)).size, first.nodes.length);
  assert.ok(first.edges.every((relationship) => relationship.properties?.graphDomain === 'product-progress'));
  assert.ok(first.edges.some((relationship) => relationship.from === 'emp-04'));
  assert.ok(first.edges.some((relationship) => relationship.from === 'eng'));
});

test('Product Progress seed verification accepts the selected graph and rejects incomplete writes', async () => {
  const seed = generateProductSeedData('2026-01-01');
  const completeGraph = {
    query: async (cypher: string) => cypher.includes('count(r)')
      ? { data: [{ count: seed.edges.length }] }
      : { data: seed.nodes.map((node) => ({ id: node.id })) }
  } as never;
  assert.deepEqual(await verifyProductSeed(completeGraph, seed), { nodeCount: 25, relationshipCount: 45 });

  const incompleteGraph = {
    query: async (cypher: string) => cypher.includes('count(r)')
      ? { data: [{ count: 1 }] }
      : { data: [{ id: seed.nodes[0].id }] }
  } as never;
  await assert.rejects(() => verifyProductSeed(incompleteGraph, seed), /Product Progress seed verification failed/);
});
