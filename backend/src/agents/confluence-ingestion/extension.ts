/**
 * Disabled extension point for a future Confluence Ingestion Agent.
 * This module intentionally contains no HTTP client, credentials, or workflow registration.
 */
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

export const confluenceIngestionEnabled = false;

export const disabledConfluenceIngestionAgent: ConfluenceIngestionAgent = {
  async ingest(request) {
    return { status: 'disabled', sourceRecordId: request.sourceRecordId };
  }
};
