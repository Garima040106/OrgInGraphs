import type { Graph } from 'falkordb';
import type { FeatureUpdateState } from '../agents/feature-update/types.js';
import type { TicketIdentificationState } from '../agents/ticket-identification/types.js';
import type { TicketModel } from '../agents/ticket-identification/types.js';
import type { FeatureUpdateModel } from '../agents/feature-update/types.js';

export const workflowEventKinds = ['auto', 'ticket', 'feature-update'] as const;
export type WorkflowEventKind = (typeof workflowEventKinds)[number];
export const workflowProvenances = ['synthetic', 'user-provided', 'external-verified', 'mock-verified'] as const;
export type WorkflowProvenance = (typeof workflowProvenances)[number];

export interface WorkflowInputEvent {
  text: string;
  type?: WorkflowEventKind;
  source?: string;
  sourceRecordId?: string;
  receivedAt?: string;
  provenance?: WorkflowProvenance;
}

export type WorkflowRoute = 'ticket-identification' | 'feature-update';
export type WorkflowPhase = 'received' | 'validated' | 'classified' | 'routed' | 'processed' | 'terminated' | 'failed';

export interface WorkflowGraphState {
  input: WorkflowInputEvent;
  phase: WorkflowPhase;
  route?: WorkflowRoute;
  provenance?: WorkflowProvenance;
  ticketState?: TicketIdentificationState;
  featureUpdateState?: FeatureUpdateState;
  response?: WorkflowResponse;
  errors: WorkflowError[];
  steps: number;
  graph?: Graph;
  ticketModel?: TicketModel;
  featureUpdateModel?: FeatureUpdateModel;
  deterministicModels?: boolean;
}

export interface WorkflowError {
  code: 'invalid-input' | 'model-failure' | 'database-failure' | 'agent-validation' | 'ambiguous-reference' | 'workflow-failure';
  message: string;
  retryable?: boolean;
}

export interface WorkflowResponse {
  ok: boolean;
  eventType: WorkflowRoute;
  provenance: WorkflowProvenance;
  classification: string;
  processing: 'processed' | 'not-persisted' | 'failed';
  resolvedEntities: Record<string, string | undefined>;
  changes: string[];
  unresolvedReferences: Array<{ text: string; kind: string; status: string; candidates?: string[] }>;
  errors: WorkflowError[];
}
