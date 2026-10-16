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
export interface MockFetcherResult { source: MockSource; documents: NormalizedDocument[]; }
export type MockFetcherErrorCode = 'missing-configuration' | 'invalid-configuration' | 'unsupported-source' | 'http-error' | 'malformed-response' | 'timeout' | 'empty-result';
export class MockFetcherError extends Error {
  constructor(public readonly code: MockFetcherErrorCode, message: string, public readonly retryable = false) { super(message); this.name = 'MockFetcherError'; }
}
