import { env } from '../../config/env.js';
import { MockFetcherError, mockSources, type MockSource, type NormalizedDocument } from './types.js';

/** Company Brain Mock API routes. MOCK_API_BASE_URL is the tunnel origin. */
export const MOCK_ENDPOINTS: Readonly<Record<MockSource, string>> = {
  confluence: '/api/confluence/pages',
  jira: '/api/jira/issues',
  github: '/api/github/pulls',
  slack: '/api/slack/conversations.list'
};
const SEEDED_MOCK_API_HOST = 'confluenece.vercel.app';
type RawRecord = Record<string, unknown>;
type TransportError = { name?: unknown; code?: unknown; cause?: { code?: unknown } };
const isRecord = (value: unknown): value is RawRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function transportFailure(source: MockSource, error: unknown): MockFetcherError {
  const details = error && typeof error === 'object' ? error as TransportError : {};
  const code = typeof details.cause?.code === 'string' ? details.cause.code : typeof details.code === 'string' ? details.code : undefined;
  if (details.name === 'AbortError' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return new MockFetcherError('timeout', `${source} connector request timed out. Check proxy health and network latency.`, true, undefined, 'timeout');
  if (code && /^(ENOTFOUND|EAI_AGAIN|EAI_FAIL|ENODATA)$/.test(code)) return new MockFetcherError('dns-error', `${source} connector hostname could not be resolved (${code}). Check that the configured proxy or tunnel hostname is current and published in DNS.`, false, undefined, 'dns');
  if (code && /^(CERT_|ERR_TLS|ERR_SSL|DEPTH_|UNABLE_TO_VERIFY|SELF_SIGNED)/.test(code)) return new MockFetcherError('tls-error', `${source} connector TLS verification failed (${code}). Check the endpoint certificate and TLS configuration.`, false, undefined, 'tls');
  if (code && /^(ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|EPIPE)$/.test(code)) return new MockFetcherError('connection-error', `${source} connector could not establish a connection (${code}). Check that the proxy is running and accepting HTTPS traffic.`, true, undefined, 'connection');
  return new MockFetcherError('connection-error', `${source} connector request failed before an HTTP response. Check proxy availability, DNS, TLS, and outbound network access.`, true, undefined, 'connection');
}
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

function normalizeRecord(record: RawRecord, source: MockSource, trustedProviderResponse = false): NormalizedDocument {
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
  const seedMarked = Boolean(text(record.rawSeedId) || text(record.seedId) || text(record.source) === 'seed');
  const rawProvenance = text(record.provenance);
  const provenance = rawProvenance === 'mock-verified'
    ? 'mock-verified'
    : !seedMarked && trustedProviderResponse && (rawProvenance === 'external-verified' || rawProvenance === 'user-provided')
      ? rawProvenance as NormalizedDocument['provenance']
      : 'synthetic';
  const status = nestedText(record.status, 'name') ?? text(record.status);
  const issueType = nestedText(record.issuetype, 'name');
  const assignee = nestedText(record.assignee, 'displayName');
  const project = nestedText(record.project, 'name');
  const authorLogin = nestedText(record.user, 'login');
  const sourceUrl = text(record.sourceUrl) ?? text(record.url) ?? text(record.webUrl) ?? text(record.html_url) ?? (isSlack ? text(record.permalink) : undefined);
  const author = isRecord(record.user) ? record.user : {};
  const authorName = [author.real_name, author.name, author.display_name].find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  const replyCount = typeof record.reply_count === 'number' && Number.isFinite(record.reply_count) ? record.reply_count : undefined;
  return { sourceSystem: source, sourceRecordId: id, title, summary, content, sourceUrl, createdAt: isJira ? timestamp(record.created) : timestamp(record.createdAt) ?? timestamp(record.created_at), updatedAt: isJira ? timestamp(record.updated) : timestamp(record.updatedAt) ?? timestamp(record.updated_at), occurredAt: isSlack ? timestamp(record.ts) : timestamp(record.occurredAt) ?? timestamp(record.occurred_at), provenance, synthetic: provenance === 'synthetic' || provenance === 'mock-verified', metadata: isJira ? { ...record, ...(sourceUrl ? { externalUrl: sourceUrl } : {}), issueKey: text(record.key), status, issueType, assignee, project } : isGithub ? { ...record, recordType: text(record.recordType) ?? 'pull_request', repository: record.repository, state: text(record.state), merged: typeof record.merged === 'boolean' ? record.merged : undefined, authorLogin } : isSlack ? { ...record, channelName: nestedText(record.channel, 'name') ?? text(record.channelName), channelId: text(record.channelId) ?? nestedText(record.channel, 'id'), ...(authorName ? { authorName } : {}), ...(typeof record.thread_ts === 'string' ? { threadTs: record.thread_ts } : {}), ...(replyCount !== undefined ? { replyCount } : {}) } : record };
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
const isSeededMockApi = (url: URL) => url.hostname.toLowerCase() === SEEDED_MOCK_API_HOST;
/** The connector URL may be supplied as MOCK_API_BASE_URL or, for compatibility
 * with the supplied .env, as a URL-valued *_API_KEY entry. */
export function sourceConnectorBase(source: MockSource, override?: string): string | undefined {
  if (override !== undefined) return override;
  if (source === 'confluence' && env.CONFLUENCE_INGESTION_ENABLED !== 'false'
    && env.CONFLUENCE_BASE_URL && env.CONFLUENCE_EMAIL && (env.CONFLUENCE_API_TOKEN || env.CONFLUENCE_API_KEY)) return undefined;
  const setting = sourceSetting(source);
  return env.MOCK_API_BASE_URL ?? (isHttpUrl(setting) ? setting : undefined);
}

export function configuredSourceConnectors(): MockSource[] {
  return mockSources.filter((source) => Boolean(sourceConnectorBase(source))
    || (source === 'confluence' && env.CONFLUENCE_INGESTION_ENABLED !== 'false'
      && Boolean(env.CONFLUENCE_BASE_URL && env.CONFLUENCE_EMAIL && (env.CONFLUENCE_API_TOKEN || env.CONFLUENCE_API_KEY))));
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
  url.searchParams.set('cql', 'type=page'); url.searchParams.set('limit', '100'); url.searchParams.set('expand', 'body.storage,version,space');
  const authorization = Buffer.from(`${env.CONFLUENCE_EMAIL}:${confluenceToken}`).toString('base64');
  const records: unknown[] = [];
  let start = 0;
  while (records.length < limit) {
    url.searchParams.set('start', String(start));
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try { response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Basic ${authorization}` }, signal: controller.signal }); }
    catch (error) { throw transportFailure('confluence', error); }
      finally { clearTimeout(timeout); }
      if (response.status !== 429 || attempt === 2) break;
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * (attempt + 1)));
    }
    if (!response) throw new MockFetcherError('http-error', 'Confluence request failed.', true);
    if (!response.ok) throw new MockFetcherError('http-error', `Confluence returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429, response.status);
    let payload: unknown; try { payload = await response.json(); } catch { throw new MockFetcherError('malformed-response', 'Confluence returned invalid JSON.'); }
    const page = payloadRecords(payload, 'confluence');
    records.push(...page);
    if (page.length < 100) break;
    start += page.length;
  }
  if (!records.length) throw new MockFetcherError('empty-result', 'Confluence returned no pages.');
  return records.slice(0, limit).map((entry) => {
    if (!isRecord(entry)) throw new MockFetcherError('malformed-response', 'Confluence returned a non-object page.');
    const links = isRecord(entry._links) ? entry._links : {};
    const webui = text(links.webui);
    const basePath = wikiBasePath;
    const sourcePath = webui ? (webui.startsWith(`${basePath}/`) ? webui : `${basePath}/${webui.replace(/^\/+/, '')}`) : undefined;
    const sourceUrl = sourcePath ? new URL(sourcePath, base.origin).toString() : undefined;
    return normalizeRecord({ ...entry, id: entry.id, url: sourceUrl, provenance: 'external-verified' }, 'confluence', true);
  });
}
export async function fetchMockDocuments(source: MockSource, options: { baseUrl?: string; limit?: number; timeoutMs?: number } = {}): Promise<NormalizedDocument[]> {
  if (!mockSources.includes(source)) throw new MockFetcherError('unsupported-source', 'Unsupported mock source.');
  const connectorBase = sourceConnectorBase(source, options.baseUrl);
  if (source === 'confluence' && !connectorBase) return fetchConfluenceDocuments(options.limit ?? 20, options.timeoutMs ?? 10_000);
  // Never silently fall back to an unverified local connector. Requiring an
  // explicit server-side base URL makes missing source configuration visible.
  const url = configuredBase(connectorBase);
  const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 20)));
  const key = isSeededMockApi(url) ? undefined : sourceCredential(source);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (key) { headers['x-api-key'] = key; headers.Authorization = `Bearer ${key}`; }
  const requestJson = async (path: string, params: Record<string, string> = {}) => {
    const requestUrl = new URL(url);
    requestUrl.pathname = `${url.pathname.replace(/\/$/, '')}${path}`;
    for (const [name, value] of Object.entries(params)) requestUrl.searchParams.set(name, value);
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
      try {
        const response = await fetch(requestUrl, { headers, signal: controller.signal });
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * (attempt + 1)));
          continue;
        }
        if (!response.ok) throw new MockFetcherError('http-error', `${source} source returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429, response.status);
        try { return await response.json() as unknown; } catch { throw new MockFetcherError('malformed-response', `${source} source returned invalid JSON.`); }
      } catch (error) {
        if (error instanceof MockFetcherError) throw error;
        throw transportFailure(source, error);
      } finally { clearTimeout(timeout); }
    }
    throw new MockFetcherError('http-error', `${source} source returned HTTP 429 after retrying.`, true, 429);
  };
  const fetchPaged = async (path: string, requestedLimit: number, fixed: Record<string, string> = {}) => {
    const collected: unknown[] = [];
    let offset = 0;
    let cursor: string | undefined;
    for (let pageNumber = 0; collected.length < requestedLimit && pageNumber < 20; pageNumber++) {
      const pageSize = Math.min(100, requestedLimit - collected.length);
      const paging: Record<string, string> = source === 'jira' ? { startAt: String(offset), maxResults: String(pageSize), limit: String(pageSize) }
        : source === 'confluence' ? { start: String(offset), limit: String(pageSize) }
          : { offset: String(offset), limit: String(pageSize) };
      const payload = await requestJson(path, { ...fixed, ...paging, ...(cursor ? { cursor } : {}) });
      if (source === 'slack' && isRecord(payload) && payload.ok === false) {
        const code = text(payload.error)?.toLowerCase();
        const status = code === 'not_authed' || code === 'invalid_auth' || code === 'token_revoked' ? 401 : code === 'missing_scope' || code === 'no_permission' || code === 'permission_denied' ? 403 : undefined;
        throw new MockFetcherError('http-error', status === 401 ? 'Slack authentication failed.' : status === 403 ? 'Slack permissions are missing for message history.' : 'Slack message history request failed.', false, status);
      }
      const page = payloadRecords(payload, source);
      collected.push(...page);
      const root = isRecord(payload) ? payload : {};
      const metadata = isRecord(root.response_metadata) ? root.response_metadata : {};
      const nextCursor = text(root.nextCursor) ?? text(root.next_cursor) ?? text(root.nextPageToken) ?? text(root.next_page_token) ?? text(metadata.next_cursor);
      const hasMore = root.hasMore === true || root.has_more === true || root.isLast === false || root.is_last === false;
      const total = typeof root.total === 'number' ? root.total : typeof root.totalSize === 'number' ? root.totalSize : undefined;
      const currentOffset = typeof root.offset === 'number' ? root.offset : typeof root.startAt === 'number' ? root.startAt : typeof root.start === 'number' ? root.start : offset;
      if (nextCursor) { cursor = nextCursor; offset += page.length; continue; }
      if (hasMore || (total !== undefined && currentOffset + page.length < total)) { offset = currentOffset + page.length; continue; }
      if (page.length < pageSize) break;
      offset += page.length;
    }
    return collected.slice(0, requestedLimit);
  };
  let records: unknown[];
  if (source === 'slack') {
    let channelPayload = await requestJson(MOCK_ENDPOINTS.slack, { limit: '100' });
    if (isRecord(channelPayload) && channelPayload.ok === false) {
      const code = text(channelPayload.error)?.toLowerCase();
      const status = code === 'not_authed' || code === 'invalid_auth' || code === 'token_revoked' ? 401 : code === 'missing_scope' || code === 'no_permission' || code === 'permission_denied' ? 403 : undefined;
      throw new MockFetcherError('http-error', status === 401 ? 'Slack authentication failed.' : status === 403 ? 'Slack permissions are missing.' : 'Slack source returned an unsuccessful response.', false, status);
    }
    if (isRecord(channelPayload) && Array.isArray(channelPayload.messages)) {
      records = payloadRecords(channelPayload, 'slack');
    } else {
    const channels = isRecord(channelPayload) && Array.isArray(channelPayload.channels) ? channelPayload.channels.filter(isRecord) : [];
    let channelCursor = '';
    for (let page = 0; page < 20 && channels.length < limit; page++) {
      const metadata = isRecord(channelPayload) && isRecord(channelPayload.response_metadata) ? channelPayload.response_metadata : {};
      channelCursor = text(metadata.next_cursor) ?? text(isRecord(channelPayload) ? channelPayload.next_cursor : undefined) ?? '';
      if (!channelCursor) break;
      channelPayload = await requestJson(MOCK_ENDPOINTS.slack, { limit: '100', cursor: channelCursor });
      if (isRecord(channelPayload) && Array.isArray(channelPayload.channels)) channels.push(...channelPayload.channels.filter(isRecord));
    }
    const selectedChannels = channels.slice(0, limit);
    const perChannelLimit = Math.max(1, Math.floor(limit / Math.max(1, selectedChannels.length)));
    const channelMessages: PromiseSettledResult<unknown[]>[] = [];
    for (let index = 0; index < selectedChannels.length; index += 4) {
      const batch = await Promise.allSettled(selectedChannels.slice(index, index + 4).map(async (channel) => {
        const channelId = text(channel.id) ?? text(channel.name);
        if (!channelId) return [];
        const messages = await fetchPaged('/api/slack/conversations.history', perChannelLimit, { channel: channelId });
        return messages.map((message) => isRecord(message) ? { ...message, channel, channelId, channelName: text(channel.name) } : message);
      }));
      channelMessages.push(...batch);
    }
    records = channelMessages.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (!records.length && channelMessages.some((result) => result.status === 'rejected')) throw new MockFetcherError('http-error', 'Slack could not read messages from any accessible channel.');
    }
  } else if (source === 'github') {
    const perKind = Math.floor(limit / 3);
    const pullLimit = perKind + (limit % 3);
    const [pulls, issues, commits] = await Promise.all([
      fetchPaged('/api/github/pulls', pullLimit),
      perKind ? fetchPaged('/api/github/issues', perKind) : Promise.resolve([]),
      perKind ? fetchPaged('/api/github/commits', perKind) : Promise.resolve([])
    ]);
    records = [
      ...payloadRecords(pulls, 'github').map((record) => isRecord(record) ? { ...record, recordType: 'pull_request' } : record),
      ...payloadRecords(issues, 'github').map((record) => isRecord(record) ? { ...record, recordType: 'issue' } : record),
      ...payloadRecords(commits, 'github').map((record) => isRecord(record) ? { ...record, recordType: 'commit' } : record)
    ];
  } else {
    records = await fetchPaged(MOCK_ENDPOINTS[source], limit);
  }
  if (!records.length) throw new MockFetcherError('empty-result', `${source} returned no records.`);
  const requestedLimit = options.limit === undefined ? undefined : Math.max(1, Math.min(1000, Math.floor(options.limit)));
  const mockVerified = source !== 'confluence' && isSeededMockApi(url);
  return records.slice(0, requestedLimit).map((record) => isRecord(record)
    ? normalizeRecord(mockVerified ? { ...record, provenance: 'mock-verified' } : record, source, Boolean(key))
    : (() => { throw new MockFetcherError('malformed-response', 'Mock API returned a non-object record.'); })());
}
