import { activityType } from '../agents/feature-update/rules.js';
import { classifyTicket } from '../agents/ticket-identification/rules.js';
import type { WorkflowInputEvent, WorkflowRoute, WorkflowProvenance } from './types.js';

export function establishProvenance(input: WorkflowInputEvent): WorkflowProvenance {
  if (input.provenance) return input.provenance;
  if (input.source === 'seed' || input.source === 'synthetic') return 'synthetic';
  return 'user-provided';
}

export function classifyWorkflowInput(input: WorkflowInputEvent): WorkflowRoute {
  if (input.type === 'ticket') return 'ticket-identification';
  if (input.type === 'feature-update') return 'feature-update';
  const text = input.text.toLowerCase();
  if (/\b(pr|pull request|commit|release|reviewed|fixed|shipped|merged|development update)\b/.test(text)) return 'feature-update';
  const ticket = classifyTicket(input.text);
  if (ticket === 'bug' || ticket === 'feature-request' || ticket === 'task' || ticket === 'improvement' || ticket === 'question') return 'ticket-identification';
  return activityType(input.text) === 'development-update' ? 'feature-update' : 'ticket-identification';
}
