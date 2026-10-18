import { DEMO_CONVERSATIONS, DEMO_TICKETS } from "@/lib/demo-data";
import type { IntegrationStatusResponse } from "@/lib/types";

export type SourceId = "confluence" | "jira" | "slack" | "github" | "people";
export type SourceMode = "demo" | "live";
export type SourceSummary = {
  id: SourceId;
  displayName: string;
  dataMode: SourceMode;
  totalAvailableRecords: number | null;
  currentlyDisplayedRecords: number | null;
  verifiedIndexedRecordCount: number | null;
  readinessStatus: "available" | "unavailable" | "unknown";
  lastSyncTime: string | null;
  syncState: "idle" | "running" | "completed" | "partial" | "failed" | "unknown";
  connectionState: string;
  fetchedRecords: number | null;
  processedRecords: number | null;
  persistedRecords: number | null;
  indexedThisRun: number | null;
  failedRecords: number | null;
  skippedRecords: number | null;
  lastAttemptTime: string | null;
  pendingRecords: number | null;
  failureCategory?: string;
  endpoint?: { hostname: string; paths: string[] };
  error?: string;
  indexedError?: string;
};

export const SOURCE_CATALOG: Array<{ id: SourceId; displayName: string; image: string; href: string; dataMode: SourceMode }> = [
  { id: "confluence", displayName: "Confluence", image: "/img/confluence.png", href: "/documents", dataMode: "live" },
  { id: "jira", displayName: "Jira", image: "/img/jira.webp", href: "/tickets", dataMode: "demo" },
  { id: "slack", displayName: "Slack", image: "/img/slack.png", href: "/conversations", dataMode: "demo" },
  { id: "github", displayName: "GitHub", image: "/img/github.png", href: "/proactive-insights", dataMode: "demo" },
  { id: "people", displayName: "People Directory", image: "", href: "/people", dataMode: "live" },
];

export const DEMO_SOURCE_IDS = new Set<SourceId>();
export const DEMO_SOURCE_TOTALS: Record<"jira" | "slack", number> = {
  jira: DEMO_TICKETS.length,
  slack: DEMO_CONVERSATIONS.length,
};

/** Connectivity and ingestion are separate health dimensions; either can require attention. */
export function integrationNeedsAttention(source: Pick<SourceSummary, "connectionState" | "syncState" | "failedRecords">): boolean {
  return source.connectionState !== "Connected"
    || source.syncState === "idle"
    || source.syncState === "unknown"
    || source.syncState === "partial"
    || source.syncState === "failed"
    || (source.failedRecords ?? 0) > 0;
}

/** Returns one card-level warning while keeping connectivity separate from sync health. */
export function integrationWarning(source: Pick<SourceSummary, "connectionState" | "syncState" | "failedRecords" | "error">, transientError?: string): string {
  if (transientError) return transientError;
  if (source.connectionState !== "Connected") return source.error ?? `Connection check failed (${source.connectionState}).`;
  if (source.syncState === "partial") return source.error ?? `Partial sync: ${source.failedRecords ?? "Some"} record(s) failed or could not be indexed.`;
  if (source.syncState === "failed") return source.error ?? "The latest sync failed.";
  if ((source.failedRecords ?? 0) > 0) return source.error ?? `${source.failedRecords} record(s) failed in the latest sync.`;
  return source.error ?? "";
}

export function demoSourceSummary(id: "jira" | "slack", currentlyDisplayedRecords: number | null = null, syncState: SourceSummary["syncState"] = "idle"): SourceSummary {
  const source = SOURCE_CATALOG.find((item) => item.id === id)!;
  return {
    id, displayName: source.displayName, dataMode: "demo",
    totalAvailableRecords: DEMO_SOURCE_TOTALS[id], currentlyDisplayedRecords,
    verifiedIndexedRecordCount: null, readinessStatus: "available",
    lastSyncTime: null, lastAttemptTime: null, syncState, connectionState: "Demo data", fetchedRecords: null, processedRecords: null, persistedRecords: null, indexedThisRun: null, failedRecords: null, skippedRecords: null, pendingRecords: null,
  };
}

export function liveSourceSummary(id: "confluence" | "jira" | "slack" | "github", count: number | null, error?: string, currentlyDisplayedRecords: number | null = null, details: Partial<Pick<SourceSummary, "connectionState" | "fetchedRecords" | "processedRecords" | "persistedRecords" | "indexedThisRun" | "failedRecords" | "skippedRecords" | "pendingRecords" | "lastSyncTime" | "lastAttemptTime" | "syncState" | "failureCategory" | "endpoint" | "indexedError" | "dataMode">> = {}): SourceSummary {
  const source = SOURCE_CATALOG.find((item) => item.id === id)!;
  return {
    id, displayName: source.displayName, dataMode: source.dataMode,
    totalAvailableRecords: count, currentlyDisplayedRecords,
    verifiedIndexedRecordCount: count, readinessStatus: error ? "unavailable" : count === null ? "unknown" : "available",
    lastSyncTime: null, lastAttemptTime: null, syncState: "unknown", connectionState: "Checking", fetchedRecords: null, processedRecords: null, persistedRecords: null, indexedThisRun: null, failedRecords: null, skippedRecords: null, pendingRecords: null, ...details, ...(error ? { error } : {}),
  };
}

export function peopleSourceSummary(count: number | null): SourceSummary {
  return {
    id: "people", displayName: "People Directory", dataMode: "live",
    totalAvailableRecords: count, currentlyDisplayedRecords: null,
    verifiedIndexedRecordCount: null, readinessStatus: count === null ? "unknown" : "available",
    lastSyncTime: null, lastAttemptTime: null, syncState: "unknown", connectionState: "Unknown", fetchedRecords: null, processedRecords: null, persistedRecords: null, indexedThisRun: null, failedRecords: null, skippedRecords: null, pendingRecords: null,
  };
}

const liveSourceIds = ["confluence", "jira", "slack", "github"] as const;
const finiteCount = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export function integrationSummaries(response: IntegrationStatusResponse): Record<(typeof liveSourceIds)[number], SourceSummary> {
  const byId = new Map(response.sources.map((source) => [source.source, source]));
  return Object.fromEntries(liveSourceIds.map((id) => {
    const source = byId.get(id);
    if (!source) return [id, liveSourceSummary(id, null, "The backend did not return a status for this source.", null, { connectionState: "Unavailable", syncState: "failed" })];
    const legacy = source as typeof source & {
      indexedRecords?: unknown;
      connectionStatus?: unknown;
      lastSyncStatus?: unknown;
      lastError?: unknown;
      lastAttemptedSync?: unknown;
      connectorConfigured?: unknown;
    };
    const indexed = finiteCount(source.indexed) ?? finiteCount(legacy.indexedRecords);
    const rawConnection = source.connectionState ?? legacy.connectionStatus;
    const normalizedConnection = typeof rawConnection === "string" ? rawConnection.toLowerCase().replace(/[_\s]+/g, "-") : "";
    const connectionLabels: Record<string, string> = {
      connected: "Connected",
      "not-configured": "Not configured",
      "authentication-failed": "Authentication failed",
      "permission-missing": "Permission missing",
      syncing: "Syncing",
      "sync-failed": "Sync failed",
      unavailable: "Unavailable",
    };
    const connectionState = connectionLabels[normalizedConnection]
      ?? (typeof rawConnection === "string" && rawConnection.trim() ? rawConnection : "Unknown");
    const rawSyncState = source.syncState ?? legacy.lastSyncStatus;
    const normalizedSyncState = typeof rawSyncState === "string" ? rawSyncState.toLowerCase() : "unknown";
    const syncState: SourceSummary["syncState"] = normalizedSyncState === "empty" ? "completed"
      : (["idle", "running", "completed", "partial", "failed"] as const).find((state) => state === normalizedSyncState) ?? "unknown";
    const error = typeof source.error === "string" ? source.error : typeof legacy.lastError === "string" ? legacy.lastError : undefined;
    const lastSuccessfulSync = typeof source.lastSuccessfulSync === "string" ? source.lastSuccessfulSync : null;
    const attemptedAt = typeof source.attemptedAt === "string" ? source.attemptedAt : typeof legacy.lastAttemptedSync === "string" ? legacy.lastAttemptedSync : null;
    return [id, liveSourceSummary(id, indexed, error, null, {
      connectionState,
      fetchedRecords: finiteCount(source.fetched),
      processedRecords: finiteCount(source.processed),
      persistedRecords: finiteCount(source.persisted),
      indexedThisRun: finiteCount(source.indexedThisRun),
      failedRecords: finiteCount(source.failed),
      skippedRecords: finiteCount(source.skipped),
      pendingRecords: finiteCount(source.pending),
      lastAttemptTime: attemptedAt,
      lastSyncTime: lastSuccessfulSync,
      syncState,
      failureCategory: source.failureCategory,
      endpoint: source.endpoint,
      indexedError: source.indexedError,
      dataMode: source.sourceMode === "mock" ? "demo" : source.sourceMode === "live" || legacy.connectorConfigured === true ? "live" : SOURCE_CATALOG.find((item) => item.id === id)!.dataMode,
    })];
  })) as Record<(typeof liveSourceIds)[number], SourceSummary>;
}

export function unavailableIntegrationSummaries(message: string): Record<(typeof liveSourceIds)[number], SourceSummary> {
  return Object.fromEntries(liveSourceIds.map((id) => [id, liveSourceSummary(id, null, message, null, { connectionState: "Unavailable", syncState: "failed" })])) as Record<(typeof liveSourceIds)[number], SourceSummary>;
}
