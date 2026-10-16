import assert from 'node:assert/strict';
import test from 'node:test';
import { runIngestionWorkflow } from '../src/workflow/ingestion-workflow.js';
import type { NormalizedDocument } from '../src/agents/mock-fetcher/types.js';
import type { DocumentOutcome } from '../src/agents/document-processor/types.js';

const doc = (id = 'JIRA-1'): NormalizedDocument => ({ sourceSystem: 'jira', sourceRecordId: id, title: 'Bug: timeout', content: 'Bug: timeout', provenance: 'synthetic', synthetic: true, metadata: {} });
const outcome = (id: string, status: DocumentOutcome['status'] = 'processed'): DocumentOutcome => ({ sourceSystem: 'jira', sourceRecordId: id, status, route: 'ticket-identification', unresolvedReferences: [] });

test('fetches once and passes documents to the processor', async () => {
  let fetches = 0; let processed: NormalizedDocument[] = [];
  const result = await runIngestionWorkflow({ source: 'jira' }, { fetcher: async () => { fetches += 1; return { source: 'jira', documents: [doc()] }; }, processor: async (documents) => { processed = documents; return [outcome('JIRA-1')]; } });
  assert.equal(fetches, 1); assert.equal(processed.length, 1); assert.equal(result.status, 'processed'); assert.equal(result.outcomes[0].status, 'processed');
});

test('returns successful empty result without invoking the processor', async () => {
  let called = false;
  const result = await runIngestionWorkflow({ source: 'slack' }, { fetcher: async () => ({ source: 'slack', documents: [] }), processor: async () => { called = true; return []; } });
  assert.equal(result.status, 'empty'); assert.equal(called, false); assert.deepEqual(result.outcomes, []);
});

test('stops safely on fetch failure and sanitizes errors', async () => {
  let called = false;
  const result = await runIngestionWorkflow({ source: 'github' }, { fetcher: async () => { throw new Error('token=secret https://tunnel.example/api failed'); }, processor: async () => { called = true; return []; } });
  assert.equal(result.status, 'failed'); assert.equal(called, false); assert.deepEqual(result.errors, ['Mock API fetch failed.']);
});

test('aggregates processor failures and partial outcomes', async () => {
  const result = await runIngestionWorkflow({ source: 'jira' }, { fetcher: async () => ({ source: 'jira', documents: [doc('1'), doc('2')] }), processor: async () => [outcome('1'), outcome('2', 'failed')] });
  assert.equal(result.status, 'processed'); assert.deepEqual(result.outcomes.map((item) => item.status), ['processed', 'failed']);
});

test('rejects invalid input and remains bounded', async () => {
  let fetches = 0;
  const invalid = await runIngestionWorkflow({ source: 'unknown' as 'jira' }, { fetcher: async () => { fetches += 1; return { source: 'jira', documents: [] }; } });
  assert.equal(invalid.status, 'failed'); assert.equal(fetches, 0);
});

test('rejects source records that do not satisfy the normalized ingestion schema', async () => {
  let processed = false;
  const result = await runIngestionWorkflow({ source: 'jira' }, {
    fetcher: async () => ({ source: 'jira', documents: [{ ...doc(), metadata: null } as unknown as NormalizedDocument] }),
    processor: async () => { processed = true; return []; }
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.errors, ['Fetched records failed the normalized ingestion schema.']);
  assert.equal(processed, false);
});
