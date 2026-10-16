import { z } from 'zod';
import { ticketKinds, priorities, statuses } from './types.js';

export const identifiedTicketSchema = z.object({
  id: z.string().regex(/^ticket-[a-f0-9]{16}$/),
  kind: z.enum(ticketKinds),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.enum(priorities),
  status: z.enum(statuses),
  productId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  moduleId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  reporterId: z.string().regex(/^emp-\d{2}$/).optional(),
  assigneeId: z.string().regex(/^emp-\d{2}$/).optional(),
  references: z.array(z.object({
    kind: z.enum(['employee', 'product', 'module', 'ticket', 'external']),
    text: z.string().min(1),
    id: z.string().optional(),
    status: z.enum(['resolved', 'ambiguous', 'unresolved']),
    candidates: z.array(z.string()).optional()
  })),
  sourceSystem: z.string().min(1),
  sourceRecordId: z.string().min(1),
  graphDomain: z.literal('product-progress'),
  synthetic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ValidatedIdentifiedTicket = z.infer<typeof identifiedTicketSchema>;

export function parseModelOutput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? value;
  try { return JSON.parse(fenced); } catch { return value; }
}
