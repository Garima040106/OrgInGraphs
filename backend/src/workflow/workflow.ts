import { ZodError } from 'zod';
import { runFeatureUpdate } from '../agents/feature-update/agent.js';
import { runTicketIdentification } from '../agents/ticket-identification/agent.js';
import type { FeatureUpdateState } from '../agents/feature-update/types.js';
import type { TicketIdentificationState } from '../agents/ticket-identification/types.js';
import type { TicketModel } from '../agents/ticket-identification/types.js';
import type { FeatureUpdateModel } from '../agents/feature-update/types.js';
import { configuredTicketModel, configuredFeatureUpdateModel } from '../models/agents.js';
import { classifyWorkflowInput, establishProvenance } from './classify.js';
import { validateWorkflowInput } from './validate.js';
import type { WorkflowError, WorkflowGraphState, WorkflowInputEvent, WorkflowResponse, WorkflowRoute } from './types.js';

const MAX_STEPS = 4;

function errorFrom(error: unknown): WorkflowError {
  if (error instanceof ZodError) return { code: 'invalid-input', message: 'Input failed workflow validation.' };
  if (error instanceof Error && /database|falkor/i.test(error.message)) return { code: 'database-failure', message: 'Graph database processing failed.', retryable: true };
  if (error instanceof Error && /model|provider|rate limit|credential/i.test(error.message)) return { code: 'model-failure', message: 'Model processing failed; deterministic fallback was unavailable.', retryable: true };
  return { code: 'workflow-failure', message: 'Workflow processing failed.' };
}

function unresolvedFromState(state: WorkflowGraphState) {
  if (state.route === 'ticket-identification') return (state.ticketState?.ticket?.references ?? []).filter((reference) => reference.status !== 'resolved');
  return (state.featureUpdateState?.update?.references ?? []).filter((reference) => reference.status !== 'resolved');
}

function agentErrors(state: WorkflowGraphState): WorkflowError[] {
  const errors = state.route === 'ticket-identification' ? (state.ticketState?.errors ?? []) : (state.featureUpdateState?.errors ?? []);
  return errors.map((message) => message.includes('persistence failed') || message.includes('FalkorDB')
    ? { code: 'database-failure' as const, message: 'Graph database persistence failed.', retryable: true }
    : { code: 'agent-validation' as const, message });
}

function responseFor(state: WorkflowGraphState): WorkflowResponse {
  const ticket = state.ticketState?.ticket;
  const update = state.featureUpdateState?.update;
  const entity = ticket ?? update;
  const unresolved = unresolvedFromState(state);
  const changes = update ? ['Activity identified', ...(update.newStatus ? [`Status changed to ${update.newStatus}`] : []), ...(state.featureUpdateState?.persisted ? ['Activity and relationships persisted'] : [])]
    : ticket ? ['Ticket identified', ...(state.ticketState?.persisted ? ['Ticket and relationships persisted'] : [])] : [];
  const resolvedEntities = ticket ? { ticketId: ticket.id, productId: ticket.productId, moduleId: ticket.moduleId, reporterId: ticket.reporterId, assigneeId: ticket.assigneeId }
    : { activityId: update?.id, actorId: update?.actorId, productId: update?.productId, moduleId: update?.moduleId, featureId: update?.featureId, ticketId: update?.ticketId };
  const errors = [...state.errors, ...agentErrors(state)];
  const ambiguous = state.route === 'ticket-identification' ? (state.ticketState?.ambiguities ?? []) : (state.featureUpdateState?.ambiguities ?? []);
  const allErrors = [...errors, ...(ambiguous.length ? [{ code: 'ambiguous-reference' as const, message: 'One or more references were ambiguous and were not linked.' }] : [])];
  return { ok: Boolean(entity) && allErrors.length === 0 && unresolved.length === 0 && (state.route === 'ticket-identification' ? Boolean(state.ticketState?.persisted) : Boolean(state.featureUpdateState?.persisted)), eventType: state.route ?? 'ticket-identification', provenance: state.provenance ?? 'user-provided', classification: ticket?.kind ?? update?.activityType ?? 'unknown', processing: allErrors.length ? 'failed' : (entity && (state.ticketState?.persisted || state.featureUpdateState?.persisted) ? 'processed' : 'not-persisted'), resolvedEntities, changes, unresolvedReferences: unresolved, errors: allErrors };
}

async function routeAndProcess(state: WorkflowGraphState): Promise<WorkflowGraphState> {
  if (!state.route || state.steps >= MAX_STEPS) return { ...state, phase: 'failed', errors: [...state.errors, { code: 'workflow-failure', message: 'Workflow exceeded its execution bound.' }] };
  const input = state.input;
  if (state.route === 'ticket-identification') {
    const ticketInput = { text: input.text, source: input.source, sourceRecordId: input.sourceRecordId, receivedAt: input.receivedAt };
    const ticketState = await runTicketIdentification(ticketInput, { graph: state.graph, model: state.ticketModel, useConfiguredModel: !state.deterministicModels });
    return { ...state, ticketState, phase: 'processed', steps: state.steps + 1 };
  }
  const featureInput = { text: input.text, source: input.source, sourceRecordId: input.sourceRecordId, receivedAt: input.receivedAt };
  const featureUpdateState = await runFeatureUpdate(featureInput, { graph: state.graph, model: state.featureUpdateModel, useConfiguredModel: !state.deterministicModels });
  return { ...state, featureUpdateState, phase: 'processed', steps: state.steps + 1 };
}

export async function runOrgInGraphsWorkflow(input: unknown, options: { graph?: WorkflowGraphState['graph']; models?: { ticket?: TicketModel; featureUpdate?: FeatureUpdateModel } } = {}): Promise<WorkflowResponse> {
  let state: WorkflowGraphState = { input: input as WorkflowInputEvent, phase: 'received', errors: [], steps: 0, graph: options.graph, ticketModel: options.models?.ticket, featureUpdateModel: options.models?.featureUpdate, deterministicModels: Boolean(options.models) };
  try {
    state = { ...state, input: validateWorkflowInput(input), phase: 'validated', provenance: establishProvenance(validateWorkflowInput(input)), steps: 1 };
    const route: WorkflowRoute = classifyWorkflowInput(state.input);
    state = { ...state, route, phase: 'classified', steps: state.steps + 1 };
    state = { ...state, phase: 'routed' };
    state = await routeAndProcess(state);
    state = { ...state, phase: 'terminated' };
    return responseFor(state);
  } catch (error) {
    const workflowError = errorFrom(error);
    return { ok: false, eventType: state.route ?? 'ticket-identification', provenance: state.provenance ?? 'user-provided', classification: 'unknown', processing: 'failed', resolvedEntities: {}, changes: [], unresolvedReferences: [], errors: [workflowError] };
  }
}
