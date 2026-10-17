import { createHash } from 'node:crypto';
import type { DiscoveredSource } from '../types.js';

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  category: 'General' | 'Company' | 'Employees' | 'Departments' | 'Projects' | 'Graph' | 'Search' | 'ProductProgress' | 'Assistant' | 'Ingestion' | 'Confluence' | 'Jira' | 'GitHub' | 'Slack';
  summary: string;
  description: string;
  parameters?: {
    query?: Record<string, string>;
    path?: Record<string, string>;
    body?: Record<string, string>;
  };
  authentication?: string;
  responseDescription: string;
  associatedEntities: string[];
}

export const BACKEND_ROUTES: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/health',
    category: 'General',
    summary: 'Health check and database connectivity status',
    description: 'Checks connectivity to the underlying FalkorDB graph database. Returns status ok and database connected if reachable, otherwise degraded and 503.',
    responseDescription: 'JSON object with status ("ok"|"degraded") and database ("connected"|"unavailable").',
    associatedEntities: []
  },
  {
    method: 'GET',
    path: '/api/graph',
    category: 'Graph',
    summary: 'Complete company knowledge graph export',
    description: 'Retrieves all nodes and edges from the FalkorDB graph including disconnected nodes. No truncation or pagination limits are applied.',
    responseDescription: 'Object with nodes: Array<{ id, labels, properties }> and edges: Array<{ id, type, source, target, properties }>.',
    associatedEntities: ['Company', 'Employee', 'Department', 'Team', 'Project', 'Service', 'Repository', 'Document', 'Decision', 'Incident']
  },
  {
    method: 'GET',
    path: '/api/company',
    category: 'Company',
    summary: 'Get Hirenova organization core details',
    description: 'Returns the primary Company entity from FalkorDB. Includes name (Hirenova), founded date, company start date, source system provenance.',
    responseDescription: 'Company entity with id, name, foundedAt, companyStartDate, externalUrl, and provenance.',
    associatedEntities: ['Company']
  },
  {
    method: 'GET',
    path: '/api/employees',
    category: 'Employees',
    summary: 'List and filter employees across departments and teams',
    description: 'Queries Employee records in FalkorDB ordered by name. Supports filtering by departmentId, teamId, and employmentStatus ("active" | "inactive").',
    parameters: {
      query: {
        departmentId: 'Optional ID of department (e.g. swe, devops, paymentintegration)',
        teamId: 'Optional ID of team (e.g. eng, platform, payments)',
        employmentStatus: 'Optional status: active or inactive'
      }
    },
    responseDescription: 'Array of Employee records with id, employeeId, name, email, jobTitle, seniority, skills, location, employmentStatus.',
    associatedEntities: ['Employee', 'Department', 'Team']
  },
  {
    method: 'GET',
    path: '/api/employees/:employeeId',
    category: 'Employees',
    summary: 'Get full employee profile, management chain, and project assignments',
    description: 'Fetches detailed information for a specific employee by ID (e.g. emp-00). Resolves manager (REPORTS_TO), direct reports, department (WORKS_IN), team (MEMBER_OF), skills, and associated projects (WORKS_ON | OWNS).',
    parameters: {
      path: {
        employeeId: 'Unique employee ID string (e.g. emp-00, emp-01)'
      }
    },
    responseDescription: 'Object with employee, manager, directReports, department, team, skills, and projects.',
    associatedEntities: ['Employee', 'Department', 'Team', 'Project']
  },
  {
    method: 'GET',
    path: '/api/departments',
    category: 'Departments',
    summary: 'List all company departments, headcount, and leadership heads',
    description: 'Retrieves all Department nodes with calculated employeeCount (WORKS_IN) and list of department heads (Employee with HEADS relationship).',
    responseDescription: 'Array of Department records with id, name, slug, employeeCount, and heads.',
    associatedEntities: ['Department', 'Employee', 'Team']
  },
  {
    method: 'GET',
    path: '/api/departments/:departmentId',
    category: 'Departments',
    summary: 'Get department details with sub-teams and member employees',
    description: 'Retrieves a single Department by ID, including associated teams (HAS_TEAM) and all member employees (WORKS_IN).',
    parameters: {
      path: {
        departmentId: 'Unique department ID (e.g. swe, devops, paymentintegration, product, design, security, customer-success)'
      }
    },
    responseDescription: 'Object with department, teams array, and employees array.',
    associatedEntities: ['Department', 'Team', 'Employee']
  },
  {
    method: 'GET',
    path: '/api/projects',
    category: 'Projects',
    summary: 'List all company projects with owners, contributors, and dependent services',
    description: 'Queries Project nodes with their owners (Employee -[:OWNS]-> Project), contributors (Employee -[:WORKS_ON]-> Project), and services (Service -[:WORKS_ON]-> Project).',
    responseDescription: 'Array of Project objects with owners, contributors, and services.',
    associatedEntities: ['Project', 'Employee', 'Service']
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId',
    category: 'Projects',
    summary: 'Get project details including team members, pull requests, tasks, and owners',
    description: 'Detailed view of a project by ID (e.g. ledger-reconciliation, instant-refunds, reliability-foundation). Includes assigned employees, pull requests, tasks, and owners.',
    parameters: {
      path: {
        projectId: 'Unique project ID (e.g. ledger-reconciliation, instant-refunds, reliability-foundation)'
      }
    },
    responseDescription: 'Project record with employees, pullRequests, tasks, and owners arrays.',
    associatedEntities: ['Project', 'Employee', 'PullRequest', 'Task']
  },
  {
    method: 'GET',
    path: '/api/graph/neighborhood/:entityType/:entityId',
    category: 'Graph',
    summary: 'Explore 1-hop graph neighborhood and relationships for any entity',
    description: 'Traverses direct neighbors and directional edges connected to the specified entity in FalkorDB. Returns incoming and outgoing relationships capped at 100.',
    parameters: {
      path: {
        entityType: 'Supported entity label (e.g. Employee, Department, Team, Project, Service, Document, Decision)',
        entityId: 'Target entity ID'
      }
    },
    responseDescription: 'Object with nodes: Array<{ id, entityType, properties }> and edges: Array<{ from, to, type, direction }>.',
    associatedEntities: ['Employee', 'Department', 'Team', 'Project', 'Service', 'Document', 'Decision', 'Incident']
  },
  {
    method: 'GET',
    path: '/api/search',
    category: 'Search',
    summary: 'Full-text search across company graph entities by name, title, or email',
    description: 'Performs case-insensitive substring search on nodes with name, title, or email properties in FalkorDB. Capped at 50 results.',
    parameters: {
      query: {
        q: 'Search term (1 to 100 characters)'
      }
    },
    responseDescription: 'Array of matching items with entityType label and entity properties.',
    associatedEntities: ['Employee', 'Project', 'Service', 'Document', 'Decision', 'Team', 'Department']
  },
  {
    method: 'GET',
    path: '/api/product-progress/graph',
    category: 'ProductProgress',
    summary: 'Product Progress entity and activity knowledge graph',
    description: 'Returns the connected Product Progress graph containing Product, ProductModule, Feature, FeatureRequest, Ticket, Bug, Release, Commit, Comment, and Activity nodes.',
    responseDescription: 'Graph representation with nodes and edges matching the standard graph response contract.',
    associatedEntities: ['Product', 'ProductModule', 'Feature', 'FeatureRequest', 'Ticket', 'Bug', 'Release', 'Commit', 'Comment', 'Activity']
  },
  {
    method: 'POST',
    path: '/api/product-progress/tickets',
    category: 'ProductProgress',
    summary: 'Agent 2 Ticket Identification workflow endpoint',
    description: 'Extracts and classifies tickets (bug, feature request, task, improvement) from raw unstructured text, resolves references, and persists into FalkorDB.',
    parameters: {
      body: {
        text: 'Unstructured text describing a ticket, issue, or request',
        source: 'Optional source identifier (e.g. jira, user-input)',
        sourceRecordId: 'Optional source record ID'
      }
    },
    responseDescription: 'WorkflowResponse with ok, classification, resolvedEntities, changes, and unresolvedReferences.',
    associatedEntities: ['Ticket', 'Bug', 'Product', 'ProductModule', 'Employee']
  },
  {
    method: 'POST',
    path: '/api/product-progress/activities',
    category: 'ProductProgress',
    summary: 'Agent 2 Feature Update and Activity workflow endpoint',
    description: 'Processes development updates, pull requests, releases, code commits, and status changes, linking them to features and modules in the company graph.',
    parameters: {
      body: {
        text: 'Unstructured development update text',
        source: 'Optional source identifier (e.g. github, slack, user-input)'
      }
    },
    responseDescription: 'WorkflowResponse with ok, classification, resolvedEntities, changes, and unresolvedReferences.',
    associatedEntities: ['Activity', 'Feature', 'PullRequest', 'Release', 'Commit']
  },
  {
    method: 'POST',
    path: '/api/assistant/query',
    category: 'Assistant',
    summary: 'Company Assistant query and graph reasoning workflow',
    description: 'Orchestrates the company assistant LangGraph workflow: validates request, classifies intent (company_overview, ownership_lookup, decision_investigation, impact_analysis, knowledge_graph_query), retrieves graph context, optionally synthesizes with model, and validates response.',
    parameters: {
      body: {
        question: 'User question string (1 to 4000 characters)',
        conversationId: 'Optional UUID of existing conversation',
        context: 'Optional target entity context { entityId, entityType }'
      }
    },
    authentication: 'Optional header x-orgmind-user-id for workspace conversation persistence.',
    responseDescription: 'Structured assistant response with answer (title, summary, findings, citations, related_entities, uncertainty), ui layout, and execution stages.',
    associatedEntities: ['Company', 'Employee', 'Department', 'Project', 'Service', 'Document', 'Decision']
  },
  {
    method: 'GET',
    path: '/api/assistant/conversations',
    category: 'Assistant',
    summary: 'List past assistant conversations for the authenticated workspace identity',
    description: 'Returns up to 50 conversations owned by the workspace identity provided in x-orgmind-user-id header.',
    authentication: 'Requires x-orgmind-user-id header with a valid email string.',
    responseDescription: 'Object with conversations: Array<{ id, title, createdAt, updatedAt }>.',
    associatedEntities: []
  },
  {
    method: 'POST',
    path: '/api/ingestion/process',
    category: 'Ingestion',
    summary: 'Ingest records from mock connectors (Jira, Confluence, GitHub, Slack)',
    description: 'Validates source connector and limit, fetches normalized records from backend mock APIs or Confluence credentials, processes documents through ticket/feature-update routing, and indexes verified records.',
    parameters: {
      body: {
        source: 'confluence | jira | github | slack',
        limit: 'Optional integer between 1 and 100'
      }
    },
    responseDescription: 'Object with status, source, fetchedDocumentCount, outcomes, and errors.',
    associatedEntities: ['Document', 'Ticket', 'Activity']
  },
  {
    method: 'GET',
    path: '/api/confluence/pages',
    category: 'Confluence',
    summary: 'Confluence Knowledge Base pages, documentation spaces, and specs',
    description: 'Retrieves knowledge base pages with id, title, body storage value, space, version, author, labels, and timestamps. Serves as verified documentation backing company processes.',
    parameters: {
      query: {
        q: 'Optional search text to filter Confluence documentation',
        space: 'Optional Confluence space identifier'
      }
    },
    responseDescription: 'Array of Confluence pages with id, title, body.storage.value, space, version, and author.',
    associatedEntities: ['Document']
  },
  {
    method: 'GET',
    path: '/api/confluence/search',
    category: 'Confluence',
    summary: 'Search Confluence knowledge base titles, body content, and architecture records',
    description: 'Searches page titles, storage values, and labels in the Confluence documentation repository.',
    parameters: {
      query: {
        query: 'Search query string (e.g. idempotency, architecture, onboarding)'
      }
    },
    responseDescription: 'Array of matching Confluence documentation pages.',
    associatedEntities: ['Document']
  },
  {
    method: 'GET',
    path: '/api/jira/issues',
    category: 'Jira',
    summary: 'Jira work management issue tracker and sprint tickets',
    description: 'Retrieves Jira issues with key (e.g. PAY-1001), summary, description, status, priority, issuetype, assignee, reporter, sprint, storyPoints, and fixVersion.',
    parameters: {
      query: {
        status: 'Optional issue status filter (e.g. In Progress, Done, Open)',
        assignee: 'Optional employee ID or username',
        project: 'Optional project key (e.g. PAY)'
      }
    },
    responseDescription: 'Array of Jira issue objects with key, summary, description, status, priority, and links.',
    associatedEntities: ['Ticket', 'Bug', 'Project']
  },
  {
    method: 'GET',
    path: '/api/jira/search',
    category: 'Jira',
    summary: 'Jira text query search across tickets, bug reports, and sprint tasks',
    description: 'Performs text search across Jira summary, description, issue key, status, and assignee.',
    parameters: {
      query: {
        jql: 'Text search fragment or JQL filter string'
      }
    },
    responseDescription: 'Array of Jira issue records matching the query.',
    associatedEntities: ['Ticket', 'Bug']
  },
  {
    method: 'GET',
    path: '/api/github/pulls',
    category: 'GitHub',
    summary: 'GitHub source control pull requests, branches, and code reviews',
    description: 'Retrieves pull requests across company repositories with PR number, title, repository, author, merge state, branch names, and linked Jira keys.',
    parameters: {
      query: {
        q: 'Optional search term',
        state: 'Optional PR state: open, closed, merged'
      }
    },
    responseDescription: 'Array of pull request objects with number, title, head, base, merge state, and review decisions.',
    associatedEntities: ['PullRequest', 'Repository', 'Activity']
  },
  {
    method: 'GET',
    path: '/api/github/repos',
    category: 'GitHub',
    summary: 'GitHub repositories, services, and platform source control modules',
    description: 'Lists company repositories under acme-platform (e.g. payments-api, checkout-web, platform-runtime) with dependencies and branch metadata.',
    responseDescription: 'Array of GitHub repository records with name, owner, and default branch.',
    associatedEntities: ['Repository', 'Service']
  },
  {
    method: 'GET',
    path: '/api/slack/conversations.list',
    category: 'Slack',
    summary: 'Slack workspace channels, engineering rooms, and topic ownership',
    description: 'Lists Slack channels (e.g. #payments-eng, #team-engineering, #general) with channel purpose, topic, owner, and member counts.',
    responseDescription: 'Array of Slack channels with id, name, purpose, topic, and owner.',
    associatedEntities: ['Channel']
  },
  {
    method: 'GET',
    path: '/api/slack/conversations.history',
    category: 'Slack',
    summary: 'Slack channel discussion history, engineering threads, and messages',
    description: 'Retrieves message history from seeded channels such as #payments-eng, customer escalations, and release coordination.',
    parameters: {
      query: {
        channel: 'Channel name (e.g. #payments-eng) or channel ID'
      }
    },
    responseDescription: 'Array of message records with text, user, timestamp, and channel.',
    associatedEntities: ['Message', 'Channel']
  },
  {
    method: 'GET',
    path: '/api/dashboard',
    category: 'General',
    summary: 'Read the overview dashboard graph snapshots and source counts',
    description: 'Reads company, organization graph, product graph, totals, and source counts from FalkorDB. This route never calls upstream connectors.',
    responseDescription: 'Dashboard payload containing company, organization and productProgress graph responses, sourceCounts, and aggregate totals.',
    associatedEntities: ['Company', 'Employee', 'Team', 'Service', 'Decision', 'Document', 'Ticket', 'Message', 'PullRequest']
  },
  {
    method: 'GET',
    path: '/api/documents',
    category: 'Confluence',
    summary: 'Read Confluence documents already stored in FalkorDB',
    description: 'Returns paginated Document nodes whose sourceSystem is confluence. Supports q, limit, and offset; performs no Confluence API requests.',
    parameters: { query: { q: 'Optional title/content/source ID text filter', limit: 'Optional page size, 1 to 200', offset: 'Optional result offset' } },
    responseDescription: 'Paged source record response with items, total, limit, and offset.',
    associatedEntities: ['Document']
  },
  {
    method: 'GET',
    path: '/api/tickets',
    category: 'Jira',
    summary: 'Read Jira tickets already stored in FalkorDB',
    description: 'Returns paginated Ticket and Bug nodes whose sourceSystem is jira. Supports q, limit, and offset; performs no Jira API requests.',
    parameters: { query: { q: 'Optional title/content/source ID text filter', limit: 'Optional page size, 1 to 200', offset: 'Optional result offset' } },
    responseDescription: 'Paged source record response with items, total, limit, and offset.',
    associatedEntities: ['Ticket', 'Bug']
  },
  {
    method: 'GET',
    path: '/api/conversations',
    category: 'Slack',
    summary: 'Read Slack messages and linked channels already stored in FalkorDB',
    description: 'Returns paginated Message nodes whose sourceSystem is slack with their linked Channel when available. Supports q, limit, and offset; performs no Slack API requests.',
    parameters: { query: { q: 'Optional message or channel text filter', limit: 'Optional page size, 1 to 200', offset: 'Optional result offset' } },
    responseDescription: 'Paged messages with optional channel details and total count.',
    associatedEntities: ['Message', 'Channel']
  },
  {
    method: 'GET',
    path: '/api/proactive-insights',
    category: 'GitHub',
    summary: 'Read indexed GitHub activity for the proactive insights view',
    description: 'Returns paginated GitHub PullRequest, Bug, and Commit source records from FalkorDB. It does not calculate or claim risk insights.',
    parameters: { query: { q: 'Optional title/content/source ID text filter', limit: 'Optional page size, 1 to 200', offset: 'Optional result offset' } },
    responseDescription: 'Paged GitHub source records with total, limit, and offset.',
    associatedEntities: ['PullRequest', 'Bug', 'Commit']
  }
];

export function discoverRouteSources(): DiscoveredSource[] {
  return BACKEND_ROUTES.map((route) => {
    const id = `route:${route.method}:${route.path}`;
    const paramsText = route.parameters
      ? Object.entries(route.parameters)
          .map(([type, map]) => `${type.toUpperCase()} Parameters:\n${Object.entries(map).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`)
          .join('\n\n')
      : 'No specific query, path, or body parameters required.';

    const content = [
      `# API Route: ${route.method} ${route.path}`,
      `Category: ${route.category}`,
      `Summary: ${route.summary}`,
      `Description: ${route.description}`,
      route.authentication ? `Authentication: ${route.authentication}` : 'Authentication: None required / Open backend route',
      `Associated Entities: ${route.associatedEntities.length ? route.associatedEntities.join(', ') : 'None'}`,
      `\n## Parameters\n${paramsText}`,
      `\n## Response Contract\n${route.responseDescription}`
    ].join('\n\n');

    const hash = createHash('sha256').update(content).digest('hex');

    return {
      id,
      type: 'route',
      path: route.path,
      title: `${route.method} ${route.path} - ${route.summary}`,
      content,
      metadata: {
        method: route.method,
        path: route.path,
        category: route.category,
        entities: route.associatedEntities
      },
      hash
    };
  });
}
