import { fetchMockDocuments } from './client.js';
import type { MockFetcherRequest, MockFetcherResult } from './types.js';

/** Fetcher-only agent. It performs no graph writes and never invokes processors. */
export async function runMockFetcher(request: MockFetcherRequest, options: { baseUrl?: string; timeoutMs?: number } = {}): Promise<MockFetcherResult> {
  return { source: request.source, documents: await fetchMockDocuments(request.source, { ...options, limit: request.limit }) };
}
