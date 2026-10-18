import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_CONVERSATIONS, DEMO_TICKETS, filterDemoConversations, filterDemoTickets } from "./demo-data";
import { DEMO_SOURCE_TOTALS, demoSourceSummary, integrationNeedsAttention, integrationSummaries, integrationWarning, liveSourceSummary, unavailableIntegrationSummaries } from "./source-data";

test("demo source counts and filters use the source page fixtures", () => {
  assert.equal(DEMO_SOURCE_TOTALS.jira, DEMO_TICKETS.length);
  assert.equal(DEMO_SOURCE_TOTALS.slack, DEMO_CONVERSATIONS.length);
  assert.equal(filterDemoTickets("payment", "In Progress").length, 1);
  assert.equal(filterDemoTickets("", "All statuses", "Critical").length, 3);
  assert.equal(filterDemoConversations("Mia").length, 2);
  assert.equal(filterDemoConversations("#support").length, 1);
  assert.equal(filterDemoConversations("no matching record").length, 0);
});

test("source summaries distinguish fixture totals from verified live index counts", () => {
  const jira = demoSourceSummary("jira", 5, "running");
  assert.equal(jira.dataMode, "demo");
  assert.equal(jira.totalAvailableRecords, DEMO_TICKETS.length);
  assert.equal(jira.currentlyDisplayedRecords, 5);
  assert.equal(jira.verifiedIndexedRecordCount, null);
  assert.equal(jira.syncState, "running");

  const live = liveSourceSummary("confluence", 12, undefined, 4);
  assert.equal(live.dataMode, "live");
  assert.equal(live.totalAvailableRecords, 12);
  assert.equal(live.verifiedIndexedRecordCount, 12);
  assert.equal(live.currentlyDisplayedRecords, 4);

  const unavailable = liveSourceSummary("github", null, "backend unavailable");
  assert.equal(unavailable.readinessStatus, "unavailable");
  assert.equal(unavailable.verifiedIndexedRecordCount, null);
});

test("integration status resolves every provider and preserves unavailable counts", () => {
  const live = integrationSummaries({ sources: [
    { source: "confluence", connectionState: "Connected", syncState: "completed", fetched: 2, processed: 2, indexed: 2, skipped: 0, failed: 0, pending: 0, lastSuccessfulSync: "2026-10-18T00:00:00.000Z" },
    { source: "jira", connectionState: "Sync failed", syncState: "failed", fetched: null, processed: null, indexed: 0, skipped: null, failed: null, pending: 0, lastSuccessfulSync: null, failureCategory: "dns", error: "DNS lookup failed." },
    { source: "slack", connectionState: "Connected", syncState: "idle", fetched: null, processed: null, indexed: 4, skipped: null, failed: null, pending: 0, lastSuccessfulSync: null },
    { source: "github", connectionState: "Connected", syncState: "idle", fetched: null, processed: null, indexed: null, skipped: null, failed: null, pending: 0, lastSuccessfulSync: null, error: "Graph count unavailable." },
  ] });
  assert.equal(live.confluence.connectionState, "Connected");
  assert.equal(live.confluence.verifiedIndexedRecordCount, 2);
  assert.equal(live.confluence.lastSyncTime, "2026-10-18T00:00:00.000Z");
  assert.equal(live.jira.connectionState, "Sync failed");
  assert.equal(live.jira.failureCategory, "dns");
  assert.equal(live.github.verifiedIndexedRecordCount, null);
  assert.equal(live.github.readinessStatus, "unavailable");
});

test("failed status requests resolve cards to Unavailable instead of Checking", () => {
  const unavailable = unavailableIntegrationSummaries("Backend request timed out.");
  for (const source of Object.values(unavailable)) {
    assert.equal(source.connectionState, "Unavailable");
    assert.equal(source.verifiedIndexedRecordCount, null);
    assert.equal(source.readinessStatus, "unavailable");
    assert.match(source.error ?? "", /timed out/i);
  }
});

test("connectivity does not mask partial ingestion health", () => {
  assert.equal(integrationNeedsAttention({ connectionState: "Connected", syncState: "partial", failedRecords: 20 }), true);
  assert.equal(integrationNeedsAttention({ connectionState: "Connected", syncState: "failed", failedRecords: 0 }), true);
  assert.equal(integrationNeedsAttention({ connectionState: "Connected", syncState: "idle", failedRecords: null }), true);
  assert.equal(integrationNeedsAttention({ connectionState: "Sync failed", syncState: "idle", failedRecords: null }), true);
  assert.equal(integrationNeedsAttention({ connectionState: "Connected", syncState: "completed", failedRecords: 0 }), false);
});

test("status keeps cumulative indexed totals distinct from the latest run counts", () => {
  const sources = integrationSummaries({ sources: [
    { source: "confluence", connectionState: "Connected", syncState: "completed", fetched: 11, processed: 11, persisted: 11, indexedThisRun: 11, indexed: 11, skipped: 0, failed: 0, pending: 0, attemptedAt: "2026-10-18T00:00:00.000Z", lastSuccessfulSync: "2026-10-18T00:00:00.000Z" },
    { source: "jira", connectionState: "Connected", syncState: "partial", fetched: 129, processed: 109, persisted: 109, indexedThisRun: 109, indexed: 109, skipped: 0, failed: 20, pending: 0, lastSuccessfulSync: null },
    { source: "slack", connectionState: "Connected", syncState: "partial", fetched: 217, processed: 112, persisted: 217, indexedThisRun: 217, indexed: 217, skipped: 0, failed: 105, pending: 0, lastSuccessfulSync: null },
    { source: "github", connectionState: "Connected", syncState: "partial", fetched: 444, processed: 405, persisted: 211, indexedThisRun: 211, indexed: 211, skipped: 0, failed: 32, pending: 0, lastSuccessfulSync: null },
  ] });
  assert.equal(sources.slack.verifiedIndexedRecordCount, 217);
  assert.equal(sources.slack.processedRecords, 112);
  assert.equal(sources.github.verifiedIndexedRecordCount, 211);
  assert.equal(sources.github.processedRecords, 405);
  assert.equal(sources.github.failedRecords, 32);
  assert.equal(integrationNeedsAttention(sources.slack), true);
  assert.equal(integrationNeedsAttention(sources.github), true);
});

test("one card warning communicates connection and sync health without conflating them", () => {
  const partial = liveSourceSummary("slack", 217, "105 unique source records could not be fully processed or verified.", null, {
    connectionState: "Connected", syncState: "partial", failedRecords: 105,
  });
  assert.equal(integrationWarning(partial), "105 unique source records could not be fully processed or verified.");
  assert.equal(integrationWarning(partial, "The latest sync request failed."), "The latest sync request failed.");

  const unreachable = liveSourceSummary("github", null, "DNS lookup failed.", null, { connectionState: "Sync failed", syncState: "partial" });
  assert.equal(integrationWarning(unreachable), "DNS lookup failed.");
});
