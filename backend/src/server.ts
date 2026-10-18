import { createApp } from './api/app.js';
import { connectGraph } from './db/falkordb.js';
import { env } from './config/env.js';
import { getOrganizationIntelligenceAgent } from './agents/organization-intelligence/agent.js';
import { RAGSyncWorker } from './agents/organization-intelligence/sync/rag-sync-worker.js';

export async function startServer() {
  if (!process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
    console.warn('RAG answer generation is not configured. Set AWS_BEARER_TOKEN_BEDROCK in backend/.env to enable Amazon Bedrock.');
  }
  const { db, graph } = await connectGraph();
  const agent1 = getOrganizationIntelligenceAgent({ graph, orgId: env.ORGANIZATION_ID });
  const ragSyncWorker = new RAGSyncWorker(graph, agent1, {
    enabled: env.RAG_AUTO_SYNC_ENABLED === 'true',
    pollIntervalMs: env.RAG_SYNC_POLL_INTERVAL_MS,
    batchSize: env.RAG_SYNC_BATCH_SIZE,
    concurrency: env.RAG_SYNC_CONCURRENCY,
    maxRetries: env.RAG_SYNC_MAX_RETRIES
  });
  const app = createApp(graph, { agent1, ragSyncWorker });
  const server = app.listen(env.PORT, () => console.log(`OrgInGraphs backend listening on port ${env.PORT}`));
  ragSyncWorker.start();
  const close = async () => {
    await ragSyncWorker.stop();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  };
  process.once('SIGINT', close); process.once('SIGTERM', close);
  return server;
}
