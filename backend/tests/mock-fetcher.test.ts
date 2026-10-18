import assert from 'node:assert/strict';
import test from 'node:test';
import { MOCK_ENDPOINTS, fetchMockDocuments } from '../src/agents/mock-fetcher/client.js';
import { runMockFetcher } from '../src/agents/mock-fetcher/agent.js';
import { MockFetcherError } from '../src/agents/mock-fetcher/types.js';

const originalFetch = globalThis.fetch;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('fetches and normalizes all supported synthetic source types', async () => {
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    const path = new URL(String(input)).pathname;
    const record = { id: 'record-1', title: 'Synthetic record', content: 'Content', createdAt: '2026-01-01', sourceUrl: 'https://source.example/1' };
    if (path.includes('/jira/')) return response({ issues: [{ id: '10001', key: 'JIRA-1', summary: 'Issue', description: 'Details', status: { name: 'Open' }, issuetype: { name: 'Bug' }, assignee: { displayName: 'Ava Patel' }, project: { name: 'Checkout' }, created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z', url: 'https://source.example/JIRA-1' }], startAt: 0, maxResults: 3, total: 1, isLast: true });
    if (path.includes('/confluence/')) return response({ results: [{ ...record, body: { storage: { value: 'Confluence page content', representation: 'storage' } } }] });
    if (path.includes('/slack/')) return response({ ok: true, messages: [{ ...record, ts: '2026-01-01T00:00:00.000Z' }] });
    return response([record]);
  };
  try {
    for (const source of ['confluence', 'jira', 'github', 'slack'] as const) {
      const result = await runMockFetcher({ source }, { baseUrl: 'https://mock.example' });
      assert.equal(result.documents[0].sourceSystem, source);
      assert.equal(result.documents[0].provenance, 'synthetic');
      assert.equal(result.documents[0].synthetic, true);
      if (source === 'jira') {
        assert.equal(result.documents[0].sourceRecordId, '10001');
        assert.equal(result.documents[0].title, 'Issue');
        assert.equal(result.documents[0].content, 'Issue\n\nDetails');
        assert.equal(result.documents[0].metadata.issueKey, 'JIRA-1');
        assert.equal(result.documents[0].metadata.status, 'Open');
        assert.equal(result.documents[0].metadata.issueType, 'Bug');
        assert.equal(result.documents[0].metadata.assignee, 'Ava Patel');
        assert.equal(result.documents[0].metadata.project, 'Checkout');
      }
    }
    assert.deepEqual(requested.map((url) => new URL(url).pathname), [
      MOCK_ENDPOINTS.confluence,
      MOCK_ENDPOINTS.jira,
      MOCK_ENDPOINTS.github,
      '/api/github/issues',
      '/api/github/commits',
      MOCK_ENDPOINTS.slack
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test('normalizes the documented Confluence results envelope and nested storage content', async () => {
  globalThis.fetch = async () => response({ results: [
    { id: 'page-100', title: 'Checkout runbook', body: { storage: { value: '<p>Rollback steps</p>', representation: 'storage' } }, space: { key: 'ENG' }, authorId: 'emp-04', url: 'https://confluence.example/pages/100', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z', source: 'synthetic' },
    { id: 'page-101', title: 'Retry notes', body: { storage: { value: '<p>Retry details</p>', representation: 'storage' } }, space: { key: 'ENG' }, url: null }
  ], startAt: 0, maxResults: 50, total: 2, isLast: true });
  try {
    const items = await fetchMockDocuments('confluence', { baseUrl: 'https://mock.example', limit: 1 });
    assert.equal(items.length, 1);
    assert.equal(items[0].sourceRecordId, 'page-100');
    assert.equal(items[0].content, '<p>Rollback steps</p>');
    assert.equal(items[0].sourceUrl, 'https://confluence.example/pages/100');
    assert.equal(items[0].createdAt, '2026-02-01T00:00:00.000Z');
    assert.equal(items[0].metadata.space && typeof items[0].metadata.space, 'object');
    assert.equal(items[0].provenance, 'synthetic');
  } finally { globalThis.fetch = originalFetch; }
});

test('uses the allowlisted path and query limit, never a request URL', async () => {
  let requested = '';
  globalThis.fetch = async (input) => { requested = String(input); return response({ issues: [{ id: '10001', key: 'JIRA-1', summary: 'Issue', description: 'Details' }], startAt: 0, maxResults: 4, total: 1, isLast: true }); };
  try {
    await fetchMockDocuments('jira', { baseUrl: 'https://mock.example', limit: 4 });
    const url = new URL(requested);
    assert.equal(url.pathname, '/api/jira/issues');
    assert.equal(url.searchParams.get('limit'), '4');
  } finally { globalThis.fetch = originalFetch; }
});

test('normalizes the documented Jira pagination envelope and rejects the wrong envelope', async () => {
  globalThis.fetch = async () => response({ issues: [{ id: '42', key: 'PAY-42', summary: 'Payment timeout', description: 'Retry the payment request.', status: { name: 'In Progress' }, issuetype: { name: 'Task' }, assignee: { displayName: 'Noah Williams' }, project: { name: 'Payments' }, created: '2026-02-01T00:00:00.000+0000', updated: '2026-02-02T00:00:00.000+0000', url: 'https://source.example/PAY-42' }], startAt: 0, maxResults: 3, total: 1, isLast: true });
  try {
    const [item] = await fetchMockDocuments('jira', { baseUrl: 'https://mock.example' });
    assert.equal(item.sourceRecordId, '42');
    assert.equal(item.title, 'Payment timeout');
    assert.equal(item.content, 'Payment timeout\n\nRetry the payment request.');
    assert.equal(item.createdAt, '2026-02-01T00:00:00.000Z');
    assert.equal(item.updatedAt, '2026-02-02T00:00:00.000Z');
    assert.equal(item.sourceUrl, 'https://source.example/PAY-42');
  } finally { globalThis.fetch = originalFetch; }
  globalThis.fetch = async () => response({ data: [{ id: '42', summary: 'Wrong envelope', description: 'Should not be accepted.' }] });
  try { await assert.rejects(() => fetchMockDocuments('jira', { baseUrl: 'https://mock.example' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'malformed-response'); }
  finally { globalThis.fetch = originalFetch; }
});

test('keeps Jira records marked with rawSeedId synthetic', async () => {
  globalThis.fetch = async () => response({ issues: [{ id: 'task-idempotency', key: 'TASK-IDEMPOTENCY', summary: 'Implement idempotency middleware', description: '', status: { name: 'Done' }, priority: { name: 'P2' }, issuetype: { name: 'Task' }, assignee: { displayName: 'Liam Johnson' }, project: { key: 'ORB', name: 'Orbit Checkout' }, url: 'https://example.com/task/task-idempotency', rawSeedId: 'task-idempotency' }], startAt: 0, maxResults: 1, total: 1, isLast: true });
  try {
    const [item] = await fetchMockDocuments('jira', { baseUrl: 'https://connector.example' });
    assert.equal(item.metadata.issueKey, 'TASK-IDEMPOTENCY');
    assert.equal(item.provenance, 'synthetic');
    assert.equal(item.synthetic, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not trust provenance asserted by a generic route-catalog endpoint', async () => {
  globalThis.fetch = async () => response({ issues: [{ id: '42', key: 'PAY-42', summary: 'Payment timeout', description: 'Retry payment safely.', provenance: 'external-verified' }], startAt: 0, maxResults: 1, total: 1, isLast: true });
  try {
    const [item] = await fetchMockDocuments('jira', { baseUrl: 'https://connector.example' });
    assert.equal(item.provenance, 'synthetic');
    assert.equal(item.synthetic, true);
  } finally { globalThis.fetch = originalFetch; }
});

test('normalizes the documented GitHub pulls envelope, preserves metadata, handles null URLs, and applies the local limit', async () => {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/pulls')) return response({
      pulls: [
        { id: '142', title: 'Authentication refactor', state: 'open', merged: false, user: { login: 'ava' }, repository: 'org/checkout', html_url: null, body: 'Refactor authentication.' },
        { id: '143', title: 'Payment timeout fix', state: 'closed', merged: true, user: { login: 'noah' }, repository: 'org/checkout', html_url: 'https://github.example/pr/143', body: 'Fix timeout handling.' }
      ], startAt: 0, maxResults: 2, total: 3, isLast: false
    });
    if (path.endsWith('/issues')) return response({ issues: [{ id: 'issue-201', number: 201, title: 'Fix webhook retry' }], startAt: 0, maxResults: 1, total: 1, isLast: true });
    return response({ commits: [{ sha: 'commit-301', commit: { message: 'Fix idempotency guard' } }], startAt: 0, maxResults: 1, total: 1, isLast: true });
  };
  try {
    const items = await fetchMockDocuments('github', { baseUrl: 'https://mock.example', limit: 4 });
    assert.equal(items.length, 4);
    assert.equal(items[0].sourceRecordId, '142');
    assert.equal(items[0].title, 'Authentication refactor');
    assert.equal(items[0].sourceUrl, undefined);
    assert.equal(items[0].metadata.repository, 'org/checkout');
    assert.equal(items[0].metadata.state, 'open');
    assert.equal(items[0].metadata.merged, false);
    assert.equal(items[0].metadata.authorLogin, 'ava');
    assert.equal(items[1].sourceUrl, 'https://github.example/pr/143');
    assert.equal(items[1].metadata.merged, true);
    assert.equal(items[1].provenance, 'synthetic');
    assert.equal(items[2].sourceRecordId, 'issue-201');
    assert.equal(items[2].metadata.recordType, 'issue');
    assert.equal(items[3].sourceRecordId, 'commit-301');
    assert.equal(items[3].metadata.recordType, 'commit');
  } finally { globalThis.fetch = originalFetch; }
});

test('recognizes the configured Company Brain seeded API as mock-verified while retaining its synthetic-data label', async () => {
  let authHeadersPresent = false;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const headers = init?.headers as Record<string, string> | undefined;
    authHeadersPresent ||= Boolean(headers?.Authorization || headers?.['x-api-key']);
    if (path.endsWith('/jira/issues')) return response({ issues: [{ id: 'seed-1', key: 'SEED-1', summary: 'Seeded test issue', description: 'Mock issue' }], startAt: 0, maxResults: 1, total: 1, isLast: true });
    return response({ pulls: [], startAt: 0, maxResults: 1, total: 0, isLast: true });
  };
  try {
    const [record] = await fetchMockDocuments('jira', { baseUrl: 'https://confluenece.vercel.app', limit: 1 });
    assert.equal(record.provenance, 'mock-verified');
    assert.equal(record.synthetic, true);
    assert.equal(record.sourceRecordId, 'seed-1');
    assert.equal(authHeadersPresent, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('normalizes the documented Slack messages envelope, preserves metadata, and applies the local limit', async () => {
  globalThis.fetch = async () => response({
    ok: true,
    messages: [
      { type: 'message', ts: '2026-02-01T10:00:00.000Z', user: 'U001', username: 'ava', user_profile: { display_name: 'Ava Patel' }, text: 'PAY-27 is blocked.', channel: 'general', channel_id: 'C001', thread_ts: '1700000000.000001', reply_count: 2, permalink: 'https://slack.example/1', linkedJiraKey: 'PAY-27', seedId: 'slack-001' },
      { type: 'message', ts: '2026-02-02T10:00:00.000Z', user: 'U002', username: 'noah', user_profile: { display_name: 'Noah Williams' }, text: 'The retry review is complete.', channel: 'general', channel_id: 'C001', reply_count: 0, permalink: null, linkedJiraKey: null, seedId: 'slack-002' },
      { type: 'message', ts: '2026-02-03T10:00:00.000Z', user: 'U003', username: 'mia', text: 'A third message.', channel: 'general', channel_id: 'C001', seedId: 'slack-003' }
    ],
    has_more: true,
    response_metadata: { next_cursor: 'next-page' }
  });
  try {
    const items = await fetchMockDocuments('slack', { baseUrl: 'https://mock.example', limit: 2 });
    assert.equal(items.length, 2);
    assert.equal(items[0].sourceRecordId, 'slack-001');
    assert.equal(items[0].content, 'PAY-27 is blocked.');
    assert.equal(items[0].occurredAt, '2026-02-01T10:00:00.000Z');
    assert.equal(items[0].sourceUrl, 'https://slack.example/1');
    assert.equal(items[0].metadata.channel, 'general');
    assert.equal(items[0].metadata.channel_id, 'C001');
    assert.equal(items[0].metadata.user, 'U001');
    assert.equal(items[0].metadata.username, 'ava');
    assert.deepEqual(items[0].metadata.user_profile, { display_name: 'Ava Patel' });
    assert.equal(items[0].metadata.linkedJiraKey, 'PAY-27');
    assert.equal(items[0].metadata.thread_ts, '1700000000.000001');
    assert.equal(items[1].sourceUrl, undefined);
    assert.equal(items[1].provenance, 'synthetic');
  } finally { globalThis.fetch = originalFetch; }
});

test('rejects unsuccessful Slack responses and malformed messages without seed IDs or text', async () => {
  globalThis.fetch = async () => response({ ok: false, messages: [] });
  try { await assert.rejects(() => fetchMockDocuments('slack', { baseUrl: 'https://mock.example' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'http-error'); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async () => response({ ok: true, messages: [{ type: 'message', text: 'Missing seed ID' }] });
  try { await assert.rejects(() => fetchMockDocuments('slack', { baseUrl: 'https://mock.example' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'malformed-response'); }
  finally { globalThis.fetch = originalFetch; }
});

test('handles missing and invalid configuration without requesting', async () => {
  await assert.rejects(() => fetchMockDocuments('slack', { baseUrl: '' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'missing-configuration');
  await assert.rejects(() => fetchMockDocuments('slack', { baseUrl: 'file:///secret' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'invalid-configuration');
});

test('handles HTTP errors, malformed responses, timeouts, and empty results', async () => {
  globalThis.fetch = async () => response({ error: 'nope' }, 503);
  try { await assert.rejects(() => fetchMockDocuments('github', { baseUrl: 'https://mock.example' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'http-error' && error.retryable); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async () => response({ nope: true });
  try { await assert.rejects(() => fetchMockDocuments('confluence', { baseUrl: 'https://mock.example' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'malformed-response'); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async (_input, init) => { await new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); }); return response([]); };
  try { await assert.rejects(() => fetchMockDocuments('slack', { baseUrl: 'https://mock.example', timeoutMs: 1 }), (error: unknown) => error instanceof MockFetcherError && error.code === 'timeout'); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async () => response({ issues: [], startAt: 0, maxResults: 3, total: 0, isLast: true });
  try { await assert.rejects(() => fetchMockDocuments('jira', { baseUrl: 'https://mock.example' }), (error: unknown) => error instanceof MockFetcherError && error.code === 'empty-result'); }
  finally { globalThis.fetch = originalFetch; }
});
