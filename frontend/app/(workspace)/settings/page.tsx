"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, CloudDownload, LoaderCircle, RefreshCw } from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import type { IngestionResponse, IngestionSource } from "@/lib/types";

const integrations: Array<{ id: IngestionSource; name: string; detail: string; logo: string; logoAlt: string }> = [
  { id: "confluence", name: "Confluence", detail: "Knowledge pages · server credentials", logo: "/img/confluence.png", logoAlt: "Confluence logo" },
  { id: "slack", name: "Slack", detail: "Team conversations · live connector required", logo: "/img/slack.png", logoAlt: "Slack logo" },
  { id: "jira", name: "Jira", detail: "Issues and delivery · live connector required", logo: "/img/jira.webp", logoAlt: "Jira logo" },
  { id: "github", name: "GitHub", detail: "Repositories and pull requests · live connector required", logo: "/img/github.png", logoAlt: "GitHub logo" },
];

function integrationRecordPath(outcome: IngestionResponse["outcomes"][number]) {
  if (!outcome.entityId) return null;
  const type = outcome.route === "ticket-identification" ? "Ticket" : outcome.route === "feature-update" ? "Activity" : outcome.route === "document-indexing" ? "Document" : "Unknown";
  return `/org-graph?${type === "Ticket" || type === "Activity" ? "mode=product&" : ""}focus=${encodeURIComponent(outcome.entityId)}&type=${type}`;
}

function IntegrationCard({ integration }: { integration: (typeof integrations)[number] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestionResponse | null>(null);
  const [error, setError] = useState("");

  async function sync() {
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.processIngestion(integration.id)); }
    catch (cause) { setError(friendlyApiError(cause)); }
    finally { setLoading(false); }
  }

  return <article className="integration-setting" aria-label={`${integration.name} source`}>
    <div className="integration-setting-logo" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={integration.logo} alt={integration.logoAlt} />
    </div>
    <div className="integration-setting-copy">
      <b>{integration.name}</b><span>{integration.detail}</span>
      <span className="integration-status-badge" aria-live="polite"><span className={`integration-status-dot ${error ? "" : result?.status === "processed" ? "is-connected" : loading ? "is-busy" : ""}`} />{error ? "Unavailable" : loading ? "Fetching and processing" : result ? `${result.status} · ${result.fetchedDocumentCount} fetched` : integration.id === "confluence" ? "Server-side source · not yet synced" : "Live connector required"}</span>
      <button className="integration-action-btn is-connect" type="button" onClick={() => void sync()} disabled={loading} aria-label={`Fetch and process ${integration.name} records`}>
        {loading ? <LoaderCircle size={13} className="spin" /> : <CloudDownload size={13} />}{loading ? "Processing…" : "Fetch & process records"}
      </button>
    </div>
    {result && <div className="ingestion-result" aria-live="polite">
      <b>{result.outcomes.filter((item) => item.status === "processed").length} processed</b>
      <span>{result.outcomes.filter((item) => item.status === "unresolved").length} need review · {result.outcomes.filter((item) => item.status === "skipped").length} skipped · {result.outcomes.filter((item) => item.status === "failed").length} failed</span>
      {result.errors.map((item, index) => <span className="ingestion-error" key={`${index}:${item}`}><CircleAlert size={12} />{item}</span>)}
      {result.outcomes.slice(0, 4).map((outcome) => {
        const href = integrationRecordPath(outcome);
        return <div className="ingestion-outcome" key={`${outcome.sourceSystem}:${outcome.sourceRecordId}`}>
          <span className={`ingestion-status ${outcome.status}`}>{outcome.status}</span>
          {href ? <Link href={href}>{outcome.sourceRecordId} <ArrowUpRight size={10} /></Link> : <span>{outcome.sourceRecordId}</span>}
          {!!outcome.unresolvedReferences.length && <small>{outcome.unresolvedReferences.length} unresolved reference(s)</small>}
          {outcome.error && <small>{outcome.error}</small>}
        </div>;
      })}
      {result.outcomes.length > 4 && <small>Showing 4 of {result.outcomes.length} record outcomes.</small>}
      {result.status === "empty" && <span>No records were returned by the configured source.</span>}
    </div>}
    {error && <div className="ingestion-error" role="alert"><CircleAlert size={13} />{error}<button type="button" className="small-button" onClick={() => void sync()} disabled={loading}><RefreshCw size={11} /> Retry</button></div>}
  </article>;
}

export default function WorkspaceSettingsPage() {
  return <section className="workspace-settings" aria-labelledby="workspace-settings-title">
    <div className="workspace-settings-heading">
      <div><span className="eyebrow"><span className="eyebrow-mark" /> Workspace</span><h1 id="workspace-settings-title">Integrations</h1><p>Fetch backend sources and process returned records through the LangGraph ingestion workflow.</p></div>
      <span className="settings-demo-note">Confluence credentials remain server-side</span>
    </div>
    <div className="integration-settings-grid">{integrations.map((integration) => <IntegrationCard key={integration.id} integration={integration} />)}</div>
    <div className="settings-source-note"><span>Confluence uses the configured server-side API credentials. The documented Jira, GitHub, and Slack catalog routes currently return seeded fixtures; the backend refuses to write those records into FalkorDB. Configure live provider credentials and connector responses to populate their verified source pages.</span><Link href="/dashboard">Return to organization graph <ArrowUpRight size={13} /></Link></div>
  </section>;
}
