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

/** Summarizes the latest run without treating connectivity alone as a successful sync. */
export function integrationSyncLabel(source: Omit<Pick<SourceSummary, "connectionState" | "syncState" | "failedRecords" | "fetchedRecords" | "processedRecords" | "persistedRecords" | "skippedRecords">, "syncState"> & { syncState: SourceSummary["syncState"] | "empty" }): string {
  if (source.connectionState === "Not configured") return "Not configured";
  if (source.syncState === "failed") return "Sync failed";
  if (source.syncState === "partial") return "Partial sync";
  const incomplete = (source.failedRecords ?? 0) > 0
    || (source.skippedRecords ?? 0) > 0
    || (source.fetchedRecords !== null && source.processedRecords !== null && source.processedRecords < source.fetchedRecords)
    || (source.processedRecords !== null && source.persistedRecords !== null && source.persistedRecords < source.processedRecords);
  if (incomplete) return "Partial sync";
  if (source.syncState === "completed" || source.syncState === "empty") return "Sync completed";
  if (source.syncState === "running") return "Syncing";
  return "No sync recorded";
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
export function integrationSummaries(response: IntegrationStatusResponse): Record<(typeof liveSourceIds)[number], SourceSummary> {
  const byId = new Map(response.sources.map((source) => [source.source, source]));
  return Object.fromEntries(liveSourceIds.map((id) => {
    const source = byId.get(id);
    if (!source) return [id, liveSourceSummary(id, null, "The backend did not return a status for this source.", null, { connectionState: "Unavailable", syncState: "failed" })];
    return [id, liveSourceSummary(id, source.indexed, source.error, null, {
      connectionState: source.connectionState,
      fetchedRecords: source.fetched,
      processedRecords: source.processed,
      persistedRecords: source.persisted ?? null,
      indexedThisRun: source.indexedThisRun ?? null,
      failedRecords: source.failed,
      skippedRecords: source.skipped,
      pendingRecords: source.pending,
      lastAttemptTime: source.attemptedAt ?? null,
      lastSyncTime: source.lastSuccessfulSync,
    syncState: source.syncState === "empty" ? "completed" : source.syncState,
      failureCategory: source.failureCategory,
      endpoint: source.endpoint,
      indexedError: source.indexedError,
      dataMode: source.sourceMode === "mock" ? "demo" : source.sourceMode === "live" ? "live" : SOURCE_CATALOG.find((item) => item.id === id)!.dataMode,
    })];
  })) as Record<(typeof liveSourceIds)[number], SourceSummary>;
}

export function unavailableIntegrationSummaries(message: string): Record<(typeof liveSourceIds)[number], SourceSummary> {
  return Object.fromEntries(liveSourceIds.map((id) => [id, liveSourceSummary(id, null, message, null, { connectionState: "Unavailable", syncState: "failed" })])) as Record<(typeof liveSourceIds)[number], SourceSummary>;
}
