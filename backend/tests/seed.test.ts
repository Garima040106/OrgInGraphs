import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeedData } from '../src/seed/generate.js';
import { validateSeedData } from '../src/seed/validate.js';
import { fetchEntireGraph } from '../src/graph/entire.js';

test('Hirenova seed is deterministic and structurally valid', () => {
  const first = generateSeedData('2026-01-01');
  const second = generateSeedData('2026-01-01');
  assert.deepEqual(first, second);
  assert.equal(first.nodes.filter((node) => node.type === 'Employee').length, 56);
  const employees = first.nodes.filter((node) => node.type === 'Employee');
  const former = employees.filter((employee) => employee.properties.employmentStatus !== 'active');
  assert.equal(former.length, 5);
  assert.deepEqual(new Set(former.map((employee) => employee.properties.employmentStatus)), new Set(['RESIGNED', 'OFFBOARDED']));
  for (const employee of former) {
    assert.equal(typeof employee.properties.leftAt, 'string');
    assert.equal(typeof employee.properties.departureReason, 'string');
    assert.ok(String(employee.properties.leftAt) > String(employee.properties.joinedAt));
    assert.ok(String(employee.properties.leftAt) <= first.companyStartDate);
  }
  assert.deepEqual(validateSeedData(first), []);
});

test('maps every FalkorDB node and relationship without duplicate IDs', async () => {
  const graph = {
    query: async (cypher: string) => cypher.includes('RETURN n')
      ? { data: [
        { n: { id: 1, labels: ['Employee'], properties: { id: 'emp-01', name: 'Ava' } } },
        { n: { id: 2, labels: ['Team'], properties: { id: 'eng' } } }
      ] }
      : { data: [
        { r: { id: 7, relationshipType: 'MEMBER_OF', sourceId: 1, destinationId: 2, properties: {} } },
        { r: { id: 8, relationshipType: 'MEMBER_OF', sourceId: 1, destinationId: 2, properties: {} } }
      ] }
  } as never;
  const result = await fetchEntireGraph(graph);
  assert.deepEqual(result.nodes, [
    { id: 'emp-01', labels: ['Employee'], properties: { id: 'emp-01', name: 'Ava' } },
    { id: 'eng', labels: ['Team'], properties: { id: 'eng' } }
  ]);
  assert.equal(result.edges.length, 2);
  assert.deepEqual(result.edges.map((edge) => edge.id), ['MEMBER_OF:emp-01:eng', 'MEMBER_OF:emp-01:eng:2']);
  assert.ok(result.edges.every((edge) => ['emp-01', 'eng'].includes(edge.source) && ['emp-01', 'eng'].includes(edge.target)));
});

test('maps an empty FalkorDB graph', async () => {
  const graph = { query: async () => ({ data: [] }) } as never;
  assert.deepEqual(await fetchEntireGraph(graph), { nodes: [], edges: [] });
});

test('propagates database failures from complete graph reads', async () => {
  const graph = { query: async () => { throw new Error('database unavailable'); } } as never;
  await assert.rejects(() => fetchEntireGraph(graph), /database unavailable/);
});
