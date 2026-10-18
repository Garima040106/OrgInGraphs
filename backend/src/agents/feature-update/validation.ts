import { z } from 'zod';
import { activityTypes } from './types.js';

export const featureUpdateSchema = z.object({
  id: z.string().regex(/^activity-[a-f0-9]{16}$/),
  actorId: z.string().regex(/^emp-\d{2}$/).optional(),
  occurredAt: z.string().datetime().optional(),
  activityType: z.enum(activityTypes),
  summary: z.string().trim().min(1),
  productId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  moduleId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  featureId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  ticketId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  previousStatus: z.string().min(1).optional(),
  newStatus: z.string().min(1).optional(),
  references: z.array(z.object({
    kind: z.enum(['pull-request', 'commit', 'release', 'ticket', 'feature', 'external']),
    text: z.string().min(1), id: z.string().optional(),
    status: z.enum(['resolved', 'ambiguous', 'unresolved']), verified: z.literal(false),
    candidates: z.array(z.string()).optional()
  })),
  sourceSystem: z.string().min(1), sourceRecordId: z.string().min(1),
  provenance: z.enum(['synthetic', 'user-provided', 'external-verified', 'mock-verified']),
  verifiedExternalEvent: z.literal(false), graphDomain: z.literal('product-progress'),
  createdAt: z.string().min(1), updatedAt: z.string().min(1)
});

export type ValidatedFeatureUpdate = z.infer<typeof featureUpdateSchema>;

export function parseModelOutput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? value;
  try { return JSON.parse(fenced); } catch { return value; }
}
