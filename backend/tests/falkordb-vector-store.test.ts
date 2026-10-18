import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Graph } from 'falkordb';
import { FalkorDBVectorStore } from '../src/agents/organization-intelligence/vector-store/falkordb-vector-store.js';
import type { DocumentChunk, VectorStoreDocumentEntry } from '../src/agents/organization-intelligence/types.js';
import { PersistentVectorStore } from '../src/agents/organization-intelligence/vector-store/persistent-store.js';
import { GeminiEmbeddingService } from '../src/agents/organization-intelligence/embeddings/gemini-embeddings.js';
import { runIngestionGraph } from '../src/agents/organization-intelligence/workflow/ingestion-graph.js';

class FakeGraph {
  calls: Array<{ query: string; params?: Record<string, unknown> }> = [];
  indexRows: unknown[] = [];
  nodes = new Map<string, Record<string, unknown>>();
  failWrites = false;

  async query(query: string, options?: { params?: Record<string, unknown> }) {
    this.calls.push({ query, params: options?.params });
    if (query === 'CALL db.indexes()') return { data: this.indexRows };
    if (query.includes('CREATE VECTOR INDEX')) {
      this.indexRows.push({ label: 'RAGChunk', property: 'embedding', type: 'VECTOR', options: { dimension: 384, similarityFunction: 'cosine' } });
      return { data: [] };
    }
    if (this.failWrites && query.includes('MERGE (c:RAGChunk')) throw new Error('write failed');
    if (query.includes('MERGE (c:RAGChunk')) {
      const p = options?.params ?? {};
      const key = `${p.orgId}:${p.chunkId}`;
      this.nodes.set(key, { ...this.nodes.get(key), ...p });
    }
    if (query.includes('MATCH (c:RAGChunk {orgId:$orgId,sourcePath:$sourcePath}) WHERE NOT')) {
      const p = options?.params ?? {};
      const keep = new Set(p.chunkIds as string[]);
      for (const [key, node] of this.nodes) if (node.orgId === p.orgId && node.sourcePath === p.sourcePath && !keep.has(String(node.chunkId))) this.nodes.delete(key);
    }
    return { data: [] };
  }
}

const entry: VectorStoreDocumentEntry = { path: 'docs/guide.md', title: 'Guide', sourceType: 'documentation', docHash: 'hash', chunkIds: ['stable-id'], updatedAt: '' };
const chunk = (id = 'stable-id', embedding = new Array(384).fill(0.01)): DocumentChunk => ({
  id, text: 'Guide text', embedding,
  metadata: { chunkId: id, orgId: 'org-a', sourceType: 'documentation', sourcePath: entry.path, title: entry.title, contentHash: 'content', docHash: entry.docHash, createdAt: '', updatedAt: '' }
});

test('vector index initialization creates once and is safe when called repeatedly', async () => {
  const graph = new FakeGraph();
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await Promise.all([store.initialize(), store.initialize(), store.initialize()]);
  await store.initialize();
  assert.equal(graph.calls.filter((call) => call.query.includes('CREATE VECTOR INDEX')).length, 1);
  assert.equal(graph.calls.filter((call) => call.query === 'CALL db.indexes()').length, 1);
});

test('vector index initialization reuses a compatible existing embedding index', async () => {
  const graph = new FakeGraph();
  graph.indexRows = [{ label: 'RAGChunk', property: 'embedding', type: 'VECTOR', options: { dimension: 384, similarityFunction: 'cosine' } }];
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await store.initialize();
  assert.equal(graph.calls.filter((call) => call.query.includes('CREATE VECTOR INDEX')).length, 0);
});

test('vector index initialization reads FalkorDB nested index metadata', async () => {
  const graph = new FakeGraph();
  graph.indexRows = [{ label: 'RAGChunk', properties: ['embedding'], types: { embedding: ['VECTOR'] }, options: { embedding: { dimension: 384, similarityFunction: 'cosine' } } }];
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await store.initialize();
  assert.equal(store.healthy, true);
  assert.equal(graph.calls.filter((call) => call.query.includes('CREATE VECTOR INDEX')).length, 0);
});

test('vector index initialization refuses an incompatible index without dropping it', async () => {
  const graph = new FakeGraph();
  graph.indexRows = [{ label: 'RAGChunk', property: 'embedding', type: 'VECTOR', options: { dimension: 768, similarityFunction: 'cosine' } }];
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await assert.rejects(store.initialize(), /incompatible.*dimension=768/i);
  assert.equal(graph.calls.some((call) => call.query.includes('DROP') || call.query.includes('DELETE')), false);
});

test('vector index initialization reports duplicate definitions without modifying them', async () => {
  const graph = new FakeGraph();
  const existing = { label: 'RAGChunk', property: 'embedding', type: 'VECTOR', options: { dimension: 384, similarityFunction: 'cosine' } };
  graph.indexRows = [existing, existing];
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await assert.rejects(store.initialize(), /Multiple vector indexes already target RAGChunk.embedding/);
  assert.equal(graph.calls.some((call) => call.query.includes('CREATE') || call.query.includes('DROP')), false);
});

test('repeated upserts merge stable chunk ids and never initialize the index', async () => {
  const graph = new FakeGraph();
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await store.upsertDocumentChunks(entry, [chunk()]);
  await store.upsertDocumentChunks(entry, [chunk()]);
  assert.equal(graph.nodes.size, 1);
  assert.equal(graph.calls.filter((call) => call.query.includes('CREATE VECTOR INDEX')).length, 0);
  assert.equal(graph.calls.filter((call) => call.query.includes('MERGE (c:RAGChunk')).length, 2);
});

test('upsert validates embedding dimensions and finite numeric values', async () => {
  const graph = new FakeGraph();
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await assert.rejects(store.upsertDocumentChunks(entry, [chunk('short', [1, 2])]), /exactly 384 finite numeric/);
  const invalid = new Array(384).fill(0.01); invalid[12] = Number.NaN;
  await assert.rejects(store.upsertDocumentChunks(entry, [chunk('nan', invalid)]), /exactly 384 finite numeric/);
});

test('persistence errors propagate from upsert', async () => {
  const graph = new FakeGraph(); graph.failWrites = true;
  const store = new FalkorDBVectorStore(graph as unknown as Graph, 'org-a');
  await assert.rejects(store.upsertDocumentChunks(entry, [chunk()]), /write failed/);
});

test('failed ingestion persistence increments failed source and chunk counts', async () => {
  class FailingStore extends PersistentVectorStore {
    override upsertDocumentChunks(): void { throw new Error('disk write failed'); }
  }
  const storagePath = `data/test-store-failure-${Date.now()}.json`;
  try {
    const result = await runIngestionGraph({
      vectorStore: new FailingStore({ storagePath, orgId: 'hirenova' }),
      embeddingService: new GeminiEmbeddingService({ useMock: true }),
      orgId: 'hirenova',
      selectedSources: ['/api/employees'],
      forceReindex: true
    });
    assert.equal(result.status, 'failed', JSON.stringify(result));
    assert.equal(result.stats.failed, 1);
    assert.ok((result.stats.generatedChunks ?? 0) > 0);
    assert.equal(result.stats.failedChunks, result.stats.generatedChunks);
    assert.equal(result.sources[0]?.status, 'failed');
    assert.equal(result.stats.totalChunks, 0);
  } finally {
    const resolvedStoragePath = path.resolve(process.cwd(), storagePath);
    if (existsSync(resolvedStoragePath)) unlinkSync(resolvedStoragePath);
  }
});
