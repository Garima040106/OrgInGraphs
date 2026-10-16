import { createHash } from 'node:crypto';
import { parseFeatureUpdate } from './parser.js';
import { resolveActor, resolveUpdateReference } from './resolve.js';
import { persistFeatureUpdate } from './persist.js';
import { featureUpdateSchema, type ValidatedFeatureUpdate } from './validation.js';
import type { FeatureUpdateInput, FeatureUpdateModel, FeatureUpdateState, UpdateReference } from './types.js';
import { configuredFeatureUpdateModel } from '../../models/agents.js';

const actorPattern = /(?:actor|by|from)\s*(?:am|:|-)?\s*(emp-\d{2}|[A-Za-z][A-Za-z .'-]+?)(?=\s*(?:[:;,]|\b(?:fixed|reviewed|merged|updated|completed|is|was)\b|$))/i;
const entityPatterns: Array<[UpdateReference['kind'], RegExp]> = [
  ['pull-request', /(?:PR|pull request)\s*(?:#|:)?\s*([A-Za-z0-9._-]+)/gi],
  ['commit', /commit\s*(?:#|:)?\s*([A-Za-z0-9._-]+)/gi],
  ['release', /release\s*(?:#|:)?\s*([A-Za-z0-9._-]+)/gi],
  ['ticket', /(?:ticket|bug)\s*(?:#|:)?\s*([A-Za-z0-9._-]+)/gi]
];

function extractReferences(text: string): UpdateReference[] {
  const result: UpdateReference[] = [];
  for (const [kind, pattern] of entityPatterns) for (const match of text.matchAll(pattern)) if (match[1]) result.push({ kind, text: match[1], status: 'unresolved', verified: false });
  return result;
}

export const identifyUpdateNode = async (state: FeatureUpdateState, model?: FeatureUpdateModel): Promise<FeatureUpdateState> => ({ ...state, parsed: await parseFeatureUpdate(state.input, model) });

export async function resolveUpdateNode(state: FeatureUpdateState): Promise<FeatureUpdateState> {
  if (!state.parsed) return { ...state, errors: [...state.errors, 'Update has not been parsed'] };
  const parsed = { ...state.parsed };
  const references = extractReferences(state.input.text);
  const resolvedReferences = [];
  for (const reference of references) resolvedReferences.push(await resolveUpdateReference(state.graph, reference.kind, reference.text));
  const actorMatch = state.input.text.match(actorPattern);
  if (actorMatch) {
    const actor = await resolveActor(state.graph, actorMatch[1].trim());
    if (actor.status === 'resolved') parsed.actorId = actor.id;
    if (actor.status === 'ambiguous') state.ambiguities.push({ kind: 'external', text: actor.text, status: 'ambiguous', verified: false, candidates: actor.candidates });
    if (actor.status === 'unresolved') state.unresolved.push({ kind: 'external', text: actor.text, status: 'unresolved', verified: false });
  }
  for (const reference of resolvedReferences) {
    if (reference.status === 'ambiguous') state.ambiguities.push(reference);
    if (reference.status === 'unresolved') state.unresolved.push(reference);
  }
  parsed.references = resolvedReferences;
  const ticket = resolvedReferences.find((reference) => reference.kind === 'ticket' && reference.status === 'resolved');
  if (ticket?.id) parsed.ticketId = ticket.id;
  return { ...state, parsed };
}

export function validateUpdateNode(state: FeatureUpdateState): FeatureUpdateState {
  if (!state.parsed) return { ...state, errors: [...state.errors, 'Update has not been parsed'] };
  const id = `activity-${createHash('sha256').update(`${state.parsed.sourceSystem}:${state.parsed.sourceRecordId}`).digest('hex').slice(0, 16)}`;
  const result = featureUpdateSchema.safeParse({ ...state.parsed, id });
  return result.success ? { ...state, update: result.data as ValidatedFeatureUpdate } : { ...state, errors: [...state.errors, ...result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)] };
}

export async function persistUpdateNode(state: FeatureUpdateState): Promise<FeatureUpdateState> {
  if (!state.update || state.errors.length || state.ambiguities.length || !state.graph) return state.graph ? state : { ...state, errors: [...state.errors, 'FalkorDB graph is required for persistence'] };
  await persistFeatureUpdate(state.graph, state.update);
  return { ...state, persisted: true };
}

/** State-in/state-out nodes can be wired directly into a LangGraph StateGraph. */
export async function runFeatureUpdate(input: FeatureUpdateInput, options: { graph?: FeatureUpdateState['graph']; model?: FeatureUpdateModel; useConfiguredModel?: boolean } = {}) {
  let state: FeatureUpdateState = { input, ambiguities: [], unresolved: [], errors: [], persisted: false, graph: options.graph };
  state = await identifyUpdateNode(state, options.model ?? (options.useConfiguredModel === false ? undefined : configuredFeatureUpdateModel()));
  state = await resolveUpdateNode(state);
  state = validateUpdateNode(state);
  state = await persistUpdateNode(state);
  return state;
}
