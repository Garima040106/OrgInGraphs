import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Graph } from "falkordb";
import { createApp } from "../src/api/app.js";
import type { NormalizedDocument } from "../src/agents/mock-fetcher/types.js";

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
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET,OPTIONS");

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

const ingestionDocument: NormalizedDocument = { sourceSystem: 'jira', sourceRecordId: 'JIRA-1', title: 'Bug', content: 'Bug: timeout', provenance: 'synthetic', synthetic: true, metadata: {} };
const startIngestionServer = async (ingestion: Parameters<typeof createApp>[1]['ingestion']) => {
  const server = createApp({} as Graph, { ingestion }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}/api/ingestion/process` };
};

test("ingestion API processes fetched documents and returns outcomes", async () => {
  const { server, url } = await startIngestionServer({
    fetcher: async () => ({ source: 'jira', documents: [ingestionDocument] }),
    processor: async () => [{ sourceSystem: 'jira', sourceRecordId: 'JIRA-1', status: 'processed', route: 'ticket-identification', unresolvedReferences: [] }]
  });
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'jira', limit: 1 }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'processed', source: 'jira', fetchedDocumentCount: 1, outcomes: [{ sourceSystem: 'jira', sourceRecordId: 'JIRA-1', status: 'processed', route: 'ticket-identification', unresolvedReferences: [] }], errors: [] });
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("ingestion API handles empty results and rejects arbitrary URLs", async () => {
  let processed = false;
  const { server, url } = await startIngestionServer({ fetcher: async () => ({ source: 'slack', documents: [] }), processor: async () => { processed = true; return []; } });
  try {
    const empty = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'slack' }) });
    assert.equal(empty.status, 200); assert.equal((await empty.json()).status, 'empty'); assert.equal(processed, false);
    const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'jira', url: 'https://example.test' }) });
    assert.equal(invalid.status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("ingestion API returns sanitized fetch and database failures", async () => {
  const fetchServer = await startIngestionServer({ fetcher: async () => { throw new Error('token=secret https://tunnel.example failed'); }, processor: async () => [] });
  try {
    const response = await fetch(fetchServer.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'github' }) });
    assert.equal(response.status, 503); assert.deepEqual((await response.json()).errors, ['Mock API fetch failed.']);
  } finally { await new Promise<void>((resolve, reject) => fetchServer.server.close((error) => error ? reject(error) : resolve())); }
  const dbServer = await startIngestionServer({ fetcher: async () => ({ source: 'jira', documents: [ingestionDocument] }), processor: async () => { throw new Error('FalkorDB password=secret unavailable'); } });
  try {
    const response = await fetch(dbServer.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'jira' }) });
    assert.equal(response.status, 503); assert.deepEqual((await response.json()).errors, ['Document processing failed.']);
  } finally { await new Promise<void>((resolve, reject) => dbServer.server.close((error) => error ? reject(error) : resolve())); }
});
