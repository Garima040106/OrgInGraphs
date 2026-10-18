import { createApp } from './api/app.js';
import { connectGraph } from './db/falkordb.js';
import { env } from './config/env.js';

export async function startServer() {
  if (!process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
    console.warn('RAG answer generation is not configured. Set AWS_BEARER_TOKEN_BEDROCK in backend/.env to enable Amazon Bedrock.');
  }
  const { db, graph } = await connectGraph();
  const server = createApp(graph).listen(env.PORT, () => console.log(`OrgInGraphs backend listening on port ${env.PORT}`));
  const close = async () => { server.close(); await db.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
  return server;
}
