export interface EmbeddingOptions {
  useMock?: boolean;
}

export const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;
const DEFAULT_BATCH_SIZE = 16;

export function deterministicOfflineEmbedding(text: string, dimension = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimension).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const word of words) {
    let hash = 5381;
    for (let i = 0; i < word.length; i++) hash = ((hash << 5) + hash + word.charCodeAt(i)) & 0x7fffffff;
    vector[hash % dimension] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm) for (let i = 0; i < dimension; i++) vector[i] /= norm;
  return vector;
}

type PipelineOutput = { data?: ArrayLike<number>; tolist?: () => unknown };
type FeaturePipeline = (input: string | string[], options: { pooling: 'mean'; normalize: true }) => Promise<PipelineOutput>;
let pipelinePromise: Promise<FeaturePipeline> | undefined;

async function getPipeline(): Promise<FeaturePipeline> {
  pipelinePromise ??= (async () => {
    // Loaded dynamically so tests can use deterministic embeddings without downloading model assets.
    const moduleName = '@huggingface/transformers';
    const transformers = await import(moduleName) as { pipeline: (task: string, model: string) => Promise<FeaturePipeline> };
    return transformers.pipeline('feature-extraction', DEFAULT_EMBEDDING_MODEL);
  })().catch((error) => {
    pipelinePromise = undefined;
    throw new Error(`Embedding model initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  });
  return pipelinePromise;
}

export class GeminiEmbeddingService {
  readonly model = DEFAULT_EMBEDDING_MODEL;
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly useMock: boolean;

  constructor(options: EmbeddingOptions = {}) {
    this.useMock = options.useMock ?? (process.env.RAG_EMBEDDING_PROVIDER === 'offline' || process.env.NODE_ENV === 'test');
  }

  async embedText(text: string, dimension = EMBEDDING_DIMENSIONS): Promise<number[]> {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Embedding input must be a non-empty string.');
    if (dimension !== EMBEDDING_DIMENSIONS) throw new Error(`Embedding dimension must be ${EMBEDDING_DIMENSIONS}.`);
    if (this.useMock) return deterministicOfflineEmbedding(text, dimension);
    const result = await (await getPipeline())(text, { pooling: 'mean', normalize: true });
    const values = result.tolist?.();
    const vector = Array.isArray(values) ? values.flat(Infinity) as number[] : Array.from(result.data ?? []);
    if (vector.length !== dimension || vector.some((value) => !Number.isFinite(value))) throw new Error('Embedding provider returned a malformed vector.');
    return vector;
  }

  async embedBatch(texts: string[], batchSize = DEFAULT_BATCH_SIZE): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string' || !text.trim())) throw new Error('Embedding batch must contain non-empty strings.');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 64) throw new Error('Embedding batch size must be between 1 and 64.');
    const results: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);
      if (this.useMock) results.push(...batch.map((text) => deterministicOfflineEmbedding(text)));
      else {
        const output = await (await getPipeline())(batch, { pooling: 'mean', normalize: true });
        const values = output.tolist?.();
        if (!Array.isArray(values) || values.length !== batch.length) throw new Error('Embedding provider returned a malformed batch.');
        const vectors = values.map((value) => Array.isArray(value) ? value.flat(Infinity) as number[] : []);
        if (vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS || vector.some((item) => !Number.isFinite(item)))) throw new Error('Embedding provider returned invalid batch dimensions.');
        results.push(...vectors);
      }
    }
    return results;
  }
}
