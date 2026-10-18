import type { Graph } from 'falkordb';

export const ticketKinds = ['bug', 'feature-request', 'task', 'improvement', 'question'] as const;
export type TicketKind = (typeof ticketKinds)[number];

export const priorities = ['P0', 'P1', 'P2', 'P3', 'unknown'] as const;
export type TicketPriority = (typeof priorities)[number];

export const statuses = ['open', 'triaged', 'in-progress', 'blocked', 'done', 'unknown'] as const;
export type TicketStatus = (typeof statuses)[number];

export interface TicketInput {
  text: string;
  source?: string;
  sourceRecordId?: string;
  receivedAt?: string;
  provenance?: 'synthetic' | 'user-provided' | 'external-verified';
  metadata?: Record<string, unknown>;
}

export interface ReferenceCandidate {
  kind: 'employee' | 'product' | 'module' | 'ticket' | 'external';
  text: string;
  id?: string;
  status: 'resolved' | 'ambiguous' | 'unresolved';
  candidates?: string[];
}

export interface IdentifiedTicket {
  id: string;
  kind: TicketKind;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  productId?: string;
  moduleId?: string;
  reporterId?: string;
  assigneeId?: string;
  references: ReferenceCandidate[];
  sourceSystem: string;
  sourceRecordId: string;
  graphDomain: 'product-progress';
  synthetic: boolean;
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  issueKey?: string;
  originalStatus?: string;
  originalPriority?: string;
  assigneeName?: string;
  reporterName?: string;
  externalUrl?: string;
}

export interface TicketIdentificationState {
  input: TicketInput;
  parsed?: Partial<IdentifiedTicket>;
  ticket?: IdentifiedTicket;
  ambiguities: ReferenceCandidate[];
  errors: string[];
  persisted: boolean;
  graph?: Graph;
}

export type TicketModel = (input: TicketInput) => Promise<unknown>;
