import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTicket } from '../src/agents/ticket-identification/rules.js';
import { runTicketIdentification } from '../src/agents/ticket-identification/agent.js';

const input = (text: string) => ({ text, source: 'synthetic', sourceRecordId: 'incoming-001', receivedAt: '2026-01-01T00:00:00.000Z' });

test('classifies bug, feature request, task, improvement, and question inputs', () => {
  assert.equal(classifyTicket('Bug: checkout crashes on timeout'), 'bug');
  assert.equal(classifyTicket('Feature request: allow saved cards'), 'feature-request');
  assert.equal(classifyTicket('Task: update the retry dashboard'), 'task');
  assert.equal(classifyTicket('Improve checkout latency'), 'improvement');
  assert.equal(classifyTicket('Why does wallet fallback fail?'), 'question');
});

test('missing references remain unresolved and are not invented', async () => {
  const result = await runTicketIdentification(input('Bug: checkout timeout; assignee: Unknown Person; product: Unknown Product'));
  assert.ok(result.errors.some((error) => error.includes('FalkorDB graph')));
  assert.equal(result.persisted, false);
  assert.equal(result.ticket?.assigneeId, undefined);
  assert.equal(result.ticket?.productId, undefined);
  assert.deepEqual(result.ticket?.references.map((reference) => reference.status), ['unresolved', 'unresolved']);
});

test('ambiguous FalkorDB references are flagged and not persisted', async () => {
  const graph = { query: async () => ({ data: [
    { n: { properties: { id: 'emp-01' } } },
    { n: { properties: { id: 'emp-02' } } }
  ] }) } as never;
  const result = await runTicketIdentification(input('Task: investigate; assignee: Alex'), { graph });
  assert.equal(result.ambiguities.length, 1);
  assert.equal(result.ambiguities[0].status, 'ambiguous');
  assert.equal(result.persisted, false);
});

test('invalid model output is rejected by structured validation', async () => {
  const result = await runTicketIdentification(input('Task: valid fallback'), {
    model: async () => ({ kind: 'not-a-kind', title: '', priority: 'P9', status: 'unknown' })
  });
  assert.ok(result.errors.some((error) => error.includes('kind')));
  assert.equal(result.ticket, undefined);
});

test('reprocessing the same source produces the same stable ticket and idempotent MERGE operations', async () => {
  const queries: string[] = [];
  const graph = { query: async (cypher: string) => { queries.push(cypher); return { data: [] }; } } as never;
  const first = await runTicketIdentification(input('Task: update retry dashboard'), { graph });
  const second = await runTicketIdentification(input('Task: update retry dashboard'), { graph });
  assert.equal(first.ticket?.id, second.ticket?.id);
  assert.equal(first.persisted, true);
  assert.equal(second.persisted, true);
  assert.equal(queries.filter((query) => query.includes('MERGE (n:Ticket')).length, 2);
  assert.ok(queries.every((query) => query.includes('$')));
});
