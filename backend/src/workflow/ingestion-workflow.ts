import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { runMockFetcher } from '../agents/mock-fetcher/agent.js';
import { mockSources, normalizedDocumentSchema, type MockFetcherRequest, type NormalizedDocument } from '../agents/mock-fetcher/types.js';
import { processDocuments } from '../agents/document-processor/agent.js';
import type { DocumentOutcome, DocumentProcessorOptions } from '../agents/document-processor/types.js';
import { env } from '../config/env.js';

export const ingestionRequestSchema = z.object({ source: z.enum(mockSources), limit: z.number().int().min(1).max(100).optional() }).strict();
export type IngestionStatus = 'received' | 'failed' | 'fetched' | 'processed' | 'empty';
export type IngestionRequest = MockFetcherRequest;
export interface IngestionResult { status: IngestionStatus; source?: string; documents: NormalizedDocument[]; outcomes: DocumentOutcome[]; errors: string[]; }

const replace = <T>(defaultValue: () => T) => Annotation<T>({ reducer: (_left, right) => right, default: defaultValue });

const IngestionState = Annotation.Root({
  request: Annotation<IngestionRequest>(),
  documents: replace<NormalizedDocument[]>(() => []),
  outcomes: replace<DocumentOutcome[]>(() => []),
  status: replace<IngestionStatus>(() => 'received'),
  errors: replace<string[]>(() => [])
});
export type IngestionGraphState = typeof IngestionState.State;

export interface IngestionWorkflowDependencies {
  fetcher?: (request: IngestionRequest) => Promise<{ source: string; documents: NormalizedDocument[] }>;
  processor?: (documents: NormalizedDocument[]) => Promise<DocumentOutcome[]>;
  processorOptions?: DocumentProcessorOptions;
}

function safeError(error: unknown, fallback: string) { return error instanceof Error && error.message && !/password|token|secret|authorization|https?:\/\//i.test(error.message) ? error.message : fallback; }

export function createIngestionWorkflow(dependencies: IngestionWorkflowDependencies = {}) {
  const fetcher = dependencies.fetcher ?? ((request: IngestionRequest) => runMockFetcher(request));
  const processor = dependencies.processor ?? ((documents: NormalizedDocument[]) => processDocuments(documents, dependencies.processorOptions));
  const graph = new StateGraph(IngestionState)
    .addNode('validate', async (state) => {
      const result = ingestionRequestSchema.safeParse(state.request);
      if (!result.success) return { status: 'failed' as const, errors: ['Ingestion request is invalid.'] };
      if (!dependencies.fetcher && !env.MOCK_API_BASE_URL) return { status: 'failed' as const, errors: ['Mock API is not configured.'] };
      return { request: result.data, status: 'received' as const, errors: [] };
    })
    .addNode('fetch', async (state) => {
      if (state.status === 'failed') return {};
      try {
        const result = await fetcher(state.request);
        if (result.source !== state.request.source) return { status: 'failed' as const, errors: ['Source connector returned records for a different source.'] };
        const validated = z.array(normalizedDocumentSchema).safeParse(result.documents);
        if (!validated.success || validated.data.some((document) => document.sourceSystem !== result.source)) return { status: 'failed' as const, errors: ['Fetched records failed the normalized ingestion schema.'] };
        return validated.data.length ? { documents: validated.data, status: 'fetched' as const, errors: [] } : { documents: [], status: 'empty' as const, errors: [] };
      } catch (error) { return { status: 'failed' as const, errors: [safeError(error, 'Mock API fetch failed.')] }; }
    })
    .addNode('process', async (state) => {
      if (state.status !== 'fetched' || !state.documents.length) return {};
      try { return { outcomes: await processor(state.documents), status: 'processed' as const }; }
      catch (error) { return { status: 'failed' as const, errors: [safeError(error, 'Document processing failed.')] }; }
    })
    .addNode('finish', async (state) => ({ status: state.status }))
    .addEdge(START, 'validate')
    .addEdge('validate', 'fetch')
    .addConditionalEdges('fetch', (state) => state.status === 'fetched' ? 'process' : 'finish', { process: 'process', finish: 'finish' })
    .addEdge('process', 'finish')
    .addEdge('finish', END);
  return graph.compile();
}

export async function runIngestionWorkflow(request: unknown, dependencies: IngestionWorkflowDependencies = {}): Promise<IngestionResult> {
  const result = await createIngestionWorkflow(dependencies).invoke({ request: request as IngestionRequest }, { recursionLimit: 8 });
  return { status: result.status, source: result.request?.source, documents: result.documents ?? [], outcomes: result.outcomes ?? [], errors: result.errors ?? [] };
}
