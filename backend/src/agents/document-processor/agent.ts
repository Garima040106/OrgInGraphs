import { createHash } from 'node:crypto';
import { query } from '../../db/falkordb.js';
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
  if (document.sourceSystem === 'confluence') return 'document-indexing';
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

async function persistConversationOrGithubRecord(document: NormalizedDocument, graph: NonNullable<DocumentProcessorOptions['graph']>) {
  if (document.sourceSystem === 'slack') {
    const id = `slack-message-${createHash('sha256').update(document.sourceRecordId).digest('hex').slice(0, 20)}`;
    const channelId = typeof document.metadata.channelId === 'string' ? document.metadata.channelId : undefined;
    const channelName = typeof document.metadata.channelName === 'string' ? document.metadata.channelName : channelId;
    await query(graph, 'MERGE (m:Message {id:$id}) SET m += $properties', { id, properties: { title: channelName ? `Message in ${channelName}` : document.title ?? 'Slack message', content: document.content.slice(0, 100_000), sourceSystem: 'slack', sourceRecordId: document.sourceRecordId, ...(document.sourceUrl ? { externalUrl: document.sourceUrl } : {}), ...(document.createdAt ? { createdAt: document.createdAt } : {}), ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}), ...(document.occurredAt ? { occurredAt: document.occurredAt } : {}), ...(channelId ? { channelId } : {}), ...(channelName ? { channelName } : {}), provenance: document.provenance, synthetic: document.synthetic, graphDomain: 'organization' } });
    if (channelId) {
      const channelNodeId = `slack-channel-${createHash('sha256').update(channelId).digest('hex').slice(0, 20)}`;
      await query(graph, 'MERGE (c:Channel {id:$channelNodeId}) SET c += $channelProperties WITH c MATCH (m:Message {id:$messageId}) MERGE (m)-[:IN_CHANNEL {sourceSystem:"slack"}]->(c)', { channelNodeId, messageId: id, channelProperties: { name: channelName ?? channelId, sourceSystem: 'slack', sourceRecordId: channelId, graphDomain: 'organization' } });
    }
    return id;
  }
  if (document.sourceSystem === 'github') {
    const recordType = typeof document.metadata.recordType === 'string' ? document.metadata.recordType : 'pull_request';
    const label = recordType === 'commit' ? 'Commit' : recordType === 'issue' ? 'Bug' : 'PullRequest';
    const id = `github-${label.toLowerCase()}-${createHash('sha256').update(document.sourceRecordId).digest('hex').slice(0, 20)}`;
    await query(graph, `MERGE (n:${label} {id:$id}) SET n += $properties`, { id, properties: { title: document.title ?? document.sourceRecordId, description: document.content.slice(0, 100_000), sourceSystem: 'github', sourceRecordId: document.sourceRecordId, ...(document.sourceUrl ? { externalUrl: document.sourceUrl } : {}), ...(document.createdAt ? { createdAt: document.createdAt } : {}), ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}), ...(document.occurredAt ? { occurredAt: document.occurredAt } : {}), ...(typeof document.metadata.state === 'string' ? { status: document.metadata.state } : {}), ...(typeof document.metadata.repository === 'string' ? { repository: document.metadata.repository } : {}), provenance: document.provenance, synthetic: document.synthetic, graphDomain: 'organization' } });
    return id;
  }
  return undefined;
}

export async function processDocument(document: NormalizedDocument, options: DocumentProcessorOptions = {}): Promise<DocumentOutcome> {
  if (!document.sourceRecordId || !document.content.trim() || !document.sourceSystem || !document.provenance) {
    return { sourceSystem: document.sourceSystem ?? 'unknown', sourceRecordId: document.sourceRecordId ?? 'unknown', status: 'failed', route: 'unsupported', unresolvedReferences: [], error: 'Document is missing required normalized fields.' };
  }
  const selectedRoute = route(document);
  let sourceEntityId: string | undefined;
  if ((document.sourceSystem === 'slack' || document.sourceSystem === 'github') && options.graph) {
    try { sourceEntityId = await persistConversationOrGithubRecord(document, options.graph); }
    catch { return { ...baseOutcome(document, selectedRoute), status: 'failed', error: 'Source record could not be persisted to the company graph.' }; }
  }
  if (selectedRoute === 'unsupported') return { ...baseOutcome(document, selectedRoute), status: sourceEntityId ? 'processed' : 'skipped', ...(sourceEntityId ? { entityId: sourceEntityId } : {}) };
  if (selectedRoute === 'document-indexing') {
    if (!options.graph) return { ...baseOutcome(document, selectedRoute), status: 'failed', error: 'Document indexing requires the company graph.' };
    const id = `doc-${createHash('sha256').update(`${document.sourceSystem}:${document.sourceRecordId}`).digest('hex').slice(0, 20)}`;
    try {
      await query(options.graph, 'MERGE (d:Document {id:$id}) SET d += $properties', { id, properties: { title: document.title ?? document.sourceRecordId, content: document.content.slice(0, 100_000), summary: document.summary ?? '', sourceSystem: document.sourceSystem, sourceRecordId: document.sourceRecordId, ...(document.sourceUrl ? { externalUrl: document.sourceUrl } : {}), ...(document.createdAt ? { createdAt: document.createdAt } : {}), ...(document.updatedAt ? { updatedAt: document.updatedAt } : {}), provenance: document.provenance, graphDomain: 'organization' } });
      return { ...baseOutcome(document, selectedRoute), status: 'processed', entityId: id, unresolvedReferences: [] };
    } catch { return { ...baseOutcome(document, selectedRoute), status: 'failed', error: 'Document indexing failed safely.' }; }
  }
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
