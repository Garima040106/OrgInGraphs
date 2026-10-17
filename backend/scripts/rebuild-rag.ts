import { OrganizationIntelligenceAgent } from '../src/agents/organization-intelligence/agent.js';

const agent = new OrganizationIntelligenceAgent({ useMockEmbeddings: true });
agent.clear();

const result = await agent.ingest({ forceReindex: true });
console.log('RAG seed rebuild finished:', {
  status: result.status,
  sources: result.stats.totalSources,
  chunks: result.stats.totalChunks,
  processed: result.stats.processed,
  failed: result.stats.failed,
  errors: result.errors
});

if (result.status === 'failed' || result.stats.totalChunks === 0) process.exitCode = 1;
