import { createHash } from 'node:crypto';
import { identifiedTicketSchema, type ValidatedIdentifiedTicket } from './validation.js';
import { parseTicket } from './parser.js';
import { resolveReference } from './resolve.js';
import { persistTicket } from './persist.js';
import type { ReferenceCandidate, TicketInput, TicketIdentificationState, TicketModel } from './types.js';
import { configuredTicketModel } from '../../models/agents.js';

const referencePatterns: Array<[ReferenceCandidate['kind'], RegExp]> = [
  ['employee', /(?:assignee|assigned to|reporter|reported by)\s*[:=]?\s*([A-Za-z][A-Za-z .'-]+|emp-\d{2})/gi],
  ['product', /(?:product)\s*[:=]?\s*([a-z0-9][a-z0-9 -]+)/gi],
  ['module', /(?:module)\s*[:=]?\s*([a-z0-9][a-z0-9 -]+)/gi]
];

function findReferences(text: string): ReferenceCandidate[] {
  const result: ReferenceCandidate[] = [];
  for (const [kind, pattern] of referencePatterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (value) result.push({ kind, text: value, status: 'unresolved' });
    }
  }
  return result;
}

export const identifyNode = async (state: TicketIdentificationState, model?: TicketModel): Promise<TicketIdentificationState> => ({ ...state, parsed: await parseTicket(state.input, model) });

export async function resolveNode(state: TicketIdentificationState): Promise<TicketIdentificationState> {
  if (!state.parsed) return { ...state, errors: [...state.errors, 'Ticket has not been parsed'] };
  const references = findReferences(state.input.text);
  const resolved = [];
  for (const reference of references) resolved.push(await resolveReference(state.graph, reference.kind, reference.text));
  const byKind = new Map(resolved.map((reference) => [reference.kind, reference]));
  const parsed = { ...state.parsed };
  const employee = byKind.get('employee');
  const product = byKind.get('product');
  const module = byKind.get('module');
  if (employee?.status === 'resolved') parsed.assigneeId = employee.id;
  if (product?.status === 'resolved') parsed.productId = product.id;
  if (module?.status === 'resolved') parsed.moduleId = module.id;
  return { ...state, parsed: { ...parsed, references: resolved }, ambiguities: resolved.filter((reference) => reference.status === 'ambiguous') };
}

export function validateNode(state: TicketIdentificationState): TicketIdentificationState {
  if (!state.parsed) return { ...state, errors: [...state.errors, 'Ticket has not been parsed'] };
  const id = `ticket-${createHash('sha256').update(`${state.parsed.sourceSystem}:${state.parsed.sourceRecordId}`).digest('hex').slice(0, 16)}`;
  const result = identifiedTicketSchema.safeParse({ ...state.parsed, id });
  return result.success ? { ...state, ticket: result.data as ValidatedIdentifiedTicket } : { ...state, errors: [...state.errors, ...result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)] };
}

export async function persistNode(state: TicketIdentificationState): Promise<TicketIdentificationState> {
  if (!state.ticket || state.errors.length || state.ambiguities.length) return state;
  if (!state.graph) return { ...state, errors: [...state.errors, 'FalkorDB graph is required for persistence'] };
  await persistTicket(state.graph, state.ticket);
  return { ...state, persisted: true };
}

/** Each function is a LangGraph-compatible state node: state in, state out. */
export async function runTicketIdentification(input: TicketInput, options: { graph?: TicketIdentificationState['graph']; model?: TicketModel; useConfiguredModel?: boolean } = {}) {
  let state: TicketIdentificationState = { input, ambiguities: [], errors: [], persisted: false, graph: options.graph };
  try { state = await identifyNode(state, options.model ?? (options.useConfiguredModel === false ? undefined : configuredTicketModel())); }
  catch { return { ...state, errors: [...state.errors, 'Ticket parsing failed.'], persisted: false }; }
  try { state = await resolveNode(state); }
  catch { return { ...state, errors: [...state.errors, 'Ticket reference resolution failed.'], persisted: false }; }
  state = validateNode(state);
  try { state = await persistNode(state); }
  catch { return { ...state, errors: [...state.errors, 'Ticket persistence failed.'], persisted: false }; }
  return state;
}
