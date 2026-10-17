import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DocumentChunk, IngestionStats, PersistentVectorStoreData, SearchResult, SourceType, VectorStoreDocumentEntry } from '../types.js';

export interface VectorStoreOptions {
  storagePath?: string;
  orgId?: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class PersistentVectorStore {
  private filePath: string;
  private orgId: string;
  private documents: Map<string, VectorStoreDocumentEntry> = new Map();
  private chunks: Map<string, DocumentChunk> = new Map();
  private lastUpdated: string;

  constructor(options: VectorStoreOptions = {}) {
    this.orgId = options.orgId ?? 'hirenova';
    const defaultPath = path.resolve(process.cwd(), 'data', 'vector-store.json');
    this.filePath = options.storagePath ?? process.env.VECTOR_STORE_PATH ?? defaultPath;
    this.lastUpdated = new Date().toISOString();
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as PersistentVectorStoreData;
      if (data && typeof data === 'object') {
        this.orgId = data.orgId ?? this.orgId;
        this.lastUpdated = data.lastUpdated ?? this.lastUpdated;
        this.documents = new Map(Object.entries(data.documents ?? {}));
        this.chunks = new Map(Object.entries(data.chunks ?? {}));
      }
    } catch (error) {
      console.warn(`Could not load vector store from ${this.filePath}:`, error);
    }
  }

  save(): void {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const payload: PersistentVectorStoreData = {
      version: 1,
      orgId: this.orgId,
      lastUpdated: new Date().toISOString(),
      documents: Object.fromEntries(this.documents),
      chunks: Object.fromEntries(this.chunks)
    };

    const tempPath = `${this.filePath}.tmp-${Date.now()}`;
    try {
      writeFileSync(tempPath, JSON.stringify(payload), 'utf-8');
      renameSync(tempPath, this.filePath);
      this.lastUpdated = payload.lastUpdated;
    } catch (error) {
      if (existsSync(tempPath)) {
        try { unlinkSync(tempPath); } catch {}
      }
      throw error;
    }
  }

  getDocument(path: string): VectorStoreDocumentEntry | undefined {
    return this.documents.get(path);
  }

  getAllDocuments(): VectorStoreDocumentEntry[] {
    return Array.from(this.documents.values());
  }

  getEmbeddingDimensions(): number[] {
    return Array.from(new Set(Array.from(this.chunks.values())
      .map((chunk) => chunk.embedding?.length ?? 0)
      .filter((dimension) => dimension > 0)));
  }

  hasDocumentWithHash(path: string, docHash: string): boolean {
    const existing = this.documents.get(path);
    return Boolean(existing && existing.docHash === docHash);
  }

  upsertDocumentChunks(docEntry: VectorStoreDocumentEntry, newChunks: DocumentChunk[]): void {
    const existing = this.documents.get(docEntry.path);
    if (existing) {
      // Remove stale chunks previously associated with this document
      for (const chunkId of existing.chunkIds) {
        this.chunks.delete(chunkId);
      }
    }

    const chunkIds: string[] = [];
    for (const chunk of newChunks) {
      this.chunks.set(chunk.id, chunk);
      chunkIds.push(chunk.id);
    }

    this.documents.set(docEntry.path, {
      ...docEntry,
      chunkIds,
      updatedAt: new Date().toISOString()
    });

    this.save();
  }

  removeDocument(path: string): boolean {
    const doc = this.documents.get(path);
    if (!doc) return false;

    for (const chunkId of doc.chunkIds) {
      this.chunks.delete(chunkId);
    }
    this.documents.delete(path);
    this.save();
    return true;
  }

  cleanStaleSources(currentPaths: Set<string>): string[] {
    const removed: string[] = [];
    for (const existingPath of this.documents.keys()) {
      if (!currentPaths.has(existingPath)) {
        this.removeDocument(existingPath);
        removed.push(existingPath);
      }
    }
    return removed;
  }

  search(queryEmbedding: number[], options: {
    topK?: number;
    threshold?: number;
    orgId?: string;
    sourceTypes?: SourceType[];
    sourcePath?: string;
  } = {}): SearchResult[] {
    const topK = options.topK ?? 5;
    const threshold = options.threshold ?? 0.3;
    const targetOrg = options.orgId ?? this.orgId;
    const allowedTypes = options.sourceTypes ? new Set(options.sourceTypes) : undefined;

    const scored: SearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      // Tenant isolation filter
      if (chunk.metadata.orgId && chunk.metadata.orgId !== targetOrg) {
        continue;
      }

      // Source type filter
      if (allowedTypes && !allowedTypes.has(chunk.metadata.sourceType)) {
        continue;
      }

      // Source path filter
      if (options.sourcePath && chunk.metadata.sourcePath !== options.sourcePath) {
        continue;
      }

      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue;
      }

      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= threshold) {
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  getStats(): IngestionStats {
    const breakdown: Record<SourceType, number> = {
      route: 0,
      documentation: 0,
      database: 0,
      api: 0
    };

    for (const doc of this.documents.values()) {
      if (doc.sourceType in breakdown) {
        breakdown[doc.sourceType]++;
      }
    }

    return {
      totalSources: this.documents.size,
      processed: this.documents.size,
      skipped: 0,
      updated: 0,
      failed: 0,
      totalChunks: this.chunks.size,
      lastIngestedAt: this.lastUpdated,
      sourceTypeBreakdown: breakdown
    };
  }

  clear(): void {
    this.documents.clear();
    this.chunks.clear();
    this.save();
  }
}
