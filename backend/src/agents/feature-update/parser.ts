import { createHash } from 'node:crypto';
import { deterministicFeatureUpdate } from './rules.js';
import { parseModelOutput } from './validation.js';
import type { FeatureUpdateInput, FeatureUpdateModel } from './types.js';

export async function parseFeatureUpdate(input: FeatureUpdateInput, model?: FeatureUpdateModel) {
  const fallback = deterministicFeatureUpdate(input);
  if (!model) return fallback;
  let value: unknown;
  try { value = parseModelOutput(await model(input)); } catch { return fallback; }
  if (!value || typeof value !== 'object') return fallback;
  return {
    ...fallback, ...(value as Record<string, unknown>),
    id: `activity-${createHash('sha256').update(`${fallback.sourceSystem}:${fallback.sourceRecordId}`).digest('hex').slice(0, 16)}`,
    sourceSystem: fallback.sourceSystem, sourceRecordId: fallback.sourceRecordId,
    graphDomain: 'product-progress' as const, verifiedExternalEvent: false as const,
    provenance: fallback.provenance, createdAt: fallback.createdAt, updatedAt: fallback.updatedAt
  };
}
