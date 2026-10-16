import { createHash, randomUUID } from 'node:crypto';
import type { Graph } from 'falkordb';
import { query, rows } from '../../db/falkordb.js';
import type { AssistantStructuredResponse } from './types.js';

export type ConversationRole = 'user' | 'assistant';
export type MemoryKind = 'episodic' | 'semantic' | 'procedural';
export interface ConversationTurn { role: ConversationRole; content: string; response?: AssistantStructuredResponse; createdAt: string; }
export interface SemanticMemoryEntity { id: string; entityType: string; title: string; }
export interface ProceduralMemory { status: string; stages: Array<{ name: string; status: string }>; }
export interface AssistantMemoryContext { recentTurns: Array<Pick<ConversationTurn, 'role' | 'content'>>; semanticEntities: SemanticMemoryEntity[]; recentProcedures: ProceduralMemory[]; }
export interface ConversationSummary { id: string; title: string; createdAt: string; updatedAt: string; }

export function memoryOwnerId(workspaceIdentity: string) {
  return createHash('sha256').update(workspaceIdentity.trim().toLowerCase()).digest('hex');
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function createConversation(graph: Graph, ownerId: string, title: string): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(graph, 'CREATE (:AssistantConversation {id:$id, ownerId:$ownerId, title:$title, createdAt:$now, updatedAt:$now})', { id, ownerId, title: title.slice(0, 120), now });
  return id;
}

export async function ownsConversation(graph: Graph, ownerId: string, conversationId: string): Promise<boolean> {
  const result = await query(graph, 'MATCH (c:AssistantConversation {id:$conversationId, ownerId:$ownerId}) RETURN c.id AS id LIMIT 1', { conversationId, ownerId });
  return rows(result).length > 0;
}

export async function listConversations(graph: Graph, ownerId: string): Promise<ConversationSummary[]> {
  const result = await query(graph, 'MATCH (c:AssistantConversation {ownerId:$ownerId}) RETURN c.id AS id,c.title AS title,c.createdAt AS createdAt,c.updatedAt AS updatedAt ORDER BY c.updatedAt DESC LIMIT 50', { ownerId });
  return rows(result).flatMap((item) => typeof item.id === 'string' ? [{ id: item.id, title: typeof item.title === 'string' ? item.title : 'New conversation', createdAt: String(item.createdAt ?? ''), updatedAt: String(item.updatedAt ?? '') }] : []);
}

export async function conversationTurns(graph: Graph, ownerId: string, conversationId: string): Promise<ConversationTurn[] | null> {
  const result = await query(graph, 'MATCH (c:AssistantConversation {id:$conversationId, ownerId:$ownerId})-[:HAS_MEMORY]->(m:AssistantMemory {kind:"episodic"}) RETURN m.role AS role,m.content AS content,m.responseJson AS responseJson,m.createdAt AS createdAt ORDER BY m.createdAt ASC LIMIT 200', { conversationId, ownerId });
  if (!result.data?.length && !(await ownsConversation(graph, ownerId, conversationId))) return null;
  return rows(result).flatMap((item) => item.role === 'user' || item.role === 'assistant' ? [{ role: item.role, content: String(item.content ?? ''), ...(item.role === 'assistant' ? { response: parseJson<AssistantStructuredResponse | undefined>(item.responseJson, undefined) } : {}), createdAt: String(item.createdAt ?? '') }] : []);
}

export async function loadAssistantMemory(graph: Graph, ownerId: string, conversationId: string): Promise<AssistantMemoryContext> {
  const recentResult = await query(graph, 'MATCH (c:AssistantConversation {id:$conversationId, ownerId:$ownerId})-[:HAS_MEMORY]->(m:AssistantMemory {kind:"episodic"}) RETURN m.role AS role,m.content AS content ORDER BY m.createdAt DESC LIMIT 16', { conversationId, ownerId });
  const semanticResult = await query(graph, 'MATCH (m:AssistantMemory {ownerId:$ownerId, kind:"semantic"}) RETURN m.payloadJson AS payloadJson ORDER BY m.createdAt DESC LIMIT 30', { ownerId });
  const procedureResult = await query(graph, 'MATCH (m:AssistantMemory {ownerId:$ownerId, kind:"procedural"}) RETURN m.payloadJson AS payloadJson ORDER BY m.createdAt DESC LIMIT 6', { ownerId });
  const recentTurns = rows(recentResult).flatMap((item) => item.role === 'user' || item.role === 'assistant' ? [{ role: item.role, content: String(item.content ?? '') }] : []).reverse();
  const semanticEntities = [...new Map(rows(semanticResult).flatMap((item) => parseJson<SemanticMemoryEntity[]>(item.payloadJson, [])).map((entity) => [entity.id, entity])).values()].slice(0, 24);
  const recentProcedures = rows(procedureResult).flatMap((item) => { const value = parseJson<ProceduralMemory | null>(item.payloadJson, null); return value ? [value] : []; });
  return { recentTurns, semanticEntities, recentProcedures };
}

export async function saveAssistantTurn(graph: Graph, ownerId: string, conversationId: string, question: string, response: AssistantStructuredResponse): Promise<void> {
  const now = new Date().toISOString();
  const assistantSummary = `${response.answer.title}\n${response.answer.summary}`;
  const references = response.answer.citations.map(({ entityId, entityType, title }) => ({ id: entityId, entityType, title }));
  const memories: Array<{ kind: MemoryKind; role?: ConversationRole; content?: string; responseJson?: string; payloadJson?: string }> = [
    { kind: 'episodic', role: 'user', content: question },
    { kind: 'episodic', role: 'assistant', content: assistantSummary, responseJson: JSON.stringify(response) },
    { kind: 'semantic', payloadJson: JSON.stringify(references) },
    { kind: 'procedural', payloadJson: JSON.stringify({ status: response.execution.status, stages: response.execution.stages }) }
  ];
  await query(graph, 'MATCH (c:AssistantConversation {id:$conversationId, ownerId:$ownerId}) SET c.updatedAt=$now FOREACH (memory IN $memories | CREATE (m:AssistantMemory {id:memory.id,ownerId:$ownerId,conversationId:$conversationId,kind:memory.kind,role:memory.role,content:memory.content,responseJson:memory.responseJson,payloadJson:memory.payloadJson,createdAt:$now}) CREATE (c)-[:HAS_MEMORY]->(m))', {
    conversationId, ownerId, now,
    memories: memories.map((memory) => ({ id: randomUUID(), kind: memory.kind, role: memory.role ?? null, content: memory.content ?? null, responseJson: memory.responseJson ?? null, payloadJson: memory.payloadJson ?? null }))
  });
}
