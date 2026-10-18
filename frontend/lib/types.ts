export type EntityType =
  | "Company"
  | "Employee"
  | "Department"
  | "Team"
  | "Project"
  | "Repository"
  | "Service"
  | "Document"
  | "Decision"
  | "Incident"
  | "Task"
  | "PullRequest"
  | "Channel"
  | "Message";

export type ProductEntityType = "Product" | "ProductModule" | "Feature" | "FeatureRequest" | "Ticket" | "Bug" | "Release" | "Commit" | "Comment" | "Activity" | "Review";
export type GraphEntityType = EntityType | ProductEntityType;

export type GraphApiNode = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
};

export type GraphApiEdge = {
  id: string;
  type: string;
  source: string;
  target: string;
  properties: Record<string, unknown>;
};

export type GraphResponse = {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
};

export type DashboardResponse = {
  company: Entity | null;
  organization: GraphResponse;
  productProgress: GraphResponse;
  sourceCounts: Record<"confluence" | "jira" | "slack" | "github", number>;
  totals: { entities: number; people: number; teams: number; services: number; decisions: number };
};
export type SourceRecordResponse = { source: string; items: GraphApiNode[]; total: number; limit: number; offset: number };
export type IntegrationStatus = {
  source: IngestionSource;
  connectorConfigured: boolean;
  indexedRecords: number;
  connectionStatus: "not-configured" | "not-tested" | "available" | "fixture-data" | "error";
  lastError: string | null;
  lastSyncStatus: "received" | "failed" | "fetched" | "processed" | "partial" | "empty" | null;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  syncHistoryAvailable: boolean;
  history: IntegrationSyncRun[];
  browserSyncAvailable: boolean;
};
export type IntegrationSyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: "received" | "failed" | "fetched" | "processed" | "partial" | "empty";
  fetched: number;
  excludedSynthetic: number;
  processed: number;
  failed: number;
  unresolved: number;
  skipped: number;
  error: string | null;
};
export type IntegrationStatusResponse = {
  sources: IntegrationStatus[];
  syncHistoryAvailable: boolean;
  syncAuthorization: "backend-admin-key-required";
};

export type Entity = Record<string, unknown> & {
  id: string;
  name?: string;
  title?: string;
  entityType?: GraphEntityType;
};

export type Employee = Entity & {
  employeeId?: string;
  email?: string;
  jobTitle?: string;
  departmentId?: string;
  teamId?: string;
  managerId?: string | null;
  employmentStatus?: string;
  skills?: string[];
};

export type Department = Entity & {
  employeeCount?: number;
  heads?: Entity[];
};

export type Project = Entity & {
  status?: string;
  owners?: Entity[];
  contributors?: Entity[];
  services?: Entity[];
};

export type EmployeeDetail = {
  employee: Employee;
  manager: Employee | null;
  directReports: Employee[];
  department: Department | null;
  team: Entity | null;
  skills: string[];
  projects: Project[];
};

export type DepartmentDetail = {
  department: Department;
  teams: Entity[];
  employees: Employee[];
};

export type ProjectDetail = Project & {
  employees: Employee[];
  pullRequests: Entity[];
  tasks: Entity[];
  owners: Employee[];
};

export type Neighborhood = {
  nodes: Array<Entity & { entityType?: GraphEntityType }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    direction?: "outgoing" | "incoming" | "unknown";
  }>;
};

export type SearchResult = {
  entityType: GraphEntityType;
  n: Entity;
};

export type Health = {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
};

export type IngestionSource = "confluence" | "jira" | "github" | "slack";
export type IngestionOutcome = {
  sourceSystem: string;
  sourceRecordId: string;
  status: "processed" | "skipped" | "failed" | "unresolved";
  route: "ticket-identification" | "feature-update" | "document-indexing" | "unsupported";
  entityId?: string;
  unresolvedReferences: Array<{ text: string; kind: string; status: string; candidates?: string[] }>;
  error?: string;
};
export type IngestionResponse = {
  status: "received" | "failed" | "fetched" | "processed" | "partial" | "empty";
  source?: string;
  fetchedDocumentCount: number;
  excludedSyntheticCount: number;
  outcomes: IngestionOutcome[];
  errors: string[];
};

export type PlatformType = "jira" | "confluence" | "slack" | "github" | "route" | "database";

export type OrganizationRagResponse = {
  answer: string;
  sources: Array<{
    title: string;
    sourceType: string;
    sourcePath: string;
    url?: string;
    platform?: PlatformType;
    excerpt?: string;
  }>;
  retrieved_chunks: Array<{
    chunkId: string;
    sourcePath: string;
    score: number;
    text: string;
    platform?: PlatformType;
    metadata: Record<string, unknown>;
  }>;
  agent: "organization-intelligence";
  status: "completed" | "partial" | "failed";
  uncertainty?: string;
  errors?: string[];
  retrieval?: { candidateCount: number; usedChunks: number };
};

export type RagQueryResponse = {
  answer: string;
  sources: Array<{
    documentId: string;
    chunkId: string;
    sourceType: string;
    title: string;
    url?: string;
    score: number;
    excerpt?: string;
    citationIds?: string[];
  }>;
  retrieval: { candidateCount: number; usedChunks: number };
  evidenceFound: boolean;
};

export type AssistantQuery = { question: string; conversationId?: string; context?: { entityId: string; entityType: EntityType } };
export type AssistantConversation = { id: string; title: string; createdAt: string; updatedAt: string };
export type AssistantTurn = { role: "user" | "assistant"; content: string; response?: AssistantResponse; ragResponse?: OrganizationRagResponse; createdAt: string };
export type AssistantResponse = {
  conversationId?: string;
  answer: {
    type: "company_overview" | "entity_lookup" | "ownership_lookup" | "decision_investigation" | "impact_analysis" | "knowledge_graph_query" | "general_explanation";
    title: string; summary: string;
    findings: Array<{ text: string; confidence: "confirmed" | "inferred" | "unknown"; citationIds: string[] }>;
    citations: Array<{ entityId: string; entityType: EntityType; title: string; platform?: PlatformType; sourceSystem?: string; sourceRecordId?: string; sourceUrl?: string; excerpt?: string }>;
    related_entities: Array<Entity & { entityType: EntityType }>;
    suggested_actions: Array<{ label: string; type: "open_entity" | "show_dependencies" | "investigate"; entityId: string }>;
    uncertainty: string;
  };
  ui: { component: string; layout: "compact" | "split"; interactions: Array<{ type: "open_entity" | "show_dependencies" | "investigate"; entityId: string }>; graph: Neighborhood };
  execution: { status: "completed" | "partial" | "failed"; stages: Array<{ name: string; status: "completed" | "fallback" | "skipped" | "failed" }>; errors: string[] };
};
