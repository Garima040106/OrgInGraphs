import assert from 'node:assert/strict';
import test from 'node:test';
import type { Graph } from 'falkordb';
import { FalkorDBSyncQueue } from '../src/agents/organization-intelligence/sync/falkordb-sync-queue.js';
import { RAGSyncWorker, type RAGSyncConfig } from '../src/agents/organization-intelligence/sync/rag-sync-worker.js';
import { PersistentVectorStore } from '../src/agents/organization-intelligence/vector-store/persistent-store.js';
import type { DiscoveredSource, DocumentChunk, SourceIngestionRecord } from '../src/agents/organization-intelligence/types.js';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { extractDatabaseSources } from '../src/agents/organization-intelligence/sources/database-extractor.js';
import { ConnectorChangeDetector, normalizedDocumentHash } from '../src/agents/organization-intelligence/sync/connector-change-detector.js';
import type { NormalizedDocument } from '../src/agents/mock-fetcher/types.js';

type StoredJob = Record<string, string | number | undefined>;

class QueueGraph {
  jobs = new Map<string, StoredJob>();
  async query(query: string, options?: { params?: Record<string, unknown> }) {
    const p = options?.params ?? {};
    const key = `${p.orgId}:${p.sourcePath}`;
    if (query.includes('MERGE (j:RAGSyncJob')) {
      const old = this.jobs.get(key);
      const changed = !old || old.contentHash !== p.contentHash || old.operation !== p.operation;
      if (!old) this.jobs.set(key, { ...p, id: p.id, status: 'pending', attempts: 0, createdAt: p.observedAt, nextAttemptAt: p.observedAt });
      const job = this.jobs.get(key)!;
      if (changed) {
        if (job.status !== 'processing') job.status = 'pending';
        job.attempts = 0;
        job.nextAttemptAt = p.observedAt as string;
        job.lastError = '';
      }
      Object.assign(job, { operation: p.operation, contentHash: p.contentHash, lastObservedAt: p.observedAt });
      return { data: [] };
    }
    if (query.includes('RETURN j\n')) {
      const now = String(p.now);
      const candidates = [...this.jobs.values()].filter((job) => job.orgId === p.orgId && (
        (job.status === 'pending' && String(job.nextAttemptAt ?? '') <= now)
        || (job.status === 'processing' && String(job.leaseUntil ?? '') <= now)
      )).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const job = candidates[0];
      if (!job) return { data: [] };
      Object.assign(job, { status: 'processing', leaseOwner: p.workerId, leaseUntil: p.leaseUntil, attempts: Number(job.attempts) + 1, startedAt: now });
      return { data: [{ j: { ...job } }] };
    }
    if (query.includes('superseded')) {
      const job = this.jobs.get(key);
      if (!job || job.status !== 'processing' || job.leaseOwner !== p.workerId) return { data: [] };
      const superseded = job.contentHash !== p.claimedHash || job.operation !== p.claimedOperation;
      const failing = query.includes('$exhausted');
      const exhausted = Boolean(p.exhausted);
      job.status = superseded ? 'pending' : failing && exhausted ? 'dead' : failing ? 'pending' : 'completed';
      job.nextAttemptAt = p.nextAttemptAt as string ?? p.now as string;
      if (failing && !superseded) job.lastError = p.error as string;
      delete job.leaseOwner;
      delete job.leaseUntil;
      return { data: [] };
    }
    if (query.includes('leaseOwner:$workerId')) {
      const job = this.jobs.get(key);
      if (job?.leaseOwner === p.workerId) {
        job.status = 'pending';
        job.nextAttemptAt = p.now as string;
        delete job.leaseOwner;
        delete job.leaseUntil;
      }
      return { data: [] };
    }
    if (query.includes("status:'dead'")) {
      let count = 0;
      for (const job of this.jobs.values()) if (job.orgId === p.orgId && job.status === 'dead') { job.status = 'pending'; job.attempts = 0; job.nextAttemptAt = p.now as string; count++; }
      return { data: [{ count }] };
    }
    if (query.includes('RETURN j.status AS status')) {
      const grouped = new Map<string, StoredJob[]>();
      for (const job of this.jobs.values()) if (job.orgId === p.orgId) grouped.set(String(job.status), [...(grouped.get(String(job.status)) ?? []), job]);
      return { data: [...grouped].map(([status, jobs]) => ({ status, count: jobs.length, attempts: jobs.reduce((sum, job) => sum + Number(job.attempts ?? 0), 0), lastObservedChange: jobs.map((job) => String(job.lastObservedAt ?? '')).sort().at(-1), oldestPendingAt: status === 'pending' ? jobs.map((job) => String(job.createdAt ?? '')).sort()[0] : null })) };
    }
    return { data: [] };
  }
}

const config: RAGSyncConfig = { enabled: true, pollIntervalMs: 60_000, batchSize: 20, concurrency: 3, maxRetries: 3 };
const source = (hash: string, content = 'Company operating information'): DiscoveredSource => ({ id: 'doc:company', type: 'documentation', path: 'docs/company.md', title: 'Company', content, metadata: {}, hash });
const noConnectorPoll = async () => ({ configured: 0, fetched: 0, changed: 0, persisted: 0, failures: 0, lastError: null });

function fakeAgent(store: PersistentVectorStore, getSources: () => DiscoveredSource[], failWrites = () => false) {
  let embeddingGenerations = 0;
  const agent = {
    vectorStore: store,
    embeddingService: { model: 'Xenova/all-MiniLM-L6-v2' },
    async getSources() { return store.getAllDocuments(); },
    async getStatus() { return store.getStats(); },
    async ingest(options: { selectedSources?: string[] }) {
      const candidates = getSources().filter((item) => options.selectedSources?.includes(item.path));
      const records: SourceIngestionRecord[] = [];
      if (failWrites()) return { status: 'failed', stats: { failed: 1 }, sources: [], errors: ['Vector store persistence failed.'] };
      for (const item of candidates) {
        const old = store.getDocument(item.path);
        const id = `documentation:${encodeURIComponent(item.path)}:${item.hash}:0`;
        const embedding = new Array(384).fill(0.01);
        embeddingGenerations++;
        const chunk: DocumentChunk = { id, text: item.content, embedding, metadata: { chunkId: id, orgId: 'org-a', sourceType: 'documentation', sourcePath: item.path, title: item.title, contentHash: item.hash, docHash: item.hash, createdAt: '', updatedAt: '' } };
        store.upsertDocumentChunks({ path: item.path, title: item.title, sourceType: item.type, docHash: item.hash, chunkIds: [id], updatedAt: '' }, [chunk]);
        records.push({ path: item.path, title: item.title, sourceType: item.type, status: old ? 'updated' : 'processed', chunks: 1, docHash: item.hash, updatedAt: '' });
      }
      return { status: 'completed', stats: {}, sources: records, errors: [] };
    }
  };
  return { agent, embeddingCount: () => embeddingGenerations };
}

async function withWorker<T>(fn: (input: { worker: RAGSyncWorker; sources: DiscoveredSource[]; store: PersistentVectorStore; graph: QueueGraph; embeddingCount: () => number; agent: ReturnType<typeof fakeAgent>['agent'] }) => Promise<T>): Promise<T> {
  const storagePath = path.resolve(`data/rag-sync-test-${Date.now()}-${Math.random()}.json`);
  const graph = new QueueGraph();
  const sources = [source('hash-1')];
  const store = new PersistentVectorStore({ storagePath, orgId: 'org-a' });
  const fake = fakeAgent(store, () => sources);
  const worker = new RAGSyncWorker(graph as unknown as Graph, fake.agent as never, config, async () => sources, noConnectorPoll);
  try { return await fn({ worker, sources, store, graph, embeddingCount: fake.embeddingCount, agent: fake.agent }); }
  finally { if (existsSync(storagePath)) unlinkSync(storagePath); }
}

test('automatic polling indexes new sources and skips embedding unchanged content', async () => {
  await withWorker(async ({ worker, embeddingCount, store }) => {
    worker.start();
    await worker.tick();
    assert.equal(store.getStats().totalChunks, 1);
    assert.equal(embeddingCount(), 1);
    await worker.tick();
    assert.equal(embeddingCount(), 1);
    await worker.stop();
  });
});

test('updated content is re-embedded once and deleted content is removed after reconciliation', async () => {
  await withWorker(async ({ worker, embeddingCount, store, sources }) => {
    worker.start();
    await worker.tick();
    sources[0] = source('hash-2', 'Updated company information');
    await worker.tick();
    assert.equal(embeddingCount(), 2);
    assert.equal(store.getDocument('docs/company.md')?.docHash, 'hash-2');
    await worker.tick();
    assert.equal(embeddingCount(), 2);
    sources.splice(0, 1);
    await worker.tick();
    assert.equal(store.getStats().totalChunks, 0);
    await worker.stop();
  });
});

test('two worker processes do not index the same source job concurrently', async () => {
  await withWorker(async ({ graph, sources, embeddingCount, agent }) => {
    const first = new RAGSyncWorker(graph as unknown as Graph, agent as never, config, async () => sources, noConnectorPoll);
    const second = new RAGSyncWorker(graph as unknown as Graph, agent as never, config, async () => sources, noConnectorPoll);
    first.start();
    second.start();
    await Promise.all([first.tick(), second.tick()]);
    await Promise.all([first.stop(), second.stop()]);
    assert.equal(embeddingCount(), 1);
    assert.equal(graph.jobs.size, 1);
  });
});

test('failed persistence is counted and dead-lettered after the configured attempt limit', async () => {
  const storagePath = path.resolve(`data/rag-sync-failure-${Date.now()}.json`);
  const graph = new QueueGraph();
  const sources = [source('hash-1')];
  const store = new PersistentVectorStore({ storagePath, orgId: 'org-a' });
  const failedAgent = fakeAgent(store, () => sources, () => true);
  const worker = new RAGSyncWorker(graph as unknown as Graph, failedAgent.agent as never, { ...config, maxRetries: 1 }, async () => sources, noConnectorPoll);
  try {
    worker.start();
    await worker.tick();
    await worker.stop();
    assert.equal((await worker.status()).failed, 1);
    assert.equal(store.getStats().totalChunks, 0);
  } finally {
    await worker.stop();
    if (existsSync(storagePath)) unlinkSync(storagePath);
  }
});

test('duplicate events coalesce by source and newer out-of-order content supersedes older hashes', async () => {
  const graph = new QueueGraph();
  const queue = new FalkorDBSyncQueue(graph as unknown as Graph, 'org-a');
  await queue.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'old' });
  await queue.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'old' });
  await queue.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'new' });
  assert.equal(graph.jobs.size, 1);
  assert.equal(graph.jobs.values().next().value?.contentHash, 'new');
  assert.equal(graph.jobs.values().next().value?.status, 'pending');
});

test('exhausted persistence failures go to dead-letter state and can be replayed', async () => {
  const graph = new QueueGraph();
  const queue = new FalkorDBSyncQueue(graph as unknown as Graph, 'org-a');
  await queue.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'hash-1' });
  const job = await queue.claim('worker', 30_000);
  assert.ok(job);
  await queue.fail(job!, 'worker', new Error('database unavailable'), 1, 1000, 15);
  assert.equal((await queue.status()).failed, 1);
  assert.equal(await queue.replayDeadLetters(), 1);
  assert.equal((await queue.status()).pending, 1);
});

test('retryable work stays pending with a future exponential-backoff deadline', async () => {
  const graph = new QueueGraph();
  const queue = new FalkorDBSyncQueue(graph as unknown as Graph, 'org-a');
  await queue.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'hash-1' });
  const job = await queue.claim('worker', 30_000);
  assert.ok(job);
  await queue.fail(job!, 'worker', new Error('temporary failure'), 5, 60_000, 25);
  assert.equal((await queue.status()).pending, 1);
  assert.equal((await queue.status()).failed, 0);
  assert.equal(await queue.claim('other-worker', 30_000), undefined);
});

test('a temporary discovery failure leaves indexed documents untouched and creates no deletion jobs', async () => {
  await withWorker(async ({ store, graph }) => {
    const indexed = source('already-indexed');
    const id = `documentation:${encodeURIComponent(indexed.path)}:${indexed.hash}:0`;
    const chunk: DocumentChunk = { id, text: indexed.content, embedding: new Array(384).fill(0.01), metadata: { chunkId: id, orgId: 'org-a', sourceType: 'documentation', sourcePath: indexed.path, title: indexed.title, contentHash: indexed.hash, docHash: indexed.hash, createdAt: '', updatedAt: '' } };
    store.upsertDocumentChunks({ path: indexed.path, title: indexed.title, sourceType: indexed.type, docHash: indexed.hash, chunkIds: [id], updatedAt: '' }, [chunk]);
    const inaccessibleAgent = fakeAgent(store, () => []);
    const inaccessibleWorker = new RAGSyncWorker(graph as unknown as Graph, inaccessibleAgent.agent as never, config, async () => { throw new Error('source unavailable'); }, noConnectorPoll);
    inaccessibleWorker.start();
    await inaccessibleWorker.tick();
    await inaccessibleWorker.stop();
    assert.equal(store.getDocument(indexed.path)?.docHash, 'already-indexed');
    assert.equal(graph.jobs.size, 0);
  });
});

test('durable jobs are isolated by organization', async () => {
  const graph = new QueueGraph();
  const firstOrg = new FalkorDBSyncQueue(graph as unknown as Graph, 'org-a');
  const secondOrg = new FalkorDBSyncQueue(graph as unknown as Graph, 'org-b');
  await firstOrg.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'a' });
  await secondOrg.enqueue({ sourcePath: 'docs/company.md', operation: 'upsert', contentHash: 'b' });
  assert.equal((await firstOrg.status()).pending, 1);
  assert.equal((await secondOrg.status()).pending, 1);
  assert.equal(graph.jobs.size, 2);
});

test('a second worker can resume durable pending work after process restart', async () => {
  await withWorker(async ({ graph, sources, store }) => {
    const queue = new FalkorDBSyncQueue(graph as unknown as Graph, 'org-a');
    await queue.enqueue({ sourcePath: 'docs/after-restart.md', operation: 'upsert', contentHash: 'restart-hash' });
    const restartedSource = { ...source('restart-hash', 'Restarted document'), path: 'docs/after-restart.md' };
    const discovered = [...sources, restartedSource];
    const worker = new RAGSyncWorker(graph as unknown as Graph, fakeAgent(store, () => discovered).agent as never, config, async () => discovered, noConnectorPoll);
    worker.start();
    await worker.tick();
    await worker.stop();
    assert.ok(store.getDocument('docs/after-restart.md'));
  });
});

test('connector records are discovered with stable IDs and normalized content hashes', async () => {
  let updatedAt = '2026-01-01T00:00:00.000Z';
  const graph = { async query(query: string) {
    if (query.includes('RETURN n, labels(n)[0] AS label')) return { data: [{ n: { properties: { sourceSystem: 'jira', sourceRecordId: 'PAY-42', title: '  Payment   retry ', description: 'Add retry\n policy', updatedAt, provenance: 'external-verified' } }, label: 'Ticket' }] };
    return { data: [] };
  } };
  const first = await extractDatabaseSources(graph as unknown as Graph, { strictLive: true });
  updatedAt = '2026-01-02T00:00:00.000Z';
  const second = await extractDatabaseSources(graph as unknown as Graph, { strictLive: true });
  assert.equal(first.length, 1);
  assert.equal(first[0].path, 'connectors/jira/PAY-42');
  assert.equal(first[0].hash, second[0].hash);
  assert.equal(first[0].metadata.sourceSystem, 'jira');
});

test('failed live source discovery is not treated as an empty scan or deletion signal', async () => {
  const graph = { async query() { throw new Error('FalkorDB temporarily unavailable'); } };
  await assert.rejects(extractDatabaseSources(graph as unknown as Graph, { strictLive: true }), /Live FalkorDB source discovery failed/);
});

test('configured connector polling persists new and changed verified records, then skips unchanged hashes', async () => {
  const state = new Map<string, string>();
  const docs = new Map<string, Record<string, unknown>>();
  const graph = { async query(query: string, options?: { params?: Record<string, unknown> }) {
    const p = options?.params ?? {};
    if (query.includes('RETURN s.sourceRecordId AS sourceRecordId')) return { data: [...state].map(([sourceRecordId, contentHash]) => ({ sourceRecordId, contentHash })) };
    if (query.includes('MERGE (d:Document')) { docs.set(String(p.id), p.properties as Record<string, unknown>); return { data: [] }; }
    if (query.includes('MERGE (s:RAGSyncSourceState')) { state.set(String(p.sourceRecordId), String(p.contentHash)); return { data: [] }; }
    return { data: [] };
  } };
  let document: NormalizedDocument = { sourceSystem: 'confluence', sourceRecordId: 'page-123', title: 'Architecture', content: 'Current company architecture.', provenance: 'external-verified', synthetic: false, metadata: {} };
  let fetches = 0;
  const detector = new ConnectorChangeDetector(graph as unknown as Graph, 'org-a', 25, 2, async () => { fetches++; return [document]; }, () => ['confluence']);
  const first = await detector.poll();
  assert.equal(first.persisted, 1);
  assert.equal(first.changed, 1);
  assert.equal(docs.size, 1);
  const second = await detector.poll();
  assert.equal(second.changed, 0);
  assert.equal(second.persisted, 0);
  assert.equal(fetches, 2);
  document = { ...document, content: 'Updated company architecture.' };
  const third = await detector.poll();
  assert.equal(third.changed, 1);
  assert.equal(third.persisted, 1);
  assert.equal(normalizedDocumentHash(document), state.get('page-123'));
});

test('connector polling never accepts synthetic records as authoritative source changes', async () => {
  const graph = { async query() { return { data: [] }; } };
  const document: NormalizedDocument = { sourceSystem: 'jira', sourceRecordId: 'PAY-1', title: 'Demo', content: 'Synthetic fixture content', provenance: 'synthetic', synthetic: true, metadata: {} };
  const detector = new ConnectorChangeDetector(graph as unknown as Graph, 'org-a', 10, 1, async () => [document], () => ['jira']);
  const result = await detector.poll();
  assert.equal(result.persisted, 0);
  assert.equal(result.failures, 1);
  assert.match(result.lastError ?? '', /jira Error/);
});
