import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import type { Graph } from 'falkordb';
import { query, rows } from '../db/falkordb.js';
import { fetchEntireGraph } from '../graph/entire.js';
import { configuredModel } from '../models/provider.js';
import type { EntityType } from '../types/seed.js';
import type { AssistantCitation, AssistantEntity, AssistantQueryInput, AssistantRelation, AssistantResponseType, AssistantStructuredResponse } from '../agents/company-assistant/types.js';
import type { AssistantMemoryContext } from '../agents/company-assistant/memory.js';

const entityTypes = ['Company','Employee','Department','Team','Project','Repository','Service','Document','Decision','Incident','Task','PullRequest','Channel','Message','Product','ProductModule','Feature','FeatureRequest','Ticket','Bug','Release','Commit','Comment','Activity','Review'] as const satisfies readonly EntityType[];
export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  context: z.object({ entityId: z.string().regex(/^[a-z0-9-]+$/), entityType: z.enum(entityTypes) }).strict().optional()
}).strict();

const responseTypes = ['company_overview','entity_lookup','ownership_lookup','decision_investigation','impact_analysis','knowledge_graph_query','general_explanation'] as const;
const responseSchema = z.object({
  conversationId: z.string().uuid().optional(),
  answer: z.object({
    type: z.enum(responseTypes), title: z.string().min(1).max(180), summary: z.string().min(1).max(1200),
    findings: z.array(z.object({ text: z.string().min(1).max(600), confidence: z.enum(['confirmed','inferred','unknown']), citationIds: z.array(z.string()).max(8) }).strict()).max(20),
    citations: z.array(z.object({ entityId: z.string(), entityType: z.enum(entityTypes), title: z.string(), sourceSystem: z.string().optional(), sourceRecordId: z.string().optional(), sourceUrl: z.string().url().optional(), excerpt: z.string().max(420).optional() }).strict()).max(30),
    related_entities: z.array(z.object({ id: z.string(), entityType: z.enum(entityTypes), name: z.string().optional(), title: z.string().optional() }).passthrough()).max(30),
    suggested_actions: z.array(z.object({ label: z.string().min(1).max(120), type: z.enum(['open_entity','show_dependencies','investigate']), entityId: z.string() }).strict()).max(8),
    uncertainty: z.string().max(700)
  }).strict(),
  ui: z.object({ component: z.enum(['company_overview','entity_detail','ownership_panel','decision_timeline','impact_analysis','knowledge_graph','general_response']), layout: z.enum(['compact','split']), interactions: z.array(z.object({ type: z.enum(['open_entity','show_dependencies','investigate']), entityId: z.string() }).strict()).max(8), graph: z.object({ nodes: z.array(z.object({ id:z.string(), entityType:z.enum(entityTypes), name:z.string().optional(), title:z.string().optional() }).passthrough()).max(100), edges: z.array(z.object({ from:z.string(), to:z.string(), type:z.string(), direction:z.enum(['incoming','outgoing']) }).strict()).max(100) }) }).strict(),
  execution: z.object({ status: z.enum(['completed','partial','failed']), stages: z.array(z.object({ name: z.enum(['validate','classify','retrieve','synthesize','validate_response']), status: z.enum(['completed','fallback','skipped','failed']) }).strict()), errors: z.array(z.string()).max(6) }).strict()
}).strict();

const modelAnswerSchema = z.object({
  title: z.string().min(1).max(180), summary: z.string().min(1).max(1200),
  findings: z.array(z.object({ text: z.string().min(1).max(600), confidence: z.enum(['confirmed','inferred','unknown']), citationIds: z.array(z.string()).max(8) }).strict()).max(20),
  citationIds: z.array(z.string()).max(30), relatedEntityIds: z.array(z.string()).max(30), uncertainty: z.string().max(700),
  suggestedActions: z.array(z.object({ label: z.string().min(1).max(120), type: z.enum(['open_entity','show_dependencies','investigate']), entityId: z.string() }).strict()).max(8)
}).strict();

type Intent = 'company_overview' | 'entity_lookup' | 'ownership_lookup' | 'decision_investigation' | 'impact_analysis' | 'knowledge_graph_query' | 'general_explanation';
type Stage = AssistantStructuredResponse['execution']['stages'][number];
type SearchHit = { entity: AssistantEntity; entityType: EntityType };
type GraphBundle = { nodes: AssistantEntity[]; edges: AssistantRelation[] };

const replace = <T>(defaultValue: () => T) => Annotation<T>({ reducer: (_left, right) => right, default: defaultValue });
const AssistantState = Annotation.Root({
  request: Annotation<AssistantQueryInput>(),
  status: replace<'received' | 'failed' | 'retrieved' | 'completed'>(() => 'received'),
  intent: replace<Intent>(() => 'general_explanation'),
  target: replace<SearchHit | undefined>(() => undefined),
  matches: replace<SearchHit[]>(() => []),
  bundle: replace<GraphBundle>(() => ({ nodes: [], edges: [] })),
  counts: replace<Record<string, number>>(() => ({})),
  response: replace<AssistantStructuredResponse | undefined>(() => undefined),
  stages: replace<Stage[]>(() => []),
  errors: replace<string[]>(() => []),
  memory: Annotation<AssistantMemoryContext | undefined>({ reducer: (_left, right) => right, default: () => undefined })
});
type State = typeof AssistantState.State;
type AssistantModel = (systemPrompt: string, userPrompt: string) => Promise<unknown>;
export interface AssistantWorkflowDependencies { model?: AssistantModel; memory?: AssistantMemoryContext; }

function classify(question: string): Intent {
  const text = question.toLowerCase();
  if (/\b(company overview|company summary|organization overview|how many people|organization metrics)\b/.test(text)) return 'company_overview';
  if (/\b(own|owns|owner|ownership|responsible for|who maintains)\b/.test(text)) return 'ownership_lookup';
  if (/\b(why|decision|history|trace this|what led to|when did we)\b/.test(text)) return 'decision_investigation';
  if (/\b(impact|break|deprecat|dependenc|risk|affected)\b/.test(text)) return 'impact_analysis';
  if (/\b(graph|connected|connections|relationship|neighbor|dependencies|path between)\b/.test(text)) return 'knowledge_graph_query';
  return 'entity_lookup';
}

function queryTerms(question: string) {
  const stripped = question.toLowerCase()
    .replace(/\b(who|owns?|ownership|responsible|why|decision|history|trace|what|could|break|deprecate|impact|risk|affected|dependencies|dependency|connected|connections|relationship|graph|show|find|tell|me|about|this|that|the|is|are|was|were|do|does|did|we|our|company|organization|overview|summary|how|many|people|service|team|project|to|for|with|on|in|of|a|an)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...new Set([stripped, ...stripped.split(' ').filter((word) => word.length > 2).sort((a, b) => b.length - a.length)])].filter(Boolean).slice(0, 4);
}

async function searchRecords(graph: Graph, term: string): Promise<SearchHit[]> {
  const result = await query(graph, 'MATCH (n) WHERE (n.name IS NOT NULL AND toLower(n.name) CONTAINS toLower($q)) OR (n.title IS NOT NULL AND toLower(n.title) CONTAINS toLower($q)) OR (n.email IS NOT NULL AND toLower(n.email) CONTAINS toLower($q)) RETURN labels(n)[0] AS entityType,n LIMIT 12', { q: term });
  return rows(result).flatMap((row) => {
    const entityType = row.entityType as EntityType;
    const entity = row.n as AssistantEntity | undefined;
    return entity && typeof entity.id === 'string' && entityTypes.includes(entityType) ? [{ entity: { ...entity, entityType }, entityType }] : [];
  });
}

async function contextRecord(graph: Graph, context: NonNullable<AssistantQueryInput['context']>): Promise<SearchHit | undefined> {
  const result = await query(graph, `MATCH (n:${context.entityType} {id:$id}) RETURN n, labels(n)[0] AS entityType LIMIT 1`, { id: context.entityId });
  const row = rows(result)[0];
  const entity = row?.n as AssistantEntity | undefined;
  return entity && typeof entity.id === 'string' ? { entity: { ...entity, entityType: context.entityType }, entityType: context.entityType } : undefined;
}

async function neighborhood(graph: Graph, hit: SearchHit): Promise<GraphBundle> {
  const result = await query(graph, `MATCH (start:${hit.entityType} {id:$id})-[r]-(n) RETURN start,n,labels(n)[0] AS entityType,type(r) AS relationship,startNode(r) AS relationshipStart,endNode(r) AS relationshipEnd LIMIT 100`, { id: hit.entity.id });
  const entries: AssistantEntity[] = [];
  const relations: AssistantRelation[] = [];
  for (const row of rows(result)) {
    const start = row.start as AssistantEntity | undefined;
    const neighbor = row.n as AssistantEntity | undefined;
    const startId = (row.relationshipStart as { id?: string } | undefined)?.id;
    const endId = (row.relationshipEnd as { id?: string } | undefined)?.id;
    const type = row.relationship;
    if (start?.id) entries.push({ ...start, entityType: hit.entityType });
    if (neighbor?.id && entityTypes.includes(row.entityType as EntityType)) entries.push({ ...neighbor, entityType: row.entityType as EntityType });
    if (typeof startId === 'string' && typeof endId === 'string' && typeof type === 'string') relations.push({ from: startId, to: endId, type, direction: startId === hit.entity.id ? 'outgoing' : 'incoming' });
  }
  const unique = new Map(entries.map((entity) => [entity.id, entity]));
  if (!unique.has(hit.entity.id)) unique.set(hit.entity.id, hit.entity);
  return { nodes: [...unique.values()], edges: relations };
}

function displayTitle(entity: AssistantEntity) { return entity.name ?? entity.title ?? entity.id; }
function excerpt(entity: AssistantEntity) {
  const text = [entity.summary, entity.description, entity.content, entity.text, entity.body].find((value) => typeof value === 'string' && value.trim());
  return typeof text === 'string' ? text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 420) : undefined;
}
function citation(entity: AssistantEntity): AssistantCitation {
  return { entityId: entity.id, entityType: entity.entityType, title: displayTitle(entity), ...(typeof entity.sourceSystem === 'string' ? { sourceSystem: entity.sourceSystem } : {}), ...(typeof entity.sourceRecordId === 'string' ? { sourceRecordId: entity.sourceRecordId } : {}), ...(typeof entity.externalUrl === 'string' && /^https?:\/\//.test(entity.externalUrl) ? { sourceUrl: entity.externalUrl } : {}), ...(excerpt(entity) ? { excerpt: excerpt(entity) } : {}) };
}
function limitedEntity(entity: AssistantEntity): AssistantEntity {
  const allowed = ['id','name','title','status','priority','jobTitle','employmentStatus','sourceSystem','sourceRecordId','createdAt','updatedAt','occurredAt','validFrom','externalUrl','teamId','departmentId','projectId','assigneeId','authorId','ownerId','deciderId','entityType'];
  return Object.fromEntries(Object.entries(entity).filter(([key, value]) => allowed.includes(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))) as AssistantEntity;
}
function componentFor(intent: Intent): AssistantStructuredResponse['ui']['component'] {
  return ({ company_overview: 'company_overview', entity_lookup: 'entity_detail', ownership_lookup: 'ownership_panel', decision_investigation: 'decision_timeline', impact_analysis: 'impact_analysis', knowledge_graph_query: 'knowledge_graph', general_explanation: 'general_response' } as const)[intent];
}
function userActions(intent: Intent, target?: SearchHit): AssistantStructuredResponse['answer']['suggested_actions'] {
  if (!target) return [];
  const open = { label: `Open ${displayTitle(target.entity)}`, type: 'open_entity' as const, entityId: target.entity.id };
  if (intent === 'impact_analysis') return [open, { label: 'Show dependencies', type: 'show_dependencies', entityId: target.entity.id }, { label: 'Investigate impact', type: 'investigate', entityId: target.entity.id }];
  if (intent === 'decision_investigation') return [open, { label: 'Investigate related records', type: 'investigate', entityId: target.entity.id }];
  return [open];
}

function deterministicSummary(intent: Intent, target: SearchHit | undefined, matches: SearchHit[], bundle: GraphBundle, counts: Record<string, number>) {
  if (intent === 'company_overview') return `The graph contains ${counts.Employee ?? 0} people, ${counts.Department ?? 0} departments, ${counts.Project ?? 0} projects, and ${counts.Service ?? 0} services.`;
  if (!target) return matches.length ? `Found ${matches.length} matching company record${matches.length === 1 ? '' : 's'}.` : 'No matching company record was returned by graph search.';
  if (intent === 'impact_analysis') return `The graph returns ${Math.max(0, bundle.nodes.length - 1)} directly connected records and ${bundle.edges.length} recorded relationships for ${displayTitle(target.entity)}. This is graph traversal, not a simulation.`;
  if (intent === 'decision_investigation') return `Found ${Math.max(0, bundle.nodes.length - 1)} directly connected records around ${displayTitle(target.entity)}. Review the linked evidence and recorded dates below.`;
  if (intent === 'ownership_lookup') return `Found ${bundle.nodes.filter((item) => ['Employee','Team','Department'].includes(item.entityType) && item.id !== target.entity.id).length} directly connected people or groups for ${displayTitle(target.entity)}.`;
  if (intent === 'knowledge_graph_query') return `The graph returned ${Math.max(0, bundle.nodes.length - 1)} neighboring records and ${bundle.edges.length} direct relationships for ${displayTitle(target.entity)}.`;
  return `${target.entityType} record from the indexed company graph.`;
}

function makeFallback(state: State, matches: SearchHit[], bundle: GraphBundle, counts: Record<string, number>, modelFallback: boolean): AssistantStructuredResponse {
  const intent = state.intent;
  const target = state.target;
  const graphIds = new Set(bundle.nodes.map((entity) => entity.id));
  const ordered = [...matches.map((hit) => hit.entity), ...bundle.nodes].filter((entity, index, all) => graphIds.has(entity.id) || matches.some((hit) => hit.entity.id === entity.id)).filter((entity, index, all) => all.findIndex((candidate) => candidate.id === entity.id) === index);
  const citations = ordered.slice(0, 20).map(citation);
  const findings: AssistantStructuredResponse['answer']['findings'] = bundle.edges.slice(0, 12).map((edge) => {
    const from = bundle.nodes.find((item) => item.id === edge.from);
    const to = bundle.nodes.find((item) => item.id === edge.to);
    return { text: `${from ? displayTitle(from) : edge.from} —${edge.type}→ ${to ? displayTitle(to) : edge.to}`, confidence: 'confirmed', citationIds: [edge.from, edge.to] };
  });
  if (intent === 'company_overview') findings.push(...Object.entries(counts).slice(0, 8).map(([type, count]) => ({ text: `${count} ${type} record${count === 1 ? '' : 's'} in the graph.`, confidence: 'confirmed' as const, citationIds: [] })));
  if (!findings.length && target) findings.push({ text: `A ${target.entityType} record named ${displayTitle(target.entity)} is present in the company graph.`, confidence: 'confirmed', citationIds: [target.entity.id] });
  const status = state.errors.length ? 'partial' : 'completed';
  return {
    answer: { type: intent, title: target ? displayTitle(target.entity) : intent === 'company_overview' ? 'Company overview' : 'Company graph results', summary: deterministicSummary(intent, target, matches, bundle, counts), findings, citations, related_entities: bundle.nodes.filter((entity) => entity.id !== target?.entity.id).slice(0, 20), suggested_actions: userActions(intent, target), uncertainty: intent === 'impact_analysis' ? 'Only direct recorded relationships are shown. No multi-hop risk analysis or simulation was run.' : intent === 'decision_investigation' ? 'Recorded relationships and dates are shown as evidence; they do not establish causation.' : state.errors.length ? 'The model response was unavailable or invalid; this answer uses validated graph records only.' : 'The graph contains only the records returned by the configured data source.' },
    ui: { component: componentFor(intent), layout: ['decision_investigation','impact_analysis','company_overview'].includes(intent) ? 'split' : 'compact', interactions: userActions(intent, target).map(({ type, entityId }) => ({ type, entityId })), graph: { nodes: bundle.nodes.map(limitedEntity), edges: bundle.edges } },
    execution: { status, stages: [{ name: 'validate', status: 'completed' }, { name: 'classify', status: 'completed' }, { name: 'retrieve', status: 'completed' }, { name: 'synthesize', status: modelFallback ? 'fallback' : 'skipped' }, { name: 'validate_response', status: 'completed' }], errors: state.errors.slice(0, 6) }
  };
}

function safeModelEvidence(matches: SearchHit[], bundle: GraphBundle, counts: Record<string, number>) {
  const entities = new Map<string, AssistantEntity>();
  [...matches.map((item) => item.entity), ...bundle.nodes].forEach((entity) => entities.set(entity.id, entity));
  return { counts, entities: [...entities.values()].slice(0, 24).map(limitedEntity), relationships: bundle.edges.slice(0, 100) };
}

function validateModelAnswer(raw: unknown, knownIds: Set<string>) {
  if (typeof raw !== 'string') return undefined;
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return undefined; }
  const result = modelAnswerSchema.safeParse(decoded);
  if (!result.success) return undefined;
  const answer = result.data;
  const allCitations = [...answer.citationIds, ...answer.findings.flatMap((item) => item.citationIds)];
  if (allCitations.some((id) => !knownIds.has(id)) || answer.relatedEntityIds.some((id) => !knownIds.has(id)) || answer.suggestedActions.some((item) => !knownIds.has(item.entityId))) return undefined;
  return answer;
}

function withModelAnswer(fallback: AssistantStructuredResponse, modelOutput: ReturnType<typeof validateModelAnswer>, knownEntities: AssistantEntity[]): AssistantStructuredResponse {
  if (!modelOutput) return fallback;
  const entities = new Map(knownEntities.map((item) => [item.id, item]));
  const ids = [...new Set([...modelOutput.citationIds, ...fallback.answer.citations.map((c) => c.entityId)])];
  const citations = ids.flatMap((id) => { const entity = entities.get(id); return entity ? [citation(entity)] : []; });
  const type = fallback.answer.type;
  const modelEntities = modelOutput.relatedEntityIds.flatMap((id) => { const entity = entities.get(id); return entity ? [limitedEntity(entity)] : []; });
  const related_entities = [...modelEntities, ...fallback.answer.related_entities.filter((f) => !modelEntities.some((m) => m.id === f.id))].slice(0, 30);
  const title = type === 'company_overview' && modelOutput.title.toLowerCase() === 'company overview' ? 'Company overview' : modelOutput.title;
  let summary = modelOutput.summary;
  if (type === 'impact_analysis' && !/not a simulation/i.test(summary)) {
    summary = `${summary} This is graph traversal, not a simulation.`.slice(0, 1200);
  }
  let uncertainty = modelOutput.uncertainty;
  if (type === 'impact_analysis' && !/no multi-hop risk analysis or simulation/i.test(uncertainty)) {
    uncertainty = `Only direct recorded relationships are shown. No multi-hop risk analysis or simulation was run. ${uncertainty}`.trim().slice(0, 700);
  }
  return responseSchema.parse({
    answer: { ...fallback.answer, title, summary, findings: modelOutput.findings, citations, related_entities, suggested_actions: modelOutput.suggestedActions.length ? modelOutput.suggestedActions : fallback.answer.suggested_actions, uncertainty, type },
    ui: { ...fallback.ui, interactions: (modelOutput.suggestedActions.length ? modelOutput.suggestedActions : fallback.answer.suggested_actions).map(({ type: interactionType, entityId }) => ({ type: interactionType, entityId })) },
    execution: { ...fallback.execution, stages: fallback.execution.stages.map((stage) => stage.name === 'synthesize' ? { ...stage, status: 'completed' as const } : stage) }
  });
}

export function createAssistantWorkflow(graph: Graph, dependencies: AssistantWorkflowDependencies = {}) {
  const model = dependencies.model ?? configuredModel('default');
  const workflow = new StateGraph(AssistantState)
    .addNode('validate', async (state) => {
      const parsed = assistantRequestSchema.safeParse(state.request);
      if (!parsed.success) return { status: 'failed' as const, errors: ['Assistant request is invalid.'] };
      return { request: parsed.data, stages: [{ name: 'validate', status: 'completed' as const }] };
    })
    .addNode('classify', async (state) => {
      if (state.status === 'failed') return {};
      const intent = classify(state.request.question);
      return { intent, stages: [...state.stages, { name: 'classify' as const, status: 'completed' as const }] };
    })
    .addNode('retrieve', async (state) => {
      if (state.status === 'failed') return {};
      try {
        let matches: SearchHit[] = [];
        let target: SearchHit | undefined;
        let counts: Record<string, number> = {};
        let bundle: GraphBundle = { nodes: [], edges: [] };
        if (state.intent === 'company_overview') {
          const whole = await fetchEntireGraph(graph);
          counts = whole.nodes.reduce<Record<string, number>>((aggregate, node) => { const type = node.labels[0]; if (type) aggregate[type] = (aggregate[type] ?? 0) + 1; return aggregate; }, {});
          matches = whole.nodes.filter((node) => ['Company','Decision','Project','Service'].some((label) => node.labels.includes(label))).slice(0, 16).map((node) => ({ entity: { ...node.properties, id: node.id, entityType: node.labels[0] as EntityType }, entityType: node.labels[0] as EntityType }));
          bundle = { nodes: matches.map((hit) => hit.entity), edges: [] };
        } else {
          if (state.request.context) target = await contextRecord(graph, state.request.context);
          if (!target && state.memory?.semanticEntities.length && /\b(it|that|those|them|there|this|these|same|instead|also|what about|and what|how about)\b/i.test(state.request.question)) {
            for (const remembered of state.memory.semanticEntities) {
              if (entityTypes.includes(remembered.entityType as EntityType)) {
                target = await contextRecord(graph, { entityId: remembered.id, entityType: remembered.entityType as EntityType });
                if (target) break;
              }
            }
          }
          if (!target) {
            const terms = queryTerms(state.request.question);
            for (const term of terms) { matches = await searchRecords(graph, term); if (matches.length) break; }
            const preferred = state.intent === 'decision_investigation' ? ['Decision','Document','Message','PullRequest']
              : ['Service','Project','Repository','Product','ProductModule'];
            const selected = ['decision_investigation','impact_analysis','ownership_lookup'].includes(state.intent)
              ? matches.find((item) => preferred.includes(item.entityType))
              : undefined;
            target = selected ?? matches[0];
          }
          if (target && !matches.some((item) => item.entity.id === target!.entity.id)) matches = [target, ...matches];
          if (target) bundle = await neighborhood(graph, target);
          else bundle = { nodes: matches.map((item) => item.entity), edges: [] };
        }
        return { target, matches, counts, bundle, status: 'retrieved' as const, stages: [...state.stages, { name: 'retrieve' as const, status: 'completed' as const }] };
      } catch {
        return { status: 'failed' as const, errors: ['Graph retrieval failed. Check the company data connection.'], stages: [...state.stages, { name: 'retrieve' as const, status: 'failed' as const }] };
      }
    })
    .addNode('synthesize', async (state) => {
      if (state.status === 'failed') return {};
      const fallback = makeFallback(state, state.matches, state.bundle, state.counts, false);
      if (!model) return { response: fallback, status: 'completed' as const, stages: [...state.stages, { name: 'synthesize' as const, status: 'skipped' as const }, { name: 'validate_response' as const, status: 'completed' as const }] };
      const entities = new Map([...state.matches.map((hit) => hit.entity), ...state.bundle.nodes].map((entity) => [entity.id, entity]));
      try {
        const prompt = `Answer the user's question using only the JSON evidence provided. Conversation memory is for resolving follow-up references and preferences; it is not evidence. Do not invent facts, owners, causal explanations, risks, or actions. Cite only IDs in evidence.entities. Distinguish recorded relationships from inference. For an impact request, do not claim simulation. Return one JSON object with keys title, summary, findings (array of {text, confidence: confirmed|inferred|unknown, citationIds}), citationIds, relatedEntityIds, uncertainty, suggestedActions (array of {label,type: open_entity|show_dependencies|investigate,entityId}). Every citation or action ID must exist in evidence.entities. Do not return HTML, JSX, code, or chain-of-thought.`;
        const raw = await model(prompt, JSON.stringify({ question: state.request.question, intent: state.intent, evidence: safeModelEvidence(state.matches, state.bundle, state.counts), memory: state.memory ?? { recentTurns: [], semanticEntities: [], recentProcedures: [] } }));
        const modelAnswer = validateModelAnswer(raw, new Set(entities.keys()));
        if (!modelAnswer) throw new Error('Invalid structured model output');
        const response = withModelAnswer(fallback, modelAnswer, [...entities.values()]);
        return { response, status: 'completed' as const, stages: [...state.stages, { name: 'synthesize' as const, status: 'completed' as const }, { name: 'validate_response' as const, status: 'completed' as const }] };
      } catch {
        const partial = makeFallback({ ...state, errors: ['Model synthesis unavailable; returned a deterministic evidence summary.'] }, state.matches, state.bundle, state.counts, true);
        return { response: partial, status: 'completed' as const, stages: [...state.stages, { name: 'synthesize' as const, status: 'fallback' as const }, { name: 'validate_response' as const, status: 'completed' as const }] };
      }
    })
    .addEdge(START, 'validate')
    .addEdge('validate', 'classify')
    .addEdge('classify', 'retrieve')
    .addEdge('retrieve', 'synthesize')
    .addEdge('synthesize', END);
  return workflow.compile();
}

export async function runAssistantWorkflow(input: unknown, graph: Graph, dependencies: AssistantWorkflowDependencies = {}) {
  const parsed = assistantRequestSchema.safeParse(input);
  if (!parsed.success) return { error: 'Assistant request is invalid.', status: 'failed' as const };
  const result = await createAssistantWorkflow(graph, dependencies).invoke({ request: parsed.data, memory: dependencies.memory }, { recursionLimit: 8 });
  if (!result.response) return { status: 'failed' as const, errors: result.errors };
  const validated = responseSchema.safeParse(result.response);
  if (!validated.success) return { status: 'failed' as const, errors: ['Structured assistant response validation failed.'] };
  return validated.data;
}
