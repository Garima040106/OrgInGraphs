import assert from 'node:assert/strict';
import test from 'node:test';
import { runOrgInGraphsWorkflow } from '../src/workflow/workflow.js';
import { confluenceIngestionEnabled, disabledConfluenceIngestionAgent } from '../src/agents/confluence-ingestion/extension.js';

const event = (text: string, type?: 'ticket' | 'feature-update') => ({ text, type, source: 'user-input', sourceRecordId: 'workflow-001', receivedAt: '2026-01-01T00:00:00.000Z' });

test('routes ticket-like input only to ticket identification', async () => {
  const result = await runOrgInGraphsWorkflow(event('Bug: checkout crashes on timeout', 'ticket'));
  assert.equal(result.eventType, 'ticket-identification');
  assert.equal(result.classification, 'bug');
  assert.equal(result.changes[0], 'Ticket identified');
});

test('routes development updates only to Product Progress processing', async () => {
  const result = await runOrgInGraphsWorkflow(event('PR #142 was merged for authentication.', 'feature-update'));
  assert.equal(result.eventType, 'feature-update');
  assert.equal(result.classification, 'merge');
  assert.equal(result.unresolvedReferences[0].text, '142');
});

test('rejects invalid input with a typed validation error', async () => {
  const result = await runOrgInGraphsWorkflow({ text: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'invalid-input');
});

test('returns a database failure without exposing internal errors', async () => {
  const graph = { query: async () => { throw new Error('FalkorDB password=secret database unavailable'); } } as never;
  const result = await runOrgInGraphsWorkflow(event('Bug: checkout crashes', 'ticket'), { graph });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'database-failure');
  assert.ok(!result.errors[0].message.includes('secret'));
});

test('workflow terminates after one selected agent and does not loop', async () => {
  const result = await runOrgInGraphsWorkflow(event('I reviewed the search refactor.', 'feature-update'));
  assert.equal(result.eventType, 'feature-update');
  assert.notEqual(result.classification, 'bug');
});

test('the product workflow does not fetch external records and the legacy Confluence extension stays disabled', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('external requests are forbidden in this test'); };
  try {
    assert.equal(typeof confluenceIngestionEnabled, 'boolean');
    assert.deepEqual(await disabledConfluenceIngestionAgent.ingest({ sourceRecordId: 'offline-1', content: 'Confluence content' }), { status: 'disabled', sourceRecordId: 'offline-1' });
    const result = await runOrgInGraphsWorkflow({ text: 'Bug: checkout timeout', type: 'ticket', source: 'user-input', sourceRecordId: 'offline-workflow-1', receivedAt: '2026-01-01T00:00:00.000Z' }, { models: {} });
    assert.equal(result.eventType, 'ticket-identification');
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
