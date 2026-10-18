import assert from 'node:assert/strict';
import test from 'node:test';
import { BedrockService } from '../src/services/bedrock.service.js';
import { EmbeddingService } from '../src/services/embedding.service.js';

test('MiniLM embedding contract rejects empty values and returns normalized 384 dimensions in offline tests', async () => {
  const embeddings = new EmbeddingService({ useMock: true });
  await assert.rejects(() => embeddings.embedText('  '), /non-empty/);
  const vector = await embeddings.embedText('reliable company documentation');
  assert.equal(vector.length, 384);
  assert.ok(vector.every(Number.isFinite));
  assert.ok(Math.abs(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) - 1) < 1e-8);
});

test('Bedrock service uses configured OpenAI-compatible model and returns answer text', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  let requestUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Grounded answer [S1]' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const service = new BedrockService({ apiKey: 'test-token', baseURL: 'https://bedrock.example/v1', model: 'openai.gpt-oss-120b' });
    assert.equal(await service.generate('system', 'question'), 'Grounded answer [S1]');
    assert.equal(requestUrl, 'https://bedrock.example/v1/chat/completions');
    assert.equal(requestBody?.model, 'openai.gpt-oss-120b');
  } finally { globalThis.fetch = originalFetch; }
});

test('Bedrock authentication failures do not retry or expose provider response bodies', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ error: { message: 'private provider detail' } }), { status: 401 }); }) as typeof fetch;
  try {
    const service = new BedrockService({ apiKey: 'test-token', baseURL: 'https://bedrock.example/v1' });
    await assert.rejects(() => service.generate('system', 'question'), /rejected the configured credentials/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('Bedrock rate limit gets bounded retries and then succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return calls < 3
      ? new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'retry-after': '0' } })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'Recovered [S1]' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const service = new BedrockService({ apiKey: 'test-token', baseURL: 'https://bedrock.example/v1' });
    assert.equal(await service.generate('system', 'question'), 'Recovered [S1]');
    assert.equal(calls, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test('Bedrock retries transient connection timeouts a bounded number of times', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    const error = new Error('socket timed out');
    error.name = 'APIConnectionTimeoutError';
    throw error;
  }) as typeof fetch;
  try {
    const service = new BedrockService({ apiKey: 'test-token', baseURL: 'https://bedrock.example/v1', timeoutMs: 100 });
    await assert.rejects(() => service.generate('system', 'question'), /controlled retries/);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = originalFetch; }
});
