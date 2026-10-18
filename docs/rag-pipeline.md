# OrgInGraphs RAG pipeline

The Company Brain reuses the backend's existing LangGraph source discovery, chunking, and retrieval flow. Company and employee records come from the seeded graph data; Markdown documentation and the existing source catalog are also indexed. The graph assistant remains available for ownership and relationship questions.

## Storage and models

- **Embeddings:** `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2`, 384 dimensions, mean pooling, normalized vectors. The model loads lazily once per backend process and its files are cached by Transformers.js.
- **Production vectors:** FalkorDB `RAGChunk` nodes and a cosine HNSW vector index. FalkorDB introduced vector indexes in newer server versions, so `CALL db.indexes()` compatibility is checked on first use. An older server produces a clear unavailable status; it does not silently write vectors to the local JSON store.
- **Local tests and development without a graph:** the existing JSON-backed store remains available as a local fallback. It is not used when the agent is constructed with the production FalkorDB graph.
- **Generation:** the OpenAI JavaScript SDK calls the OpenAI-compatible Bedrock Mantle endpoint. The default model is `openai.gpt-oss-120b`.

FalkorDB vector index initialization runs on first ingestion or retrieval. No separate schema migration is required. The RAG nodes share the configured `FALKORDB_GRAPH`/`FALKORDB_DATABASE` graph with the existing knowledge graph and carry an `orgId` property used for tenant filtering. Search uses the graph vector index, then applies tenant and source filters before returning text to the model.

## Configuration

Copy `backend/.env.example` to `backend/.env`, then set the existing FalkorDB connection values. Configure:

```env
AWS_BEARER_TOKEN_BEDROCK=your_bedrock_bearer_api_key
BEDROCK_BASE_URL=https://bedrock-mantle.us-east-1.api.aws/v1
BEDROCK_MODEL=openai.gpt-oss-120b
BEDROCK_MAX_TOKENS=1000
BEDROCK_TEMPERATURE=0.2
BEDROCK_TIMEOUT_MS=45000
RAG_ADMIN_API_KEY=long-random-server-side-value
ORGANIZATION_ID=hirenova
RAG_EMBEDDING_PROVIDER=local
RAG_CHUNK_MAX_CHARS=2000
RAG_CHUNK_OVERLAP_CHARS=300
RAG_AUTO_SYNC_ENABLED=true
RAG_SYNC_POLL_INTERVAL_MS=60000
RAG_SYNC_BATCH_SIZE=25
RAG_SYNC_CONCURRENCY=4
RAG_SYNC_MAX_RETRIES=5
```

`RAG_ADMIN_API_KEY` authorizes RAG ingestion and re-index routes through the `x-rag-admin-key` header. It must only be used by a trusted backend administrator and must never be added to the Next.js bundle. The current application identifies users using its existing `x-orgmind-user-id` demo workspace header. Put the API behind the deployment's trusted authentication layer before treating that client supplied identity as proof of user or workspace membership; this repository does not yet include a signed session/JWT provider or source-system ACL connector.

## API

All RAG routes require the existing `x-orgmind-user-id` email identity. Ingestion and re-index also require the administrator key.

```http
POST /api/rag/query
Content-Type: application/json
x-orgmind-user-id: admin@hirenova.example

{"question":"Why was the authentication service changed?","filters":{"sourceTypes":["confluence","jira","github"]}}
```

The response has `answer`, `sources` with actual `documentId`/`chunkId`/score values and an excerpt from the retrieved chunk, a `citationIds` list that preserves the model's `[S1]` chunk-to-source mapping when multiple chunks belong to one document, a `retrieval` count, and `evidenceFound`. `excerpt` and `citationIds` are optional for older clients. When no relevant evidence survives filtering, the assistant explicitly reports that.

```http
POST /api/rag/ingest
x-orgmind-user-id: admin@hirenova.example
x-rag-admin-key: <server-side admin key>
Content-Type: application/json

{"sources":["docs/architecture.md"],"force":false}
```

Omit `sources` for a full source scan. Use `POST /api/rag/reindex` with `{}` for a full re-index, or `{ "sourcePath": "docs/architecture.md" }` for one source. `GET /api/rag/status` reports indexed counts, the sync worker state, last observed change, pending/processing/completed/dead job counts, retries, lag, and a sanitized last error. `POST /api/rag/sync/replay` (same admin authorization as ingestion) retries dead-letter jobs.

## Automatic incremental synchronization

The backend starts one polling worker after it connects to FalkorDB. The queue is stored as `RAGSyncJob` nodes in the configured FalkorDB graph, so pending jobs survive process restarts and multiple server processes share leases. Each successful full source scan compares stable source paths and SHA-256 content hashes. Only new or changed source documents are sent through the existing chunker, MiniLM embedding service, and vector store. Unchanged hashes are skipped. Deleted sources are queued only after a complete live source scan; each deletion is checked again immediately before indexed chunks are removed. A failed or partial scan does not trigger deletion. Source chunks use content-addressed IDs, and updated chunks remain inactive until the complete new set is written, so an interrupted replacement leaves the last complete version searchable.

Jobs are deduplicated by organization and source path, carry the latest observed operation/hash, use bounded concurrency and batch size, and are protected by expiring leases. Failures are retried with exponential backoff and jitter up to `RAG_SYNC_MAX_RETRIES`; exhausted jobs remain in dead-letter state until replayed. Shutdown waits for the active poll cycle, then releases the worker's leases to pending state. The first successful worker scan bootstraps an empty index through normal incremental ingestion; `npm run rag:rebuild` remains available for an intentional full rebuild.

All currently discoverable RAG sources use polling; there is no CDC feed or webhook receiver in this repository. Repository documentation and README files are read from disk, route catalog entries come from the backend registry, and live company records are read from FalkorDB. When a Confluence, Jira, GitHub, or Slack connector is configured, the worker also uses the existing server-side fetcher on each poll and persists only verified, changed records through the existing document processor. A per-record hash checkpoint prevents unchanged records from being reprocessed. The fetchers return bounded pages (at most 100 records per connector poll), so they can detect new and updated records in those responses but cannot safely infer deletions from absence. Delete a connector record from its authoritative graph data, or add a source API that provides a complete snapshot or authenticated deletion webhooks, before expecting its vectors to be removed automatically.

The worker uses only indexed vector-store records for reconciliation and scopes queue and chunk operations by `ORGANIZATION_ID`. It never deletes graph entities or unrelated indexes. To disable the worker set `RAG_AUTO_SYNC_ENABLED=false`; interval must be 1,000–86,400,000 ms, batch size 1–1,000, concurrency 1–32, and maximum attempts 1–20. These values are validated at backend startup.

Existing `/api/organization/query`, `/api/organization/ingest`, `/api/organization/reindex`, and status/source routes remain for current frontend compatibility.

## Operations and diagnostics

```bash
cd backend
npm install
npm run rag:rebuild
npm run rag:verify
npm test
npm run build
```

`rag:rebuild` replaces this organization's current index from discovered sources. `rag:verify` checks local embedding initialization, FalkorDB vector-index operations, a temporary sample document upsert/retrieval, Bedrock connectivity, and citation output. It requires reachable services and valid credentials; it exits nonzero when a check fails and removes its temporary document.

The Next.js Company knowledge assistant sends `{ "question": "..." }` to `POST /api/rag/query` at `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080`). The backend performs embedding, FalkorDB retrieval, and Bedrock Mantle generation, then returns `answer`, `sources` (`documentId`, `chunkId`, `sourceType`, `title`, optional `url`/`excerpt`/`citationIds`, and `score`), `retrieval`, and `evidenceFound`. The UI renders Markdown safely, links answer citations to expandable source cards, and retains turns in frontend state for the current session. Connection status comes from `GET /health`, not a UI constant. The RAG query endpoint does not provide persistent conversational memory or structured project/person UI blocks; the separate graph assistant continues to render its validated structured response.

The frontend API base URL is public configuration, not a secret. `AWS_BEARER_TOKEN_BEDROCK`, FalkorDB credentials, and the RAG admin key remain in `backend/.env`; never add them to a `NEXT_PUBLIC_*` variable. The frontend uses the existing `x-orgmind-user-id` workspace header required by the backend. This repository currently validates that demo identity as an email; it does not implement signed user authentication, so deploy behind the application's trusted authentication layer before relying on user identity for authorization.
