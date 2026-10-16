import { createHash } from 'node:crypto';
import { deterministicTicket } from './rules.js';
import { parseModelOutput } from './validation.js';
import type { TicketInput, TicketModel } from './types.js';

export async function parseTicket(input: TicketInput, model?: TicketModel) {
  const fallback = deterministicTicket(input);
  if (!model) return fallback;
  let value: unknown;
  try { value = parseModelOutput(await model(input)); } catch { return fallback; }
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Record<string, unknown>;
  return {
    ...fallback,
    ...candidate,
    id: `ticket-${createHash('sha256').update(`${fallback.sourceSystem}:${fallback.sourceRecordId}`).digest('hex').slice(0, 16)}`,
    sourceSystem: fallback.sourceSystem,
    sourceRecordId: fallback.sourceRecordId,
    graphDomain: 'product-progress' as const,
    synthetic: fallback.synthetic,
    createdAt: fallback.createdAt,
    updatedAt: fallback.updatedAt
  };
}
