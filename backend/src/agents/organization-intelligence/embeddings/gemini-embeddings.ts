import { createHash } from 'node:crypto';

export interface EmbeddingOptions {
  apiKey?: string;
  bedrockBearerToken?: string;
  model?: string;
  baseUrl?: string;
  useMock?: boolean;
}

export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const GEMINI_EMBEDDING_DIMENSION = 3072;
const BEDROCK_EMBEDDING_DIMENSION = 1024;

export function deterministicOfflineEmbedding(text: string, dimension = GEMINI_EMBEDDING_DIMENSION): number[] {
  const vector = new Array<number>(dimension).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let h = 5381;
    for (let c = 0; c < word.length; c++) {
      h = ((h << 5) + h) + word.charCodeAt(c);
      h = h & 0x7fffffff;
    }
    const idx = h % dimension;
    vector[idx] += 2.0;

    const h2 = (h * 31 + 17) % dimension;
    vector[h2] += 1.0;
  }

  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      vector[i] /= norm;
    }
  } else {
    vector[0] = 1;
  }

  return vector;
}

export class GeminiEmbeddingService {
  private apiKey?: string;
  private model: string;
  private baseUrl: string;
  private useMock: boolean;
  private bedrockBearerToken?: string;
  private bedrockBaseUrl: string;
  private dimension: number;

  constructor(options: EmbeddingOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = options.model ?? process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.bedrockBearerToken = options.bedrockBearerToken ?? process.env.AWS_BEARER_TOKEN_BEDROCK;
    const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
    this.bedrockBaseUrl = `https://bedrock-runtime.${region}.amazonaws.com`;
    this.dimension = this.bedrockBearerToken ? BEDROCK_EMBEDDING_DIMENSION : GEMINI_EMBEDDING_DIMENSION;
    this.useMock = options.useMock ?? ((!this.apiKey && !this.bedrockBearerToken) || process.env.NODE_ENV === 'test');
  }

  async embedText(text: string, dimension = this.dimension): Promise<number[]> {
    if (this.useMock) return deterministicOfflineEmbedding(text, dimension);
    if (dimension === BEDROCK_EMBEDDING_DIMENSION && this.bedrockBearerToken) return this.embedBedrock(text);
    if (!this.apiKey) return deterministicOfflineEmbedding(text, dimension);

    const cleanModel = this.model.startsWith('models/') ? this.model : `models/${this.model}`;
    const url = `${this.baseUrl}/${cleanModel}:embedContent`;

    let retries = 3;
    let delay = 1000;

    while (retries > 0) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey
          },
          body: JSON.stringify({
            content: { parts: [{ text }] }
          })
        });

        if (response.status === 429) {
          retries--;
          if (retries === 0) break;
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Gemini embedding failed with status ${response.status}`);
        }

        const data = await response.json() as { embedding?: { values?: number[] } };
        if (data.embedding?.values && Array.isArray(data.embedding.values)) {
          return data.embedding.values;
        }

        throw new Error('Malformed embedding response from Gemini');
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.warn('Gemini embedding error, falling back to deterministic offline embedding:', error);
          return deterministicOfflineEmbedding(text);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    return deterministicOfflineEmbedding(text);
  }

  async embedBatch(texts: string[], batchSize = 25): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.bedrockBearerToken && !this.useMock) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += 5) {
        vectors.push(...await Promise.all(texts.slice(i, i + 5).map((text) => this.embedBedrock(text))));
      }
      return vectors;
    }
    if (this.useMock || !this.apiKey) {
      return texts.map((t) => deterministicOfflineEmbedding(t, this.dimension));
    }

    const results: number[][] = [];
    const cleanModel = this.model.startsWith('models/') ? this.model : `models/${this.model}`;
    const url = `${this.baseUrl}/${cleanModel}:batchEmbedContents`;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      let retries = 3;
      let delay = 1000;
      let batchSuccess = false;

      while (retries > 0 && !batchSuccess) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey
            },
            body: JSON.stringify({
              requests: batch.map((text) => ({
                model: cleanModel,
                content: { parts: [{ text }] }
              }))
            })
          });

          if (response.status === 429) {
            retries--;
            if (retries === 0) break;
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }

          if (!response.ok) {
            throw new Error(`Batch embedding failed with status ${response.status}`);
          }

          const data = await response.json() as { embeddings?: Array<{ values?: number[] }> };
          if (data.embeddings && Array.isArray(data.embeddings)) {
            for (let j = 0; j < batch.length; j++) {
              const vals = data.embeddings[j]?.values;
              results.push(vals && Array.isArray(vals) ? vals : deterministicOfflineEmbedding(batch[j]));
            }
            batchSuccess = true;
          } else {
            throw new Error('Malformed batch embedding response');
          }
        } catch {
          retries--;
          if (retries === 0) {
            // Fallback for this batch
            for (const text of batch) {
              results.push(deterministicOfflineEmbedding(text));
            }
            batchSuccess = true;
          } else {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      }
    }

    return results;
  }

  private async embedBedrock(text: string): Promise<number[]> {
    if (!this.bedrockBearerToken) return deterministicOfflineEmbedding(text, this.dimension);
    const model = 'amazon.titan-embed-text-v2:0';
    const response = await fetch(`${this.bedrockBaseUrl}/model/${encodeURIComponent(model)}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.bedrockBearerToken}` },
      body: JSON.stringify({ inputText: text, dimensions: BEDROCK_EMBEDDING_DIMENSION, normalize: true })
    });
    if (!response.ok) throw new Error(`Bedrock embedding request failed with status ${response.status}`);
    const payload = await response.json() as { embedding?: unknown };
    if (!Array.isArray(payload.embedding) || !payload.embedding.every((value) => typeof value === 'number')) {
      throw new Error('Bedrock returned a malformed embedding response');
    }
    return payload.embedding as number[];
  }
}
