# OrgInGraphs frontend

The frontend is a standalone Next.js App Router application. It reads company data only through the existing Express API; it does not connect to FalkorDB directly.

## Requirements

- Node.js 20 or newer
- npm
- The OrgInGraphs backend running on port `8080`

## Install and run

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The backend's default CORS configuration allows this origin and `http://127.0.0.1:3000`.

For production:

```bash
npm run typecheck
npm run build
npm start
```

## Configuration

Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to the browser-accessible backend URL. The default is `http://localhost:8080`.

Set `FRONTEND_ORIGINS` in the backend environment to a comma-separated list of allowed browser origins when the frontend is hosted somewhere other than the local defaults.

## Supported behavior and limitations

- `/` is the product landing page; `/login` provides a clearly marked local demo entry. The backend does not currently provide authentication, so demo access is not a security boundary and the email entered is stored only in browser local storage.
- The dashboard and directories use records returned by the backend. Initial graph layout is deterministic and limited to the first 24 employees; select and expand nodes to progressively load real neighborhoods.
- Search uses `GET /api/search` and supports Ctrl+K / Cmd+K. Result types without a dedicated detail endpoint open in the graph.
- The assistant builds allowlisted entity, ownership, decision evidence, direct graph impact, and graph query cards from search, entity detail, and neighborhood APIs. Citations link to indexed graph records. This backend does not expose a conversational answer endpoint; the UI does not claim that a LangGraph ingestion run is an assistant answer or an impact simulation.
- Workspace settings invokes `POST /api/ingestion/process` for Confluence, Jira, GitHub, or Slack data and displays each returned processing state. Confluence pages can be fetched with backend-only `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN` credentials and indexed as verified Document graph nodes. Other sources currently use the configured backend `MOCK_API_BASE_URL`.
- The assistant drawer calls `POST /api/assistant/query` and renders validated LangGraph response types with source citations, related entities, direct graph relationships, uncertainty, and execution stages. When the default model is disabled or unavailable, the backend provides a deterministic evidence-based response.
- Neighborhood relationships are labeled with their actual edge direction. Other relationships are displayed only when returned by the API or derivable from its list/detail fields.
