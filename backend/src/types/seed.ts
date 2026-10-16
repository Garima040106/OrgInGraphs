export type EntityType = 'Company' | 'Employee' | 'Department' | 'Team' | 'Project' | 'Repository' | 'Service' | 'Document' | 'Decision' | 'Incident' | 'Task' | 'PullRequest' | 'Channel' | 'Message' | 'Product' | 'ProductModule' | 'Feature' | 'FeatureRequest' | 'Ticket' | 'Bug' | 'Release' | 'Commit' | 'Comment' | 'Activity' | 'Review';

export interface GraphNode { id: string; type: EntityType; properties: Record<string, unknown>; }
export interface GraphEdge { from: string; to: string; type: string; properties?: Record<string, unknown>; }
export interface SeedData { nodes: GraphNode[]; edges: GraphEdge[]; companyStartDate: string; }
