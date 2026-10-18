import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { runMockFetcher } from '../agents/mock-fetcher/agent.js';
import { sourceConnectorBase } from '../agents/mock-fetcher/client.js';
import { mockSources, normalizedDocumentSchema, type MockFetcherRequest, type NormalizedDocument } from '../agents/mock-fetcher/types.js';
import { processDocuments } from '../agents/document-processor/agent.js';
import type { DocumentOutcome, DocumentProcessorOptions } from '../agents/document-processor/types.js';
import { env } from '../config/env.js';

export const ingestionRequestSchema = z.object({ source: z.enum(mockSources), limit: z.number().int().min(1).max(100).optional() }).strict();
export type IngestionStatus = 'received' | 'failed' | 'fetched' | 'processed' | 'partial' | 'empty';
export type IngestionRequest = MockFetcherRequest;
export interface IngestionResult { status: IngestionStatus; source?: string; documents: NormalizedDocument[]; fetchedDocumentCount: number; excludedSyntheticCount: number; outcomes: DocumentOutcome[]; errors: string[]; }

const replace = <T>(defaultValue: () => T) => Annotation<T>({ reducer: (_left, right) => right, default: defaultValue });

const IngestionState = Annotation.Root({
  request: Annotation<IngestionRequest>(),
  documents: replace<NormalizedDocument[]>(() => []),
  fetchedDocumentCount: replace<number>(() => 0),
  excludedSyntheticCount: replace<number>(() => 0),
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
      const directConfluenceConfigured = state.request.source === 'confluence'
        && env.CONFLUENCE_INGESTION_ENABLED !== 'false'
        && !sourceConnectorBase('confluence')
        && Boolean(env.CONFLUENCE_BASE_URL && env.CONFLUENCE_EMAIL && (env.CONFLUENCE_API_TOKEN || env.CONFLUENCE_API_KEY));
      if (!dependencies.fetcher && !sourceConnectorBase(state.request.source) && !directConfluenceConfigured) {
        const message = state.request.source === 'confluence'
          ? 'Confluence API credentials are not configured.'
          : `MOCK_API_BASE_URL is not configured for ${state.request.source}. Configure the server-side source connector before syncing.`;
        return { status: 'failed' as const, errors: [message] };
      }
      return { request: result.data, status: 'received' as const, errors: [] };
    })
    .addNode('fetch', async (state) => {
      if (state.status === 'failed') return {};
      try {
        const result = await fetcher(state.request);
        if (result.source !== state.request.source) return { status: 'failed' as const, errors: ['Source connector returned records for a different source.'] };
        const validated = z.array(normalizedDocumentSchema).safeParse(result.documents);
        if (!validated.success || validated.data.some((document) => document.sourceSystem !== result.source)) return { status: 'failed' as const, errors: ['Fetched records failed the normalized ingestion schema.'] };
        const verified = validated.data.filter((document) => !document.synthetic && document.provenance !== 'synthetic');
        const excludedSyntheticCount = validated.data.length - verified.length;
        if (validated.data.length && !verified.length) {
          return { documents: [], fetchedDocumentCount: validated.data.length, excludedSyntheticCount, status: 'failed' as const, errors: [`${result.source} returned only demo or synthetic records. They were not written to FalkorDB.`] };
        }
        const errors = excludedSyntheticCount ? [`${excludedSyntheticCount} demo or synthetic records were excluded from the ${result.source} sync.`] : [];
        return verified.length
          ? { documents: verified, fetchedDocumentCount: validated.data.length, excludedSyntheticCount, status: 'fetched' as const, errors }
          : { documents: [], fetchedDocumentCount: 0, excludedSyntheticCount: 0, status: 'empty' as const, errors: [] };
      } catch (error) { return { status: 'failed' as const, errors: [safeError(error, 'Mock API fetch failed.')] }; }
    })
    .addNode('process', async (state) => {
      if (state.status !== 'fetched' || !state.documents.length) return {};
      try {
        const outcomes = await processor(state.documents);
        const successful = outcomes.filter((outcome) => outcome.status === 'processed').length;
        const failed = state.documents.length - successful;
        const errors = [...state.errors, ...(failed ? [`${failed} of ${state.documents.length} fetched records were not fully processed.`] : [])];
        const status = successful === 0 ? 'failed' as const : failed || state.excludedSyntheticCount ? 'partial' as const : 'processed' as const;
        return { outcomes, status, errors };
      }
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
  return { status: result.status, source: result.request?.source, documents: result.documents ?? [], fetchedDocumentCount: result.fetchedDocumentCount ?? 0, excludedSyntheticCount: result.excludedSyntheticCount ?? 0, outcomes: result.outcomes ?? [], errors: result.errors ?? [] };
}
