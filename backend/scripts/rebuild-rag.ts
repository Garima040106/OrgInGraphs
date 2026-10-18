import { OrganizationIntelligenceAgent } from '../src/agents/organization-intelligence/agent.js';
import { connectGraph } from '../src/db/falkordb.js';
import { rows } from '../src/db/falkordb.js';
import { FalkorDBVectorStore } from '../src/agents/organization-intelligence/vector-store/falkordb-vector-store.js';

const { db, graph } = await connectGraph();
const agent = new OrganizationIntelligenceAgent({ graph, orgId: process.env.ORGANIZATION_ID ?? 'hirenova' });

try {
  const result = await agent.ingest({ forceReindex: true });
  console.log('RAG rebuild finished:', {
    status: result.status,
    sources: result.stats.totalSources,
    generatedChunks: result.stats.generatedChunks ?? 0,
    storedChunks: result.stats.totalChunks,
    failedSources: result.stats.failed,
    failedChunks: result.stats.failedChunks ?? 0,
    processed: result.stats.processed,
    errors: result.errors
  });
  const vectorStore = agent.vectorStore instanceof FalkorDBVectorStore ? agent.vectorStore : undefined;
  let semanticRetrieval: { passed: boolean; sourcePath?: string; chunkId?: string } = { passed: false };
  if (vectorStore && result.stats.totalChunks > 0) {
    const sample = rows(await graph.query('MATCH (c:RAGChunk {orgId:$orgId}) RETURN c.chunkText AS text,c.sourcePath AS sourcePath,c.chunkId AS chunkId LIMIT 1', { params: { orgId: process.env.ORGANIZATION_ID ?? 'hirenova' } }))[0];
    if (sample) {
      const query = String(sample.text ?? '').slice(0, 1200);
      const embedding = await agent.embeddingService.embedText(query);
      const matches = await vectorStore.search(embedding, { topK: 20, threshold: 0, sourcePath: String(sample.sourcePath), orgId: process.env.ORGANIZATION_ID ?? 'hirenova' });
      const relevant = matches.find((match) => match.chunk.metadata.sourcePath === String(sample.sourcePath));
      semanticRetrieval = { passed: Boolean(relevant), sourcePath: String(sample.sourcePath), ...(relevant ? { chunkId: relevant.chunk.id } : {}) };
    }
  }
  console.log('RAG verification:', { indexStatus: vectorStore?.healthy ? 'ready' : 'unavailable', semanticRetrieval });
  if (result.status === 'failed' || result.stats.totalChunks === 0) process.exitCode = 1;
  if (!semanticRetrieval.passed) process.exitCode = 1;
} finally { await db.close(); }
