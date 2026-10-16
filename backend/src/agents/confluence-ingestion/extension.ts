/** Confluence source retrieval is performed server-side by the mock-fetcher client. */
import { env } from '../../config/env.js';
export interface ConfluenceIngestionRequest {
  sourceRecordId: string;
  content: string;
  receivedAt?: string;
}

export interface ConfluenceIngestionResult {
  status: 'disabled';
  sourceRecordId: string;
}

export interface ConfluenceIngestionAgent {
  ingest(request: ConfluenceIngestionRequest): Promise<ConfluenceIngestionResult>;
}

export const confluenceIngestionEnabled = env.CONFLUENCE_INGESTION_ENABLED !== 'false' && Boolean(env.CONFLUENCE_BASE_URL && env.CONFLUENCE_EMAIL && env.CONFLUENCE_API_TOKEN);

export const disabledConfluenceIngestionAgent: ConfluenceIngestionAgent = {
  async ingest(request) {
    return { status: 'disabled', sourceRecordId: request.sourceRecordId };
  }
};
