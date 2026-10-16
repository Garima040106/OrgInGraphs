import { runFeatureUpdate } from '../feature-update/agent.js';
import { activityType } from '../feature-update/rules.js';
import { runTicketIdentification } from '../ticket-identification/agent.js';
import { classifyTicket } from '../ticket-identification/rules.js';
import type { NormalizedDocument } from '../mock-fetcher/types.js';
import type { DocumentOutcome, DocumentProcessorOptions, DocumentRoute } from './types.js';

function text(document: NormalizedDocument) {
  return [document.title, document.summary, document.content].filter(Boolean).join('\n').trim();
}

function route(document: NormalizedDocument): DocumentRoute {
  const value = text(document);
  if (document.sourceSystem === 'jira') return 'ticket-identification';
  if (document.sourceSystem === 'github' || document.sourceSystem === 'slack') {
    const activity = activityType(value);
    const isGithubPullRequest = document.sourceSystem === 'github'
      && typeof document.metadata.repository === 'string'
      && typeof document.metadata.state === 'string';
    return activity !== 'development-update' || isGithubPullRequest || /\b(pr|pull request|commit|release|review|fixed|fix|merged|shipped|completed|blocked)\b/i.test(value) ? 'feature-update' : 'unsupported';
  }
  return 'unsupported';
}

function baseOutcome(document: NormalizedDocument, selectedRoute: DocumentRoute): DocumentOutcome {
  return { sourceSystem: document.sourceSystem, sourceRecordId: document.sourceRecordId, status: 'skipped', route: selectedRoute, unresolvedReferences: [] };
}

export async function processDocument(document: NormalizedDocument, options: DocumentProcessorOptions = {}): Promise<DocumentOutcome> {
  if (!document.sourceRecordId || !document.content.trim() || !document.sourceSystem || !document.provenance) {
    return { sourceSystem: document.sourceSystem ?? 'unknown', sourceRecordId: document.sourceRecordId ?? 'unknown', status: 'failed', route: 'unsupported', unresolvedReferences: [], error: 'Document is missing required normalized fields.' };
  }
  const selectedRoute = route(document);
  if (selectedRoute === 'unsupported') return baseOutcome(document, selectedRoute);
  const input = { text: text(document), source: document.sourceSystem, sourceRecordId: document.sourceRecordId, receivedAt: document.occurredAt ?? document.updatedAt ?? document.createdAt, provenance: document.provenance, metadata: document.metadata };
  try {
    if (selectedRoute === 'ticket-identification') {
      const state = await runTicketIdentification(input, { graph: options.graph, model: options.ticketModel, useConfiguredModel: options.useConfiguredModels });
      const unresolved = state.ticket?.references.filter((reference) => reference.status !== 'resolved') ?? [];
      return { ...baseOutcome(document, selectedRoute), status: state.ambiguities.length || unresolved.length ? 'unresolved' : state.errors.length || !state.persisted ? 'failed' : 'processed', entityId: state.ticket?.id, unresolvedReferences: unresolved, ...(state.errors.length ? { error: state.errors[0] } : {}) };
    }
    const state = await runFeatureUpdate(input, { graph: options.graph, model: options.featureUpdateModel, useConfiguredModel: options.useConfiguredModels });
    const unresolved = state.update?.references.filter((reference) => reference.status !== 'resolved') ?? [];
    return { ...baseOutcome(document, selectedRoute), status: state.ambiguities.length || unresolved.length ? 'unresolved' : state.errors.length || !state.persisted ? 'failed' : 'processed', entityId: state.update?.id, unresolvedReferences: unresolved, ...(state.errors.length ? { error: state.errors[0] } : {}) };
  } catch {
    return { ...baseOutcome(document, selectedRoute), status: 'failed', error: 'Document processing failed safely.' };
  }
}

export async function processDocuments(documents: NormalizedDocument[], options: DocumentProcessorOptions = {}) {
  return Promise.all(documents.map((document) => processDocument(document, options)));
}

export { classifyTicket };
