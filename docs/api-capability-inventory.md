# Backend API capability inventory

The backend exposes no OpenAPI document. This inventory is based on the current Express routes, workflow schemas, agent implementations, and existing response types. The backend has no authentication middleware; the local demo login is not an access boundary.

| Endpoint | Contract / behavior | Frontend use |
|---|---|---|
| `GET /health` | Status and database connectivity | Workspace connection indicator |
| `GET /api/company` | Company graph node | Workspace company name |
| `GET /api/graph` | Full graph nodes and edges | Dashboard metrics and organization graph |
| `GET /api/dashboard` | Company data plus organization and product graph snapshots and source counts, assembled from FalkorDB | Overview Bento dashboard initial load and refresh |
| `GET /api/dashboard/summary` | Lightweight totals and source counts from FalkorDB | Dashboard summary integrations |
| `GET /api/documents?q=&limit=&offset=` | Paginated Confluence `Document` graph records | Documents page |
| `GET /api/tickets?q=&limit=&offset=` | Paginated Jira `Ticket` and `Bug` graph records | Tickets page |
| `GET /api/conversations?q=&limit=&offset=` | Paginated Slack `Message` records and linked channels | Conversations page |
| `GET /api/proactive-insights?q=&limit=&offset=` | Paginated GitHub pull request, issue, and commit records | Proactive Insights source view (not a generated risk assessment) |
| `GET /api/integrations/status` | Connector configuration, verified indexed counts, last sync outcome, and ten recent sanitized sync runs; it does not actively probe the upstream provider | Integrations and Sync & Data pages |
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
| `POST /api/ingestion/process` | Requires the backend `RAG_ADMIN_API_KEY` in `x-rag-admin-key` and a valid demo identity header; fetches normalized records and returns outcomes | No browser action; requires an authorized backend operator |

## Documents and tickets pages

The Documents page reads `GET /api/documents`; the Tickets page reads `GET /api/tickets`. Both routes paginate and filter persisted source records, and neither calls upstream services. Conversations reads `GET /api/conversations`, and Proactive Insights reads `GET /api/proactive-insights`. The overview page uses `GET /api/dashboard` for the company, organization and product graphs, counts, and dashboard cards. Backend read failures are displayed in the relevant page. Browser-triggered sync is disabled because the frontend has no trusted operator authentication channel; sync requires a backend-side caller holding `RAG_ADMIN_API_KEY`.

Confluence fetching uses the configured server-side Confluence REST API connection (`CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN` or `CONFLUENCE_API_KEY`) when `MOCK_API_BASE_URL` is not set. Jira fetching uses the configured connector at `MOCK_API_BASE_URL/api/jira/issues` with `JIRA_API_KEY` when supplied; a direct Jira Cloud REST client is not implemented. The route catalog's `/api/confluence/*` and `/api/jira/*` entries describe connector/source capabilities and are not Express routes exposed by this backend. The supplied Jira response contains `rawSeedId`, which marks the current records as fixtures; the ingestion workflow rejects these records and the Tickets API intentionally does not show them. Configure a connector that returns genuine Jira records marked with verified provenance before expecting them in Tickets.

The same ingestion flow now persists Slack messages as graph `Message` nodes with channel relationships and GitHub pull requests, issues, and commits as graph source records. The frontend maps Conversations to Slack `Message` records and Proactive Insights to GitHub records. The latter is a source-backed activity view; the backend does not currently calculate or persist risk insights from GitHub data. Source refreshes use the route catalog contract (`/api/slack/conversations.list` and `/api/slack/conversations.history`; `/api/github/pulls`, `/api/github/issues`, and `/api/github/commits`) through `MOCK_API_BASE_URL`, which defaults to `http://localhost:8787` for these connector APIs.

Per-source credentials are backend-only: `CONFLUENCE_API_KEY` (or the existing `CONFLUENCE_API_TOKEN` for direct Atlassian access), `JIRA_API_KEY`, `SLACK_API_KEY`, and `GITHUB_API_KEY`. For the route-catalog connector, a non-URL source key is sent in `x-api-key` and Bearer authorization headers, but it does not establish record provenance. Generic route-catalog responses are classified as synthetic even if the response asserts otherwise. Only the direct Confluence REST client marks records verified, and it excludes explicit seed markers. Graph reads are served from FalkorDB, so page navigation does not refetch upstream APIs.

### Source API response probe (2026-10-17)

The configured tunnel routes responded successfully, but the returned records are seeded fixtures, not verified live provider records. Do not ingest or present them as real company data. A backend workflow guard rejects synthetic connector results, and the four source-library read routes include only non-synthetic `external-verified` or `user-provided` records.

| GET route | Response wrapper | Probe result | Fixture indicator |
|---|---|---:|---|
| `/api/confluence/pages` | `results`, `startAt`, `maxResults`, `total`, `isLast` | 42 pages | `source: "seed"` |
| `/api/jira/issues` | `issues`, `startAt`, `maxResults`, `total`, `isLast` | 129 issues | Records include `rawSeedId` |
| `/api/github/pulls` | `pulls`, `startAt`, `maxResults`, `total`, `isLast` | 87 pull requests | Route-catalog docs identify GitHub records as deterministic fixtures |
| `/api/github/issues` | `issues`, `startAt`, `maxResults`, `total`, `isLast` | 24 issues | Route-catalog docs identify GitHub records as deterministic fixtures |
| `/api/github/commits` | `commits`, `startAt`, `maxResults`, `total`, `isLast` | 170 commits | Route-catalog docs identify GitHub records as deterministic fixtures |
| `/api/slack/conversations.list` | `ok`, `channels`, `response_metadata` | 15 channels | Channel history records contain `seedId` |
| `/api/slack/conversations.history` | `ok`, `messages`, `response_metadata` | 16 messages in the probed channel | Message records contain `seedId` |

These response shapes are useful connector contracts. The stats and source cards in the frontend read the indexed backend routes, not these fixtures directly. Genuine Jira, GitHub, or Slack records require live provider credentials/connector responses with verifiable provenance; URL-valued `*_API_KEY` settings are connector URLs, not provider credentials.

## LangGraph ingestion behavior

The ingestion endpoint accepts `confluence`, `jira`, `github`, or `slack`, with an optional limit from 1 to 100. Confluence uses `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN` on the backend when no mock source URL is configured; pages are stored as verified `Document` nodes. Jira records route through ticket identification. Some GitHub and Slack records route through feature-update processing. Other sources use the backend `MOCK_API_BASE_URL`. Credentials are not accepted in browser requests. The endpoint returns counts and outcomes, not source content. Authorized runs are summarized in `IntegrationSyncRun` graph nodes and exposed through the integration status response. Synthetic records are counted as fetched, rejected before processing, and never written.

In the local backend environment inspected on 2026-10-18, Confluence has no configured credentials or base URL. Jira, GitHub, and Slack use URL-valued `*_API_KEY` entries that point to the same route-catalog tunnel, not provider API tokens. The tunnel has been probed and returns seed-marked fixture data. Local authorized sync attempts reject those records and preserve zero verified writes. Native Jira, GitHub, and Slack provider REST clients are not part of this backend; setting a secret token alone does not turn the route-catalog connector into an upstream integration. Configure a trusted live connector with provider credentials and verifiable upstream records before expecting nonzero live source counts.

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
