import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Graph } from "falkordb";
import { createApp } from "../src/api/app.js";
import type { NormalizedDocument } from "../src/agents/mock-fetcher/types.js";

process.env.RAG_ADMIN_API_KEY = "test-ingestion-admin-key";
const ingestionAdminHeaders = { "Content-Type": "application/json", "x-orgmind-user-id": "demo@example.com", "x-rag-admin-key": "test-ingestion-admin-key" };

function assistantMemoryGraph() {
  const conversations = new Map<string, Record<string, unknown>>();
  const memories = new Map<string, Array<Record<string, unknown>>>();
  return { query: async (cypher: string, options?: { params?: Record<string, unknown> }) => {
    const params = options?.params ?? {};
    if (cypher.startsWith("CREATE (:AssistantConversation")) {
      conversations.set(String(params.id), { id: params.id, ownerId: params.ownerId, title: params.title, createdAt: params.now, updatedAt: params.now });
      memories.set(String(params.id), []);
      return { data: [] };
    }
    if (cypher.includes("FOREACH (memory IN $memories")) {
      const convo = conversations.get(String(params.conversationId));
      if (convo?.ownerId === params.ownerId) {
        convo.updatedAt = params.now;
        memories.get(String(params.conversationId))?.push(...(params.memories as Array<Record<string, unknown>>));
      }
      return { data: [] };
    }
    if (cypher.includes("RETURN c.id AS id LIMIT 1")) {
      const convo = conversations.get(String(params.conversationId));
      return { data: convo?.ownerId === params.ownerId ? [{ id: convo.id }] : [] };
    }
    if (cypher.includes("RETURN c.id AS id,c.title AS title")) {
      return { data: [...conversations.values()].filter((convo) => convo.ownerId === params.ownerId).map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })) };
    }
    if (cypher.includes("RETURN m.role AS role,m.content AS content,m.responseJson AS responseJson")) {
      const convo = conversations.get(String(params.conversationId));
      return { data: convo?.ownerId === params.ownerId ? (memories.get(String(params.conversationId)) ?? []).filter((memory) => memory.kind === "episodic").map(({ role, content, responseJson, createdAt }) => ({ role, content, responseJson, createdAt })) : [] };
    }
    if (cypher.includes("RETURN m.role AS role,m.content AS content ORDER BY")) {
      return { data: (memories.get(String(params.conversationId)) ?? []).filter((memory) => memory.kind === "episodic").map(({ role, content }) => ({ role, content })) };
    }
    if (cypher.includes("RETURN m.payloadJson AS payloadJson")) return { data: [] };
    return { data: [] };
  } } as unknown as Graph;
}

test("CORS allows the local frontend origins and answers preflight requests", async () => {
  const server = createApp({} as Graph).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/company`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");

    const rejectedOrigin = await fetch(`http://127.0.0.1:${address.port}/api/company`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.example",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(rejectedOrigin.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("assistant conversations persist and remain isolated by workspace identity", async () => {
  const server = createApp(assistantMemoryGraph()).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "Content-Type": "application/json", "x-orgmind-user-id": "owner@example.com" };
  try {
    const unauthenticated = await fetch(`${base}/api/assistant/conversations`);
    assert.equal(unauthenticated.status, 401);
    const asked = await fetch(`${base}/api/assistant/query`, { method: "POST", headers, body: JSON.stringify({ question: "Give me a company overview." }) });
    assert.equal(asked.status, 200);
    const response = await asked.json() as { conversationId: string; answer: { title: string } };
    assert.ok(response.conversationId);
    assert.equal(response.answer.title, "Company overview");

    const ownList = await fetch(`${base}/api/assistant/conversations`, { headers: { "x-orgmind-user-id": "owner@example.com" } });
    const ownConversations = await ownList.json() as { conversations: Array<{ id: string }> };
    assert.equal(ownConversations.conversations.length, 1);
    assert.equal(ownConversations.conversations[0].id, response.conversationId);

    const otherList = await fetch(`${base}/api/assistant/conversations`, { headers: { "x-orgmind-user-id": "different@example.com" } });
    assert.deepEqual((await otherList.json() as { conversations: unknown[] }).conversations, []);
    const privateConversation = await fetch(`${base}/api/assistant/conversations/${response.conversationId}`, { headers: { "x-orgmind-user-id": "different@example.com" } });
    assert.equal(privateConversation.status, 404);

    const history = await fetch(`${base}/api/assistant/conversations/${response.conversationId}`, { headers: { "x-orgmind-user-id": "owner@example.com" } });
    const turns = await history.json() as { turns: Array<{ role: string; response?: unknown }> };
    assert.deepEqual(turns.turns.map((turn) => turn.role), ["user", "assistant"]);
    assert.ok(turns.turns[1].response);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Product Progress endpoints validate payloads and keep graph data scoped", async () => {
  const graph = { query: async (cypher: string) => cypher.includes('MATCH (n)-[r:') ? { data: [
    { n: { id: 1, labels: ['Product'], properties: { id: 'product-orbit', graphDomain: 'product-progress' } }, m: { id: 2, labels: ['Employee'], properties: { id: 'emp-01', graphDomain: 'organization' } }, r: { id: 3, relationshipType: 'OWNED_BY', sourceId: 1, destinationId: 2, properties: { graphDomain: 'product-progress' } } }
  ] } : { data: [] } } as never;
  const app = createApp(graph);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const graphResponse = await fetch(`http://127.0.0.1:${address.port}/api/product-progress/graph`);
    assert.equal(graphResponse.status, 200);
    const graphPayload = await graphResponse.json() as { nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string }> };
    assert.deepEqual(graphPayload.nodes.map((node) => node.id), ['product-orbit', 'emp-01']);
    assert.deepEqual(graphPayload.edges[0], { id: 'OWNED_BY:product-orbit:emp-01', type: 'OWNED_BY', source: 'product-orbit', target: 'emp-01', properties: { graphDomain: 'product-progress' } });

    const invalid = await fetch(`http://127.0.0.1:${address.port}/api/product-progress/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    assert.equal(invalid.status, 400);
    const processed = await fetch(`http://127.0.0.1:${address.port}/api/product-progress/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'PR #142 was merged.' }) });
    assert.equal(processed.status, 200);
    const payload = await processed.json() as { eventType: string; unresolvedReferences: Array<{ text: string }> };
    assert.equal(payload.eventType, 'feature-update');
    assert.equal(payload.unresolvedReferences[0].text, '142');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Product Progress API returns consistent database errors", async () => {
  const app = createApp({ query: async () => { throw new Error('database unavailable'); } } as never);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/product-progress/graph`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Product Progress graph unavailable' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("graph neighborhood accepts Product Progress entity labels", async () => {
  const graph = { query: async () => ({ data: [{
    start: { id: 1, labels: ["Product"], properties: { id: "product-orbit", name: "Orbit" } },
    n: { id: 2, labels: ["Ticket"], properties: { id: "ticket-retry", title: "Retry policy" } },
    startType: "Product", entityType: "Ticket", relationship: "HAS_TICKET",
    relationshipStart: { id: "product-orbit" }, relationshipEnd: { id: "ticket-retry" },
  }] }) } as never;
  const server = createApp(graph).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/graph/neighborhood/Product/product-orbit`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { nodes: Array<{ id: string; entityType: string }>; edges: Array<{ type: string; direction: string }> };
    assert.deepEqual(payload.nodes.map((node) => [node.id, node.entityType]), [["product-orbit", "Product"], ["ticket-retry", "Ticket"]]);
    assert.deepEqual(payload.edges.map((edge) => [edge.type, edge.direction]), [["HAS_TICKET", "outgoing"]]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

const ingestionDocument: NormalizedDocument = { sourceSystem: 'jira', sourceRecordId: 'JIRA-1', title: 'Bug', content: 'Bug: timeout', provenance: 'external-verified', synthetic: false, metadata: {} };
const startIngestionServer = async (ingestion: Parameters<typeof createApp>[1]['ingestion'], graph: Graph = { query: async () => ({ data: [] }) } as unknown as Graph) => {
  const server = createApp(graph, { ingestion }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}/api/ingestion/process` };
};

test("integration status returns safe config, verified counts, and recent sync history", async () => {
  const graph = { query: async (cypher: string, options?: { params?: Record<string, unknown> }) => cypher.includes('IntegrationSyncRun')
    ? { data: options?.params?.source === 'jira' ? [{ r: { properties: { id: 'run-1', source: 'jira', startedAt: '2026-10-18T00:00:00.000Z', finishedAt: '2026-10-18T00:00:01.000Z', status: 'failed', fetched: 4, processed: 0, failed: 0, unresolved: 0, skipped: 0, errorCode: 'fixture-data', errorMessage: 'The connector returned seeded fixture records; nothing was written.' } } }] : [] }
    : { data: [{ total: options?.params?.source === 'jira' ? 7 : 0 }] } } as unknown as Graph;
  const server = createApp(graph).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/integrations/status`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { sources: Array<{ source: string; indexedRecords: number; connectorConfigured: boolean; lastSuccessfulSync: string | null; lastAttemptedSync: string | null; connectionStatus: string; history: Array<{ fetched: number; error: string | null }>; browserSyncAvailable: boolean }>; syncHistoryAvailable: boolean };
    assert.equal(payload.sources.length, 4);
    assert.equal(payload.sources.find((item) => item.source === 'jira')?.indexedRecords, 7);
    const jira = payload.sources.find((item) => item.source === 'jira');
    assert.equal(jira?.connectionStatus, 'fixture-data');
    assert.equal(jira?.lastSuccessfulSync, null);
    assert.equal(jira?.lastAttemptedSync, '2026-10-18T00:00:01.000Z');
    assert.equal(jira?.history[0]?.fetched, 4);
    assert.match(jira?.history[0]?.error ?? '', /seeded fixture/);
    assert.ok(payload.sources.every((item) => item.browserSyncAvailable === false));
    assert.equal(payload.syncHistoryAvailable, true);
    assert.equal(JSON.stringify(payload).includes('test-ingestion-admin-key'), false);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("provider synchronization rejects missing identity or admin credentials", async () => {
  let fetched = false;
  const { server, url } = await startIngestionServer({ fetcher: async () => { fetched = true; return { source: 'jira', documents: [] }; }, processor: async () => [] });
  try {
    const noIdentity = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rag-admin-key': 'test-ingestion-admin-key' }, body: JSON.stringify({ source: 'jira' }) });
    assert.equal(noIdentity.status, 401);
    const noAdminKey = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orgmind-user-id': 'demo@example.com' }, body: JSON.stringify({ source: 'jira' }) });
    assert.equal(noAdminKey.status, 403);
    assert.equal(fetched, false);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("ingestion API processes fetched documents and returns outcomes", async () => {
  const runs: Record<string, unknown>[] = [];
  const graph = { query: async (cypher: string, options?: { params?: Record<string, unknown> }) => {
    if (cypher.includes('CREATE (r:IntegrationSyncRun)')) { runs.push(options?.params?.properties as Record<string, unknown>); return { data: [] }; }
    if (cypher.includes('IntegrationSyncRun')) return { data: runs.map((run) => ({ r: { properties: run } })) };
    return { data: [{ total: 0 }] };
  } } as unknown as Graph;
  const { server, url } = await startIngestionServer({
    fetcher: async () => ({ source: 'jira', documents: [ingestionDocument] }),
    processor: async () => [{ sourceSystem: 'jira', sourceRecordId: 'JIRA-1', status: 'processed', route: 'ticket-identification', unresolvedReferences: [] }]
  }, graph);
  try {
    const response = await fetch(url, { method: 'POST', headers: ingestionAdminHeaders, body: JSON.stringify({ source: 'jira', limit: 1 }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'processed', source: 'jira', fetchedDocumentCount: 1, excludedSyntheticCount: 0, outcomes: [{ sourceSystem: 'jira', sourceRecordId: 'JIRA-1', status: 'processed', route: 'ticket-identification', unresolvedReferences: [] }], errors: [] });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].fetched, 1);
    assert.equal(runs[0].processed, 1);
    assert.equal(runs[0].excludedSynthetic, 0);
    const statusResponse = await fetch(url.replace('/api/ingestion/process', '/api/integrations/status'));
    const status = await statusResponse.json() as { sources: Array<{ source: string; connectionStatus: string; history: Array<{ processed: number }> }> };
    const jiraStatus = status.sources.find((item) => item.source === 'jira');
    assert.equal(jiraStatus?.connectionStatus, 'available');
    assert.equal(jiraStatus?.history[0]?.processed, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("ingestion API reports fixture counts and refuses to persist seeded rows", async () => {
  const { server, url } = await startIngestionServer({ fetcher: async () => ({ source: 'jira', documents: [{ ...ingestionDocument, provenance: 'synthetic', synthetic: true }] }), processor: async () => { throw new Error('Synthetic records must not reach persistence.'); } });
  try {
    const response = await fetch(url, { method: 'POST', headers: ingestionAdminHeaders, body: JSON.stringify({ source: 'jira', limit: 1 }) });
    assert.equal(response.status, 503);
    const payload = await response.json() as { status: string; fetchedDocumentCount: number; excludedSyntheticCount: number; outcomes: unknown[]; errors: string[] };
    assert.equal(payload.status, 'failed');
    assert.equal(payload.fetchedDocumentCount, 1);
    assert.equal(payload.excludedSyntheticCount, 1);
    assert.deepEqual(payload.outcomes, []);
    assert.match(payload.errors[0], /seeded fixture/);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("ingestion API handles empty results and rejects arbitrary URLs", async () => {
  let processed = false;
  const { server, url } = await startIngestionServer({ fetcher: async () => ({ source: 'slack', documents: [] }), processor: async () => { processed = true; return []; } });
  try {
    const empty = await fetch(url, { method: 'POST', headers: ingestionAdminHeaders, body: JSON.stringify({ source: 'slack' }) });
    assert.equal(empty.status, 200); assert.equal((await empty.json()).status, 'empty'); assert.equal(processed, false);
    const invalid = await fetch(url, { method: 'POST', headers: ingestionAdminHeaders, body: JSON.stringify({ source: 'jira', url: 'https://example.test' }) });
    assert.equal(invalid.status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("ingestion API returns sanitized fetch and database failures", async () => {
  const fetchServer = await startIngestionServer({ fetcher: async () => { throw new Error('token=secret https://tunnel.example failed'); }, processor: async () => [] });
  try {
    const response = await fetch(fetchServer.url, { method: 'POST', headers: ingestionAdminHeaders, body: JSON.stringify({ source: 'github' }) });
    assert.equal(response.status, 503); assert.deepEqual((await response.json()).errors, ['Mock API fetch failed.']);
  } finally { await new Promise<void>((resolve, reject) => fetchServer.server.close((error) => error ? reject(error) : resolve())); }
  const dbServer = await startIngestionServer({ fetcher: async () => ({ source: 'jira', documents: [ingestionDocument] }), processor: async () => { throw new Error('FalkorDB password=secret unavailable'); } });
  try {
    const response = await fetch(dbServer.url, { method: 'POST', headers: ingestionAdminHeaders, body: JSON.stringify({ source: 'jira' }) });
    assert.equal(response.status, 503); assert.deepEqual((await response.json()).errors, ['Document processing failed.']);
  } finally { await new Promise<void>((resolve, reject) => dbServer.server.close((error) => error ? reject(error) : resolve())); }
});
