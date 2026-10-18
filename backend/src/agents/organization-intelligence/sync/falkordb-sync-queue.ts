import { randomUUID } from 'node:crypto';
import type { Graph } from 'falkordb';
import { rows } from '../../../db/falkordb.js';

export type SyncOperation = 'upsert' | 'delete';
export type SyncJobStatus = 'pending' | 'processing' | 'completed' | 'dead';

export interface RAGSyncJob {
  id: string;
  orgId: string;
  sourcePath: string;
  operation: SyncOperation;
  contentHash: string;
  attempts: number;
  status: SyncJobStatus;
  leaseOwner?: string;
}

export interface RAGSyncQueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retries: number;
  lastObservedChange: string | null;
  lastError: string | null;
  oldestPendingAt: string | null;
  lagMs: number;
}

const safeError = (error: unknown): string => {
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name) ? error.name : 'Error';
  return `${name}: RAG sync operation failed`;
};

export class FalkorDBSyncQueue {
  constructor(private readonly graph: Graph, private readonly orgId: string) {}

  async enqueue(input: { sourcePath: string; operation: SyncOperation; contentHash: string; observedAt?: string }): Promise<void> {
    const observedAt = input.observedAt ?? new Date().toISOString();
    await this.graph.query(`
      MERGE (j:RAGSyncJob {orgId:$orgId,sourcePath:$sourcePath})
      ON CREATE SET j.id=$id,j.operation=$operation,j.contentHash=$contentHash,
        j.status='pending',j.attempts=0,j.createdAt=$observedAt,
        j.lastObservedAt=$observedAt,j.nextAttemptAt=$observedAt
      WITH j, (coalesce(j.contentHash,'') <> $contentHash OR coalesce(j.operation,'') <> $operation) AS changed
      SET j.status=CASE WHEN changed AND j.status<>'processing' THEN 'pending' ELSE j.status END,
        j.attempts=CASE WHEN changed THEN 0 ELSE coalesce(j.attempts,0) END,
        j.operation=$operation,j.contentHash=$contentHash,
        j.lastObservedAt=$observedAt,
        j.nextAttemptAt=CASE WHEN changed THEN $observedAt ELSE coalesce(j.nextAttemptAt,$observedAt) END,
        j.lastError=CASE WHEN changed THEN '' ELSE coalesce(j.lastError,'') END
    `, { params: { orgId: this.orgId, sourcePath: input.sourcePath, id: randomUUID(), operation: input.operation, contentHash: input.contentHash, observedAt } });
  }

  async claim(workerId: string, leaseMs: number): Promise<RAGSyncJob | undefined> {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + leaseMs).toISOString();
    const row = rows(await this.graph.query(`
      MATCH (j:RAGSyncJob {orgId:$orgId})
      WHERE (j.status='pending' AND coalesce(j.nextAttemptAt,'') <= $now)
        OR (j.status='processing' AND coalesce(j.leaseUntil,'') <= $now)
      WITH j ORDER BY j.createdAt,j.sourcePath LIMIT 1
      SET j.status='processing',j.leaseOwner=$workerId,j.leaseUntil=$leaseUntil,
        j.attempts=coalesce(j.attempts,0)+1,j.startedAt=$now
      RETURN j
    `, { params: { orgId: this.orgId, workerId, leaseUntil, now } }))[0]?.j as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id), orgId: String(row.orgId), sourcePath: String(row.sourcePath),
      operation: row.operation as SyncOperation, contentHash: String(row.contentHash ?? ''),
      attempts: Number(row.attempts ?? 1), status: row.status as SyncJobStatus,
      ...(typeof row.leaseOwner === 'string' ? { leaseOwner: row.leaseOwner } : {})
    };
  }

  async complete(job: RAGSyncJob, workerId: string, durationMs: number): Promise<void> {
    await this.graph.query(`
      MATCH (j:RAGSyncJob {orgId:$orgId,sourcePath:$sourcePath})
      WHERE j.status='processing' AND j.leaseOwner=$workerId
      WITH j, (j.contentHash <> $claimedHash OR j.operation <> $claimedOperation) AS superseded
      SET j.status=CASE WHEN superseded THEN 'pending' ELSE 'completed' END,
        j.completedAt=CASE WHEN superseded THEN coalesce(j.completedAt,'') ELSE $now END,
        j.lastDurationMs=$durationMs,
        j.nextAttemptAt=CASE WHEN superseded THEN $now ELSE coalesce(j.nextAttemptAt,$now) END,
        j.lastError=CASE WHEN superseded THEN 'Superseded by a newer source change.' ELSE '' END
      REMOVE j.leaseOwner,j.leaseUntil,j.startedAt
    `, { params: { orgId: this.orgId, sourcePath: job.sourcePath, workerId, claimedHash: job.contentHash, claimedOperation: job.operation, now: new Date().toISOString(), durationMs } });
  }

  async fail(job: RAGSyncJob, workerId: string, error: unknown, maxRetries: number, delayMs: number, durationMs: number): Promise<void> {
    const now = new Date().toISOString();
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    const exhausted = job.attempts >= maxRetries;
    await this.graph.query(`
      MATCH (j:RAGSyncJob {orgId:$orgId,sourcePath:$sourcePath})
      WHERE j.status='processing' AND j.leaseOwner=$workerId
      WITH j, (j.contentHash <> $claimedHash OR j.operation <> $claimedOperation) AS superseded
      SET j.status=CASE WHEN superseded THEN 'pending' WHEN $exhausted THEN 'dead' ELSE 'pending' END,
        j.nextAttemptAt=CASE WHEN superseded THEN $now WHEN $exhausted THEN $now ELSE $nextAttemptAt END,
        j.lastError=CASE WHEN superseded THEN 'Superseded by a newer source change.' ELSE $error END,
        j.lastDurationMs=$durationMs,
        j.failedAt=CASE WHEN $exhausted AND NOT superseded THEN $now ELSE coalesce(j.failedAt,'') END
      REMOVE j.leaseOwner,j.leaseUntil,j.startedAt
    `, { params: { orgId: this.orgId, sourcePath: job.sourcePath, workerId, claimedHash: job.contentHash, claimedOperation: job.operation, exhausted, now, nextAttemptAt, error: safeError(error), durationMs } });
  }

  async release(workerId: string): Promise<void> {
    await this.graph.query(`MATCH (j:RAGSyncJob {orgId:$orgId,status:'processing',leaseOwner:$workerId}) SET j.status='pending',j.nextAttemptAt=$now REMOVE j.leaseOwner,j.leaseUntil,j.startedAt`, { params: { orgId: this.orgId, workerId, now: new Date().toISOString() } });
  }

  async replayDeadLetters(): Promise<number> {
    const result = await this.graph.query(`MATCH (j:RAGSyncJob {orgId:$orgId,status:'dead'}) WITH j SET j.status='pending',j.attempts=0,j.nextAttemptAt=$now,j.lastError='' RETURN count(j) AS count`, { params: { orgId: this.orgId, now: new Date().toISOString() } });
    return Number(rows(result)[0]?.count ?? 0);
  }

  async status(): Promise<RAGSyncQueueStatus> {
    const data = rows(await this.graph.query(`MATCH (j:RAGSyncJob {orgId:$orgId}) RETURN j.status AS status,count(j) AS count,sum(coalesce(j.attempts,0)) AS attempts,max(j.lastObservedAt) AS lastObservedChange,max(CASE WHEN coalesce(j.lastError,'')<>'' THEN j.lastError ELSE null END) AS lastError,min(CASE WHEN j.status='pending' THEN j.createdAt ELSE null END) AS oldestPendingAt`, { params: { orgId: this.orgId } }));
    const result: RAGSyncQueueStatus = { pending: 0, processing: 0, completed: 0, failed: 0, retries: 0, lastObservedChange: null, lastError: null, oldestPendingAt: null, lagMs: 0 };
    for (const row of data) {
      const status = String(row.status);
      const count = Number(row.count ?? 0);
      if (status === 'pending') result.pending = count;
      else if (status === 'processing') result.processing = count;
      else if (status === 'completed') result.completed = count;
      else if (status === 'dead') result.failed = count;
      result.retries += Math.max(0, Number(row.attempts ?? 0) - count);
      if (typeof row.lastObservedChange === 'string' && (!result.lastObservedChange || row.lastObservedChange > result.lastObservedChange)) result.lastObservedChange = row.lastObservedChange;
      if (typeof row.lastError === 'string' && row.lastError) result.lastError = row.lastError;
      if (typeof row.oldestPendingAt === 'string' && (!result.oldestPendingAt || row.oldestPendingAt < result.oldestPendingAt)) result.oldestPendingAt = row.oldestPendingAt;
    }
    result.lagMs = result.oldestPendingAt ? Math.max(0, Date.now() - Date.parse(result.oldestPendingAt)) : 0;
    return result;
  }
}
