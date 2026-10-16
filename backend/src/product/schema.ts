import type { EntityType } from '../types/seed.js';

/** Product Progress nodes. Existing organization labels are intentionally reused. */
export const PRODUCT_NODE_LABELS = [
  'Product',
  'ProductModule',
  'Feature',
  'FeatureRequest',
  'Ticket',
  'Bug',
  'Release',
  'PullRequest',
  'Commit',
  'Comment',
  'Decision',
  'Activity',
  'Review',
  'Task'
] as const;

export type ProductNodeLabel = (typeof PRODUCT_NODE_LABELS)[number];
export type ProductOrganizationLabel = Extract<EntityType, 'Employee' | 'Department' | 'Team' | 'Project'>;

/** Labels allowed in Product Progress responses. Company-wide unrelated nodes are excluded. */
export const PRODUCT_PROGRESS_NODE_LABELS = [
  ...PRODUCT_NODE_LABELS,
  'Employee',
  'Department',
  'Team',
  'Project'
] as const;

export type ProductProgressNodeLabel = (typeof PRODUCT_PROGRESS_NODE_LABELS)[number];

/** Relationships owned by the Product Progress graph. */
export const PRODUCT_RELATIONSHIPS = [
  'HAS_MODULE',
  'HAS_FEATURE',
  'HAS_TICKET',
  'HAS_BUG',
  'HAS_RELEASE',
  'REPORTS_TO',
  'ASSIGNED_TO',
  'OWNED_BY',
  'PART_OF',
  'WORKS_IN',
  'MEMBER_OF',
  'WORKS_ON',
  'IMPLEMENTS',
  'FIXES',
  'DEPENDS_ON',
  'REVIEWS',
  'MERGES',
  'INCLUDES',
  'COMMENTED_ON',
  'MADE_DECISION',
  'RELATED_TO',
  'ACTIVITY_ON',
  'PERFORMED_BY',
  'CREATED'
] as const;

export type ProductRelationship = (typeof PRODUCT_RELATIONSHIPS)[number];

export interface ProductEntityProperties {
  id: string;
  graphDomain: 'product-progress';
  name?: string;
  title?: string;
  status?: string;
  priority?: string;
  createdAt: string;
  updatedAt: string;
  sourceSystem: 'seed' | string;
  sourceRecordId: string;
  externalUrl?: string;
  occurredAt?: string;
  startedAt?: string;
  completedAt?: string;
  dueAt?: string;
}

/** The schema contract for synthetic and future external records. */
export const PRODUCT_PROVENANCE = {
  graphDomain: 'product-progress',
  syntheticSourceSystem: 'seed',
  requiredFields: ['id', 'createdAt', 'updatedAt', 'sourceSystem', 'sourceRecordId'] as const,
  externalSourceSystemExamples: ['jira', 'github', 'linear', 'slack'] as const
} as const;

export function productNodeLabel(label: string): ProductProgressNodeLabel {
  if (!(PRODUCT_PROGRESS_NODE_LABELS as readonly string[]).includes(label)) {
    throw new Error(`Unsupported Product Progress node label: ${label}`);
  }
  return label as ProductProgressNodeLabel;
}

export function productRelationship(type: string): ProductRelationship {
  if (!(PRODUCT_RELATIONSHIPS as readonly string[]).includes(type)) {
    throw new Error(`Unsupported Product Progress relationship: ${type}`);
  }
  return type as ProductRelationship;
}
