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
const identifier = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};
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
  const id = isSlack
    ? identifier(record.seedId, record.ts, record.id, record.sourceRecordId)
    : isGithub
      ? identifier(record.id, record.number, record.sha, record.sourceRecordId)
      : identifier(record.id, record.key, record.sourceRecordId);
  const commit = isRecord(record.commit) ? record.commit : undefined;
  const title = isJira ? summary : text(record.title) ?? text(record.name) ?? nestedText(commit, 'message') ?? summary;
  const content = isJira ? [summary, description].filter(Boolean).join('\n\n') : isGithub ? [title, text(record.body) ?? text(record.description) ?? nestedText(commit, 'message')].filter(Boolean).join('\n\n') : source === 'confluence' ? confluenceBody(record.body) ?? text(record.content) ?? text(record.description) ?? `Confluence page: ${title ?? id}` : text(record.content) ?? text(record.body) ?? text(record.description) ?? text(record.message) ?? text(record.text);
  if (!id || !content) throw new MockFetcherError('malformed-response', 'Mock API returned a record without an ID or content.');
  const provenance = text(record.provenance) === 'external-verified' || text(record.provenance) === 'user-provided' ? text(record.provenance) as NormalizedDocument['provenance'] : 'synthetic';
  const status = nestedText(record.status, 'name') ?? text(record.status);
  const issueType = nestedText(record.issuetype, 'name');
  const assignee = nestedText(record.assignee, 'displayName');
  const project = nestedText(record.project, 'name');
  const authorLogin = nestedText(record.user, 'login');
  return { sourceSystem: source, sourceRecordId: id, title, summary, content, sourceUrl: text(record.sourceUrl) ?? text(record.url) ?? text(record.webUrl) ?? text(record.html_url) ?? (isSlack ? text(record.permalink) : undefined), createdAt: isJira ? timestamp(record.created) : timestamp(record.createdAt) ?? timestamp(record.created_at), updatedAt: isJira ? timestamp(record.updated) : timestamp(record.updatedAt) ?? timestamp(record.updated_at), occurredAt: isSlack ? timestamp(record.ts) : timestamp(record.occurredAt) ?? timestamp(record.occurred_at), provenance, synthetic: provenance === 'external-verified' || provenance === 'user-provided' ? false : true, metadata: isJira ? { ...record, issueKey: text(record.key), status, issueType, assignee, project } : isGithub ? { ...record, recordType: text(record.recordType) ?? 'pull_request', repository: record.repository, state: text(record.state), merged: typeof record.merged === 'boolean' ? record.merged : undefined, authorLogin } : isSlack ? { ...record, channelName: nestedText(record.channel, 'name') ?? text(record.channelName), channelId: nestedText(record.channel, 'id') ?? text(record.channelId) } : record };
}
function payloadRecords(payload: unknown, source: MockSource): unknown[] {
  if (source === 'jira' && isRecord(payload) && Array.isArray(payload.issues)) return payload.issues;
  if (source === 'confluence' && isRecord(payload) && (Array.isArray(payload.pages) || Array.isArray(payload.results))) return (payload.pages ?? payload.results) as unknown[];
  if (source === 'github' && isRecord(payload) && Array.isArray(payload.pulls)) return payload.pulls;
  if (source === 'github' && isRecord(payload) && Array.isArray(payload.issues)) return payload.issues;
  if (source === 'github' && isRecord(payload) && Array.isArray(payload.commits)) return payload.commits;
  if (source === 'slack' && isRecord(payload) && Array.isArray(payload.messages)) return payload.messages;
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
function sourceSetting(source: MockSource) {
  return source === 'confluence' ? env.CONFLUENCE_API_KEY ?? env.CONFLUENCE_API_TOKEN
    : source === 'jira' ? env.JIRA_API_KEY
      : source === 'github' ? env.GITHUB_API_KEY : env.SLACK_API_KEY;
}
function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}
/** The connector URL may be supplied as MOCK_API_BASE_URL or, for compatibility
 * with the supplied .env, as a URL-valued *_API_KEY entry. */
export function sourceConnectorBase(source: MockSource, override?: string): string | undefined {
  if (override !== undefined) return override;
  if (source === 'confluence' && env.CONFLUENCE_INGESTION_ENABLED !== 'false'
    && env.CONFLUENCE_BASE_URL && env.CONFLUENCE_EMAIL && (env.CONFLUENCE_API_TOKEN || env.CONFLUENCE_API_KEY)) return undefined;
  const setting = sourceSetting(source);
  return env.MOCK_API_BASE_URL ?? (isHttpUrl(setting) ? setting : undefined);
}
function sourceCredential(source: MockSource): string | undefined {
  const setting = sourceSetting(source);
  return setting && !isHttpUrl(setting) ? setting : undefined;
}
async function fetchConfluenceDocuments(limit: number, timeoutMs: number): Promise<NormalizedDocument[]> {
  if (env.CONFLUENCE_INGESTION_ENABLED === 'false') throw new MockFetcherError('missing-configuration', 'Confluence ingestion is disabled.');
  const confluenceToken = env.CONFLUENCE_API_TOKEN ?? env.CONFLUENCE_API_KEY;
  if (!env.CONFLUENCE_BASE_URL || !env.CONFLUENCE_EMAIL || !confluenceToken) throw new MockFetcherError('missing-configuration', 'Confluence base URL and server-side credentials are required.');
  const base = configuredBase(env.CONFLUENCE_BASE_URL);
  const wikiBasePath = base.pathname.replace(/\/$/, '').toLowerCase().endsWith('/wiki')
    ? base.pathname.replace(/\/$/, '')
    : `${base.pathname.replace(/\/$/, '')}/wiki`;
  const url = new URL(base);
  url.pathname = `${wikiBasePath}/rest/api/content/search`;
  url.searchParams.set('cql', 'type=page'); url.searchParams.set('limit', String(Math.max(1, Math.min(100, Math.floor(limit))))); url.searchParams.set('expand', 'body.storage,version,space');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    const authorization = Buffer.from(`${env.CONFLUENCE_EMAIL}:${confluenceToken}`).toString('base64');
    response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Basic ${authorization}` }, signal: controller.signal });
  } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw new MockFetcherError('timeout', 'Confluence request timed out.', true); throw new MockFetcherError('http-error', 'Confluence request failed.', true); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new MockFetcherError('http-error', `Confluence returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
  let payload: unknown; try { payload = await response.json(); } catch { throw new MockFetcherError('malformed-response', 'Confluence returned invalid JSON.'); }
  const records = payloadRecords(payload, 'confluence');
  if (!records.length) throw new MockFetcherError('empty-result', 'Confluence returned no pages.');
  return records.slice(0, limit).map((entry) => {
    if (!isRecord(entry)) throw new MockFetcherError('malformed-response', 'Confluence returned a non-object page.');
    const links = isRecord(entry._links) ? entry._links : {};
    const webui = text(links.webui);
    const basePath = wikiBasePath;
    const sourcePath = webui ? (webui.startsWith(`${basePath}/`) ? webui : `${basePath}/${webui.replace(/^\/+/, '')}`) : undefined;
    const sourceUrl = sourcePath ? new URL(sourcePath, base.origin).toString() : undefined;
    const normalized = normalizeRecord({ ...entry, id: entry.id, url: sourceUrl, provenance: 'external-verified' }, 'confluence');
    return { ...normalized, provenance: 'external-verified', synthetic: false };
  });
}
export async function fetchMockDocuments(source: MockSource, options: { baseUrl?: string; limit?: number; timeoutMs?: number } = {}): Promise<NormalizedDocument[]> {
  if (!mockSources.includes(source)) throw new MockFetcherError('unsupported-source', 'Unsupported mock source.');
  const connectorBase = sourceConnectorBase(source, options.baseUrl);
  if (source === 'confluence' && !connectorBase) return fetchConfluenceDocuments(options.limit ?? 20, options.timeoutMs ?? 10_000);
  // Never silently fall back to an unverified local connector. Requiring an
  // explicit server-side base URL makes missing source configuration visible.
  const url = configuredBase(connectorBase);
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
  const key = sourceCredential(source);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (key) { headers['x-api-key'] = key; headers.Authorization = `Bearer ${key}`; }
  const requestJson = async (path: string, params: Record<string, string> = {}) => {
    const requestUrl = new URL(url);
    requestUrl.pathname = `${url.pathname.replace(/\/$/, '')}${path}`;
    for (const [name, value] of Object.entries(params)) requestUrl.searchParams.set(name, value);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const response = await fetch(requestUrl, { headers, signal: controller.signal });
      if (!response.ok) throw new MockFetcherError('http-error', `${source} source returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
      try { return await response.json() as unknown; } catch { throw new MockFetcherError('malformed-response', `${source} source returned invalid JSON.`); }
    } catch (error) {
      if (error instanceof MockFetcherError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new MockFetcherError('timeout', `${source} request timed out.`, true);
      throw new MockFetcherError('http-error', `${source} request failed.`, true);
    } finally { clearTimeout(timeout); }
  };
  let records: unknown[];
  if (source === 'slack') {
    const channelPayload = await requestJson(MOCK_ENDPOINTS.slack, { limit: String(limit) });
    if (isRecord(channelPayload) && channelPayload.ok === false) throw new MockFetcherError('http-error', 'Slack source returned an unsuccessful response.');
    if (isRecord(channelPayload) && Array.isArray(channelPayload.messages)) {
      records = payloadRecords(channelPayload, 'slack');
    } else {
    const channels = isRecord(channelPayload) && Array.isArray(channelPayload.channels) ? channelPayload.channels.filter(isRecord) : [];
    const channelMessages = await Promise.all(channels.slice(0, Math.min(12, limit)).map(async (channel) => {
      const channelId = text(channel.id) ?? text(channel.name);
      if (!channelId) return [];
      const payload = await requestJson('/api/slack/conversations.history', { channel: channelId, limit: String(Math.max(1, Math.floor(limit / Math.max(1, Math.min(channels.length, 12)))) ) });
      return payloadRecords(payload, 'slack').map((message) => isRecord(message) ? { ...message, channel, channelId, channelName: text(channel.name) } : message);
    }));
    records = channelMessages.flat();
    }
  } else if (source === 'github') {
    const perKind = String(Math.max(1, Math.floor(limit / 3)));
    const [pulls, issues, commits] = await Promise.all([
      requestJson('/api/github/pulls', { limit: perKind }),
      requestJson('/api/github/issues', { limit: perKind }).catch(() => null),
      requestJson('/api/github/commits', { limit: perKind }).catch(() => null)
    ]);
    records = [
      ...payloadRecords(pulls, 'github').map((record) => isRecord(record) ? { ...record, recordType: 'pull_request' } : record),
      ...(issues ? payloadRecords(issues, 'github').map((record) => isRecord(record) ? { ...record, recordType: 'issue' } : record) : []),
      ...(commits ? payloadRecords(commits, 'github').map((record) => isRecord(record) ? { ...record, recordType: 'commit' } : record) : [])
    ];
  } else {
    const payload = await requestJson(MOCK_ENDPOINTS[source], { limit: String(limit) });
    records = payloadRecords(payload, source);
  }
  if (!records.length) throw new MockFetcherError('empty-result', `${source} returned no records.`);
  const requestedLimit = options.limit === undefined ? undefined : Math.max(1, Math.min(100, Math.floor(options.limit)));
  return records.slice(0, requestedLimit).map((record) => isRecord(record) ? normalizeRecord(key ? { ...record, provenance: 'external-verified' } : record, source) : (() => { throw new MockFetcherError('malformed-response', 'Mock API returned a non-object record.'); })());
}
