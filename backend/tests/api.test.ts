import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Graph } from "falkordb";
import { createApp } from "../src/api/app.js";

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
