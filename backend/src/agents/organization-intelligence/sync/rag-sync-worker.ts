import { randomUUID } from 'node:crypto';
import type { Graph } from 'falkordb';
import type { OrganizationIntelligenceAgent } from '../agent.js';
import type { DiscoveredSource } from '../types.js';
import { discoverRagSources } from '../sources/discovery.js';
import { FalkorDBVectorStore } from '../vector-store/falkordb-vector-store.js';
import { FalkorDBSyncQueue, type RAGSyncJob, type RAGSyncQueueStatus } from './falkordb-sync-queue.js';
import { ConnectorChangeDetector, type ConnectorPollResult } from './connector-change-detector.js';

export interface RAGSyncConfig {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  concurrency: number;
  maxRetries: number;
}

export interface RAGSyncWorkerStatus extends RAGSyncQueueStatus {
  enabled: boolean;
  running: boolean;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  indexedSources: number;
  indexedChunks: number;
  workerLagMs: number;
}

const scrubError = (error: unknown): string => {
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name) ? error.name : 'Error';
  return `${name}: RAG sync operation failed`;
};

export class RAGSyncWorker {
  readonly workerId = randomUUID();
  private readonly queue: FalkorDBSyncQueue;
  private timer?: ReturnType<typeof setInterval>;
  private cycle?: Promise<void>;
  private stopping = false;
  private started = false;
  private lastSuccessfulSync: string | null = null;
  private lastError: string | null = null;
  private readonly discover: () => Promise<DiscoveredSource[]>;
  private readonly pollConnectors: () => Promise<ConnectorPollResult>;

  constructor(
    private readonly graph: Graph,
    private readonly agent: OrganizationIntelligenceAgent,
    readonly config: RAGSyncConfig,
    discover?: () => Promise<DiscoveredSource[]>,
    pollConnectors?: () => Promise<ConnectorPollResult>,
    private readonly now = () => Date.now()
  ) {
    this.queue = new FalkorDBSyncQueue(graph, agent.vectorStore instanceof FalkorDBVectorStore ? agent.vectorStore.orgId : process.env.ORGANIZATION_ID ?? 'hirenova');
    this.discover = discover ?? (() => discoverRagSources({ graph: this.graph, strictLive: true }));
    const orgId = agent.vectorStore instanceof FalkorDBVectorStore ? agent.vectorStore.orgId : process.env.ORGANIZATION_ID ?? 'hirenova';
    const connectorDetector = new ConnectorChangeDetector(graph, orgId, config.batchSize, config.concurrency);
    this.pollConnectors = pollConnectors ?? (() => connectorDetector.poll());
  }

  start(): void {
    if (!this.config.enabled || this.started) return;
    this.started = true;
    this.stopping = false;
    this.timer = setInterval(() => { void this.tick(); }, this.config.pollIntervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  async tick(): Promise<void> {
    if (!this.started || this.stopping || this.cycle) return this.cycle;
    this.cycle = this.runCycle().finally(() => { this.cycle = undefined; });
    return this.cycle;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.cycle;
    await this.queue.release(this.workerId).catch((error) => {
      console.error('RAG sync worker could not release its leases during shutdown:', scrubError(error));
    });
    this.started = false;
  }

  async status(): Promise<RAGSyncWorkerStatus> {
    const [queue, stats] = await Promise.all([this.queue.status(), this.agent.getStatus()]);
    return {
      ...queue,
      enabled: this.config.enabled,
      running: this.started && !this.stopping,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastError: this.lastError ?? queue.lastError,
      indexedSources: stats.totalSources,
      indexedChunks: stats.totalChunks,
      workerLagMs: queue.lagMs
    };
  }

  async replayDeadLetters(): Promise<number> { return this.queue.replayDeadLetters(); }

  private async runCycle(): Promise<void> {
    try {
      if (this.agent.vectorStore instanceof FalkorDBVectorStore) await this.agent.vectorStore.initialize();
      const connectorResult = await this.pollConnectors();
      const sources = await this.discover();
      const current = new Map(sources.map((source) => [source.path, source]));
      const indexed = await this.agent.getSources();
      const observedAt = new Date(this.now()).toISOString();

      for (const source of sources) {
        const entry = indexed.find((item) => item.path === source.path);
        if (!entry || entry.docHash !== source.hash) {
          await this.queue.enqueue({ sourcePath: source.path, operation: 'upsert', contentHash: source.hash, observedAt });
        }
      }

      // This is safe only after the complete live source scan succeeded.
      // A discovery exception leaves deletion candidates untouched.
      for (const entry of indexed) {
        if (!current.has(entry.path)) await this.queue.enqueue({ sourcePath: entry.path, operation: 'delete', contentHash: 'deleted', observedAt });
      }

      const limit = this.config.batchSize;
      let claimedCount = 0;
      const runners = Array.from({ length: Math.min(this.config.concurrency, limit) }, async () => {
        while (claimedCount < limit && !this.stopping) {
          claimedCount++;
          const job = await this.queue.claim(this.workerId, Math.max(this.config.pollIntervalMs * 2, 30_000));
          if (!job) { claimedCount--; return; }
          await this.process(job);
        }
      });
      await Promise.all(runners);
      this.lastSuccessfulSync = observedAt;
      this.lastError = connectorResult.lastError;
    } catch (error) {
      this.lastError = scrubError(error);
      console.error('RAG sync poll failed; pending jobs and indexed documents were preserved:', this.lastError);
    }
  }

  private async process(job: RAGSyncJob): Promise<void> {
    const started = this.now();
    try {
      if (job.operation === 'delete') {
        // Re-confirm a candidate just before deletion so an incomplete or
        // temporarily stale discovery result cannot erase searchable data.
        const latest = (await this.discover()).find((source) => source.path === job.sourcePath);
        if (latest) {
          await this.queue.enqueue({ sourcePath: latest.path, operation: 'upsert', contentHash: latest.hash });
        } else {
          await this.agent.vectorStore.removeDocument(job.sourcePath);
        }
      } else {
        const result = await this.agent.ingest({ selectedSources: [job.sourcePath] });
        const sourceResult = result.sources.find((source) => source.path === job.sourcePath);
        if (!sourceResult || sourceResult.status === 'failed' || result.status === 'failed') {
          throw new Error(sourceResult?.error ?? result.errors[0] ?? 'Source was not persisted by the ingestion pipeline.');
        }
      }
      const durationMs = Math.max(0, this.now() - started);
      await this.queue.complete(job, this.workerId, durationMs);
      console.info('RAG sync job completed', { sourcePath: job.sourcePath, operation: job.operation, attempt: job.attempts, durationMs });
    } catch (error) {
      const durationMs = Math.max(0, this.now() - started);
      const retryBaseMs = Math.min(3_600_000, 1_000 * (2 ** Math.max(0, job.attempts - 1)));
      const jitterMs = Math.floor(Math.random() * Math.max(1, retryBaseMs * 0.25));
      await this.queue.fail(job, this.workerId, error, this.config.maxRetries, retryBaseMs + jitterMs, durationMs);
      console.error('RAG sync job failed', { sourcePath: job.sourcePath, operation: job.operation, attempt: job.attempts, durationMs, error: scrubError(error) });
    }
  }
}
