import './load-env.js';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  FALKORDB_HOST: z.string().min(1).default('localhost'),
  FALKORDB_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
  FALKORDB_USERNAME: z.string().optional(),
  FALKORDB_PASSWORD: z.string().optional(),
  FALKORDB_DATABASE: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).default('orgingraphs')),
  FALKORDB_GRAPH: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  FALKORDB_TLS: z.enum(['true', 'false']).default('false'),
  COMPANY_START_DATE: z.string().date().default('2026-01-01'),
  CONFLUENCE_INGESTION_ENABLED: z.preprocess((value) => value === '' ? undefined : value, z.enum(['true', 'false']).optional()),
  CONFLUENCE_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  CONFLUENCE_EMAIL: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  CONFLUENCE_API_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  CONFLUENCE_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  JIRA_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  GITHUB_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  SLACK_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  MOCK_API_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  GEMINI_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  GEMINI_EMBEDDING_MODEL: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).default('gemini-embedding-001')),
  VECTOR_STORE_PATH: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  ORGANIZATION_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).default('hirenova'))
});

export type Environment = z.infer<typeof environmentSchema>;

export const env: Environment = environmentSchema.parse(process.env);
