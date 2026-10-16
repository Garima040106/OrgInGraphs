import { z } from 'zod';
import { workflowEventKinds, workflowProvenances, type WorkflowInputEvent } from './types.js';

const inputSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  type: z.enum(workflowEventKinds).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  sourceRecordId: z.string().trim().min(1).max(200).optional(),
  receivedAt: z.string().datetime().optional(),
  provenance: z.enum(workflowProvenances).optional()
}).strict();

export function validateWorkflowInput(input: unknown): WorkflowInputEvent {
  return inputSchema.parse(input);
}
