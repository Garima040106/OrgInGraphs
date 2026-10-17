import 'dotenv/config';
import { z } from 'zod';

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const modelEnvironmentSchema = z.object({
  MODEL_PROVIDER: z.enum(['disabled', 'openai-compatible', 'gemini', 'bedrock']).default('disabled'),
  MODEL_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  MODEL_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  AWS_BEARER_TOKEN_BEDROCK: optionalString,
  BEDROCK_MANTLE_BASE_URL: z.string().url().optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_DEFAULT_REGION: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
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
  const provider = env.MODEL_PROVIDER !== 'disabled' ? env.MODEL_PROVIDER
    : env.AWS_BEARER_TOKEN_BEDROCK ? 'bedrock'
      : env.GEMINI_API_KEY ? 'gemini' : 'disabled';
  const defaultModelId = provider === 'bedrock' && env.MODEL_DEFAULT_ID === 'gpt-4o-mini' ? 'deepseek.v3.2' : env.MODEL_DEFAULT_ID;
  const modelId = name === 'ticket-identification' ? env.MODEL_TICKET_ID ?? defaultModelId
    : name === 'feature-update' ? env.MODEL_FEATURE_UPDATE_ID ?? defaultModelId
      : defaultModelId;
  const temperature = name === 'ticket-identification' ? env.MODEL_TICKET_TEMPERATURE ?? env.MODEL_DEFAULT_TEMPERATURE
    : name === 'feature-update' ? env.MODEL_FEATURE_UPDATE_TEMPERATURE ?? env.MODEL_DEFAULT_TEMPERATURE
      : env.MODEL_DEFAULT_TEMPERATURE;
  const selectedModel = name === 'default' && provider === 'gemini' && env.MODEL_DEFAULT_ID === 'gpt-4o-mini' ? env.GEMINI_MODEL : modelId;
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const baseUrl = provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta'
    : provider === 'bedrock' ? env.BEDROCK_MANTLE_BASE_URL ?? `https://bedrock-mantle.${region}.api.aws/v1`
      : env.MODEL_BASE_URL.replace(/\/$/, '');
  const apiKey = provider === 'gemini' ? env.GEMINI_API_KEY ?? env.MODEL_API_KEY
    : provider === 'bedrock' ? env.AWS_BEARER_TOKEN_BEDROCK
      : env.MODEL_API_KEY;
  return { name, provider, baseUrl, apiKey, modelId: selectedModel, temperature, timeoutMs: env.MODEL_TIMEOUT_MS };
}
