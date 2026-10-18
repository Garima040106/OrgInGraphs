import express, { type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Graph } from 'falkordb';
import { query, rows } from '../db/falkordb.js';
import { fetchEntireGraph } from '../graph/entire.js';
import { fetchProductProgressGraph } from '../product/graph-api.js';
import { runOrgInGraphsWorkflow } from '../workflow/workflow.js';
import { ingestionRequestSchema, runIngestionWorkflow, type IngestionWorkflowDependencies } from '../workflow/ingestion-workflow.js';
import { assistantRequestSchema, runAssistantWorkflow } from '../workflow/assistant-workflow.js';
import { conversationTurns, createConversation, listConversations, loadAssistantMemory, memoryOwnerId, ownsConversation, saveAssistantTurn } from '../agents/company-assistant/memory.js';
import { getOrganizationIntelligenceAgent, type OrganizationIntelligenceAgent } from '../agents/organization-intelligence/agent.js';
import { ragQueryInputSchema } from '../agents/organization-intelligence/types.js';
import type { RAGSyncWorker } from '../agents/organization-intelligence/sync/rag-sync-worker.js';

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const conversationIdSchema = z.string().uuid();
const workspaceIdentitySchema = z.string().trim().email().max(254);
const filterSchema = z.object({ departmentId:idSchema.optional(), teamId:idSchema.optional(), employmentStatus:z.enum(['active','inactive']).optional() });
const sourceRecordsQuerySchema = z.object({ q:z.string().trim().max(200).optional(), limit:z.coerce.number().int().min(1).max(200).default(100), offset:z.coerce.number().int().min(0).max(100_000).default(0) }).strict();
const supported = new Set(['Company','Employee','Department','Team','Project','Repository','Service','Document','Decision','Incident','Task','PullRequest','Channel','Message','Product','ProductModule','Feature','FeatureRequest','Ticket','Bug','Release','Commit','Comment','Activity','Review']);
const parse = <T>(schema:z.ZodType<T>, input:unknown): T => schema.parse(input);
const sendError = (res:Response, error:unknown) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error:'Invalid request', details:error.flatten() });
  console.error(error); return res.status(503).json({ error:'Database request failed' });
};
const one = async (graph:Graph, label:string, id:string) => rows(await query(graph,`MATCH (n:${label} {id:$id}) RETURN n`,{id}))[0]?.n;
type ApiGraphNode = { id:string; labels:string[]; properties:Record<string,unknown> };
const apiGraphNode = (value:unknown, labels:string[]=[]):ApiGraphNode|undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const node=value as { id?:string|number; labels?:string[]; properties?:Record<string,unknown> };
  const properties=node.properties??value as Record<string,unknown>;
  const id=typeof properties.id==='string'?properties.id:undefined;
  return id?{id,labels:node.labels??labels,properties}:undefined;
};
const sourceRecordFilter = (q:string) => '(n.title IS NOT NULL AND toLower(n.title) CONTAINS toLower($q)) OR (n.content IS NOT NULL AND toLower(n.content) CONTAINS toLower($q)) OR (n.description IS NOT NULL AND toLower(n.description) CONTAINS toLower($q)) OR (n.sourceRecordId IS NOT NULL AND toLower(n.sourceRecordId) CONTAINS toLower($q))';
const workflowBodySchema = z.object({ text:z.string().trim().min(1).max(20_000), type:z.enum(['auto','ticket','feature-update']).optional(), source:z.string().trim().min(1).max(100).optional(), sourceRecordId:z.string().trim().min(1).max(200).optional(), receivedAt:z.string().datetime().optional(), provenance:z.enum(['synthetic','user-provided','external-verified']).optional() }).strict();

const workflowStatus = (result: Awaited<ReturnType<typeof runOrgInGraphsWorkflow>>) => {
  if (result.errors.some((error) => error.code === 'invalid-input')) return 400;
  if (result.errors.some((error) => error.code === 'database-failure' || error.code === 'model-failure')) return 503;
  return 200;
};

export function createApp(graph:Graph, options: { ingestion?: IngestionWorkflowDependencies; agent1?: OrganizationIntelligenceAgent; ragSyncWorker?: RAGSyncWorker } = {}) {
  const app=express();
  const agent1 = options.agent1 ?? getOrganizationIntelligenceAgent({ graph });
  let initialRagIndex: Promise<void> | undefined;
  let ragWriteActive = false;
  const acquireRagWrite = (res: Response) => {
    if (ragWriteActive) { res.status(409).json({ error: 'A RAG ingestion or re-index operation is already running.' }); return false; }
    ragWriteActive = true;
    return true;
  };
  const allowedOrigins=new Set((process.env.FRONTEND_ORIGINS??'http://localhost:3000,http://127.0.0.1:3000').split(',').map(origin=>origin.trim()).filter(Boolean));
  app.use((req,res,next)=>{
    const origin=req.headers.origin;
    if(origin&&allowedOrigins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,x-orgmind-user-id,x-rag-admin-key');}
    if(req.method==='OPTIONS')return res.sendStatus(204);
    return next();
  });
  app.use(express.json());
  const memoryOwner = (req:Request, res:Response) => {
    const identity = workspaceIdentitySchema.safeParse(req.header('x-orgmind-user-id'));
    if (!identity.success) { res.status(401).json({ error: 'Sign in to use persistent assistant conversations.' }); return undefined; }
    return memoryOwnerId(identity.data);
  };
  const ragIdentity = (req: Request, res: Response): string | undefined => {
    const identity = workspaceIdentitySchema.safeParse(req.header('x-orgmind-user-id'));
    if (!identity.success) { res.status(401).json({ error: 'Sign in to use company knowledge.' }); return undefined; }
    return identity.data;
  };
  app.get('/health',async (_req,res)=>{ try { await query(graph,'RETURN 1 AS connected'); res.json({status:'ok',database:'connected'}); } catch(error){ console.error(error); res.status(503).json({status:'degraded',database:'unavailable'}); } });
  const dashboardResponse = async () => {
    const [company, organization, productProgress] = await Promise.all([
      one(graph,'Company','hirenova').catch(() => undefined),
      fetchEntireGraph(graph),
      fetchProductProgressGraph(graph)
    ]);
    const nodes=[...new Map([...organization.nodes,...productProgress.nodes].map((node)=>[node.id,node])).values()];
    const sources=['confluence','jira','slack','github'] as const;
    const sourceCounts=Object.fromEntries(sources.map((source)=>[source,nodes.filter((node)=>String(node.properties.sourceSystem??'').toLowerCase()===source).length]));
    return { company:company??null, organization, productProgress, sourceCounts, totals:{ entities:nodes.length, people:nodes.filter((node)=>node.labels.includes('Employee')).length, teams:nodes.filter((node)=>node.labels.includes('Team')).length, services:nodes.filter((node)=>node.labels.includes('Service')).length, decisions:nodes.filter((node)=>node.labels.includes('Decision')).length } };
  };
  app.get('/api/dashboard',async(_req,res)=>{try{return res.json(await dashboardResponse());}catch(error){return sendError(res,error);}});
  app.get('/api/dashboard/summary',async(_req,res)=>{try{const result=await dashboardResponse();return res.json({company:result.company,sourceCounts:result.sourceCounts,totals:result.totals});}catch(error){return sendError(res,error);}});
  const sourceRecords = (source:string, labels:string, sortProperty='updatedAt') => async (req:Request,res:Response) => {
    const parsed=sourceRecordsQuerySchema.safeParse(req.query);
    if(!parsed.success)return res.status(400).json({error:'Invalid source records query',details:parsed.error.flatten()});
    const {q='',limit,offset}=parsed.data;
    const where=`(${labels}) AND toLower(n.sourceSystem)=toLower($source) AND coalesce(n.synthetic,false)=false AND n.provenance IN ['external-verified','user-provided'] AND ($q='' OR (${sourceRecordFilter(q)}))`;
    try {
      const count=rows(await query(graph,`MATCH (n) WHERE ${where} RETURN count(n) AS total`,{source,q}))[0]?.total;
      const result=await query(graph,`MATCH (n) WHERE ${where} RETURN n,labels(n) AS labels ORDER BY n.${sortProperty} DESC SKIP $offset LIMIT $limit`,{source,q,offset,limit});
      const items=rows(result).flatMap((row)=>{const node=apiGraphNode(row.n,Array.isArray(row.labels)?row.labels:[]);return node?[node]:[];});
      return res.json({source,items,total:Number(count??0),limit,offset});
    }catch(error){return sendError(res,error);}
  };
  app.get('/api/documents',sourceRecords('confluence','n:Document'));
  app.get('/api/tickets',sourceRecords('jira','n:Ticket OR n:Bug'));
  app.get('/api/conversations',async(req,res)=>{
    const parsed=sourceRecordsQuerySchema.safeParse(req.query);
    if(!parsed.success)return res.status(400).json({error:'Invalid conversation query',details:parsed.error.flatten()});
    const {q='',limit,offset}=parsed.data;
    const where=`toLower(m.sourceSystem)='slack' AND coalesce(m.synthetic,false)=false AND m.provenance IN ['external-verified','user-provided'] AND ($q='' OR (toLower(coalesce(m.content,'')) CONTAINS toLower($q)) OR (toLower(coalesce(m.title,'')) CONTAINS toLower($q)) OR (toLower(coalesce(m.channelName,'')) CONTAINS toLower($q)))`;
    try {
      const total=rows(await query(graph,`MATCH (m:Message) WHERE ${where} RETURN count(m) AS total`,{q}))[0]?.total;
      const result=await query(graph,`MATCH (m:Message) WHERE ${where} OPTIONAL MATCH (m)-[:IN_CHANNEL]->(c:Channel) RETURN m,labels(m) AS messageLabels,c,labels(c) AS channelLabels ORDER BY m.occurredAt DESC SKIP $offset LIMIT $limit`,{q,offset,limit});
      const items=rows(result).flatMap((row)=>{const message=apiGraphNode(row.m,Array.isArray(row.messageLabels)?row.messageLabels:['Message']);return message?[{...message,channel:apiGraphNode(row.c,Array.isArray(row.channelLabels)?row.channelLabels:['Channel'])??null}]:[];});
      return res.json({source:'slack',items,total:Number(total??0),limit,offset});
    }catch(error){return sendError(res,error);}
  });
  app.get('/api/proactive-insights',sourceRecords('github','n:PullRequest OR n:Bug OR n:Commit'));
  app.get('/api/graph', async (_req, res) => {
    try {
      return res.json(await fetchEntireGraph(graph));
    } catch (error) {
      console.error('Unable to fetch complete graph:', error);
      return res.status(500).json({ error: 'Unable to fetch graph' });
    }
  });
  app.get('/api/company',async (_req,res)=>{try{const result=await query(graph,'MATCH (n:Company) RETURN n'); const company=rows(result)[0]?.n; return company?res.json(company):res.status(404).json({error:'Company not found'});}catch(e){return sendError(res,e);}});
  app.get('/api/employees',async (req,res)=>{try{const f=parse(filterSchema,req.query); const conditions:string[]=[]; const params:Record<string,unknown>={}; for(const key of ['departmentId','teamId','employmentStatus'] as const) if(f[key]){conditions.push(`e.${key} = $${key}`);params[key]=f[key];} const result=await query(graph,`MATCH (e:Employee)${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} RETURN e ORDER BY e.name`,params); return res.json(rows(result).map(r=>r.e));}catch(e){return sendError(res,e);}});
  app.get('/api/employees/:employeeId',async(req,res)=>{try{const id=parse(idSchema,req.params.employeeId);const result=await query(graph,'MATCH (e:Employee {id:$id}) OPTIONAL MATCH (e)-[:REPORTS_TO]->(m:Employee) OPTIONAL MATCH (d:Department)<-[:WORKS_IN]-(e) OPTIONAL MATCH (t:Team)<-[:MEMBER_OF]-(e) OPTIONAL MATCH (e)-[:WORKS_ON|OWNS]->(p:Project) RETURN e,m,d,t,collect(p) AS projects',{id});const r=rows(result)[0];if(!r)return res.status(404).json({error:'Employee not found'});const reports=rows(await query(graph,'MATCH (e:Employee {id:$id})<-[:REPORTS_TO]-(direct:Employee) RETURN direct',{id}));return res.json({employee:r.e,manager:r.m??null,directReports:reports.map(x=>x.direct),department:r.d??null,team:r.t??null,skills:r.e.skills??[],projects:r.projects??[]});}catch(e){return sendError(res,e);}});
  app.get('/api/departments',async(_req,res)=>{try{const r=rows(await query(graph,'MATCH (d:Department) OPTIONAL MATCH (d)<-[:WORKS_IN]-(e:Employee) OPTIONAL MATCH (h:Employee)-[:HEADS]->(d) RETURN d,count(e) AS employeeCount,collect(h) AS heads'));return res.json(r.map(x=>({...x.d,employeeCount:x.employeeCount,heads:x.heads??[]})));}catch(e){return sendError(res,e);}});
  app.get('/api/departments/:departmentId',async(req,res)=>{try{const id=parse(idSchema,req.params.departmentId);const r=rows(await query(graph,'MATCH (d:Department {id:$id}) OPTIONAL MATCH (d)-[:HAS_TEAM]->(t:Team) OPTIONAL MATCH (d)<-[:WORKS_IN]-(e:Employee) RETURN d,collect(DISTINCT t) AS teams,collect(DISTINCT e) AS employees',{id}))[0];return r?res.json({department:r.d,teams:r.teams??[],employees:r.employees??[]}):res.status(404).json({error:'Department not found'});}catch(e){return sendError(res,e);}});
  app.get('/api/projects',async(_req,res)=>{try{const r=rows(await query(graph,'MATCH (p:Project) OPTIONAL MATCH (o:Employee)-[:OWNS]->(p) OPTIONAL MATCH (c:Employee)-[:WORKS_ON]->(p) OPTIONAL MATCH (p)<-[:WORKS_ON]-(s:Service) RETURN p,collect(DISTINCT o) AS owners,collect(DISTINCT c) AS contributors,collect(DISTINCT s) AS services'));return res.json(r.map(x=>({...x.p,owners:x.owners??[],contributors:x.contributors??[],services:x.services??[]})));}catch(e){return sendError(res,e);}});
  app.get('/api/projects/:projectId',async(req,res)=>{try{const id=parse(idSchema,req.params.projectId);const r=rows(await query(graph,'MATCH (p:Project {id:$id}) OPTIONAL MATCH (p)<-[:WORKS_ON]-(e:Employee) OPTIONAL MATCH (p)<-[:IMPLEMENTS]-(pr:PullRequest) OPTIONAL MATCH (p)<-[:CREATES]-(t:Task) OPTIONAL MATCH (p)<-[:OWNS]-(o:Employee) RETURN p,collect(DISTINCT e) AS employees,collect(DISTINCT pr) AS pullRequests,collect(DISTINCT t) AS tasks,collect(DISTINCT o) AS owners',{id}))[0];if(!r)return res.status(404).json({error:'Project not found'});return res.json({...r.p,employees:r.employees??[],pullRequests:r.pullRequests??[],tasks:r.tasks??[],owners:r.owners??[]});}catch(e){return sendError(res,e);}});
  app.get('/api/graph/neighborhood/:entityType/:entityId',async(req,res)=>{
    try {
      const type=parse(z.enum([...supported] as [string,...string[]]),req.params.entityType);
      const id=parse(idSchema,req.params.entityId);
      const result=await query(graph,`MATCH (start:${type} {id:$id})-[r]-(n) RETURN start,n,labels(start)[0] AS startType,labels(n)[0] AS entityType,type(r) AS relationship,startNode(r) AS relationshipStart,endNode(r) AS relationshipEnd LIMIT 100`,{id});
      if(!result.data?.length)return res.status(404).json({error:'Entity not found'});
      const nodeRows=rows(result);
      const entries:Record<string,unknown>[] = nodeRows.flatMap(x=>[
        {...(x.start as Record<string,unknown>),entityType:x.startType},
        {...(x.n as Record<string,unknown>),entityType:x.entityType}
      ]);
      const nodes=[...new Map(entries.filter((node):node is Record<string,unknown>&{id:string}=>typeof node.id==='string').map(node=>[node.id,node])).values()];
      const edges=nodeRows.map(x=>{
        const from=(x.relationshipStart as {id:string}).id;
        const to=(x.relationshipEnd as {id:string}).id;
        return {from,to,type:x.relationship,direction:from===(x.start as {id:string}).id?'outgoing':'incoming'};
      });
      return res.json({nodes,edges});
    } catch(e) { return sendError(res,e); }
  });
  app.get('/api/search',async(req,res)=>{try{const q=parse(z.string().trim().min(1).max(100),req.query.q);const result=await query(graph,'MATCH (n) WHERE (n.name IS NOT NULL AND toLower(n.name) CONTAINS toLower($q)) OR (n.title IS NOT NULL AND toLower(n.title) CONTAINS toLower($q)) OR (n.email IS NOT NULL AND toLower(n.email) CONTAINS toLower($q)) RETURN labels(n)[0] AS entityType,n LIMIT 50',{q});return res.json(rows(result).map((item)=>({...item,n:item.n && 'properties' in item.n ? item.n.properties : item.n})));}catch(e){return sendError(res,e);}});
  app.get('/api/product-progress/graph', async (_req, res) => {
    try { return res.json(await fetchProductProgressGraph(graph)); }
    catch (error) { console.error('Unable to fetch Product Progress graph:', error); return res.status(503).json({ error: 'Product Progress graph unavailable' }); }
  });
  const processWorkflow = (forcedType?: 'ticket' | 'feature-update') => async (req:Request, res:Response) => {
    try {
      const body = parse(workflowBodySchema, { ...req.body, ...(forcedType ? { type: forcedType } : {}) });
      const result = await runOrgInGraphsWorkflow(body, { graph });
      return res.status(workflowStatus(result)).json(result);
    } catch (error) { return sendError(res, error); }
  };
  app.post('/api/product-progress/tickets', processWorkflow('ticket'));
  app.post('/api/product-progress/activities', processWorkflow('feature-update'));
  app.post('/api/product-progress/workflow', processWorkflow());
  app.get('/api/assistant/conversations', async (req, res) => {
    const ownerId = memoryOwner(req, res);
    if (!ownerId) return;
    try { return res.json({ conversations: await listConversations(graph, ownerId) }); }
    catch (error) { return sendError(res, error); }
  });
  app.get('/api/assistant/conversations/:conversationId', async (req, res) => {
    const ownerId = memoryOwner(req, res);
    if (!ownerId) return;
    const parsedId = conversationIdSchema.safeParse(req.params.conversationId);
    if (!parsedId.success) return res.status(400).json({ error: 'Invalid conversation ID.' });
    try {
      const turns = await conversationTurns(graph, ownerId, parsedId.data);
      return turns ? res.json({ conversationId: parsedId.data, turns }) : res.status(404).json({ error: 'Conversation not found.' });
    } catch (error) { return sendError(res, error); }
  });
  app.post('/api/assistant/query', async (req, res) => {
    const ownerId = memoryOwner(req, res);
    if (!ownerId) return;
    const parsed = assistantRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid assistant request', details: parsed.error.flatten() });
    try {
      const conversationId = parsed.data.conversationId ?? await createConversation(graph, ownerId, parsed.data.question);
      if (parsed.data.conversationId && !(await ownsConversation(graph, ownerId, conversationId))) return res.status(404).json({ error: 'Conversation not found.' });
      const memory = await loadAssistantMemory(graph, ownerId, conversationId);
      const response = await runAssistantWorkflow({ ...parsed.data, conversationId }, graph, { memory });
      if (!('answer' in response)) return res.status(503).json(response);
      const persistedResponse = { ...response, conversationId };
      await saveAssistantTurn(graph, ownerId, conversationId, parsed.data.question, persistedResponse);
      return res.json(persistedResponse);
    } catch {
      return res.status(503).json({ status: 'failed', errors: ['Assistant workflow failed safely.'] });
    }
  });
  app.post('/api/ingestion/process', async (req, res) => {
    try {
      const body = parse(ingestionRequestSchema, req.body);
      const dependencies = options.ingestion
        ? { ...options.ingestion, processorOptions: { ...options.ingestion.processorOptions, graph } }
        : { processorOptions: { graph } };
      const result = await runIngestionWorkflow(body, dependencies);
      if (result.status === 'failed') return res.status(503).json({ status: result.status, source: result.source, fetchedDocumentCount: result.documents.length, outcomes: result.outcomes, errors: result.errors });
      return res.json({ status: result.status, source: result.source, fetchedDocumentCount: result.documents.length, outcomes: result.outcomes, errors: result.errors });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
      console.error('Unable to process ingestion request:', error);
      return res.status(500).json({ error: 'Ingestion processing failed' });
    }
  });

  // Agent 1: Organization Intelligence & Knowledge Ingestion endpoints
  const adminOwner = (req: Request, res: Response): boolean => {
    if (!ragIdentity(req, res)) return false;
    const expected = process.env.RAG_ADMIN_API_KEY;
    const provided = req.header('x-rag-admin-key') ?? '';
    if (!expected || !provided || Buffer.byteLength(expected) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      res.status(403).json({ error: 'Administrative RAG access is not authorized.' });
      return false;
    }
    return true;
  };

  const handleIngest = async (req: Request, res: Response) => {
    if (!adminOwner(req, res)) return;
    if (!acquireRagWrite(res)) return;
    try {
      const parsed = z.object({ force: z.boolean().optional().default(false), sources: z.array(z.string().trim().min(1).max(500)).max(100).optional() }).strict().safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'Invalid ingestion request', details: parsed.error.flatten() });
      const result = await agent1.ingest({ forceReindex: parsed.data.force, selectedSources: parsed.data.sources });
      return res.status(result.status === 'failed' ? 503 : 200).json(result);
    } catch (error) {
      console.error('Agent 1 ingestion failed:', error);
      return res.status(503).json({ status: 'failed', errors: ['Ingestion workflow execution failed safely.'] });
    } finally { ragWriteActive = false; }
  };
  app.post('/api/organization/ingest', handleIngest);
  app.post('/api/organization-intelligence/ingest', handleIngest);

  const handleStatus = async (_req: Request, res: Response) => {
    if (!ragIdentity(_req, res)) return;
    try {
      const stats = await agent1.getStatus();
      const sync = options.ragSyncWorker ? await options.ragSyncWorker.status() : { enabled: false, running: false, pending: 0, processing: 0, completed: 0, failed: 0, retries: 0, lastObservedChange: null, lastSuccessfulSync: null, lastError: null, workerLagMs: 0 };
      return res.json({ status: 'ready', stats, indexedDocuments: stats.totalSources, indexedChunks: stats.totalChunks, pendingWork: (ragWriteActive ? 1 : 0) + sync.pending + sync.processing, failedWork: stats.failed, lastSuccessfulIngestion: stats.lastIngestedAt ?? null, sync, agent: 'organization-intelligence', embeddingModel: agent1.embeddingService.model, vectorStore: agent1.vectorStore instanceof Object && 'healthy' in agent1.vectorStore ? (agent1.vectorStore.healthy ? 'healthy' : 'unavailable') : 'local' });
    } catch (error) {
      console.error('Agent 1 status failed:', error);
      return res.status(500).json({ error: 'Failed to retrieve indexing status.' });
    }
  };
  app.get('/api/organization/status', handleStatus);
  app.get('/api/organization-intelligence/status', handleStatus);

  const handleQuery = async (req: Request, res: Response) => {
    const identity = ragIdentity(req, res);
    if (!identity) return;
    const parsed = ragQueryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid organization query request', details: parsed.error.flatten() });
    }
    try {
      // A fresh install has no vectors until the admin ingestion endpoint is called.
      // Populate the index on the first user query so the built-in company data is searchable.
      if ((await agent1.getStatus()).totalChunks === 0) {
        initialRagIndex ??= agent1.ingest().then((result) => {
          if (result.status === 'failed' || result.stats.totalChunks === 0) {
            console.error('Initial Organization RAG indexing did not produce searchable chunks:', {
              status: result.status,
              stats: result.stats,
              errors: result.errors
            });
          } else {
            console.log(`Initial Organization RAG index ready: ${result.stats.totalChunks} chunks from ${result.stats.totalSources} sources.`);
          }
        }).catch((error) => {
          console.error('Initial Organization RAG indexing failed:', error);
        }).finally(() => { initialRagIndex = undefined; });
        await initialRagIndex;
      }
      const response = await agent1.query({ ...parsed.data, orgId: process.env.ORGANIZATION_ID ?? 'hirenova' });
      if (response.status !== 'completed') console.error('Organization RAG query returned a degraded result:', { query: parsed.data.query, status: response.status, errors: response.errors, uncertainty: response.uncertainty });
      return res.status(response.status === 'failed' ? 503 : 200).json(response);
    } catch (error) {
      console.error('Agent 1 query failed:', { query: parsed.data.query, error });
      return res.status(503).json({
        answer: 'The organization intelligence query could not be completed safely.',
        sources: [],
        retrieved_chunks: [],
        agent: 'organization-intelligence',
        status: 'failed'
      });
    }
  };
  app.post('/api/organization/query', handleQuery);
  app.post('/api/organization-intelligence/query', handleQuery);

  const handleSources = async (_req: Request, res: Response) => {
    if (!ragIdentity(_req, res)) return;
    try {
      const sources = await agent1.getSources();
      return res.json({ sources, count: sources.length });
    } catch (error) {
      console.error('Agent 1 getSources failed:', error);
      return res.status(500).json({ error: 'Failed to retrieve indexed sources.' });
    }
  };
  app.get('/api/organization/sources', handleSources);
  app.get('/api/organization-intelligence/sources', handleSources);

  const handleReindex = async (req: Request, res: Response) => {
    if (!adminOwner(req, res)) return;
    if (!acquireRagWrite(res)) return;
    try {
      const sourcePath = typeof req.body?.sourcePath === 'string' ? req.body.sourcePath : undefined;
      const result = await agent1.reindex(sourcePath);
      return res.status(result.status === 'failed' ? 503 : 200).json(result);
    } catch (error) {
      console.error('Agent 1 reindexing failed:', error);
      return res.status(503).json({ status: 'failed', errors: ['Reindexing failed safely.'] });
    } finally { ragWriteActive = false; }
  };
  app.post('/api/organization/reindex', handleReindex);
  app.post('/api/organization-intelligence/reindex', handleReindex);

  const ragRequestSchema = z.object({
    question: z.string().trim().min(1).max(4000),
    filters: z.object({ sourceTypes: z.array(z.enum(['confluence', 'jira', 'github', 'slack', 'route', 'database'])).max(10).optional() }).strict().optional()
  }).strict();
  app.post('/api/rag/query', async (req, res) => {
    const identity = ragIdentity(req, res);
    if (!identity) return;
    const parsed = ragRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid RAG query', details: parsed.error.flatten() });
    try {
      const result = await agent1.query({ query: parsed.data.question, history: [], topK: 5, threshold: 0.1, orgId: process.env.ORGANIZATION_ID ?? 'hirenova', ...(parsed.data.filters?.sourceTypes ? { sourcePlatforms: parsed.data.filters.sourceTypes } : {}) });
      const citations = result.sources.map((source) => {
        const chunks = result.retrieved_chunks.flatMap((item, index) => item.sourcePath === source.sourcePath ? [{ item, index }] : []);
        const chunk = chunks[0]?.item;
        return {
          documentId: source.sourcePath,
          chunkId: chunk?.chunkId ?? '',
          citationIds: chunks.map(({ index }) => `S${index + 1}`),
          sourceType: source.platform ?? source.sourceType,
          title: source.title,
          ...(typeof source.url === 'string' ? { url: source.url } : {}),
          ...(source.excerpt ? { excerpt: source.excerpt } : {}),
          score: chunk?.score ?? 0
        };
      });
      return res.status(result.status === 'failed' ? 503 : 200).json({ answer: result.answer, sources: citations, retrieval: result.retrieval ?? { candidateCount: result.retrieved_chunks.length, usedChunks: result.retrieved_chunks.length }, evidenceFound: result.retrieved_chunks.length > 0 });
    } catch {
      return res.status(503).json({ error: 'The company knowledge service is unavailable.' });
    }
  });
  app.post('/api/rag/ingest', async (req, res) => {
    if (!adminOwner(req, res)) return;
    if (!acquireRagWrite(res)) return;
    const schema = z.object({ sources: z.array(z.string().trim().min(1).max(500)).max(100).optional(), force: z.boolean().optional().default(false) }).strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) { ragWriteActive = false; return res.status(400).json({ error: 'Invalid ingestion request', details: parsed.error.flatten() }); }
    try {
      const result = await agent1.ingest({ selectedSources: parsed.data.sources, forceReindex: parsed.data.force, orgId: process.env.ORGANIZATION_ID ?? 'hirenova' });
      return res.status(result.status === 'failed' ? 503 : 200).json(result);
    } catch { return res.status(503).json({ error: 'Document ingestion failed.' }); }
    finally { ragWriteActive = false; }
  });
  app.post('/api/rag/reindex', async (req, res) => {
    if (!adminOwner(req, res)) return;
    if (!acquireRagWrite(res)) return;
    const schema = z.object({ sourcePath: z.string().trim().min(1).max(500).optional() }).strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) { ragWriteActive = false; return res.status(400).json({ error: 'Invalid re-index request', details: parsed.error.flatten() }); }
    try {
      const result = await agent1.reindex(parsed.data.sourcePath);
      return res.status(result.status === 'failed' ? 503 : 200).json(result);
    } catch { return res.status(503).json({ error: 'Re-indexing failed.' }); }
    finally { ragWriteActive = false; }
  });
  app.post('/api/rag/sync/replay', async (req, res) => {
    if (!adminOwner(req, res)) return;
    if (!options.ragSyncWorker?.config.enabled) return res.status(503).json({ error: 'Automatic RAG synchronization is disabled.' });
    try { return res.json({ replayed: await options.ragSyncWorker.replayDeadLetters() }); }
    catch { return res.status(503).json({ error: 'Failed to replay RAG synchronization jobs.' }); }
  });
  app.get('/api/rag/status', async (req, res) => {
    if (!ragIdentity(req, res)) return;
    try {
      const stats = await agent1.getStatus();
      const sync = options.ragSyncWorker ? await options.ragSyncWorker.status() : { enabled: false, running: false, pending: 0, processing: 0, completed: 0, failed: 0, retries: 0, lastObservedChange: null, lastSuccessfulSync: null, lastError: null, workerLagMs: 0 };
      return res.json({ stats, indexedDocuments: stats.totalSources, indexedChunks: stats.totalChunks, pendingWork: (ragWriteActive ? 1 : 0) + sync.pending + sync.processing, failedWork: stats.failed, lastSuccessfulIngestion: stats.lastIngestedAt ?? null, sync, embeddingModel: agent1.embeddingService.model, vectorStore: agent1.vectorStore instanceof Object && 'healthy' in agent1.vectorStore ? (agent1.vectorStore.healthy ? 'healthy' : 'unavailable') : 'local' });
    } catch { return res.status(503).json({ error: 'Unable to read RAG status.' }); }
  });

  return app;
}
