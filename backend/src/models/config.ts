import 'dotenv/config';
import { z } from 'zod';

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const modelEnvironmentSchema = z.object({
  MODEL_PROVIDER: z.enum(['disabled', 'openai-compatible']).default('disabled'),
  MODEL_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  MODEL_API_KEY: optionalString,
  MODEL_DEFAULT_ID: z.string().min(1).default('gpt-4o-mini'),
  MODEL_TICKET_ID: optionalString,
  MODEL_FEATURE_UPDATE_ID: optionalString,
  MODEL_DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  MODEL_TICKET_TEMPERATURE: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().min(0).max(2).optional()),
  MODEL_FEATURE_UPDATE_TEMPERATURE: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().min(0).max(2).optional()),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000)
});

export type ModelInstanceName = 'default' | 'ticket-identification' | 'feature-update';
export type ModelEnvironment = z.infer<typeof modelEnvironmentSchema>;

export interface ModelInstanceConfig {
  name: ModelInstanceName;
  provider: ModelEnvironment['MODEL_PROVIDER'];
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  temperature: number;
  timeoutMs: number;
}

export function parseModelEnvironment(input: unknown): ModelEnvironment {
  return modelEnvironmentSchema.parse(input);
}

export function modelInstanceConfig(name: ModelInstanceName, input: unknown = process.env): ModelInstanceConfig {
  const env = parseModelEnvironment(input);
  const modelId = name === 'ticket-identification' ? env.MODEL_TICKET_ID ?? env.MODEL_DEFAULT_ID
    : name === 'feature-update' ? env.MODEL_FEATURE_UPDATE_ID ?? env.MODEL_DEFAULT_ID
      : env.MODEL_DEFAULT_ID;
  const temperature = name === 'ticket-identification' ? env.MODEL_TICKET_TEMPERATURE ?? env.MODEL_DEFAULT_TEMPERATURE
    : name === 'feature-update' ? env.MODEL_FEATURE_UPDATE_TEMPERATURE ?? env.MODEL_DEFAULT_TEMPERATURE
      : env.MODEL_DEFAULT_TEMPERATURE;
  return { name, provider: env.MODEL_PROVIDER, baseUrl: env.MODEL_BASE_URL.replace(/\/$/, ''), apiKey: env.MODEL_API_KEY, modelId, temperature, timeoutMs: env.MODEL_TIMEOUT_MS };
}
