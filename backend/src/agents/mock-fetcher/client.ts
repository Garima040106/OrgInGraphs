import { env } from '../../config/env.js';
import { MockFetcherError, mockSources, type MockSource, type NormalizedDocument } from './types.js';

/** Company Brain Mock API routes. MOCK_API_BASE_URL is the tunnel origin. */
export const MOCK_ENDPOINTS: Readonly<Record<MockSource, string>> = {
  confluence: '/api/confluence/pages',
  jira: '/api/jira/issues',
  github: '/api/github/pulls',
  slack: '/api/slack/conversations.history'
};
type RawRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is RawRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const nestedText = (value: unknown, key: string) => isRecord(value) ? text(value[key]) : undefined;
const confluenceBody = (value: unknown) => {
  const storage = isRecord(value) ? value.storage : undefined;
  return isRecord(storage) ? text(storage.value) : undefined;
};
const timestamp = (value: unknown) => {
  const valueText = text(value);
  if (!valueText) return undefined;
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.valueOf()) ? valueText : parsed.toISOString();
};

function normalizeRecord(record: RawRecord, source: MockSource): NormalizedDocument {
  const isJira = source === 'jira';
  const isGithub = source === 'github';
  const isSlack = source === 'slack';
  const summary = isJira ? text(record.summary) : text(record.summary);
  const description = isJira ? text(record.description) : undefined;
  const id = isSlack ? text(record.seedId) ?? text(record.id) ?? text(record.sourceRecordId) : text(record.id) ?? text(record.key) ?? text(record.sourceRecordId);
  const title = isJira ? summary : text(record.title) ?? text(record.name) ?? summary;
  const content = isJira ? [summary, description].filter(Boolean).join('\n\n') : isGithub ? [title, text(record.body) ?? text(record.description)].filter(Boolean).join('\n\n') : source === 'confluence' ? confluenceBody(record.body) ?? text(record.content) ?? text(record.description) : text(record.content) ?? text(record.body) ?? text(record.description) ?? text(record.message) ?? text(record.text);
  if (!id || !content) throw new MockFetcherError('malformed-response', 'Mock API returned a record without an ID or content.');
  const provenance = text(record.provenance) === 'external-verified' || text(record.provenance) === 'user-provided' ? text(record.provenance) as NormalizedDocument['provenance'] : 'synthetic';
  const status = nestedText(record.status, 'name') ?? text(record.status);
  const issueType = nestedText(record.issuetype, 'name');
  const assignee = nestedText(record.assignee, 'displayName');
  const project = nestedText(record.project, 'name');
  const authorLogin = nestedText(record.user, 'login');
  return { sourceSystem: source, sourceRecordId: id, title, summary, content, sourceUrl: text(record.sourceUrl) ?? text(record.url) ?? text(record.webUrl) ?? text(record.html_url) ?? (isSlack ? text(record.permalink) : undefined), createdAt: isJira ? timestamp(record.created) : timestamp(record.createdAt) ?? timestamp(record.created_at), updatedAt: isJira ? timestamp(record.updated) : timestamp(record.updatedAt) ?? timestamp(record.updated_at), occurredAt: isSlack ? timestamp(record.ts) : timestamp(record.occurredAt) ?? timestamp(record.occurred_at), provenance, synthetic: provenance === 'synthetic', metadata: isJira ? { ...record, issueKey: text(record.key), status, issueType, assignee, project } : isGithub ? { ...record, repository: record.repository, state: text(record.state), merged: typeof record.merged === 'boolean' ? record.merged : undefined, authorLogin } : record };
}
function payloadRecords(payload: unknown, source: MockSource): unknown[] {
  if (source === 'jira' && isRecord(payload) && Array.isArray(payload.issues)) return payload.issues;
  if (source === 'confluence' && isRecord(payload) && (Array.isArray(payload.pages) || Array.isArray(payload.results))) return (payload.pages ?? payload.results) as unknown[];
  if (source === 'github' && isRecord(payload) && Array.isArray(payload.pulls)) return payload.pulls;
  if (source === 'github' && (Array.isArray(payload) || (isRecord(payload) && Array.isArray(payload.data)))) return Array.isArray(payload) ? payload : payload.data as unknown[];
  if (source === 'slack' && isRecord(payload) && payload.ok === true && Array.isArray(payload.messages)) return payload.messages;
  throw new MockFetcherError('malformed-response', 'Mock API returned an unsupported response shape.');
}
function configuredBase(value: string | undefined): URL {
  if (!value) throw new MockFetcherError('missing-configuration', 'Mock API base URL is not configured.');
  let url: URL;
  try { url = new URL(value); } catch { throw new MockFetcherError('invalid-configuration', 'Mock API base URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new MockFetcherError('invalid-configuration', 'Mock API base URL must be an HTTP(S) URL without embedded credentials.');
  return url;
}
export async function fetchMockDocuments(source: MockSource, options: { baseUrl?: string; limit?: number; timeoutMs?: number } = {}): Promise<NormalizedDocument[]> {
  if (!mockSources.includes(source)) throw new MockFetcherError('unsupported-source', 'Unsupported mock source.');
  const url = configuredBase(options.baseUrl ?? env.MOCK_API_BASE_URL);
  url.pathname = `${url.pathname.replace(/\/$/, '')}${MOCK_ENDPOINTS[source]}`;
  if (options.limit !== undefined) url.searchParams.set('limit', String(Math.max(1, Math.min(100, Math.floor(options.limit)))));
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal }); }
  catch (error) { if (error instanceof Error && error.name === 'AbortError') throw new MockFetcherError('timeout', 'Mock API request timed out.', true); throw new MockFetcherError('http-error', 'Mock API request failed.', true); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new MockFetcherError('http-error', `Mock API returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
  let payload: unknown; try { payload = await response.json(); } catch { throw new MockFetcherError('malformed-response', 'Mock API returned invalid JSON.'); }
  if (source === 'slack' && (!isRecord(payload) || payload.ok !== true)) throw new MockFetcherError('http-error', 'Mock API returned an unsuccessful Slack response.');
  const records = payloadRecords(payload, source); if (!records.length) throw new MockFetcherError('empty-result', 'Mock API returned no records.');
  const requestedLimit = options.limit === undefined ? undefined : Math.max(1, Math.min(100, Math.floor(options.limit)));
  return records.slice(0, requestedLimit).map((record) => isRecord(record) ? normalizeRecord(record, source) : (() => { throw new MockFetcherError('malformed-response', 'Mock API returned a non-object record.'); })());
}
