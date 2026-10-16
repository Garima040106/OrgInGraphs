import assert from 'node:assert/strict';
import test from 'node:test';
import { modelInstanceConfig, parseModelEnvironment } from '../src/models/config.js';
import { ModelProviderError, createModel } from '../src/models/provider.js';

test('model configuration defaults to disabled deterministic processing', () => {
  const env = parseModelEnvironment({});
  assert.equal(env.MODEL_PROVIDER, 'disabled');
  assert.equal(modelInstanceConfig('ticket-identification', {}).modelId, 'gpt-4o-mini');
  assert.equal(modelInstanceConfig('feature-update', {}).temperature, 0);
});

test('model instances can override IDs and temperatures without exposing credentials', () => {
  const config = modelInstanceConfig('ticket-identification', {
    MODEL_PROVIDER: 'openai-compatible', MODEL_BASE_URL: 'https://models.example.test/v1', MODEL_API_KEY: 'test-secret',
    MODEL_DEFAULT_ID: 'general-model', MODEL_TICKET_ID: 'ticket-model', MODEL_TICKET_TEMPERATURE: '0.2', MODEL_TIMEOUT_MS: '5000'
  });
  assert.deepEqual({ name: config.name, provider: config.provider, baseUrl: config.baseUrl, modelId: config.modelId, temperature: config.temperature, timeoutMs: config.timeoutMs }, {
    name: 'ticket-identification', provider: 'openai-compatible', baseUrl: 'https://models.example.test/v1', modelId: 'ticket-model', temperature: 0.2, timeoutMs: 5000
  });
  assert.equal((config as { password?: string }).password, undefined);
});

test('missing credentials and provider failures are represented without logging secrets', async () => {
  assert.throws(() => createModel({ name: 'default', provider: 'openai-compatible', baseUrl: 'https://example.test/v1', modelId: 'x', temperature: 0, timeoutMs: 1000 }), (error: unknown) => error instanceof ModelProviderError && error.code === 'missing-credentials');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  try {
    const model = createModel({ name: 'default', provider: 'openai-compatible', baseUrl: 'https://example.test/v1', apiKey: 'secret-not-printed', modelId: 'x', temperature: 0, timeoutMs: 1000 });
    await assert.rejects(() => model!('system', 'user'), (error: unknown) => error instanceof ModelProviderError && error.code === 'rate-limit' && error.retryable);
  } finally { globalThis.fetch = originalFetch; }
});
