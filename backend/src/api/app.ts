import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import type { Graph } from 'falkordb';
import { query, rows } from '../db/falkordb.js';
import { fetchEntireGraph } from '../graph/entire.js';
import { fetchProductProgressGraph } from '../product/graph-api.js';
import { runOrgInGraphsWorkflow } from '../workflow/workflow.js';
import { ingestionRequestSchema, runIngestionWorkflow, type IngestionWorkflowDependencies } from '../workflow/ingestion-workflow.js';
import { assistantRequestSchema, runAssistantWorkflow } from '../workflow/assistant-workflow.js';
import { conversationTurns, createConversation, listConversations, loadAssistantMemory, memoryOwnerId, ownsConversation, saveAssistantTurn } from '../agents/company-assistant/memory.js';

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const conversationIdSchema = z.string().uuid();
const workspaceIdentitySchema = z.string().trim().email().max(254);
const filterSchema = z.object({ departmentId:idSchema.optional(), teamId:idSchema.optional(), employmentStatus:z.enum(['active','inactive']).optional() });
const supported = new Set(['Company','Employee','Department','Team','Project','Repository','Service','Document','Decision','Incident','Task','PullRequest','Channel','Message','Product','ProductModule','Feature','FeatureRequest','Ticket','Bug','Release','Commit','Comment','Activity','Review']);
const parse = <T>(schema:z.ZodType<T>, input:unknown): T => schema.parse(input);
const sendError = (res:Response, error:unknown) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error:'Invalid request', details:error.flatten() });
  console.error(error); return res.status(503).json({ error:'Database request failed' });
};
const one = async (graph:Graph, label:string, id:string) => rows(await query(graph,`MATCH (n:${label} {id:$id}) RETURN n`,{id}))[0]?.n;
const workflowBodySchema = z.object({ text:z.string().trim().min(1).max(20_000), type:z.enum(['auto','ticket','feature-update']).optional(), source:z.string().trim().min(1).max(100).optional(), sourceRecordId:z.string().trim().min(1).max(200).optional(), receivedAt:z.string().datetime().optional(), provenance:z.enum(['synthetic','user-provided','external-verified']).optional() }).strict();

const workflowStatus = (result: Awaited<ReturnType<typeof runOrgInGraphsWorkflow>>) => {
  if (result.errors.some((error) => error.code === 'invalid-input')) return 400;
  if (result.errors.some((error) => error.code === 'database-failure' || error.code === 'model-failure')) return 503;
  return 200;
};

export function createApp(graph:Graph, options: { ingestion?: IngestionWorkflowDependencies } = {}) {
  const app=express();
  const allowedOrigins=new Set((process.env.FRONTEND_ORIGINS??'http://localhost:3000,http://127.0.0.1:3000').split(',').map(origin=>origin.trim()).filter(Boolean));
  app.use((req,res,next)=>{
    const origin=req.headers.origin;
    if(origin&&allowedOrigins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,x-orgmind-user-id');}
    if(req.method==='OPTIONS')return res.sendStatus(204);
    return next();
  });
  app.use(express.json());
  const memoryOwner = (req:Request, res:Response) => {
    const identity = workspaceIdentitySchema.safeParse(req.header('x-orgmind-user-id'));
    if (!identity.success) { res.status(401).json({ error: 'Sign in to use persistent assistant conversations.' }); return undefined; }
    return memoryOwnerId(identity.data);
  };
  app.get('/health',async (_req,res)=>{ try { await query(graph,'RETURN 1 AS connected'); res.json({status:'ok',database:'connected'}); } catch(error){ console.error(error); res.status(503).json({status:'degraded',database:'unavailable'}); } });
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
  return app;
}
