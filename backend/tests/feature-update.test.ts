import assert from 'node:assert/strict';
import test from 'node:test';
import { runFeatureUpdate } from '../src/agents/feature-update/agent.js';
import { activityType } from '../src/agents/feature-update/rules.js';

const input = (text: string) => ({ text, source: 'user-input', sourceRecordId: 'update-001', receivedAt: '2026-01-01T00:00:00.000Z' });

test('extracts deterministic activity types and status changes', () => {
  assert.equal(activityType('I fixed the payment timeout bug.'), 'fix');
  assert.equal(activityType('The CSV export feature is complete.'), 'feature-complete');
  assert.equal(activityType('PR #142 was merged for authentication.'), 'merge');
  assert.equal(activityType('The release is blocked by ticket PAY-27.'), 'release-blocked');
  assert.equal(activityType('I reviewed the search refactor.'), 'review');
});

test('preserves unresolved external references and does not claim verification', async () => {
  const result = await runFeatureUpdate(input('PR #142 was merged for authentication.'));
  assert.equal(result.update?.references[0].text, '142');
  assert.equal(result.update?.references[0].status, 'unresolved');
  assert.equal(result.update?.references[0].verified, false);
  assert.equal(result.update?.verifiedExternalEvent, false);
  assert.equal(result.persisted, false);
});

test('resolves an actor and ticket, then persists a status update', async () => {
  const queries: string[] = [];
  const graph = { query: async (cypher: string) => {
    queries.push(cypher);
    if (cypher.includes('MATCH (n:Employee)')) return { data: [{ n: { properties: { id: 'emp-04' } } }] };
    if (cypher.includes('MATCH (n) WHERE n.graphDomain') && cypher.includes('Ticket|Bug')) return { data: [{ n: { properties: { id: 'ticket-retry-policy' } } }] };
    return { data: [] };
  } } as never;
  const result = await runFeatureUpdate(input('By emp-04: ticket ticket-retry-policy is complete.'), { graph });
  assert.equal(result.update?.actorId, 'emp-04');
  assert.equal(result.update?.ticketId, 'ticket-retry-policy');
  assert.equal(result.update?.newStatus, 'done');
  assert.equal(result.persisted, true);
  assert.ok(queries.some((query) => query.includes('SET n.status = $status')));
});

test('flags ambiguous actors and does not persist', async () => {
  const graph = { query: async (cypher: string) => cypher.includes('MATCH (n:Employee)') ? { data: [
    { n: { properties: { id: 'emp-01' } } }, { n: { properties: { id: 'emp-02' } } }
  ] } : { data: [] } } as never;
  const result = await runFeatureUpdate(input('By Alex: I reviewed the search refactor.'), { graph });
  assert.equal(result.ambiguities.length, 1);
  assert.equal(result.persisted, false);
});

test('rejects invalid model output and reports database failures', async () => {
  const invalid = await runFeatureUpdate(input('I fixed a bug.'), { model: async () => ({ activityType: 'invented', summary: '' }) });
  assert.ok(invalid.errors.some((error) => error.includes('activityType')));
  const failingGraph = { query: async () => { throw new Error('database unavailable'); } } as never;
  await assert.rejects(() => runFeatureUpdate(input('By emp-01: I fixed a bug.'), { graph: failingGraph }), /database unavailable/);
});

test('duplicate events generate the same activity ID and use MERGE', async () => {
  const queries: string[] = [];
  const graph = { query: async (cypher: string) => { queries.push(cypher); return { data: [] }; } } as never;
  const first = await runFeatureUpdate(input('I fixed the payment timeout bug.'), { graph });
  const second = await runFeatureUpdate(input('I fixed the payment timeout bug.'), { graph });
  assert.equal(first.update?.id, second.update?.id);
  assert.equal(first.persisted, true);
  assert.equal(second.persisted, true);
  assert.equal(queries.filter((query) => query.includes('MERGE (a:Activity')).length, 2);
});
