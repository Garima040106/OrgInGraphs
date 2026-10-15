import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  FALKORDB_HOST: z.string().min(1).default('localhost'),
  FALKORDB_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
  FALKORDB_USERNAME: z.string().optional(),
  FALKORDB_PASSWORD: z.string().optional(),
  FALKORDB_DATABASE: z.string().min(1).default('orgingraphs'),
  FALKORDB_TLS: z.enum(['true', 'false']).default('false'),
  COMPANY_START_DATE: z.string().date().default('2026-01-01')
});

export type Environment = z.infer<typeof environmentSchema>;

export const env: Environment = environmentSchema.parse(process.env);
