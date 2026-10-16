# Backend API capability inventory

The backend exposes no OpenAPI document. This inventory is based on the current Express routes, workflow schemas, agent implementations, and existing response types. The backend has no authentication middleware; the local demo login is not an access boundary.

| Endpoint | Contract / behavior | Frontend use |
|---|---|---|
| `GET /health` | Status and database connectivity | Workspace connection indicator |
| `GET /api/company` | Company graph node | Workspace company name |
| `GET /api/graph` | Full graph nodes and edges | Dashboard metrics and organization graph |
| `GET /api/graph/neighborhood/:entityType/:entityId` | Direct neighbors and relationship direction, capped at 100 | Graph expansion; entity, ownership, decision, and impact views |
| `GET /api/search?q=` | Up to 50 graph records matching name, title, or email | Global search and assistant citations |
| `GET /api/employees[?departmentId&teamId&employmentStatus]` | Employee list/filter | People directory |
| `GET /api/employees/:employeeId` | Employee, manager, reports, department, team, skills, projects | People details and ownership/entity cards |
| `GET /api/departments[/:departmentId]` | Department list and department/team/employee details | Department directory/details |
| `GET /api/projects[/:projectId]` | Project list/details with owners, people, tasks, PRs, and services | Project directory/details and assistant cards |
| `GET /api/product-progress/graph` | Product Progress graph in the standard graph response shape | Product Progress graph |
| `POST /api/product-progress/tickets` | Validated ticket identification and graph persistence | Existing workflow capability; no automatic assistant write action |
| `POST /api/product-progress/activities` | Validated activity processing and graph persistence | Existing workflow capability; no automatic assistant write action |
| `POST /api/product-progress/workflow` | Routes ticket or feature update input | Existing workflow capability |
| `POST /api/assistant/query` | LangGraph retrieval and optional synthesis; validated structured answer with graph evidence and execution stages | Right-side assistant drawer and safe response renderer
| `GET /api/assistant/conversations` | Lists up to 50 conversations for the supplied workspace identity | Assistant conversation switcher
| `GET /api/assistant/conversations/:conversationId` | Returns persisted turns after checking conversation ownership | Restore a prior assistant conversation
| `POST /api/ingestion/process` | LangGraph validates source and limit, fetches normalized records, processes documents, and returns per-record outcomes | Integration settings "Fetch & process records" action |

## LangGraph ingestion behavior

The ingestion endpoint accepts `confluence`, `jira`, `github`, or `slack`, with an optional limit from 1 to 100. Confluence uses `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN` on the backend when no mock source URL is configured; pages are stored as verified `Document` nodes. Jira records route through ticket identification. Some GitHub and Slack records route through feature-update processing. Other sources use the backend `MOCK_API_BASE_URL`. Credentials are not accepted in browser requests. The endpoint returns counts and outcomes, not raw source content or a persistent execution trace. The frontend shows returned outcomes and links processed graph entity IDs.

The assistant query endpoint `POST /api/assistant/query` runs a LangGraph workflow: validate, classify, retrieve graph entities and direct neighbors, optionally synthesize with the configured model, and validate a structured response. With model configuration disabled or unavailable, it returns deterministic summaries, verified graph citations, uncertainty, and execution stage statuses. It supports company overview, entity lookup, ownership lookup, decision investigation, impact traversal, graph query, and general explanation. Impact output explicitly reports direct graph traversal and does not claim a simulation. The response renderer uses an allowlist of predefined React views, and citation links resolve to graph-backed entities or their indexed source URL.

Assistant memory is stored in FalkorDB as conversation-scoped episodic turns and workspace-scoped semantic entity references and procedural execution stages. Memory is used for follow-up context, not as factual evidence. The API currently scopes this data using a hash of the `x-orgmind-user-id` email header. This is suitable only for the current demo login: the backend has no authentication middleware, so clients can spoof that identity. Deployments with real users must bind the owner identity to a verified server-side session/JWT before treating it as a security boundary.

## Capabilities not exposed

There is no separate source-citation retrieval endpoint, authenticated Jira/GitHub/Slack connector, dedicated decision-history service, causal investigation service, impact simulation, proactive insight API, or detailed agent tool-trace API. Indexed source records are retrievable through graph search and neighborhoods. The assistant distinguishes recorded relationships from inferred impact and does not claim to simulate impact. Rich renderers for conflicting-document comparisons, missing-approval audits, task proposals, proactive insights, and multi-stage tool traces are not yet exposed by the current backend response contract.
