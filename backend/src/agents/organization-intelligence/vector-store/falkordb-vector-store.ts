import type { Graph } from 'falkordb';
import { EMBEDDING_DIMENSIONS } from '../embeddings/gemini-embeddings.js';
import type { DocumentChunk, IngestionStats, SearchResult, SourceType, VectorStoreDocumentEntry } from '../types.js';
import { rows } from '../../../db/falkordb.js';

const LABEL = 'RAGChunk';
const PROPERTY = 'embedding';
const json = (value: unknown) => JSON.stringify(value ?? {});
const vectorLiteral = (vector: number[]) => {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Expected exactly ${EMBEDDING_DIMENSIONS} finite numeric embedding values.`);
  return `vecf32([${vector.join(',')}])`;
};

type VectorIndexInfo = { entity: string; property: string; type: string; dimension?: number; similarity?: string; raw: string };

function vectorIndexes(result: { headers?: string[]; data?: unknown[] }): VectorIndexInfo[] {
  return rows(result).map((row) => {
    const raw = JSON.stringify(row);
    const flat = Object.entries(row).map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(',') : String(value)}`).join(' ');
    const metadata = `${flat} ${raw}`;
    const dimension = metadata.match(/(?:dimension|dim)\D{0,8}(\d+)/i)?.[1];
    const similarity = metadata.match(/(?:similarityFunction|similarity|metric)\D{0,8}(cosine|euclidean|l2|ip)/i)?.[1]?.toLowerCase();
    return {
      entity: /RAGChunk/i.test(flat) ? LABEL : '',
      property: /embedding/i.test(flat) ? PROPERTY : '',
      type: /VECTOR/i.test(metadata) ? 'VECTOR' : '',
      ...(dimension ? { dimension: Number(dimension) } : {}),
      ...(similarity ? { similarity } : {}),
      raw: `${flat} ${raw}`
    };
  }).filter((index) => index.entity === LABEL && index.property === PROPERTY);
}

export class FalkorDBVectorStore {
  readonly graph: Graph;
  readonly orgId: string;
  healthy = false;
  private initialized = false;
  private initialization?: Promise<void>;
  private lastUpdated = new Date().toISOString();
  private readonly documentCache = new Map<string, VectorStoreDocumentEntry>();

  constructor(graph: Graph, orgId = 'hirenova') { this.graph = graph; this.orgId = orgId; }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.initialization) this.initialization = this.ensureVectorIndex();
    try { await this.initialization; }
    catch (error) { this.initialization = undefined; throw error; }
  }

  private async ensureVectorIndex(): Promise<void> {
    const readIndexes = async () => vectorIndexes(await this.graph.query('CALL db.indexes()'));
    const validate = (found: VectorIndexInfo[]) => {
      const vectorIndexes = found.filter((index) => index.type === 'VECTOR');
      if (vectorIndexes.length > 1) throw new Error(`Multiple vector indexes already target ${LABEL}.${PROPERTY}; no index was changed. Review the graph index listing and remove duplicate definitions only after confirming their use.`);
      const vector = vectorIndexes[0];
      if (!vector) throw new Error(`An index already uses ${LABEL}.${PROPERTY}, but it is not identifiable as a vector index: ${found[0]?.raw ?? 'unknown index metadata'}`);
      if (vector.dimension !== EMBEDDING_DIMENSIONS || vector.similarity !== 'cosine') {
        throw new Error(`Existing ${LABEL}.${PROPERTY} vector index is incompatible (dimension=${vector.dimension ?? 'unknown'}, similarity=${vector.similarity ?? 'unknown'}); expected dimension=${EMBEDDING_DIMENSIONS}, similarity=cosine. Migrate by building a new label/property and reindexing before switching; existing data was preserved.`);
      }
    };

    let found = await readIndexes();
    if (found.length) {
      validate(found);
    } else {
      try {
        await this.graph.query(`CREATE VECTOR INDEX FOR (c:${LABEL}) ON (c.${PROPERTY}) OPTIONS {dimension:${EMBEDDING_DIMENSIONS},similarityFunction:'cosine',M:16,efConstruction:200}`);
      } catch (error) {
        // A concurrent initializer may have won the create race. Accept only a
        // now-visible, compatible index; preserve the original error otherwise.
        found = await readIndexes().catch(() => []);
        if (!found.length) throw error;
        validate(found);
      }
    }
    this.healthy = true;
    this.initialized = true;
  }

  async getDocument(sourcePath: string): Promise<VectorStoreDocumentEntry | undefined> {
    const entry = this.documentCache.get(sourcePath);
    if (entry) return entry;
    const found = rows(await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId,sourcePath:$sourcePath}) WHERE coalesce(c.active,true)=true RETURN c.documentTitle AS title,c.sourceType AS sourceType,c.docHash AS docHash,c.updatedAt AS updatedAt,collect(c.chunkId) AS chunkIds LIMIT 1`, { params: { orgId: this.orgId, sourcePath } }))[0];
    if (!found) return undefined;
    const document: VectorStoreDocumentEntry = { path: sourcePath, title: String(found.title ?? sourcePath), sourceType: found.sourceType as SourceType, docHash: String(found.docHash ?? ''), updatedAt: String(found.updatedAt ?? ''), chunkIds: Array.isArray(found.chunkIds) ? found.chunkIds.map(String) : [] };
    this.documentCache.set(sourcePath, document);
    return document;
  }

  async hasDocumentWithHash(sourcePath: string, docHash: string): Promise<boolean> {
    const entry = await this.getDocument(sourcePath);
    return Boolean(entry && entry.docHash === docHash);
  }

  async upsertDocumentChunks(entry: VectorStoreDocumentEntry, chunks: DocumentChunk[], _persist = true): Promise<void> {
    const timestamp = new Date().toISOString();
    const chunkIds = chunks.map((chunk) => chunk.id);
    try {
      for (const chunk of chunks) {
        if (!chunk.embedding) throw new Error(`Chunk ${chunk.id} is missing an embedding.`);
        const embedding = vectorLiteral(chunk.embedding);
        await this.graph.query(`MERGE (c:${LABEL} {orgId:$orgId,chunkId:$chunkId}) SET c.active=CASE WHEN coalesce(c.docHash,'')=$docHash THEN coalesce(c.active,true) ELSE false END,c.sourcePath=$sourcePath,c.documentTitle=$title,c.sourceType=$sourceType,c.docHash=$docHash,c.chunkText=$text,c.metadataJson=$metadata,c.url=$url,c.updatedAt=$updatedAt,c.embedding=${embedding}`, {
          params: { chunkId: chunk.id, orgId: this.orgId, sourcePath: entry.path, title: entry.title, sourceType: entry.sourceType, docHash: entry.docHash, text: chunk.text, metadata: json(chunk.metadata), url: String(chunk.metadata.url ?? ''), updatedAt: timestamp }
        });
      }
    } catch (error) {
      // New versions use content-addressed chunk IDs and remain invisible until
      // the complete replacement is ready. Remove only staged, inactive data.
      await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId,sourcePath:$sourcePath,docHash:$docHash,active:false}) DETACH DELETE c`, { params: { orgId: this.orgId, sourcePath: entry.path, docHash: entry.docHash } }).catch(() => undefined);
      throw error;
    }
    if (chunkIds.length) {
      await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId}) WHERE c.chunkId IN $chunkIds SET c.active=true`, { params: { orgId: this.orgId, chunkIds } });
      // Only remove superseded chunks after every replacement was written and activated.
      await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId,sourcePath:$sourcePath}) WHERE NOT c.chunkId IN $chunkIds DETACH DELETE c`, { params: { orgId: this.orgId, sourcePath: entry.path, chunkIds } });
    } else {
      await this.removeDocument(entry.path);
    }
    const saved = { ...entry, chunkIds: chunks.map((chunk) => chunk.id), updatedAt: timestamp };
    this.documentCache.set(entry.path, saved);
    this.lastUpdated = timestamp;
  }

  async removeDocument(sourcePath: string): Promise<boolean> {
    const result = await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId,sourcePath:$sourcePath}) WITH collect(c) AS chunks FOREACH (c IN chunks | DETACH DELETE c) RETURN size(chunks) AS deleted`, { params: { orgId: this.orgId, sourcePath } });
    this.documentCache.delete(sourcePath);
    this.lastUpdated = new Date().toISOString();
    return Number(rows(result)[0]?.deleted ?? 0) > 0;
  }

  async cleanStaleSources(currentPaths: Set<string>): Promise<string[]> {
    const all = rows(await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId}) RETURN DISTINCT c.sourcePath AS sourcePath`, { params: { orgId: this.orgId } })).map((item) => String(item.sourcePath));
    const stale = all.filter((sourcePath) => !currentPaths.has(sourcePath));
    for (const sourcePath of stale) await this.removeDocument(sourcePath);
    return stale;
  }

  async search(queryEmbedding: number[], options: { topK?: number; threshold?: number; orgId?: string; sourceTypes?: SourceType[]; sourcePlatforms?: Array<'jira' | 'confluence' | 'slack' | 'github' | 'route' | 'database'>; sourcePath?: string; queryText?: string } = {}): Promise<SearchResult[]> {
    await this.initialize();
    const embedding = vectorLiteral(queryEmbedding);
    const candidateCount = Math.min(100, (options.topK ?? 5) * 8);
    const found = rows(await this.graph.query(`CALL db.idx.vector.queryNodes('${LABEL}','embedding',${candidateCount},${embedding}) YIELD node,score WITH node,score WHERE coalesce(node.active,true)=true RETURN node,score`, {}));
    const queryText = options.queryText ?? '';
    const asksTeamFacts = /\b(team|teams|owner|owners|lead|leads|responsible|responsibility)\b/i.test(queryText);
    const asksLatestProduct = /\b(latest|lates|newest|most recent)\b/i.test(queryText) && /\b(product|products|working on)\b/i.test(queryText);
    const asksFrontendResponsibility = /\b(front.?end|web team)\b/i.test(queryText) && /\b(who|responsible|owner|lead|team)\b/i.test(queryText);
    if (asksTeamFacts || asksLatestProduct || asksFrontendResponsibility) {
      const summaries = rows(await this.graph.query(`MATCH (node:${LABEL} {orgId:$orgId})
        WHERE coalesce(node.active,true)=true AND (
          ($includeTeams AND toLower(coalesce(node.sourcePath,'')) CONTAINS '/teams') OR
          ($includeProducts AND toLower(coalesce(node.sourcePath,'')) CONTAINS '/products') OR
          ($includeResponsibilities AND toLower(coalesce(node.sourcePath,'')) CONTAINS 'frontend-responsibility')
        ) RETURN node,1.0 AS score`, {
        params: { orgId: options.orgId ?? this.orgId, includeTeams: asksTeamFacts, includeProducts: asksLatestProduct, includeResponsibilities: asksFrontendResponsibility }
      }));
      found.push(...summaries);
    }
    const allowedTypes = options.sourceTypes ? new Set(options.sourceTypes) : undefined;
    const allowedPlatforms = options.sourcePlatforms ? new Set(options.sourcePlatforms) : undefined;
    return found.flatMap((row) => {
      const properties = (row.node as { properties?: Record<string, unknown> } | undefined)?.properties ?? row.node as Record<string, unknown> | undefined;
      if (!properties || properties.orgId !== (options.orgId ?? this.orgId) || (allowedTypes && !allowedTypes.has(properties.sourceType as SourceType)) || (options.sourcePath && properties.sourcePath !== options.sourcePath)) return [];
      const metadata = (() => { try { return JSON.parse(String(properties.metadataJson ?? '{}')) as DocumentChunk['metadata']; } catch { return {} as DocumentChunk['metadata']; } })();
      const chunk: DocumentChunk = { id: String(properties.chunkId), text: String(properties.chunkText ?? ''), metadata: { ...metadata, chunkId: String(properties.chunkId), orgId: String(properties.orgId), sourceType: properties.sourceType as SourceType, sourcePath: String(properties.sourcePath), title: String(properties.documentTitle ?? '') } };
      if (allowedPlatforms) {
        const path = chunk.metadata.sourcePath.toLowerCase();
        const raw = typeof chunk.metadata.sourceSystem === 'string' ? chunk.metadata.sourceSystem.toLowerCase() : '';
        const platform = raw || (path.includes('jira') ? 'jira' : path.includes('github') ? 'github' : path.includes('slack') ? 'slack' : path.startsWith('/api/') || path.startsWith('route:') ? 'route' : path.endsWith('.md') || path.includes('confluence') ? 'confluence' : 'database');
        if (!allowedPlatforms.has(platform as 'jira' | 'confluence' | 'slack' | 'github' | 'route' | 'database')) return [];
      }
      const score = Number(row.score);
      return Number.isFinite(score) && score >= (options.threshold ?? 0.1) ? [{ chunk, score }] : [];
    }).sort((a, b) => b.score - a.score).slice(0, options.topK ?? 5);
  }

  async getStats(): Promise<IngestionStats> {
    await this.initialize();
    const found = rows(await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId}) WHERE coalesce(c.active,true)=true RETURN count(c) AS chunks,count(DISTINCT c.sourcePath) AS documents,max(c.updatedAt) AS updatedAt`, { params: { orgId: this.orgId } }))[0] ?? {};
    const job = rows(await this.graph.query('MATCH (s:RAGIndexStatus {orgId:$orgId}) RETURN s.pendingWork AS pendingWork,s.failedWork AS failedWork,s.lastSuccessfulIngestion AS lastSuccessfulIngestion LIMIT 1', { params: { orgId: this.orgId } }))[0] ?? {};
    const breakdown: Record<SourceType, number> = { route: 0, documentation: 0, database: 0, api: 0 };
    const types = rows(await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId}) WHERE coalesce(c.active,true)=true RETURN DISTINCT c.sourceType AS sourceType,count(DISTINCT c.sourcePath) AS count`, { params: { orgId: this.orgId } }));
    for (const item of types) if (String(item.sourceType) in breakdown) breakdown[item.sourceType as SourceType] = Number(item.count ?? 0);
    return { totalSources: Number(found.documents ?? 0), processed: Number(found.documents ?? 0), skipped: 0, updated: 0, failed: Number(job.failedWork ?? 0), failedWork: Number(job.failedWork ?? 0), pendingWork: Number(job.pendingWork ?? 0), totalChunks: Number(found.chunks ?? 0), lastIngestedAt: String(job.lastSuccessfulIngestion ?? found.updatedAt ?? this.lastUpdated), lastSuccessfulIngestion: typeof job.lastSuccessfulIngestion === 'string' ? job.lastSuccessfulIngestion : undefined, sourceTypeBreakdown: breakdown };
  }

  async countOrganizationEntities(entity: 'Employee' | 'Team'): Promise<number> {
    const result = rows(await this.graph.query(`MATCH (n:${entity}) RETURN count(DISTINCT n) AS count`));
    const count = Number(result[0]?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`FalkorDB returned an invalid ${entity} count.`);
    return count;
  }

  async getOrganizationEntityNames(entity: 'Employee' | 'Team'): Promise<string[]> {
    const result = rows(await this.graph.query(`MATCH (n:${entity}) WHERE coalesce(n.name,n.title,n.id) IS NOT NULL RETURN DISTINCT coalesce(n.name,n.title,n.id) AS name ORDER BY name`));
    return result.flatMap((row) => {
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      return name ? [name] : [];
    });
  }

  async getLatestOrganizationProduct(): Promise<{ id: string; name: string; status?: string; updatedAt?: string; description?: string } | null> {
    const result = rows(await this.graph.query(`MATCH (p:Product)
      RETURN p.id AS id,coalesce(p.name,p.title,p.summary,p.id) AS name,p.status AS status,
        coalesce(p.updatedAt,p.updated,p.createdAt,p.created) AS updatedAt,
        coalesce(p.description,p.summary,p.overview) AS description
      ORDER BY coalesce(p.updatedAt,p.updated,p.createdAt,p.created) DESC LIMIT 1`));
    const row = result[0];
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    if (!row || !name) return null;
    return {
      id: String(row.id ?? name),
      name,
      ...(typeof row.status === 'string' && row.status ? { status: row.status } : {}),
      ...(typeof row.updatedAt === 'string' && row.updatedAt ? { updatedAt: row.updatedAt } : {}),
      ...(typeof row.description === 'string' && row.description ? { description: row.description } : {})
    };
  }

  async countVerifiedJiraIssues(): Promise<number> {
    const result = rows(await this.graph.query(`MATCH (n) WHERE (n:Ticket OR n:Bug)
      AND toLower(coalesce(n.sourceSystem,''))='jira'
      AND ((coalesce(n.synthetic,false)=false AND n.provenance IN ['external-verified','user-provided']) OR n.provenance='mock-verified')
      AND n.sourceRecordId IS NOT NULL
      RETURN count(DISTINCT n.sourceRecordId) AS count`));
    const count = Number(result[0]?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('FalkorDB returned an invalid verified Jira issue count.');
    return count;
  }

  async getRecentVerifiedJiraIssues(limit = 5): Promise<Array<{ id: string; key: string; summary: string; status?: string; priority?: string; updatedAt?: string; url?: string }>> {
    const result = rows(await this.graph.query(`MATCH (n) WHERE (n:Ticket OR n:Bug)
      AND toLower(coalesce(n.sourceSystem,''))='jira'
      AND ((coalesce(n.synthetic,false)=false AND n.provenance IN ['external-verified','user-provided']) OR n.provenance='mock-verified')
      AND n.sourceRecordId IS NOT NULL
      RETURN n.id AS id, coalesce(n.key,n.sourceRecordKey,n.sourceRecordId) AS issueKey,
        coalesce(n.summary,n.title,n.name) AS summary, n.status AS status, n.priority AS priority,
        coalesce(n.updatedAt,n.updated,n.createdAt,n.created) AS updatedAt,
        coalesce(n.externalUrl,n.url) AS url
      ORDER BY updatedAt DESC LIMIT $limit`, { params: { limit } }));
    return result.flatMap((row) => {
      const id = String(row.id ?? '');
      const key = String(row.issueKey ?? '');
      const summary = String(row.summary ?? '').trim();
      if (!key || !summary) return [];
      return [{ id, key, summary, ...(typeof row.status === 'string' ? { status: row.status } : {}), ...(typeof row.priority === 'string' ? { priority: row.priority } : {}), ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}), ...(typeof row.url === 'string' ? { url: row.url } : {}) }];
    });
  }

  getEmbeddingDimensions(): number[] { return [EMBEDDING_DIMENSIONS]; }
  async save(): Promise<void> { this.lastUpdated = new Date().toISOString(); }
  async clear(): Promise<void> {
    await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId}) DETACH DELETE c`, { params: { orgId: this.orgId } });
    await this.graph.query('MATCH (s:RAGIndexStatus {orgId:$orgId}) DETACH DELETE s', { params: { orgId: this.orgId } });
    this.documentCache.clear();
  }
  async setIngestionState(status: 'running' | 'completed' | 'failed', failedWork = 0): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.graph.query(`MERGE (s:RAGIndexStatus {orgId:$orgId}) SET s.status=$status,s.pendingWork=$pendingWork,s.failedWork=$failedWork,s.updatedAt=$updatedAt,s.lastSuccessfulIngestion=CASE WHEN $status='completed' THEN $updatedAt ELSE s.lastSuccessfulIngestion END`, {
      params: { orgId: this.orgId, status, pendingWork: status === 'running' ? 1 : 0, failedWork, updatedAt }
    });
  }

  async getAllDocuments(): Promise<VectorStoreDocumentEntry[]> {
    return rows(await this.graph.query(`MATCH (c:${LABEL} {orgId:$orgId}) WHERE coalesce(c.active,true)=true RETURN c.sourcePath AS path,c.documentTitle AS title,c.sourceType AS sourceType,c.docHash AS docHash,max(c.updatedAt) AS updatedAt,collect(c.chunkId) AS chunkIds`, { params: { orgId: this.orgId } })).map((row) => ({ path: String(row.path), title: String(row.title ?? ''), sourceType: row.sourceType as SourceType, docHash: String(row.docHash ?? ''), updatedAt: String(row.updatedAt ?? ''), chunkIds: Array.isArray(row.chunkIds) ? row.chunkIds.map(String) : [] }));
  }
}
