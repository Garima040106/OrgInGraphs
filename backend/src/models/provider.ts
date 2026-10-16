import { modelInstanceConfig } from './config.js';
import type { ModelInstanceConfig } from './config.js';

export class ModelProviderError extends Error {
  constructor(message: string, public readonly code: 'missing-credentials' | 'rate-limit' | 'provider-failure' | 'malformed-response', public readonly retryable = false) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

type ChatResponse = { choices?: Array<{ message?: { content?: unknown } }> };

export function createModel(config: ModelInstanceConfig) {
  if (config.provider === 'disabled') return undefined;
  if (!config.apiKey) throw new ModelProviderError(`Credentials are missing for model instance ${config.name}`, 'missing-credentials');
  return async (systemPrompt: string, userPrompt: string): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.modelId, temperature: config.temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
        signal: controller.signal
      });
      if (response.status === 429) throw new ModelProviderError('Model provider rate limit', 'rate-limit', true);
      if (!response.ok) throw new ModelProviderError(`Model provider request failed with status ${response.status}`, 'provider-failure', response.status >= 500);
      const payload = await response.json() as ChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ModelProviderError('Model provider returned a malformed response', 'malformed-response');
      return content;
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ModelProviderError('Model provider request timed out', 'provider-failure', true);
      throw new ModelProviderError('Model provider request failed', 'provider-failure', true);
    } finally { clearTimeout(timeout); }
  };
}

export function configuredModel(name: 'ticket-identification' | 'feature-update') {
  const config = modelInstanceConfig(name);
  if (config.provider === 'disabled' || !config.apiKey) return undefined;
  return async (systemPrompt: string, userPrompt: string) => createModel(config)!(systemPrompt, userPrompt);
}
