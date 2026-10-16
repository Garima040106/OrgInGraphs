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
