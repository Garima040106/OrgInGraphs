import assert from 'node:assert/strict';
import test from 'node:test';
import { runFeatureUpdate } from '../src/agents/feature-update/agent.js';
import { activityType } from '../src/agents/feature-update/rules.js';

const input = (text: string) => ({ text, source: 'user-input', sourceRecordId: 'update-001', receivedAt: '2026-01-01T00:00:00.000Z' });

test('extracts deterministic activity types and status changes', () => {
  assert.equal(activityType('I fixed the payment timeout bug.'), 'fix');
  assert.equal(activityType('The CSV export feature is complete.'), 'feature-complete');
  assert.equal(activityType('PR #142 was merged for authentication.'), 'merge');
  assert.equal(activityType('The release is blocked by ticket PAY-27.'), 'release-blocked');
  assert.equal(activityType('I reviewed the search refactor.'), 'review');
});

test('preserves unresolved external references and does not claim verification', async () => {
  const result = await runFeatureUpdate(input('PR #142 was merged for authentication.'));
  assert.equal(result.update?.references[0].text, '142');
  assert.equal(result.update?.references[0].status, 'unresolved');
  assert.equal(result.update?.references[0].verified, false);
  assert.equal(result.update?.verifiedExternalEvent, false);
  assert.equal(result.persisted, false);
});

test('does not extract production as a pull-request reference and preserves valid PR references', async () => {
  const production = await runFeatureUpdate(input('Reminder: production changes need a rollback plan.'));
  assert.equal(production.update?.references.length, 0);
  const valid = await runFeatureUpdate(input('PR #123 and PR: ABC-123 were reviewed.'));
  assert.deepEqual(valid.update?.references.map((reference) => reference.text), ['123', 'ABC-123']);
});

test('passes linked Jira keys through metadata as ticket references', async () => {
  const queries: string[] = [];
  const graph = { query: async (cypher: string) => { queries.push(cypher); return { data: [] }; } } as never;
  const result = await runFeatureUpdate({ ...input('Production changes need a Jira issue.'), metadata: { linkedJiraKey: 'WEB-1002' } }, { graph });
  assert.equal(result.update?.references[0].kind, 'ticket');
  assert.equal(result.update?.references[0].text, 'WEB-1002');
  assert.equal(result.update?.references[0].status, 'unresolved');
  assert.equal(result.persisted, true);
  assert.ok(queries.some((query) => query.includes('any(label IN labels(n)')));
});

test('persists Slack updates with unresolved optional ticket references', async () => {
  for (const linkedJiraKey of ['PAY-1001', 'WEB-1002']) {
    const graph = { query: async (_cypher: string, options?: { params?: Record<string, unknown> }) => {
      const properties = options?.params?.properties as Record<string, unknown> | undefined;
      assert.ok(!properties || !JSON.stringify(properties).includes('undefined'));
      if (properties) {
        assert.equal(properties.references, undefined);
        assert.equal(typeof properties.referencesJson, 'string');
        assert.equal(JSON.parse(properties.referencesJson as string)[0].text, linkedJiraKey);
      }
      return { data: [] };
    } } as never;
    const result = await runFeatureUpdate({ text: 'Reminder: production changes need a Jira issue and rollback plan.', source: 'slack', sourceRecordId: linkedJiraKey, receivedAt: '2026-02-03T10:00:00.000Z', provenance: 'synthetic', metadata: { linkedJiraKey } }, { graph });
    assert.equal(result.persisted, true);
    assert.equal(result.update?.references[0].status, 'unresolved');
  }
});

test('resolves an actor and ticket, then persists a status update', async () => {
  const queries: string[] = [];
  const graph = { query: async (cypher: string) => {
    queries.push(cypher);
    if (cypher.includes('MATCH (n:Employee)')) return { data: [{ n: { properties: { id: 'emp-04' } } }] };
    if (cypher.includes('MATCH (n) WHERE n.graphDomain') && cypher.includes('labels(n)')) return { data: [{ n: { properties: { id: 'ticket-retry-policy' } } }] };
    return { data: [] };
  } } as never;
  const result = await runFeatureUpdate(input('By emp-04: ticket ticket-retry-policy is complete.'), { graph });
  assert.equal(result.update?.actorId, 'emp-04');
  assert.equal(result.update?.ticketId, 'ticket-retry-policy');
  assert.equal(result.update?.newStatus, 'done');
  assert.equal(result.persisted, true);
  assert.ok(queries.some((query) => query.includes('SET n.status = $status')));
});

test('flags ambiguous actors and does not persist', async () => {
  const graph = { query: async (cypher: string) => cypher.includes('MATCH (n:Employee)') ? { data: [
    { n: { properties: { id: 'emp-01' } } }, { n: { properties: { id: 'emp-02' } } }
  ] } : { data: [] } } as never;
  const result = await runFeatureUpdate(input('By Alex: I reviewed the search refactor.'), { graph });
  assert.equal(result.ambiguities.length, 1);
  assert.equal(result.persisted, false);
});

test('rejects invalid model output and reports sanitized database-stage failures', async () => {
  const invalid = await runFeatureUpdate(input('I fixed a bug.'), { model: async () => ({ activityType: 'invented', summary: '' }) });
  assert.ok(invalid.errors.some((error) => error.includes('activityType')));
  const failingGraph = { query: async () => { throw new Error('database unavailable'); } } as never;
  const result = await runFeatureUpdate(input('By emp-01: I fixed a bug.'), { graph: failingGraph });
  assert.deepEqual(result.errors, ['Update reference resolution failed.']);
  assert.equal(result.persisted, false);
});

test('reports persistence failures with a sanitized stage diagnostic', async () => {
  const graph = { query: async (cypher: string) => cypher.includes('MERGE (a:Activity') ? Promise.reject(new Error('database password=secret')) : { data: [] } } as never;
  const result = await runFeatureUpdate(input('I fixed a bug.'), { graph });
  assert.deepEqual(result.errors, ['Activity persistence failed during activity merge.']);
  assert.equal(result.persisted, false);
});

test('duplicate events generate the same activity ID and use MERGE', async () => {
  const queries: string[] = [];
  const graph = { query: async (cypher: string) => { queries.push(cypher); return { data: [] }; } } as never;
  const first = await runFeatureUpdate(input('I fixed the payment timeout bug.'), { graph });
  const second = await runFeatureUpdate(input('I fixed the payment timeout bug.'), { graph });
  assert.equal(first.update?.id, second.update?.id);
  assert.equal(first.persisted, true);
  assert.equal(second.persisted, true);
  assert.equal(queries.filter((query) => query.includes('MERGE (a:Activity')).length, 2);
});
