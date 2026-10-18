import { createHash } from 'node:crypto';
import type { Graph } from 'falkordb';
import { rows } from '../../../db/falkordb.js';
import { processDocument } from '../../document-processor/agent.js';
import { configuredSourceConnectors, fetchMockDocuments } from '../../mock-fetcher/client.js';
import type { MockSource, NormalizedDocument } from '../../mock-fetcher/types.js';

const volatileKeys = new Set(['createdAt', 'created_at', 'updatedAt', 'updated_at', 'occurredAt', 'occurred_at', 'timestamp', 'ts']);
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !volatileKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, stableValue(item)]));
}

export function normalizedDocumentHash(document: NormalizedDocument): string {
  const value = stableValue({
    sourceSystem: document.sourceSystem,
    sourceRecordId: document.sourceRecordId,
    title: document.title,
    summary: document.summary,
    content: document.content,
    sourceUrl: document.sourceUrl,
    metadata: document.metadata
  });
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface ConnectorPollResult {
  configured: number;
  fetched: number;
  changed: number;
  persisted: number;
  failures: number;
  lastError: string | null;
}

export class ConnectorChangeDetector {
  constructor(
    private readonly graph: Graph,
    private readonly orgId: string,
    private readonly batchSize: number,
    private readonly concurrency: number,
    private readonly fetch = (source: MockSource) => fetchMockDocuments(source, { limit: Math.min(100, this.batchSize) }),
    private readonly connectors = () => configuredSourceConnectors()
  ) {}

  async poll(): Promise<ConnectorPollResult> {
    const sources = this.connectors();
    const result: ConnectorPollResult = { configured: sources.length, fetched: 0, changed: 0, persisted: 0, failures: 0, lastError: null };
    const failures: string[] = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(this.concurrency, sources.length) }, async () => {
      while (cursor < sources.length) {
        const source = sources[cursor++];
        try {
          const documents = await this.fetch(source);
          result.fetched += documents.length;
          if (documents.some((document) => document.synthetic || document.provenance === 'synthetic')) {
            throw new Error(`${source} returned synthetic or unverified records; they were ignored.`);
          }
          const stateRows = rows(await this.graph.query(
            `MATCH (s:RAGSyncSourceState {orgId:$orgId,sourceSystem:$sourceSystem}) RETURN s.sourceRecordId AS sourceRecordId,s.contentHash AS contentHash`,
            { params: { orgId: this.orgId, sourceSystem: source } }
          ));
          const known = new Map(stateRows.map((row) => [String(row.sourceRecordId), String(row.contentHash)]));
          const changed = documents.filter((document) => known.get(document.sourceRecordId) !== normalizedDocumentHash(document));
          result.changed += changed.length;
          for (let offset = 0; offset < changed.length; offset += this.concurrency) {
            const batch = changed.slice(offset, offset + this.concurrency);
            const outcomes = await Promise.all(batch.map((document) => processDocument(document, { graph: this.graph })));
            for (let index = 0; index < batch.length; index++) {
              const outcome = outcomes[index];
              const document = batch[index];
              if (outcome.status !== 'processed') {
                result.failures++;
                failures.push(`${source} record processing failed`);
                continue;
              }
              await this.graph.query(`MERGE (s:RAGSyncSourceState {orgId:$orgId,sourceSystem:$sourceSystem,sourceRecordId:$sourceRecordId}) SET s.contentHash=$contentHash,s.updatedAt=$updatedAt`, {
                params: { orgId: this.orgId, sourceSystem: source, sourceRecordId: document.sourceRecordId, contentHash: normalizedDocumentHash(document), updatedAt: new Date().toISOString() }
              });
              result.persisted++;
            }
          }
        } catch (error) {
          result.failures++;
          const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name) ? error.name : 'Error';
          failures.push(`${source} ${name}`);
        }
      }
    });
    await Promise.all(runners);
    if (failures.length) result.lastError = failures.join('; ').slice(0, 300);
    return result;
  }
}
