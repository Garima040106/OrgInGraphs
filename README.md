# OrgInGraphs

OrgInGraphs is an AI-powered company knowledge graph project. The backend provides a deterministic synthetic Hirenova company graph, FalkorDB persistence through openCypher, REST APIs for exploring company records, and a LangGraph workflow for mock-source ingestion.

## Project details

- **Version:** 1.0.0
- **Authors:** Garima,Nikhil and Mohit
- **Runtime:** Node.js
- **Language:** TypeScript
- **Package manager:** npm

## Current status

The backend serves synthetic company data and includes an opt-in LangGraph ingestion workflow for configured mock Jira, Confluence, GitHub, and Slack APIs. It does not provide authenticated third-party connectors. Seed records identify their source system and reserved example URLs.

## Prerequisites

- Node.js 20 or newer
- npm
- A reachable FalkorDB Cloud graph for `seed:falkordb` and the API

## Backend installation

```bash
cd backend
npm install
cp .env.example .env
```

The `.env.example` file contains application settings and placeholder FalkorDB connection variables. Update the values for local development as needed. Do not commit `.env` or real secrets.

Relevant variables are `PORT`, `NODE_ENV`, `COMPANY_START_DATE` (ISO date; Hirenova is founded exactly three years earlier), `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USERNAME`, `FALKORDB_PASSWORD`, `FALKORDB_TLS`, and `FALKORDB_DATABASE`. The API allows browser requests from the local frontend origins by default and includes `https://orgingraphs-ysq7.vercel.app`; use `FRONTEND_ORIGINS` for local or custom deployment origins.

RAG uses local `Xenova/all-MiniLM-L6-v2` embeddings and FalkorDB vector indexes, with Amazon Bedrock Mantle (`openai.gpt-oss-120b`) for grounded answers. Configure the backend-only Bedrock bearer token and `RAG_ADMIN_API_KEY` in `backend/.env`. The `/api/rag/query`, `/api/rag/ingest`, `/api/rag/reindex`, and `/api/rag/status` routes reuse the existing Company Brain workflow and API conventions. See [docs/rag-pipeline.md](docs/rag-pipeline.md) for configuration, route examples, vector-index initialization, diagnostics, and the current authentication integration boundary. Existing `POST /api/assistant/query` and graph workflows remain available. Assistant conversation routes persist turns and memory in FalkorDB. Confluence can be fetched with backend-only `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN`; Jira/GitHub/Slack ingestion uses `MOCK_API_BASE_URL`.

## Available commands

Run these commands from the `backend/` directory:

```bash
npm run dev      # Start the TypeScript entry point in watch mode
npm run build    # Compile TypeScript into dist/
npm start        # Run the compiled application
npm test         # Run seed integrity tests
npm run seed:generate  # Write deterministic seed-data.json
npm run seed:validate  # Validate without database access
npm run seed:falkordb  # MERGE the seed into configured FalkorDB
```

## Backend API

After `npm run seed:falkordb` and `npm run dev`, the following endpoints are available:

- `GET /health`
- `GET /api/graph`
- `GET /api/company`
- `GET /api/employees?departmentId=swe&teamId=eng&employmentStatus=active`
- `GET /api/employees/:employeeId`
- `GET /api/departments` and `GET /api/departments/:departmentId`
- `GET /api/projects` and `GET /api/projects/:projectId`
- `GET /api/graph/neighborhood/Employee/emp-03`
- `GET /api/search?q=idempotency`
- `GET /api/product-progress/graph`
- `POST /api/ingestion/process` with `{ "source": "jira", "limit": 20 }`

`GET /api/graph` returns the complete graph in one request:

```json
{
  "nodes": [
    {
      "id": "emp-01",
      "labels": ["Employee"],
      "properties": { "id": "emp-01", "name": "Ava Patel" }
    }
  ],
  "edges": [
    {
      "id": "REPORTS_TO:emp-03:emp-00",
      "type": "REPORTS_TO",
      "source": "emp-03",
      "target": "emp-00",
      "properties": {}
    }
  ]
}
```

The endpoint reads all nodes and all relationships from the configured FalkorDB graph, including disconnected nodes, without truncating the result.

Invalid IDs, filters, entity types, and empty search terms return `400`; missing records return `404`; database failures return `503`.

The neighborhood response includes each node's `entityType` and each edge's actual `from`, `to`, and `direction` (`incoming` or `outgoing`) so graph clients can render the relationship accurately.

The ingestion endpoint returns a status, fetched-record count, per-record outcomes, unresolved references, and safe errors. `docs/api-capability-inventory.md` maps the current API capabilities and limitations to frontend components.

## Frontend

The Next.js frontend is in `frontend/`. See [frontend/README.md](frontend/README.md) for installation, environment configuration, and development commands. Run the frontend on port `3000` and the backend on port `8080`.

## Project structure

```text
OrgInGraphs/
├── backend/
│   ├── src/
│   │   ├── api/       # Express read endpoints and validation
│   │   ├── config/    # Environment loading and validation
│   │   ├── db/        # FalkorDB client and idempotent graph writes
│   │   ├── seed/      # Deterministic generation and validation
│   │   └── types/     # Shared TypeScript types
│   ├── scripts/       # Seed commands
│   ├── tests/         # Seed integrity tests
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── tsconfig.json
├── frontend/         # Next.js organizational graph and workspace UI
└── README.md
```
