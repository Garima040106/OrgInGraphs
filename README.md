# OrgInGraphs

OrgInGraphs is an AI-powered company knowledge graph project. The repository currently contains the initial typed Node.js backend foundation, prepared for future FalkorDB connectivity, openCypher graph operations, and LangGraph workflows.

## Project details

- **Version:** 1.0.0
- **Authors:** Garima and Nikhil
- **Runtime:** Node.js
- **Language:** TypeScript
- **Package manager:** npm

## Current status

The backend setup is intentionally minimal. It validates environment configuration and provides a modular source structure for future development. It does not currently seed company data, connect to FalkorDB, execute openCypher queries, expose APIs, or run LangGraph agents.

## Prerequisites

- Node.js 20 or newer
- npm

## Backend installation

```bash
cd backend
npm install
cp .env.example .env
```

The `.env.example` file contains application settings and placeholder FalkorDB connection variables. Update the values for local development as needed. Do not commit `.env` or real secrets.

## Available commands

Run these commands from the `backend/` directory:

```bash
npm run dev      # Start the TypeScript entry point in watch mode
npm run build    # Compile TypeScript into dist/
npm start        # Run the compiled application
```

## Project structure

```text
OrgInGraphs/
├── backend/
│   ├── src/
│   │   ├── agents/    # Future LangGraph workflows
│   │   ├── config/    # Environment loading and validation
│   │   ├── db/        # Future FalkorDB connectivity
│   │   ├── graph/     # Future openCypher graph operations
│   │   ├── types/     # Shared TypeScript types
│   │   └── utils/     # Common utilities
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

