import type { Graph } from 'falkordb';
import type { IngestionResult, IngestionStats, RAGQueryInput, RAGResponse, VectorStoreDocumentEntry } from './types.js';
import { PersistentVectorStore } from './vector-store/persistent-store.js';
import { GeminiEmbeddingService } from './embeddings/gemini-embeddings.js';
import { runIngestionGraph, type IngestionGraphConfig } from './workflow/ingestion-graph.js';
import { runRetrievalGraph, type RetrievalGraphConfig } from './workflow/retrieval-graph.js';

export interface Agent1Options {
  graph?: Graph;
  docsDir?: string;
  storagePath?: string;
  orgId?: string;
  useMockEmbeddings?: boolean;
}

export class OrganizationIntelligenceAgent {
  public readonly vectorStore: PersistentVectorStore;
  public readonly embeddingService: GeminiEmbeddingService;
  private graph?: Graph;
  private docsDir?: string;
  private orgId: string;

  constructor(options: Agent1Options = {}) {
    this.orgId = options.orgId ?? 'hirenova';
    this.graph = options.graph;
    this.docsDir = options.docsDir;
    this.vectorStore = new PersistentVectorStore({
      storagePath: options.storagePath,
      orgId: this.orgId
    });
    this.embeddingService = new GeminiEmbeddingService({
      useMock: options.useMockEmbeddings
    });
  }

  setGraph(graph: Graph): void {
    this.graph = graph;
  }

  async ingest(options: Partial<IngestionGraphConfig> = {}): Promise<IngestionResult> {
    return runIngestionGraph({
      graph: this.graph,
      docsDir: this.docsDir,
      vectorStore: this.vectorStore,
      embeddingService: this.embeddingService,
      orgId: this.orgId,
      ...options
    });
  }

  async query(input: RAGQueryInput, options: Partial<RetrievalGraphConfig> = {}): Promise<RAGResponse> {
    return runRetrievalGraph(input, {
      vectorStore: this.vectorStore,
      embeddingService: this.embeddingService,
      ...options
    });
  }

  getStatus(): IngestionStats {
    return this.vectorStore.getStats();
  }

  getSources(): VectorStoreDocumentEntry[] {
    return this.vectorStore.getAllDocuments();
  }

  async reindex(sourcePath?: string): Promise<IngestionResult> {
    return this.ingest({
      forceReindex: true,
      selectedSources: sourcePath ? [sourcePath] : undefined
    });
  }

  clear(): void {
    this.vectorStore.clear();
  }
}

let defaultAgentInstance: OrganizationIntelligenceAgent | undefined;

export function getOrganizationIntelligenceAgent(options: Agent1Options = {}): OrganizationIntelligenceAgent {
  if (!defaultAgentInstance || options.graph) {
    defaultAgentInstance = new OrganizationIntelligenceAgent(options);
  }
  return defaultAgentInstance;
}
