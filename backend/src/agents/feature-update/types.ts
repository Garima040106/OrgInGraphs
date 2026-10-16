import type { Graph } from 'falkordb';

export const activityTypes = ['fix', 'feature-complete', 'merge', 'release-blocked', 'review', 'status-update', 'development-update'] as const;
export type ActivityType = (typeof activityTypes)[number];

export interface FeatureUpdateInput {
  text: string;
  source?: string;
  sourceRecordId?: string;
  receivedAt?: string;
  provenance?: 'synthetic' | 'user-provided' | 'external-verified';
  metadata?: Record<string, unknown>;
}

export interface UpdateReference {
  kind: 'pull-request' | 'commit' | 'release' | 'ticket' | 'feature' | 'external';
  text: string;
  id?: string;
  status: 'resolved' | 'ambiguous' | 'unresolved';
  verified: false;
  candidates?: string[];
}

export interface FeatureUpdate {
  id: string;
  actorId?: string;
  occurredAt?: string;
  activityType: ActivityType;
  summary: string;
  productId?: string;
  moduleId?: string;
  featureId?: string;
  ticketId?: string;
  previousStatus?: string;
  newStatus?: string;
  references: UpdateReference[];
  sourceSystem: string;
  sourceRecordId: string;
  provenance: 'synthetic' | 'user-provided' | 'external-verified';
  verifiedExternalEvent: false;
  graphDomain: 'product-progress';
  createdAt: string;
  updatedAt: string;
}

export interface FeatureUpdateState {
  input: FeatureUpdateInput;
  parsed?: Partial<FeatureUpdate>;
  update?: FeatureUpdate;
  ambiguities: UpdateReference[];
  unresolved: UpdateReference[];
  errors: string[];
  persisted: boolean;
  graph?: Graph;
}

export type FeatureUpdateModel = (input: FeatureUpdateInput) => Promise<unknown>;
