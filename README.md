# OrgInGraphs

OrgInGraphs is an AI-powered company knowledge graph project. The backend now provides a deterministic synthetic Hirenova company graph, FalkorDB persistence through openCypher, and read-only REST APIs for exploring company structure and history.

## Project details

- **Version:** 1.0.0
- **Authors:** Garima,Nikhil and Mohit
- **Runtime:** Node.js
- **Language:** TypeScript
- **Package manager:** npm

## Current status

The backend is intentionally limited to synthetic data and does not call Jira, Confluence, GitHub, or Slack. Seed records identify their source system and reserved example URLs.

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

Relevant variables are `PORT`, `NODE_ENV`, `COMPANY_START_DATE` (ISO date; Hirenova is founded exactly three years earlier), `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USERNAME`, `FALKORDB_PASSWORD`, `FALKORDB_TLS`, and `FALKORDB_DATABASE`. The API allows browser requests from `http://localhost:3000` and `http://127.0.0.1:3000` by default; set `FRONTEND_ORIGINS` to a comma-separated origin list to override those defaults.

LLM processing is optional. Leave `MODEL_PROVIDER=disabled` for deterministic offline agents. To enable the two active agents, set `MODEL_PROVIDER=openai-compatible`, `MODEL_BASE_URL`, `MODEL_API_KEY`, and `MODEL_DEFAULT_ID`; optionally override `MODEL_TICKET_ID`, `MODEL_FEATURE_UPDATE_ID`, and their temperatures. `MODEL_TIMEOUT_MS` controls request timeout. Credentials are read only from the environment and are never written to graph records or logs.

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
