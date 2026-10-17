import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { Graph } from 'falkordb';
import type { DiscoveredSource, DocumentChunk, IngestionResult, IngestionStats, SourceIngestionRecord, SourceType } from '../types.js';
import { discoverRouteSources } from '../sources/routes-catalog.js';
import { loadDocumentationSources } from '../sources/docs-loader.js';
import { extractDatabaseSources } from '../sources/database-extractor.js';
import { loadSeedGraphSources } from '../sources/seed-graph-loader.js';
import { chunkSource } from '../chunking/chunker.js';
import { GeminiEmbeddingService } from '../embeddings/gemini-embeddings.js';
import { PersistentVectorStore } from '../vector-store/persistent-store.js';

export interface IngestionGraphConfig {
  graph?: Graph;
  docsDir?: string;
  vectorStore?: PersistentVectorStore;
  embeddingService?: GeminiEmbeddingService;
  forceReindex?: boolean;
  selectedSources?: string[];
  orgId?: string;
}

const replace = <T>(defaultValue: () => T) => Annotation<T>({ reducer: (_left, right) => right, default: defaultValue });

export const IngestionState = Annotation.Root({
  status: replace<'idle' | 'discovering' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'failed'>(() => 'idle'),
  discoveredSources: replace<DiscoveredSource[]>(() => []),
  routeSources: replace<DiscoveredSource[]>(() => []),
  docSources: replace<DiscoveredSource[]>(() => []),
  dbSources: replace<DiscoveredSource[]>(() => []),
  chunksToEmbed: replace<Map<string, DocumentChunk[]>>(() => new Map()),
  sourceRecords: replace<SourceIngestionRecord[]>(() => []),
  stats: replace<IngestionStats>(() => ({
    totalSources: 0,
    processed: 0,
    skipped: 0,
    updated: 0,
    failed: 0,
    totalChunks: 0,
    sourceTypeBreakdown: { route: 0, documentation: 0, database: 0, api: 0 }
  })),
  errors: replace<string[]>(() => [])
});

export type IngestionWorkflowState = typeof IngestionState.State;

export function createIngestionWorkflow(config: IngestionGraphConfig = {}) {
  const store = config.vectorStore ?? new PersistentVectorStore({ orgId: config.orgId });
  const embeddings = config.embeddingService ?? new GeminiEmbeddingService();
  const orgId = config.orgId ?? 'hirenova';

  const graph = new StateGraph(IngestionState)
    // 1. discover_sources
    .addNode('discover_sources', async (_state) => {
      try {
        const routes = discoverRouteSources();
        return {
          routeSources: routes,
          status: 'discovering' as const
        };
      } catch (error) {
        return {
          status: 'failed' as const,
          errors: [`Source discovery failed: ${error instanceof Error ? error.message : String(error)}`]
        };
      }
    })

    // 2. load_documentation
    .addNode('load_documentation', async (state) => {
      if (state.status === 'failed') return {};
      try {
        const docs = loadDocumentationSources(config.docsDir);
        const seedSources = loadSeedGraphSources();
        return { docSources: [...docs, ...seedSources] };
      } catch (error) {
        return {
          status: 'failed' as const,
          errors: [...state.errors, `Documentation loading failed: ${error instanceof Error ? error.message : String(error)}`]
        };
      }
    })

    // 3. extract_organization_data
    .addNode('extract_organization_data', async (state) => {
      if (state.status === 'failed') return {};
      try {
        const dbSources = await extractDatabaseSources(config.graph);
        const allSources = [...state.routeSources, ...state.docSources, ...dbSources];

        const filtered = config.selectedSources && config.selectedSources.length > 0
          ? allSources.filter((s) => config.selectedSources!.includes(s.path) || config.selectedSources!.includes(s.id))
          : allSources;

        return {
          dbSources,
          discoveredSources: filtered
        };
      } catch (error) {
        return {
          status: 'failed' as const,
          errors: [...state.errors, `Database extraction failed: ${error instanceof Error ? error.message : String(error)}`]
        };
      }
    })

    // 4. normalize_and_chunk
    .addNode('normalize_and_chunk', async (state) => {
      if (state.status === 'failed') return {};
      try {
        const chunksMap = new Map<string, DocumentChunk[]>();
        const sourceRecords: SourceIngestionRecord[] = [];
        let skipped = 0;
        let processed = 0;
        let updated = 0;

        for (const source of state.discoveredSources) {
          const isUnchanged = !config.forceReindex && store.hasDocumentWithHash(source.path, source.hash);

          if (isUnchanged) {
            skipped++;
            sourceRecords.push({
              path: source.path,
              title: source.title,
              sourceType: source.type,
              status: 'skipped',
              chunks: store.getDocument(source.path)?.chunkIds.length ?? 0,
              docHash: source.hash,
              updatedAt: new Date().toISOString()
            });
            continue;
          }

          const existing = store.getDocument(source.path);
          const chunks = chunkSource(source, { orgId });
          chunksMap.set(source.path, chunks);

          if (existing) {
            updated++;
          } else {
            processed++;
          }

          sourceRecords.push({
            path: source.path,
            title: source.title,
            sourceType: source.type,
            status: existing ? 'updated' : 'processed',
            chunks: chunks.length,
            docHash: source.hash,
            updatedAt: new Date().toISOString()
          });
        }

        const breakdown: Record<SourceType, number> = { route: 0, documentation: 0, database: 0, api: 0 };
        for (const src of state.discoveredSources) {
          breakdown[src.type] = (breakdown[src.type] ?? 0) + 1;
        }

        return {
          chunksToEmbed: chunksMap,
          sourceRecords,
          status: 'chunking' as const,
          stats: {
            totalSources: state.discoveredSources.length,
            processed,
            skipped,
            updated,
            failed: 0,
            totalChunks: 0,
            sourceTypeBreakdown: breakdown
          }
        };
      } catch (error) {
        return {
          status: 'failed' as const,
          errors: [...state.errors, `Chunking failed: ${error instanceof Error ? error.message : String(error)}`]
        };
      }
    })

    // 5. generate_embeddings
    .addNode('generate_embeddings', async (state) => {
      if (state.status === 'failed') return {};
      try {
        const allChunks: DocumentChunk[] = [];
        for (const chunks of state.chunksToEmbed.values()) {
          allChunks.push(...chunks);
        }

        if (allChunks.length === 0) {
          return { status: 'embedding' as const };
        }

        const texts = allChunks.map((c) => c.text);
        const vectors = await embeddings.embedBatch(texts);

        for (let i = 0; i < allChunks.length; i++) {
          allChunks[i].embedding = vectors[i];
        }

        return { status: 'embedding' as const };
      } catch (error) {
        return {
          status: 'failed' as const,
          errors: [...state.errors, `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`]
        };
      }
    })

    // 6. upsert_vector_store
    .addNode('upsert_vector_store', async (state) => {
      if (state.status === 'failed') return {};
      try {
        for (const [sourcePath, chunks] of state.chunksToEmbed.entries()) {
          const source = state.discoveredSources.find((s) => s.path === sourcePath);
          if (!source) continue;

          store.upsertDocumentChunks(
            {
              path: source.path,
              title: source.title,
              sourceType: source.type,
              docHash: source.hash,
              chunkIds: chunks.map((c) => c.id),
              updatedAt: new Date().toISOString()
            },
            chunks,
            false
          );
        }

        store.save();

        // Clean stale sources only when a full re-scan was conducted
        if (!config.selectedSources || config.selectedSources.length === 0) {
          const currentPaths = new Set(state.discoveredSources.map((s) => s.path));
          store.cleanStaleSources(currentPaths);
        }

        const currentStats = store.getStats();
        return {
          status: 'completed' as const,
          stats: {
            ...state.stats,
            totalChunks: currentStats.totalChunks,
            lastIngestedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        return {
          status: 'failed' as const,
          errors: [...state.errors, `Vector store upsert failed: ${error instanceof Error ? error.message : String(error)}`]
        };
      }
    })

    .addEdge(START, 'discover_sources')
    .addEdge('discover_sources', 'load_documentation')
    .addEdge('load_documentation', 'extract_organization_data')
    .addEdge('extract_organization_data', 'normalize_and_chunk')
    .addEdge('normalize_and_chunk', 'generate_embeddings')
    .addEdge('generate_embeddings', 'upsert_vector_store')
    .addEdge('upsert_vector_store', END);

  return graph.compile();
}

export async function runIngestionGraph(config: IngestionGraphConfig = {}): Promise<IngestionResult> {
  const workflow = createIngestionWorkflow(config);
  const result = await workflow.invoke({}, { recursionLimit: 12 });

  return {
    status: result.status === 'completed' ? 'completed' : result.status === 'failed' ? 'failed' : 'partial',
    stats: result.stats,
    sources: result.sourceRecords ?? [],
    errors: result.errors ?? []
  };
}
