import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import path from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import type { Graph } from 'falkordb';
import { createApp } from '../src/api/app.js';
import { discoverRouteSources } from '../src/agents/organization-intelligence/sources/routes-catalog.js';
import { loadDocumentationSources } from '../src/agents/organization-intelligence/sources/docs-loader.js';
import { extractDatabaseSources } from '../src/agents/organization-intelligence/sources/database-extractor.js';
import { discoverAllSources } from '../src/agents/organization-intelligence/sources/scanner.js';
import { chunkSource, chunkAllSources } from '../src/agents/organization-intelligence/chunking/chunker.js';
import { deterministicOfflineEmbedding, GeminiEmbeddingService } from '../src/agents/organization-intelligence/embeddings/gemini-embeddings.js';
import { PersistentVectorStore, cosineSimilarity } from '../src/agents/organization-intelligence/vector-store/persistent-store.js';
import { OrganizationIntelligenceAgent } from '../src/agents/organization-intelligence/agent.js';
import { runIngestionGraph } from '../src/agents/organization-intelligence/workflow/ingestion-graph.js';
import { runRetrievalGraph } from '../src/agents/organization-intelligence/workflow/retrieval-graph.js';

function tempStoragePath(name: string): string {
  const p = path.resolve(process.cwd(), 'data', `test-store-${name}-${Date.now()}.json`);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch {}
  }
  return p;
}

test('Source Discovery: catalogs all registered backend routes and parameters', () => {
  const routes = discoverRouteSources();
  assert.ok(routes.length >= 10, 'Expected at least 10 documented backend routes');
  const employeeRoute = routes.find((r) => r.path === '/api/employees');
  assert.ok(employeeRoute, 'Expected /api/employees route to be discovered');
  assert.equal(employeeRoute.type, 'route');
  assert.ok(employeeRoute.content.includes('departmentId'));
  assert.ok(employeeRoute.content.includes('teamId'));
  assert.ok(employeeRoute.metadata.entities);
});

test('Source Discovery: recursively discovers docs/ and markdown files', () => {
  const docs = loadDocumentationSources();
  assert.ok(docs.length >= 1, 'Expected at least one document discovered');
  const inventoryDoc = docs.find((d) => d.path.includes('api-capability-inventory.md'));
  assert.ok(inventoryDoc, 'Expected api-capability-inventory.md to be discovered');
  assert.equal(inventoryDoc.type, 'documentation');
  assert.ok(inventoryDoc.content.length > 500);
  assert.ok(inventoryDoc.hash.length === 64);
});

test('Source Discovery: extracts company, departments, and services from database models', async () => {
  const dbSources = await extractDatabaseSources();
  assert.ok(dbSources.length >= 5, 'Expected database entity sources');
  const company = dbSources.find((s) => s.path.includes('Company'));
  assert.ok(company, 'Expected Company entity in database sources');
  assert.ok(company.content.includes('Hirenova'));

  const sweDept = dbSources.find((s) => s.path.includes('swe'));
  assert.ok(sweDept, 'Expected Software Engineering department');
  assert.ok(sweDept.content.includes('Software Engineering'));
});

test('Source Discovery: scanner combines all sources without dropping metadata', async () => {
  const all = await discoverAllSources();
  const types = new Set(all.map((s) => s.type));
  assert.ok(types.has('route'));
  assert.ok(types.has('documentation'));
  assert.ok(types.has('database'));
  assert.ok(all.every((s) => s.id && s.hash && s.content && s.title));
});

test('Chunking: breaks long sources into overlapping chunks with complete metadata', () => {
  const sampleSource = {
    id: 'test:doc:1',
    type: 'documentation' as const,
    path: 'docs/test.md',
    title: 'Test Guide',
    content: `# Test Guide\n\nSection 1:\n${'A'.repeat(600)}\n\n## Section 2:\n${'B'.repeat(800)}`,
    metadata: { version: '1.0' },
    hash: 'dummyhash123'
  };

  const chunks = chunkSource(sampleSource, { targetChunkSize: 500, overlap: 100, orgId: 'hirenova' });
  assert.ok(chunks.length >= 2, 'Expected multiple chunks for large document');
  assert.equal(chunks[0].metadata.orgId, 'hirenova');
  assert.equal(chunks[0].metadata.sourcePath, 'docs/test.md');
  assert.equal(chunks[0].metadata.docHash, 'dummyhash123');
  assert.ok(chunks[0].metadata.contentHash);
  assert.ok(chunks[0].id.startsWith('documentation:docs%2Ftest.md:'));
});

test('Embedding Service: produces normalized 384-dimensional embeddings and calculates cosine similarity', async () => {
  const embeddingService = new GeminiEmbeddingService({ useMock: true });
  const vec1 = await embeddingService.embedText('Hirenova company overview and departments');
  const vec2 = await embeddingService.embedText('Hirenova organization departments and structure');
  const vec3 = await embeddingService.embedText('quantum astrophysics celestial planetary orbits');

  assert.equal(vec1.length, 384);
  assert.equal(vec2.length, 384);
  assert.equal(vec3.length, 384);

  const simRelated = cosineSimilarity(vec1, vec2);
  const simUnrelated = cosineSimilarity(vec1, vec3);

  assert.ok(simRelated > simUnrelated, `Expected related similarity (${simRelated}) > unrelated (${simUnrelated})`);
});

test('Vector Store: persists to disk, retrieves chunks, and enforces tenant isolation', () => {
  const storagePath = tempStoragePath('tenant-test');
  try {
    const store = new PersistentVectorStore({ storagePath, orgId: 'tenant-a' });
    const dummyEmbedding = new Array(384).fill(0.01);
    dummyEmbedding[0] = 1;

    store.upsertDocumentChunks(
      {
        path: 'doc/a.md',
        title: 'Tenant A Document',
        sourceType: 'documentation',
        docHash: 'hash-a',
        chunkIds: ['chunk-a-1'],
        updatedAt: new Date().toISOString()
      },
      [
        {
          id: 'chunk-a-1',
          text: 'Confidential knowledge for Tenant A',
          metadata: {
            chunkId: 'chunk-a-1',
            orgId: 'tenant-a',
            sourceType: 'documentation',
            sourcePath: 'doc/a.md',
            title: 'Tenant A Document',
            contentHash: 'chash-1',
            docHash: 'hash-a',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          embedding: dummyEmbedding
        }
      ]
    );

    // Search from tenant-a perspective
    const resultsA = store.search(dummyEmbedding, { orgId: 'tenant-a', threshold: 0.1 });
    assert.equal(resultsA.length, 1);
    assert.equal(resultsA[0].chunk.id, 'chunk-a-1');

    // Search from tenant-b perspective (must return nothing)
    const resultsB = store.search(dummyEmbedding, { orgId: 'tenant-b', threshold: 0.1 });
    assert.equal(resultsB.length, 0, 'Cross-tenant data leakage detected!');

    // Verify persistence after reloading from disk
    const reloadedStore = new PersistentVectorStore({ storagePath, orgId: 'tenant-a' });
    const reloadedResults = reloadedStore.search(dummyEmbedding, { orgId: 'tenant-a', threshold: 0.1 });
    assert.equal(reloadedResults.length, 1);
    assert.equal(reloadedResults[0].chunk.text, 'Confidential knowledge for Tenant A');
  } finally {
    if (existsSync(storagePath)) {
      try { unlinkSync(storagePath); } catch {}
    }
  }
});

test('Vector Store: incremental indexing skips unchanged content and replaces updated documents', () => {
  const storagePath = tempStoragePath('incremental-test');
  try {
    const store = new PersistentVectorStore({ storagePath, orgId: 'hirenova' });
    const vec = new Array(384).fill(0.01);

    // Initial insert
    store.upsertDocumentChunks(
      {
        path: 'routes/employees',
        title: 'Employees Route',
        sourceType: 'route',
        docHash: 'v1-hash',
        chunkIds: ['chunk-v1'],
        updatedAt: new Date().toISOString()
      },
      [
        {
          id: 'chunk-v1',
          text: 'Version 1 of employees route',
          metadata: {
            chunkId: 'chunk-v1',
            orgId: 'hirenova',
            sourceType: 'route',
            sourcePath: 'routes/employees',
            title: 'Employees Route',
            contentHash: 'c1',
            docHash: 'v1-hash',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          embedding: vec
        }
      ]
    );

    assert.equal(store.hasDocumentWithHash('routes/employees', 'v1-hash'), true);
    assert.equal(store.hasDocumentWithHash('routes/employees', 'v2-hash'), false);
    assert.equal(store.getStats().totalChunks, 1);

    // Update with v2
    store.upsertDocumentChunks(
      {
        path: 'routes/employees',
        title: 'Employees Route',
        sourceType: 'route',
        docHash: 'v2-hash',
        chunkIds: ['chunk-v2'],
        updatedAt: new Date().toISOString()
      },
      [
        {
          id: 'chunk-v2',
          text: 'Version 2 with new filters',
          metadata: {
            chunkId: 'chunk-v2',
            orgId: 'hirenova',
            sourceType: 'route',
            sourcePath: 'routes/employees',
            title: 'Employees Route',
            contentHash: 'c2',
            docHash: 'v2-hash',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          embedding: vec
        }
      ]
    );

    // Stale chunk-v1 must be gone, chunk-v2 must be present
    assert.equal(store.getStats().totalChunks, 1);
    const searchRes = store.search(vec, { orgId: 'hirenova', threshold: 0.1 });
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].chunk.id, 'chunk-v2');
    assert.equal(searchRes[0].chunk.text, 'Version 2 with new filters');
  } finally {
    if (existsSync(storagePath)) {
      try { unlinkSync(storagePath); } catch {}
    }
  }
});

test('LangGraph Ingestion Workflow: executes full graph and reports stats', async () => {
  const storagePath = tempStoragePath('ingestion-workflow');
  try {
    const store = new PersistentVectorStore({ storagePath, orgId: 'hirenova' });
    const embeddingService = new GeminiEmbeddingService({ useMock: true });

    // Run first ingestion
    const result1 = await runIngestionGraph({
      vectorStore: store,
      embeddingService,
      orgId: 'hirenova'
    });

    assert.equal(result1.status, 'completed');
    assert.ok(result1.stats.totalSources > 0);
    assert.ok(result1.stats.totalChunks > 0);
    assert.ok(result1.stats.processed > 0);
    assert.equal(result1.stats.skipped, 0);

    // Run second ingestion (all should be skipped due to deduplication)
    const result2 = await runIngestionGraph({
      vectorStore: store,
      embeddingService,
      orgId: 'hirenova'
    });

    assert.equal(result2.status, 'completed');
    assert.equal(result2.stats.processed, 0);
    assert.equal(result2.stats.skipped, result1.stats.totalSources);
  } finally {
    if (existsSync(storagePath)) {
      try { unlinkSync(storagePath); } catch {}
    }
  }
});

test('LangGraph RAG Retrieval Workflow: retrieves relevant chunks and cites sources', async () => {
  const storagePath = tempStoragePath('rag-workflow');
  try {
    const store = new PersistentVectorStore({ storagePath, orgId: 'hirenova' });
    const embeddingService = new GeminiEmbeddingService({ useMock: true });

    // Seed knowledge
    await runIngestionGraph({ vectorStore: store, embeddingService, orgId: 'hirenova' });

    // Mock model that simulates a grounded answer
    const mockModel = async (systemPrompt: string, userPrompt: string) => {
      assert.ok(systemPrompt.includes('Hirenova'));
      assert.ok(userPrompt.includes('employees'));
      return 'Hirenova provides employee directory endpoints under /api/employees supporting department and team filtering. [S1]';
    };

    const ragResult = await runRetrievalGraph(
      { query: 'employees departmentId teamId /api/employees', threshold: 0.05 },
      { vectorStore: store, embeddingService, model: mockModel }
    );

    assert.equal(ragResult.status, 'completed');
    assert.equal(ragResult.agent, 'organization-intelligence');
    assert.ok(ragResult.sources.length > 0);
    assert.ok(ragResult.retrieved_chunks.length > 0);
    assert.ok(ragResult.answer.includes('/api/employees'));
    assert.ok(ragResult.sources.some((s) => s.sourcePath.includes('/api/employees')));
  } finally {
    if (existsSync(storagePath)) {
      try { unlinkSync(storagePath); } catch {}
    }
  }
});

test('LangGraph RAG Retrieval Workflow: reports insufficient information when context is absent', async () => {
  const storagePath = tempStoragePath('rag-insufficient');
  try {
    const store = new PersistentVectorStore({ storagePath, orgId: 'hirenova' });
    const embeddingService = new GeminiEmbeddingService({ useMock: true });

    // Empty vector store
    const ragResult = await runRetrievalGraph(
      { query: 'What is the interstellar warp drive velocity formula for spacecraft?' },
      { vectorStore: store, embeddingService }
    );

    assert.equal(ragResult.status, 'completed');
    assert.equal(ragResult.retrieved_chunks.length, 0);
    assert.ok(ragResult.answer.includes('does not contain sufficient'));
  } finally {
    if (existsSync(storagePath)) {
      try { unlinkSync(storagePath); } catch {}
    }
  }
});

test('Agent 1 API Endpoints: supports ingest, status, query, sources, and reindex with auth protection', async () => {
  const storagePath = tempStoragePath('api-agent1');
  const originalAdminKey = process.env.RAG_ADMIN_API_KEY;
  process.env.RAG_ADMIN_API_KEY = 'test-admin-key';
  let server: any;
  try {
    const agent1 = new OrganizationIntelligenceAgent({
      storagePath,
      useMockEmbeddings: true,
      orgId: 'hirenova',
      model: async () => 'Hirenova company knowledge answer. [S1]'
    });

    server = createApp({} as Graph, { agent1 }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    // 1. Ingest without auth header should fail (401)
    const unauthIngest = await fetch(`${base}/api/organization/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false })
    });
    assert.equal(unauthIngest.status, 401);

    // 2. Ingest with auth header should succeed
    const authIngest = await fetch(`${base}/api/organization/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-orgmind-user-id': 'admin@hirenova.test',
        'x-rag-admin-key': 'test-admin-key'
      },
      body: JSON.stringify({ force: false })
    });
    assert.equal(authIngest.status, 200);
    const ingestData = await authIngest.json() as { status: string; stats: { totalSources: number } };
    assert.equal(ingestData.status, 'completed');
    assert.ok(ingestData.stats.totalSources > 0);

    // 3. Status endpoint returns statistics
    const statusRes = await fetch(`${base}/api/organization/status`, { headers: { 'x-orgmind-user-id': 'admin@hirenova.test' } });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json() as { status: string; stats: { totalChunks: number }; agent: string };
    assert.equal(statusData.status, 'ready');
    assert.equal(statusData.agent, 'organization-intelligence');
    assert.ok(statusData.stats.totalChunks > 0);

    // 4. Query endpoint returns grounded response
    const queryRes = await fetch(`${base}/api/organization/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-orgmind-user-id': 'admin@hirenova.test' },
      body: JSON.stringify({ query: 'department Software Engineering', threshold: 0.05 })
    });
    assert.equal(queryRes.status, 200);
    const queryData = await queryRes.json() as {
      answer: string;
      sources: Array<{ title: string; sourcePath: string }>;
      retrieved_chunks: Array<{ chunkId: string; score: number }>;
      agent: string;
      status: string;
    };
    assert.equal(queryData.agent, 'organization-intelligence');
    assert.equal(queryData.status, 'completed');
    assert.ok(queryData.sources.length > 0);
    assert.ok(queryData.retrieved_chunks.length > 0);

    const ragStatusRes = await fetch(`${base}/api/rag/status`, { headers: { 'x-orgmind-user-id': 'admin@hirenova.test' } });
    assert.equal(ragStatusRes.status, 200);
    const ragStatus = await ragStatusRes.json() as { indexedChunks: number; embeddingModel: string };
    assert.ok(ragStatus.indexedChunks > 0);
    assert.equal(ragStatus.embeddingModel, 'Xenova/all-MiniLM-L6-v2');

    const noEvidenceRes = await fetch(`${base}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-orgmind-user-id': 'admin@hirenova.test' },
      body: JSON.stringify({ question: 'What is the unknown policy?', filters: { sourceTypes: [] } })
    });
    assert.equal(noEvidenceRes.status, 200);
    const noEvidence = await noEvidenceRes.json() as { evidenceFound: boolean; sources: unknown[]; retrieval: { usedChunks: number } };
    assert.equal(noEvidence.evidenceFound, false);
    assert.equal(noEvidence.retrieval.usedChunks, 0);
    assert.deepEqual(noEvidence.sources, []);

    const citedRes = await fetch(`${base}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-orgmind-user-id': 'admin@hirenova.test' },
      body: JSON.stringify({ question: 'department Software Engineering' })
    });
    assert.equal(citedRes.status, 200);
    const cited = await citedRes.json() as { sources: Array<{ citationIds: string[]; excerpt?: string; documentId: string; chunkId: string }>; answer: string };
    assert.ok(cited.sources.length > 0);
    assert.ok(cited.sources[0].documentId);
    assert.ok(cited.sources[0].chunkId);
    assert.ok(cited.sources[0].citationIds.some((id) => /^S\d+$/.test(id)));
    assert.ok(cited.sources[0].excerpt);

    const deniedAdmin = await fetch(`${base}/api/rag/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-orgmind-user-id': 'admin@hirenova.test' },
      body: JSON.stringify({})
    });
    assert.equal(deniedAdmin.status, 403);

    // 5. Sources list endpoint returns indexed sources
    const sourcesRes = await fetch(`${base}/api/organization/sources`, { headers: { 'x-orgmind-user-id': 'admin@hirenova.test' } });
    assert.equal(sourcesRes.status, 200);
    const sourcesData = await sourcesRes.json() as { sources: Array<{ path: string }>; count: number };
    assert.ok(sourcesData.count > 0);
    assert.ok(sourcesData.sources.some((s) => s.path === '/api/company' || s.path.includes('Company')));

    // 6. Reindex specific source
    const reindexRes = await fetch(`${base}/api/organization/reindex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-orgmind-user-id': 'admin@hirenova.test',
        'x-rag-admin-key': 'test-admin-key'
      },
      body: JSON.stringify({ sourcePath: '/api/company' })
    });
    assert.equal(reindexRes.status, 200);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err: any) => err ? reject(err) : resolve());
      });
    }
    if (existsSync(storagePath)) {
      try { unlinkSync(storagePath); } catch {}
    }
    if (originalAdminKey === undefined) delete process.env.RAG_ADMIN_API_KEY;
    else process.env.RAG_ADMIN_API_KEY = originalAdminKey;
  }
});
