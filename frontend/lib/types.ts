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
  status: "received" | "failed" | "fetched" | "processed" | "empty";
  source?: string;
  fetchedDocumentCount: number;
  outcomes: IngestionOutcome[];
  errors: string[];
};

export type AssistantQuery = { question: string; conversationId?: string; context?: { entityId: string; entityType: EntityType } };
export type AssistantConversation = { id: string; title: string; createdAt: string; updatedAt: string };
export type AssistantTurn = { role: "user" | "assistant"; content: string; response?: AssistantResponse; createdAt: string };
export type AssistantResponse = {
  conversationId?: string;
  answer: {
    type: "company_overview" | "entity_lookup" | "ownership_lookup" | "decision_investigation" | "impact_analysis" | "knowledge_graph_query" | "general_explanation";
    title: string; summary: string;
    findings: Array<{ text: string; confidence: "confirmed" | "inferred" | "unknown"; citationIds: string[] }>;
    citations: Array<{ entityId: string; entityType: EntityType; title: string; sourceSystem?: string; sourceRecordId?: string; sourceUrl?: string; excerpt?: string }>;
    related_entities: Array<Entity & { entityType: EntityType }>;
    suggested_actions: Array<{ label: string; type: "open_entity" | "show_dependencies" | "investigate"; entityId: string }>;
    uncertainty: string;
  };
  ui: { component: string; layout: "compact" | "split"; interactions: Array<{ type: "open_entity" | "show_dependencies" | "investigate"; entityId: string }>; graph: Neighborhood };
  execution: { status: "completed" | "partial" | "failed"; stages: Array<{ name: string; status: "completed" | "fallback" | "skipped" | "failed" }>; errors: string[] };
};
