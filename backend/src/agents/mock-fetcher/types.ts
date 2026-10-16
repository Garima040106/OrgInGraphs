import { z } from 'zod';

export const mockSources = ['confluence', 'jira', 'github', 'slack'] as const;
export type MockSource = (typeof mockSources)[number];
export type DocumentProvenance = 'synthetic' | 'user-provided' | 'external-verified';

export interface MockFetcherRequest { source: MockSource; limit?: number; }
export interface NormalizedDocument {
  sourceSystem: MockSource;
  sourceRecordId: string;
  title?: string;
  summary?: string;
  content: string;
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string;
  provenance: DocumentProvenance;
  synthetic: boolean;
  metadata: Record<string, unknown>;
}
export const normalizedDocumentSchema = z.object({
  sourceSystem: z.enum(mockSources), sourceRecordId: z.string().trim().min(1).max(500),
  title: z.string().max(2000).optional(), summary: z.string().max(20_000).optional(),
  content: z.string().max(1_000_000), sourceUrl: z.string().url().optional(),
  createdAt: z.string().optional(), updatedAt: z.string().optional(), occurredAt: z.string().optional(),
  provenance: z.enum(['synthetic', 'user-provided', 'external-verified']), synthetic: z.boolean(),
  metadata: z.record(z.string(), z.unknown())
}).strict();
export interface MockFetcherResult { source: MockSource; documents: NormalizedDocument[]; }
export type MockFetcherErrorCode = 'missing-configuration' | 'invalid-configuration' | 'unsupported-source' | 'http-error' | 'malformed-response' | 'timeout' | 'empty-result';
export class MockFetcherError extends Error {
  constructor(public readonly code: MockFetcherErrorCode, message: string, public readonly retryable = false) { super(message); this.name = 'MockFetcherError'; }
}
