import { z } from 'zod';

export type SourceType = 'route' | 'documentation' | 'database' | 'api';

export interface DiscoveredSource {
  id: string;
  type: SourceType;
  path: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  hash: string;
  lastModified?: string;
}

export interface ChunkMetadata {
  chunkId: string;
  orgId: string;
  sourceType: SourceType;
  sourcePath: string;
  title: string;
  section?: string;
  contentHash: string;
  docHash: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface DocumentChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  embedding?: number[];
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

export interface IngestionStats {
  totalSources: number;
  processed: number;
  skipped: number;
  updated: number;
  failed: number;
  totalChunks: number;
  lastIngestedAt?: string;
  sourceTypeBreakdown: Record<SourceType, number>;
}

export interface SourceIngestionRecord {
  path: string;
  title: string;
  sourceType: SourceType;
  status: 'processed' | 'skipped' | 'updated' | 'failed';
  chunks: number;
  docHash: string;
  updatedAt: string;
  error?: string;
}

export interface IngestionResult {
  status: 'completed' | 'partial' | 'failed';
  stats: IngestionStats;
  sources: SourceIngestionRecord[];
  errors: string[];
}

export const ragQueryInputSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  history: z.array(z.object({
    query: z.string().trim().min(1).max(4000),
    answer: z.string().trim().max(8000)
  }).strict()).max(4).optional().default([]),
  topK: z.number().int().min(1).max(20).optional().default(5),
  threshold: z.number().min(0).max(1).optional().default(0.1),
  orgId: z.string().trim().min(1).max(100).optional().default('hirenova'),
  sourceTypes: z.array(z.enum(['route', 'documentation', 'database', 'api'])).optional()
}).strict();

export type RAGQueryInput = z.infer<typeof ragQueryInputSchema>;

export type PlatformType = 'jira' | 'confluence' | 'slack' | 'github' | 'route' | 'database';

export interface RAGSourceCitation {
  title: string;
  sourceType: SourceType;
  sourcePath: string;
  platform?: PlatformType;
  excerpt?: string;
}

export interface RetrievedChunkInfo {
  chunkId: string;
  sourcePath: string;
  score: number;
  text: string;
  platform?: PlatformType;
  metadata: ChunkMetadata;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSourceCitation[];
  retrieved_chunks: RetrievedChunkInfo[];
  agent: 'organization-intelligence';
  status: 'completed' | 'partial' | 'failed';
  uncertainty?: string;
  errors?: string[];
}

export interface VectorStoreDocumentEntry {
  path: string;
  title: string;
  sourceType: SourceType;
  docHash: string;
  chunkIds: string[];
  updatedAt: string;
}

export interface PersistentVectorStoreData {
  version: number;
  orgId: string;
  lastUpdated: string;
  documents: Record<string, VectorStoreDocumentEntry>;
  chunks: Record<string, DocumentChunk>;
}
