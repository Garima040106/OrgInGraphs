import assert from 'node:assert/strict';
import test from 'node:test';
import { processDocument, processDocuments } from '../src/agents/document-processor/agent.js';
import type { NormalizedDocument } from '../src/agents/mock-fetcher/types.js';

const document = (overrides: Partial<NormalizedDocument> = {}): NormalizedDocument => ({
  sourceSystem: 'jira', sourceRecordId: 'JIRA-1', title: 'Bug: checkout timeout', content: 'Bug: checkout timeout', provenance: 'synthetic', synthetic: true, metadata: {}, ...overrides
});
const graph = (query: (cypher: string, options?: { params?: Record<string, string> }) => Promise<unknown> = async (cypher, options) =>
  cypher.includes('MATCH (n:Ticket')
    ? { data: [{ n: { properties: { id: options?.params?.id, sourceSystem: 'jira', sourceRecordId: 'JIRA-1' } } }] }
    : { data: [] }) => ({ query }) as never;

test('routes Jira documents to ticket identification and persists a validated result', async () => {
  const outcome = await processDocument(document(), { graph: graph(), useConfiguredModels: false });
  assert.equal(outcome.route, 'ticket-identification');
  assert.equal(outcome.status, 'processed');
  assert.match(outcome.entityId ?? '', /^ticket-[a-f0-9]{16}$/);
});

test('routes development documents to feature updates and skips Confluence', async () => {
  const update = await processDocument(document({ sourceSystem: 'github', sourceRecordId: 'PR-1', title: 'Add idempotency middleware', content: 'Add idempotency middleware.', metadata: { repository: 'org/checkout', state: 'open' } }), { graph: graph(), useConfiguredModels: false });
  const skipped = await processDocument(document({ sourceSystem: 'confluence', sourceRecordId: 'DOC-1', content: 'Meeting notes' }), { graph: graph(), useConfiguredModels: false });
  assert.equal(update.route, 'feature-update');
  assert.equal(update.status, 'processed');
  assert.equal(skipped.route, 'unsupported');
  assert.equal(skipped.status, 'skipped');
});

test('normalized Confluence documents are explicitly skipped without graph calls', async () => {
  let calls = 0;
  const outcome = await processDocument(document({ sourceSystem: 'confluence', sourceRecordId: 'page-100', title: 'Checkout runbook', content: 'Rollback steps' }), { graph: graph(async () => { calls += 1; return { data: [] }; }) });
  assert.equal(outcome.route, 'unsupported');
  assert.equal(outcome.status, 'skipped');
  assert.equal(calls, 0);
});

test('routes relevant GitHub pull requests to feature updates but leaves unrelated documents unsupported', async () => {
  const pullRequest = await processDocument(document({ sourceSystem: 'github', sourceRecordId: 'pr-idempotency', title: 'Add idempotency middleware', content: 'Add idempotency middleware.', metadata: { repository: 'org/checkout', state: 'open' } }), { graph: graph(), useConfiguredModels: false });
  const unrelated = await processDocument(document({ sourceSystem: 'github', sourceRecordId: 'DOC-1', title: 'Team lunch notes', content: 'Team lunch notes.', metadata: {} }), { graph: graph(), useConfiguredModels: false });
  assert.equal(pullRequest.route, 'feature-update');
  assert.equal(unrelated.route, 'unsupported');
  assert.equal(unrelated.status, 'skipped');
});

test('rejects malformed documents without invoking persistence', async () => {
  let calls = 0;
  const outcome = await processDocument(document({ content: '' }), { graph: graph(async () => { calls += 1; return { data: [] }; }) });
  assert.equal(outcome.status, 'failed');
  assert.equal(calls, 0);
});

test('preserves ambiguity and does not claim processing succeeded', async () => {
  const ambiguousGraph = graph(async (cypher) => cypher.includes('Employee') ? { data: [{ n: { id: 'emp-01' } }, { n: { id: 'emp-02' } }] } : { data: [] });
  const outcome = await processDocument(document({ content: 'Bug: timeout assigned to Ava' }), { graph: ambiguousGraph, useConfiguredModels: false });
  assert.equal(outcome.status, 'unresolved');
});

test('returns safe database failures and remains idempotent for duplicate documents', async () => {
  const failing = await processDocument(document(), { graph: graph(async () => { throw new Error('FalkorDB password=secret unavailable'); }), useConfiguredModels: false });
  assert.equal(failing.status, 'failed');
  assert.equal(failing.error, 'Ticket persistence failed.');
  const outcomes = await processDocuments([document(), document()], { graph: graph(), useConfiguredModels: false });
  assert.equal(outcomes[0].entityId, outcomes[1].entityId);
});

test('reports Jira validation and persistence stages with actionable safe diagnostics', async () => {
  const invalidTimestamp = await processDocument(document({ createdAt: 'not-a-timestamp', updatedAt: 'not-a-timestamp' }), { graph: graph(), useConfiguredModels: false });
  assert.equal(invalidTimestamp.status, 'failed');
  assert.match(invalidTimestamp.error ?? '', /createdAt|validation/i);
  const persistenceFailure = await processDocument(document(), { graph: graph(async (cypher) => cypher.includes('MERGE (n:Ticket') ? Promise.reject(new Error('FalkorDB unavailable')) : { data: [] }), useConfiguredModels: false });
  assert.equal(persistenceFailure.status, 'failed');
  assert.equal(persistenceFailure.error, 'Ticket persistence failed.');
});
