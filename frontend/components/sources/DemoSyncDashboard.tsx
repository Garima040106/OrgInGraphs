"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Check, Clock3, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, friendlyApiError } from "@/lib/api";
import { integrationNeedsAttention, integrationWarning, SOURCE_CATALOG } from "@/lib/source-data";
import { useLiveSourceData } from "@/lib/useLiveSourceData";
import type { IngestionSource, IntegrationSyncResponse } from "@/lib/types";

const providers: IngestionSource[] = ["confluence", "jira", "slack", "github"];
type LocalFailure = { message: string; attemptedAt: string };

function timestamp(value: string | null) {
  if (!value) return "No successful sync";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function conciseError(source: IngestionSource, error: string | undefined, category: string | undefined) {
  if (category === "dns" || /ENOTFOUND|could not be resolved/i.test(error ?? "")) {
    return source === "confluence" ? "Could not resolve the configured Confluence hostname." : "Could not resolve the configured mock API hostname.";
  }
  if (category === "tls") return "Could not establish a secure connection to this provider.";
  if (category === "timeout") return "The provider check timed out. Try again.";
  if (category === "authentication") return "The provider rejected the configured authentication.";
  if (category === "permission") return "The provider denied access. Check the configured account permissions.";
  if (category === "configuration") return "This provider is not configured yet.";
  if (category === "connection") return source === "confluence" ? "Could not reach Confluence." : "Could not reach the configured mock API.";
  return error || "The connection check failed. Refresh status to try again.";
}

function statusTone(connection: string) {
  if (connection === "Connected" || connection === "Mock API reachable") return "connected";
  if (connection === "Checking") return "checking";
  if (connection === "Syncing") return "syncing";
  if (connection === "Not configured") return "not-configured";
  return "failed";
}

export function DemoSyncDashboard() {
  const { sources, loading, error, refresh } = useLiveSourceData();
  const [running, setRunning] = useState<IngestionSource | null>(null);
  const [syncResults, setSyncResults] = useState<Partial<Record<IngestionSource, IntegrationSyncResponse>>>({});
  const [syncFailures, setSyncFailures] = useState<Partial<Record<IngestionSource, LocalFailure>>>({});

  async function sync(source: IngestionSource) {
    setRunning(source);
    setSyncFailures((current) => ({ ...current, [source]: undefined }));
    try {
      const result = await api.syncIntegration(source, 1000);
      setSyncResults((current) => ({ ...current, [source]: result }));
      await refresh();
    } catch (cause) {
      setSyncResults((current) => {
        const next = { ...current };
        delete next[source];
        return next;
      });
      setSyncFailures((current) => ({ ...current, [source]: { message: friendlyApiError(cause), attemptedAt: new Date().toISOString() } }));
      await refresh();
    } finally {
      setRunning(null);
    }
  }

  const connected = providers.filter((id) => sources[id].connectionState === "Connected").length;
  const attention = loading ? null : providers.filter((id) => integrationNeedsAttention(sources[id])).length;
  const indexedCountsAvailable = !loading && providers.every((id) => sources[id].verifiedIndexedRecordCount !== null);
  const totalIndexed = indexedCountsAvailable
    ? providers.reduce((total, id) => total + (sources[id].verifiedIndexedRecordCount ?? 0), 0)
    : null;
  const activity = providers.flatMap((id) => {
    const result = syncResults[id];
    const failure = syncFailures[id];
    const summary = sources[id];
    return result || failure || summary.lastAttemptTime ? [{ id, result, failure, summary }] : [];
  }).sort((a, b) => (b.result?.attemptedAt ?? b.failure?.attemptedAt ?? b.summary.lastAttemptTime ?? "").localeCompare(a.result?.attemptedAt ?? a.failure?.attemptedAt ?? a.summary.lastAttemptTime ?? ""));

  return <section className="source-library demo-sync-page">
    <header className="page-heading source-library-heading demo-sync-heading">
      <div><div className="source-library-brand"><span className="demo-data-label">Live integration status</span></div><h1>Sync &amp; Data</h1><p>Monitor connections and manage verified data syncs across your connected tools.</p></div>
      <button className="small-button" type="button" onClick={() => void refresh()} disabled={loading || running !== null}><RefreshCw size={13} className={loading ? "source-spin" : ""} />{loading ? "Refreshing…" : "Refresh status"}</button>
    </header>

    <section className="demo-sync-overview" aria-label="Integration overview">
      <div><span>Total integrations</span><b>4</b><small>1 live provider · 3 mock/demo</small></div>
      <div><span>API reachable</span><b>{loading ? "—" : connected}</b><small>{loading ? "Checking status" : "Connectivity only"}</small></div>
      <div><span>Need attention</span><b>{attention === null ? "—" : attention}</b><small>{loading ? "Checking status" : attention === 0 ? "No sync failures reported" : "Connection or sync needs review"}</small></div>
      <div><span>Indexed records</span><b>{loading ? "—" : totalIndexed ?? "Unavailable"}</b><small>Cumulative verified source records</small></div>
    </section>

    {error && <div className="source-library-alert demo-sync-global-error" role="alert"><AlertTriangle size={16} /><b>Could not refresh integration status.</b><span>{error}</span><button type="button" onClick={() => void refresh()}>Try again</button></div>}

    <div className="demo-sync-grid">
      {providers.map((id) => {
        const source = SOURCE_CATALOG.find((item) => item.id === id)!;
        const summary = sources[id];
        const result = syncResults[id];
        const failure = syncFailures[id];
        const connection = summary.connectionState;
        const syncState = running === id ? "running" : result?.syncState ?? summary.syncState;
        const transientError = failure?.message ?? result?.error;
        const issue = integrationWarning(summary, transientError);
        const connectivityIssue = connection !== "Connected" ? conciseError(id, summary.error, summary.failureCategory) : "";
        const status = loading ? "Checking" : connection === "Connected" && summary.dataMode === "demo" ? "Mock API reachable" : connection;
        const syncLabel = syncState === "partial" || (result?.failed ?? summary.failedRecords ?? 0) > 0 ? "Partial sync" : syncState === "failed" ? "Sync failed" : syncState === "completed" ? "Sync completed" : syncState === "running" ? "Syncing" : "No sync recorded";
        const showCount = (value: number | null | undefined) => value ?? (loading ? "—" : "No run");
        const lastAttempt = result?.attemptedAt ?? summary.lastAttemptTime;
        const lastSuccess = result?.lastSuccessfulSync ?? summary.lastSyncTime;
        const errorSummary = transientError ?? summary.error;
        return <article className="demo-sync-card" key={id}>
          <div className="demo-sync-card-heading">
            <span className="source-record-icon"><Image src={source.image} alt="" width={25} height={25} /></span>
            <div><b>{source.displayName}</b><small>{summary.dataMode === "demo" ? "Seeded mock data · not a live account" : "Live provider"}</small></div>
            <span className={`demo-status demo-status-${statusTone(status)}`}>{status}</span>
          </div>

          <div className="demo-sync-metrics">
            <div><small>Cumulative distinct indexed</small><b>{loading ? "—" : summary.verifiedIndexedRecordCount ?? "Unavailable"}</b></div>
            <div><small>Latest attempt</small><b className="demo-sync-date">{lastAttempt ? timestamp(lastAttempt) : loading ? "Checking" : "Not recorded"}</b></div>
            <div><small>Last successful sync</small><b className="demo-sync-date">{timestamp(lastSuccess)}</b></div>
            <div><small>Latest run status</small><b>{loading ? "Checking" : syncLabel}</b></div>
            <div><small>Latest run · fetched</small><b>{showCount(result?.fetched ?? summary.fetchedRecords)}</b></div>
            <div><small>Latest run · processed</small><b>{showCount(result?.processed ?? summary.processedRecords)}</b></div>
            <div><small>Latest run · persisted</small><b>{showCount(result?.persisted ?? summary.persistedRecords)}</b></div>
            <div><small>Latest run · indexed this run</small><b>{showCount(result?.indexedThisRun ?? summary.indexedThisRun)}</b></div>
            <div><small>Latest run · failed</small><b>{showCount(result?.failed ?? summary.failedRecords)}</b></div>
            <div><small>Latest run · skipped</small><b>{showCount(result?.skipped ?? summary.skippedRecords)}</b></div>
          </div>

          <div className={`demo-sync-connection ${issue ? "has-error" : ""}`} role={issue ? "alert" : "status"}>
            {issue ? <AlertTriangle size={15} aria-hidden="true" /> : connection === "Connected" ? <Check size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
            <span>{loading ? "Checking provider connection…" : issue || `${summary.dataMode === "demo" ? `Mock API ${connection === "Connected" ? "reachable" : connection.toLowerCase()}` : `Connection ${connection.toLowerCase()}`}. ${syncLabel}.`}</span>
          </div>

          <details className="demo-sync-details">
            <summary>Status details</summary>
            {summary.endpoint && <div className="demo-sync-endpoint"><b>Configured endpoint</b><span>{summary.endpoint.hostname}</span><code>{summary.endpoint.paths.join(" · ")}</code></div>}
            <p><b>Latest attempt:</b> {lastAttempt ? timestamp(lastAttempt) : "Not recorded"}</p>
            <p><b>Connectivity:</b> {status}</p>
            <p><b>Sync health:</b> {syncLabel}</p>
            <p><b>Run stages:</b> {showCount(result?.fetched ?? summary.fetchedRecords)} fetched · {showCount(result?.processed ?? summary.processedRecords)} processed · {showCount(result?.persisted ?? summary.persistedRecords)} persisted · {showCount(result?.indexedThisRun ?? summary.indexedThisRun)} indexed this run · {showCount(result?.failed ?? summary.failedRecords)} failed · {showCount(result?.skipped ?? summary.skippedRecords)} skipped</p>
            <p><b>Cumulative distinct indexed:</b> {summary.verifiedIndexedRecordCount ?? "Unavailable"}</p>
            {summary.failureCategory && <p><b>Failure category:</b> {summary.failureCategory}</p>}
            {errorSummary && <p><b>Error summary:</b> {errorSummary}</p>}
            {summary.indexedError && <p><b>Indexed count:</b> {summary.indexedError}</p>}
            {connectivityIssue && <button type="button" className="demo-sync-retry" onClick={() => void refresh()} disabled={loading || running !== null}><RefreshCw size={12} />Retry connection check</button>}
          </details>

          <div className="demo-sync-actions">
            <button className="button-primary source-sync-button" type="button" disabled={loading || running !== null || connection !== "Connected"} onClick={() => void sync(id)}><RefreshCw size={14} className={running === id ? "source-spin" : ""} />{running === id ? "Syncing…" : `Sync ${source.displayName}`}</button>
            <Link className="small-button demo-open-source" href={source.href}>Open records</Link>
          </div>
        </article>;
      })}
    </div>

    <section className="demo-activity-section">
      <div className="demo-activity-heading"><div><h2>Latest sync activity</h2><p>The latest attempt per source is retained in the graph-backed integration status.</p></div></div>
      {activity.length ? <div className="demo-activity-list">{activity.map(({ id, result, failure, summary }) => {
        const source = SOURCE_CATALOG.find((item) => item.id === id)!;
        const state = result?.syncState ?? summary.syncState;
        const failed = Boolean(failure || state === "failed" || state === "partial");
        const activityTime = result?.attemptedAt ?? summary.lastAttemptTime ?? failure?.attemptedAt ?? null;
        const resultSummary = result
          ? `${result.fetched ?? "—"} fetched · ${result.processed ?? "—"} processed · ${result.persisted ?? "—"} persisted · ${result.indexedThisRun ?? "—"} indexed this run · ${result.indexed ?? "Unavailable"} total indexed · ${result.skipped ?? "—"} skipped · ${result.failed ?? "—"} failed`
          : `${summary.fetchedRecords ?? "—"} fetched · ${summary.processedRecords ?? "—"} processed · ${summary.persistedRecords ?? "—"} persisted · ${summary.indexedThisRun ?? "—"} indexed this run · ${summary.verifiedIndexedRecordCount ?? "Unavailable"} total indexed · ${summary.skippedRecords ?? "—"} skipped · ${summary.failedRecords ?? "—"} failed`;
        return <article className="demo-activity-row" key={id}>
          <span className="source-record-icon"><Image src={source.image} alt="" width={22} height={22} /></span>
          <b className="demo-activity-provider">{source.displayName}</b>
          <span className={`demo-status demo-status-${failed ? "failed" : "connected"}`}>{state === "partial" ? "Partial" : state === "failed" ? "Failed" : state === "completed" ? "Completed" : "Running"}</span>
          <span className="demo-activity-result">{failure?.message ?? result?.error ?? summary.error ?? resultSummary}</span>
          <time>{activityTime ? timestamp(activityTime) : "Time unavailable"}</time>
        </article>;
      })}</div> : <div className="demo-activity-empty">No sync attempts in this session yet.</div>}
    </section>
  </section>;
}
