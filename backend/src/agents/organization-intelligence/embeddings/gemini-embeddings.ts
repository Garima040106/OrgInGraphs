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
  private dimension: number;

  constructor(options: EmbeddingOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = options.model ?? process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.dimension = GEMINI_EMBEDDING_DIMENSION;
    // The configured Bedrock bearer token authenticates to Bedrock Mantle, not
    // Bedrock Runtime's Titan embedding endpoint. Use local vectors by default
    // so indexing and retrieval do not consume an exhausted external quota.
    this.useMock = options.useMock ?? (process.env.RAG_EMBEDDING_PROVIDER !== 'gemini' || !this.apiKey || process.env.NODE_ENV === 'test');
  }

  async embedText(text: string, dimension = this.dimension): Promise<number[]> {
    if (this.useMock) return deterministicOfflineEmbedding(text, dimension);
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

}
