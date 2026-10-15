# OrgInGraphs Backend

OrgInGraphs is an AI-powered company knowledge graph project. This directory contains the minimal, typed Node.js backend foundation for future FalkorDB graph connectivity, openCypher operations, and LangGraph workflows.

## Project details

- **Version:** 1.0.0
- **Authors:** Garima and Nikhil
- **Runtime:** Node.js
- **Language:** TypeScript
- **Package manager:** npm

## Prerequisites

- Node.js 20 or newer
- npm

## Installation

From this directory:

```bash
npm install
```

## Environment configuration

Copy the example environment file and adjust values as needed:

```bash
cp .env.example .env
```

Application and placeholder FalkorDB variables are validated when the application starts. FalkorDB is not connected by this initial setup, and `.env` must never be committed.

## Project structure

```text
backend/
├── src/
│   ├── agents/    # Future LangGraph workflows
│   ├── config/    # Environment loading and validation
│   ├── db/       # Future FalkorDB connectivity
│   ├── graph/    # Future openCypher graph operations
│   ├── types/    # Shared TypeScript types
│   └── utils/    # Common utilities
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

## Available commands

```bash
npm run dev      # Run the TypeScript entry point with watch mode
npm run build    # Compile TypeScript to dist/
npm start        # Run the compiled application
```

The current entry point only validates configuration and confirms that the backend is initialized. It does not seed data, connect to FalkorDB, execute openCypher, expose APIs, or run agents.
