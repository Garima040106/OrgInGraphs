import type { Graph } from 'falkordb';
import type { NormalizedDocument } from '../mock-fetcher/types.js';
import type { FeatureUpdateModel } from '../feature-update/types.js';
import type { TicketModel } from '../ticket-identification/types.js';

export type DocumentOutcomeStatus = 'processed' | 'skipped' | 'failed' | 'unresolved';
export type DocumentRoute = 'ticket-identification' | 'feature-update' | 'unsupported';
export interface DocumentOutcome {
  sourceSystem: string;
  sourceRecordId: string;
  status: DocumentOutcomeStatus;
  route: DocumentRoute;
  entityId?: string;
  unresolvedReferences: Array<{ text: string; kind: string; status: string; candidates?: string[] }>;
  error?: string;
}
export interface DocumentProcessorOptions {
  graph?: Graph;
  ticketModel?: TicketModel;
  featureUpdateModel?: FeatureUpdateModel;
  useConfiguredModels?: boolean;
}
