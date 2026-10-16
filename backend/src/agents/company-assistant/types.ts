import type { EntityType } from '../../types/seed.js';

export const assistantResponseTypes = [
  'company_overview', 'entity_lookup', 'ownership_lookup', 'decision_investigation',
  'impact_analysis', 'knowledge_graph_query', 'general_explanation'
] as const;
export type AssistantResponseType = (typeof assistantResponseTypes)[number];

export interface AssistantEntity {
  id: string;
  entityType: EntityType;
  name?: string;
  title?: string;
  [key: string]: unknown;
}

export interface AssistantCitation {
  entityId: string;
  entityType: EntityType;
  title: string;
  sourceSystem?: string;
  sourceRecordId?: string;
  sourceUrl?: string;
  excerpt?: string;
}

export interface AssistantFinding {
  text: string;
  confidence: 'confirmed' | 'inferred' | 'unknown';
  citationIds: string[];
}

export interface AssistantRelation {
  from: string;
  to: string;
  type: string;
  direction: 'incoming' | 'outgoing';
}

export interface AssistantStructuredResponse {
  conversationId?: string;
  answer: {
    type: AssistantResponseType;
    title: string;
    summary: string;
    findings: AssistantFinding[];
    citations: AssistantCitation[];
    related_entities: AssistantEntity[];
    suggested_actions: Array<{ label: string; type: 'open_entity' | 'show_dependencies' | 'investigate'; entityId: string }>;
    uncertainty: string;
  };
  ui: {
    component: 'company_overview' | 'entity_detail' | 'ownership_panel' | 'decision_timeline' | 'impact_analysis' | 'knowledge_graph' | 'general_response';
    layout: 'compact' | 'split';
    interactions: Array<{ type: 'open_entity' | 'show_dependencies' | 'investigate'; entityId: string }>;
    graph: { nodes: AssistantEntity[]; edges: AssistantRelation[] };
  };
  execution: {
    status: 'completed' | 'partial' | 'failed';
    stages: Array<{ name: 'validate' | 'classify' | 'retrieve' | 'synthesize' | 'validate_response'; status: 'completed' | 'fallback' | 'skipped' | 'failed' }>;
    errors: string[];
  };
}

export interface AssistantQueryInput {
  question: string;
  conversationId?: string;
  context?: { entityId: string; entityType: EntityType };
}
