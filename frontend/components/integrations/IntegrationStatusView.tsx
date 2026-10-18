"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, RefreshCw } from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import type { IntegrationStatusResponse, IngestionSource } from "@/lib/types";

const providers: Array<{ id: IngestionSource; name: string; image: string; href: string; details: string }> = [
  { id: "confluence", name: "Confluence", image: "/img/confluence.png", href: "/documents", details: "Company documentation and knowledge pages" },
  { id: "jira", name: "Jira", image: "/img/jira.webp", href: "/tickets", details: "Issues, projects, status and assignment metadata" },
  { id: "slack", name: "Slack", image: "/img/slack.png", href: "/conversations", details: "Indexed messages and channel context" },
  { id: "github", name: "GitHub", image: "/img/github.png", href: "/proactive-insights", details: "Pull requests, issues and commits" },
];
const displayTime = (value: string | null | undefined) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not available" : date.toLocaleString();
};
const connectionLabel = (value: string | undefined) => value ?? "Not tested";

export function IntegrationStatusView({ syncPage = false, title }: { syncPage?: boolean; title?: string }) {
  const [result, setResult] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try { setResult(await api.integrationStatus(signal)); }
    catch (cause) { if (!signal?.aborted) setError(friendlyApiError(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return <section className="integration-status-page">
    <header className="page-heading">
      <div><span className="bento-kicker">{syncPage ? "Synchronization" : "Provider connections"}</span><h1>{title ?? (syncPage ? "Sync & Data" : "Integrations")}</h1><p>{syncPage ? "Review backend connector configuration and indexed source counts." : "Provider data is fetched and normalized by the backend before it appears in the workspace."}</p></div>
      <button className="small-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={13} className={loading ? "source-spin" : ""} />Refresh status</button>
    </header>

    {error && <div className="source-library-alert" role="alert"><CircleAlert size={15}/><b>Integration status unavailable.</b><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}
    {!error && result && <div className="integration-status-notice" role="note">
      <b>Synchronization requires backend operator authorization.</b>
      <span>The demo login does not authenticate users, so this browser cannot safely start privileged provider syncs. Authorized backend sync runs are recorded here with sanitized outcomes.</span>
    </div>}

    <div className="integration-status-grid" aria-busy={loading}>
      {providers.map((provider) => {
        const status = result?.sources.find((source) => source.source === provider.id);
        return <article className="integration-status-card" key={provider.id}>
          <div className="integration-status-card-head"><Image src={provider.image} alt="" width={34} height={34}/><div><h2>{provider.name}</h2><p>{provider.details}</p></div></div>
          <dl>
            <div><dt>Integration mode</dt><dd>{provider.id === "confluence" ? "Live provider" : "Mock/demo source"}</dd></div>
            <div><dt>Connector reachability</dt><dd>{loading ? "Checking…" : connectionLabel(status?.connectionState)}</dd></div>
            <div><dt>Verified indexed records</dt><dd>{loading ? "—" : status?.indexed === null || status?.indexed === undefined ? "Unavailable" : status.indexed.toLocaleString()}</dd></div>
            <div><dt>Latest sync</dt><dd>{loading ? "Checking…" : status?.syncState ?? "Unknown"}</dd></div>
            <div><dt>Last successful sync</dt><dd>{displayTime(status?.lastSuccessfulSync)}</dd></div>
            <div><dt>Last attempt</dt><dd>{displayTime(status?.attemptedAt)}</dd></div>
            {status?.fetched !== null && status?.fetched !== undefined && <div><dt>Latest run counts</dt><dd>{status.fetched} fetched · {status.processed ?? 0} processed · {status.persisted ?? 0} persisted/indexed · {status.skipped ?? 0} skipped · {status.failed ?? 0} failed</dd></div>}
          </dl>
          {status?.error && <p className="integration-status-error" role="status">{status.error}</p>}
          {status?.indexedError && <p className="integration-status-error" role="status">{status.indexedError}</p>}
          <div className="integration-status-card-footer"><Link href={provider.href}>View indexed records <ArrowUpRight size={13}/></Link><span>Browser sync unavailable</span></div>
        </article>;
      })}
    </div>
  </section>;
}
