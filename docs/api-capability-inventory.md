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


## confluence,JIRA,github API use

BASE API route are
 CONFLUNCE_API_KEY
 GITHUB_API_KEY
 SLACK_API_KEY
 JIRA_API_KEY

 in /backend/.env

### 1. General, dashboard and graph

| Method | Route | Purpose / useful query parameters |
|---|---|---|
| GET | `/` | Service overview and integration names |
| GET | `/api/health` | Health, combined seed node/edge counts and mock integration status |
| GET | `/api/docs` | Machine-readable route catalogue |
| GET | `/api/dashboard/summary` | Aggregate employee, project, repository, issue, PR, release, channel and message counts |
| GET | `/api/company` | Company records |
| GET | `/api/departments` | Departments; supports `q` |
| GET | `/api/teams` | Teams; supports `q` |
| GET | `/api/employees` | Employee directory; supports `q`, `departmentId`, `teamId`, `employmentStatus`, `location`, `seniority` |
| GET | `/api/graph` | Nodes and edges; supports `label`, `q`, `startAt`, `maxResults` |
| GET | `/api/graph/nodes` | Node list; supports `label`, `q` |
| GET | `/api/graph/edges` | Edge list; supports `type`, `nodeId` |
| GET | `/api/search?q=checkout` | Cross-system search across docs, Jira issues, repos, PRs, GitHub issues, Slack messages and employees |

`/api/search` requires `q` or `query`; it returns `400 query_required` if neither is supplied.

### 2. Confluence-style knowledge API

| Method | Route | Purpose / useful query parameters |
|---|---|---|
| GET | `/api/confluence/spaces` | Space list with page counts |
| GET | `/api/confluence/pages` | Page list; supports `q`, `query`, `search` |
| GET | `/api/confluence/pages/:id` | Read a page by seed ID, e.g. `org-doc-002` |
| GET | `/api/confluence/pages/:id/history` | Synthetic version history for a page |
| GET | `/api/confluence/search?query=idempotency` | Search titles, body text and IDs |
| GET | `/api/confluence/labels` | Label names and page counts |

Pages are shaped with `id`, `title`, `body.storage.value`, `space`, `version`, `author`, `labels`, timestamps and a synthetic URL. They work well as RAG ingestion inputs.

### 3. Jira-style work management API

| Method | Route | Purpose / useful query parameters |
|---|---|---|
| GET | `/api/jira/projects` | Project directory |
| GET | `/api/jira/boards` | Scrum-board-like project list |
| GET | `/api/jira/issue-types` | Distinct issue types in the seed |
| GET | `/api/jira/sprints` | Distinct seeded sprint names |
| GET | `/api/jira/issues` | Issues; supports `q`, `status`, `assignee` |
| GET | `/api/jira/issues/:id` | Issue by seed ID or Jira key, e.g. `/api/jira/issues/PAY-1001` |
| GET | `/api/jira/search?jql=retry` | Simple text search across summary, description, key, status, assignee and project |

Jira search accepts a **text fragment** in `jql`; this is not a complete JQL parser. Issue payloads include `key`, `summary`, `description`, `status`, `priority`, `issuetype`, `assignee`, `reporter`, `project`, `sprint`, `storyPoints`, `labels`, `components`, `created`, `updated`, `resolutiondate` and `fixVersion` where available.

### 4. GitHub-style source control API

| Method | Route | Purpose / useful query parameters |
|---|---|---|
| GET | `/api/github/repos` | Repository list; supports `q` |
| GET | `/api/github/repos/:owner/:repo` | Repository metadata; seeded owner is `acme-platform` |
| GET | `/api/github/repos/:owner/:repo/branches` | `main` plus feature/fix branches derived from seeded PRs |
| GET | `/api/github/repos/:owner/:repo/pulls` | Pull requests for one repository; supports `q` |
| GET | `/api/github/pulls` | Cross-repository pull requests; supports `q` |
| GET | `/api/github/pulls/:number` | Pull-request detail including branch names, merge state, linked Jira key and review decision |
| GET | `/api/github/pulls/:number/reviews` | Synthetic review records for a PR |
| GET | `/api/github/commits` | Cross-repository commits; supports `q` |
| GET | `/api/github/repos/:owner/:repo/commits` | Commits for one repository |
| GET | `/api/github/issues` | GitHub issues; supports `q`, `state`, `repo` |
| GET | `/api/github/releases` | Releases/tags; supports `q` |
| GET | `/api/github/search?q=wallet` | Search across repositories, PRs and commits |

The seed uses fictional organization/repository names such as `acme-platform/payments-api`. Branches, commit SHAs, review records and URLs are deterministic fixture data, not real GitHub objects. PR numbers and Jira keys are linked where applicable to support graph exploration and agent demos.

### 5. Slack-style workspace API

| Method | Route | Purpose / useful query parameters |
|---|---|---|
| GET | `/api/slack/users.list` | Named user directory with email, title, team and department in the profile |
| GET | `/api/slack/conversations.list` | Channel directory, purpose, topic, owner and member count |
| GET | `/api/slack/conversations.info?channel=team-platform` | One channel's metadata and owner |
| GET | `/api/slack/conversations.members?channel=team-platform` | Members and profile details for a channel |
| GET | `/api/slack/conversations.history?channel=team-payments` | Channel history; accepts channel name or seed channel ID |
| GET | `/api/slack/search.messages?query=idempotency` | Search message text, channel and user |

Channel names include `general`, `team-engineering`, `team-platform`, `team-payments`, `team-web`, `team-data`, `team-security`, `team-mobile`, `proj-saved-payments`, `inc-checkout-latency`, `customer-escalations`, `release-coordination` and `docs-and-knowledge`. Each seeded channel has an owner and membership list. Slack-shaped user IDs and message timestamps are synthetic.
