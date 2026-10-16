import { createHash } from 'node:crypto';
import type { ActivityType, FeatureUpdateInput } from './types.js';

export function activityType(text: string): ActivityType {
  const value = text.toLowerCase();
  if (/\bpr\b|pull request|merged/.test(value)) return 'merge';
  if (/reviewed|review\b/.test(value)) return 'review';
  if (/release.*blocked|blocked.*release/.test(value)) return 'release-blocked';
  if (/fixed|fix(ed|es)?|resolved|bug/.test(value)) return 'fix';
  if (/feature.*complete|complete(d)?|shipped|finished/.test(value)) return 'feature-complete';
  if (/status|blocked|in progress|ready|started/.test(value)) return 'status-update';
  return 'development-update';
}

function statusChange(text: string): { previousStatus?: string; newStatus?: string } {
  const explicit = text.match(/(?:from|status)\s+([a-z-]+)\s+(?:to|->)\s+([a-z-]+)/i);
  if (explicit) return { previousStatus: explicit[1].toLowerCase(), newStatus: explicit[2].toLowerCase() };
  if (/\bcomplete|completed|finished|shipped|merged|fixed|resolved\b/i.test(text)) return { newStatus: 'done' };
  if (/\bblocked\b/i.test(text)) return { newStatus: 'blocked' };
  return {};
}

export function deterministicFeatureUpdate(input: FeatureUpdateInput) {
  const text = input.text.trim();
  const sourceSystem = input.source ?? 'user-input';
  const sourceRecordId = input.sourceRecordId ?? createHash('sha256').update(`${sourceSystem}:${text}:${input.receivedAt ?? ''}`).digest('hex').slice(0, 16);
  const timestamp = input.receivedAt;
  return {
    activityType: activityType(text), summary: text, references: [], ...statusChange(text),
    ...(timestamp ? { occurredAt: timestamp } : {}),
    sourceSystem, sourceRecordId,
    provenance: input.provenance ?? (sourceSystem === 'seed' || sourceSystem === 'synthetic' ? 'synthetic' as const : 'user-provided' as const),
    verifiedExternalEvent: false as const, graphDomain: 'product-progress' as const,
    createdAt: timestamp ?? 'unknown', updatedAt: timestamp ?? 'unknown'
  };
}
