import { modelInstanceConfig } from './config.js';
import type { ModelInstanceConfig } from './config.js';

export class ModelProviderError extends Error {
  constructor(message: string, public readonly code: 'missing-credentials' | 'rate-limit' | 'provider-failure' | 'malformed-response', public readonly retryable = false) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

type ChatResponse = { choices?: Array<{ message?: { content?: unknown } }> };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };

export function createModel(config: ModelInstanceConfig) {
  if (config.provider === 'disabled') return undefined;
  const apiKey = config.apiKey;
  if (!apiKey) throw new ModelProviderError(`Credentials are missing for model instance ${config.name}`, 'missing-credentials');
  return async (systemPrompt: string, userPrompt: string): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const isGemini = config.provider === 'gemini';
      const endpoint = isGemini
        ? `${config.baseUrl}/models/${encodeURIComponent(config.modelId)}:generateContent`
        : `${config.baseUrl}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(isGemini ? { 'x-goog-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }) },
        body: JSON.stringify(isGemini
          ? { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: { temperature: config.temperature, responseMimeType: 'application/json', maxOutputTokens: 800 } }
          : { model: config.modelId, temperature: config.temperature, max_tokens: 800, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
        signal: controller.signal
      });
      if (response.status === 429) throw new ModelProviderError('Model provider rate limit', 'rate-limit', true);
      if (!response.ok) {
        const errorPayload = await response.clone().json().catch(() => null) as { message?: unknown; __type?: unknown; code?: unknown } | null;
        const headerCode = response.headers.get('x-amzn-errortype')?.split(':')[0];
        const providerCode = headerCode ? ` (${headerCode})`
          : typeof errorPayload?.code === 'string' ? ` (${errorPayload.code})`
            : typeof errorPayload?.__type === 'string' ? ` (${errorPayload.__type})` : '';
        const providerMessage = typeof errorPayload?.message === 'string' ? `: ${errorPayload.message}` : '';
        throw new ModelProviderError(`Model provider request failed with status ${response.status}${providerCode}${providerMessage}`, 'provider-failure', response.status >= 500);
      }
      const payload = await response.json() as ChatResponse & GeminiResponse;
      const content = isGemini
        ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text).filter((part): part is string => typeof part === 'string').join('')
        : payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ModelProviderError('Model provider returned a malformed response', 'malformed-response');
      return content;
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ModelProviderError('Model provider request timed out', 'provider-failure', true);
      throw new ModelProviderError('Model provider request failed', 'provider-failure', true);
    } finally { clearTimeout(timeout); }
  };
}

export function configuredModel(name: 'default' | 'ticket-identification' | 'feature-update') {
  const config = modelInstanceConfig(name);
  if (config.provider === 'disabled' || !config.apiKey) return undefined;
  return async (systemPrompt: string, userPrompt: string) => createModel(config)!(systemPrompt, userPrompt);
}
