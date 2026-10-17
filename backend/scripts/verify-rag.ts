import { OrganizationIntelligenceAgent } from '../src/agents/organization-intelligence/agent.js';
import { runRetrievalGraph } from '../src/agents/organization-intelligence/workflow/retrieval-graph.js';
import { modelInstanceConfig } from '../src/models/config.js';

const agent = new OrganizationIntelligenceAgent({ useMockEmbeddings: true });
const bedrock = modelInstanceConfig('default', { ...process.env, MODEL_PROVIDER: 'bedrock', MODEL_DEFAULT_ID: 'deepseek.v3.2' });
console.log(JSON.stringify({ answerModel: bedrock.modelId, bedrockCredentialLoaded: Boolean(bedrock.apiKey), embeddingProvider: 'offline-local' }));
const cases = ['how many departments are there?', 'is the design team there?'];

for (const query of cases) {
  const response = await runRetrievalGraph(
    { query, topK: 8 },
    {
      vectorStore: agent.vectorStore,
      embeddingService: agent.embeddingService,
      model: async () => 'Local retrieval check passed.'
    }
  );
  console.log(JSON.stringify({ query, status: response.status, chunks: response.retrieved_chunks.length, sources: response.sources.slice(0, 3).map((source) => source.title) }));
  if (!response.retrieved_chunks.length) process.exitCode = 1;
}
