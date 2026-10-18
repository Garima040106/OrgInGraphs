import { createHash } from 'node:crypto';
import type { TicketInput, TicketKind, TicketPriority, TicketStatus } from './types.js';

const find = (text: string, patterns: RegExp[]) => patterns.find((pattern) => pattern.test(text));

export function classifyTicket(text: string): TicketKind {
  const value = text.toLowerCase();
  if (find(value, [/\bhow do i\b/, /\bwhy does\b/, /\bquestion\b/, /\?\s*$/])) return 'question';
  if (find(value, [/\bbug\b/, /error/, /exception/, /crash/, /broken/, /fails?/, /regression/])) return 'bug';
  if (find(value, [/improv/, /optimi[sz]/, /faster/, /refactor/, /enhance/])) return 'improvement';
  if (find(value, [/feature request/, /would like/, /please add/, /request(ed)?/, /support .* ability/])) return 'feature-request';
  return 'task';
}

export function extractPriority(text: string): TicketPriority {
  const match = text.match(/\b(P[0-3])\b/i);
  if (match) return match[1].toUpperCase() as TicketPriority;
  if (/urgent|critical|production down/i.test(text)) return 'P0';
  if (/high priority|high impact/i.test(text)) return 'P1';
  return 'unknown';
}

export function extractStatus(text: string): TicketStatus {
  const value = text.toLowerCase();
  if (/\bblocked\b/.test(value)) return 'blocked';
  if (/in progress|working on|under development/.test(value)) return 'in-progress';
  if (/\btriaged\b/.test(value)) return 'triaged';
  if (/\b(done|resolved|complete|completed|shipped)\b/.test(value)) return 'done';
  if (/\bopen\b/.test(value)) return 'open';
  return 'unknown';
}

export function deterministicTicket(input: TicketInput) {
  const text = input.text.trim();
  const firstLine = text.split(/\r?\n/)[0]?.trim() || 'Untitled ticket';
  const title = firstLine.replace(/^(bug|feature request|task|improvement|question)\s*[:\-]\s*/i, '').trim();
  const timestamp = input.receivedAt ?? '2026-01-01T00:00:00.000Z';
  const sourceSystem = input.source ?? 'synthetic';
  const sourceRecordId = input.sourceRecordId ?? createHash('sha256').update(text).digest('hex').slice(0, 16);
  const metadata = input.metadata ?? {};
  const nested = (value: unknown, key: string) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  const valueText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const providerField = (field: string, nestedField: string) => valueText(nested(metadata[field], nestedField)) ?? valueText(metadata[field]);
  return {
    kind: classifyTicket(text), title: title || 'Untitled ticket', description: text,
    priority: extractPriority(text), status: extractStatus(text), references: [],
    sourceSystem, sourceRecordId, graphDomain: 'product-progress' as const,
    synthetic: input.provenance === 'synthetic' || (!input.provenance && (sourceSystem === 'synthetic' || sourceSystem === 'seed')),
    createdAt: timestamp, updatedAt: timestamp,
    ...(providerField('project', 'name') ? { projectName: providerField('project', 'name') } : {}),
    ...(valueText(metadata.issueKey) ? { issueKey: valueText(metadata.issueKey) } : {}),
    ...(providerField('status', 'name') ? { originalStatus: providerField('status', 'name') } : {}),
    ...(providerField('priority', 'name') ? { originalPriority: providerField('priority', 'name') } : {}),
    ...(providerField('assignee', 'displayName') ? { assigneeName: providerField('assignee', 'displayName') } : {}),
    ...(providerField('reporter', 'displayName') ? { reporterName: providerField('reporter', 'displayName') } : {}),
    ...(valueText(metadata.externalUrl) ? { externalUrl: valueText(metadata.externalUrl) } : {})
  };
}
