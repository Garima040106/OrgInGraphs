import { randomUUID } from 'node:crypto';
import { connectGraph } from '../src/db/falkordb.js';
import { EmbeddingService } from '../src/services/embedding.service.js';
import { BedrockService } from '../src/services/bedrock.service.js';
import { FalkorDBVectorStore } from '../src/agents/organization-intelligence/vector-store/falkordb-vector-store.js';
import type { DocumentChunk } from '../src/agents/organization-intelligence/types.js';

const sampleText = 'Diagnostic sample: the blue lantern protocol is owned by the reliability group and is reviewed every Thursday.';
const sourcePath = `diagnostic/${randomUUID()}`;
const chunkId = `diagnostic:${sourcePath}:0`;
const embeddingService = new EmbeddingService();
const statuses: Record<string, boolean> = { embedding: false, vectorStore: false, sampleIndexed: false, retrieval: false, bedrock: false, citation: false };
let connected: Awaited<ReturnType<typeof connectGraph>> | undefined;
let store: FalkorDBVectorStore | undefined;
let sampleWritten = false;
let vector: number[] | undefined;
let retrievedText: string | undefined;

try {
  try {
    vector = await embeddingService.embedText(sampleText);
    statuses.embedding = vector.length === 384 && vector.every(Number.isFinite);
  } catch (error) { console.error(`Embedding check failed: ${error instanceof Error ? error.message : 'model unavailable'}`); }

  try {
    connected = await connectGraph();
    store = new FalkorDBVectorStore(connected.graph, process.env.ORGANIZATION_ID ?? 'hirenova');
    await store.initialize();
    statuses.vectorStore = store.healthy;
  } catch (error) { console.error(`Vector-store check failed: ${error instanceof Error ? error.message : 'database unavailable'}`); }

  if (store && vector && statuses.embedding) {
    try {
      const now = new Date().toISOString();
      const chunk: DocumentChunk = {
        id: chunkId,
        text: sampleText,
        embedding: vector,
        metadata: { chunkId, orgId: process.env.ORGANIZATION_ID ?? 'hirenova', sourceType: 'documentation', sourcePath, title: 'RAG diagnostic sample', contentHash: 'diagnostic', docHash: 'diagnostic', createdAt: now, updatedAt: now }
      };
      await store.upsertDocumentChunks({ path: sourcePath, title: 'RAG diagnostic sample', sourceType: 'documentation', docHash: 'diagnostic', chunkIds: [chunkId], updatedAt: now }, [chunk]);
      sampleWritten = true;
      statuses.sampleIndexed = Boolean(await store.getDocument(sourcePath));
      const question = 'Which group owns the blue lantern protocol?';
      const queryVector = await embeddingService.embedText(question);
      const retrieved = await store.search(queryVector, { topK: 5, threshold: 0.1, orgId: process.env.ORGANIZATION_ID ?? 'hirenova', sourcePath });
      statuses.retrieval = retrieved.some((item) => item.chunk.id === chunkId);
      retrievedText = retrieved[0]?.chunk.text;
    } catch (error) { console.error(`Sample index/retrieval check failed: ${error instanceof Error ? error.message : 'retrieval unavailable'}`); }
  }

  try {
    const prompt = retrievedText
      ? `Question: Which group owns the blue lantern protocol?\nEvidence: [S1 documentId=${sourcePath} chunkId=${chunkId}] ${retrievedText}`
      : 'Reply with the single word ready.';
    const answer = await new BedrockService().generate(retrievedText ? 'Answer using only this evidence. Cite the source with [S1].' : 'Return the requested short diagnostic response.', prompt);
    statuses.bedrock = Boolean(answer.trim());
    statuses.citation = statuses.retrieval && /\[S1\]/.test(answer);
  } catch (error) { console.error(`Bedrock check failed: ${error instanceof Error ? error.message : 'model unavailable'}`); }
} finally {
  if (connected) {
    if (sampleWritten && store) {
      try { await store.removeDocument(sourcePath); }
      catch { console.error('RAG diagnostic could not remove its temporary sample document.'); }
    }
    await connected.db.close();
  }
  console.log(JSON.stringify({ checks: statuses }));
}

if (Object.values(statuses).some((passed) => !passed)) process.exitCode = 1;
