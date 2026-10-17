"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText, RefreshCw, Search, Ticket } from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import type { GraphApiNode, IngestionResponse, IngestionSource } from "@/lib/types";

type LibraryKind = "documents" | "tickets" | "conversations" | "insights";
const sourceConfig = {
  documents: { title: "Documentation", subtitle: "Search and inspect knowledge indexed from Confluence.", source: "confluence" as const, image: "/img/confluence.png", label: "Confluence", empty: "No Confluence pages have been indexed yet.", labels: ["Document"] },
  tickets: { title: "Tickets", subtitle: "Browse Jira issues processed into the company graph.", source: "jira" as const, image: "/img/jira.webp", label: "Jira", empty: "No Jira issues have been indexed yet.", labels: ["Ticket", "Bug"] },
  conversations: { title: "Conversations", subtitle: "Browse Slack messages and their indexed channel context.", source: "slack" as const, image: "/img/slack.png", label: "Slack", empty: "No Slack messages have been indexed yet.", labels: ["Message"] },
  insights: { title: "Proactive Insights", subtitle: "Review indexed GitHub pull requests, issues, and commits for current engineering context.", source: "github" as const, image: "/img/github.png", label: "GitHub", empty: "No GitHub records have been indexed yet.", labels: ["PullRequest", "Bug", "Commit"] },
} satisfies Record<LibraryKind, { title: string; subtitle: string; source: IngestionSource; image: string; label: string; empty: string; labels: string[] }>;

function timestamp(node: GraphApiNode) {
  const value = node.properties.updatedAt ?? node.properties.createdAt;
  if (typeof value !== "string") return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date not recorded" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function title(node: GraphApiNode) {
  const value = node.properties.title ?? node.properties.name ?? node.properties.summary ?? node.properties.key;
  return typeof value === "string" && value.trim() ? value : node.id;
}

export function SourceLibrary({ kind }: { kind: LibraryKind }) {
  const config = sourceConfig[kind];
  const [nodes, setNodes] = useState<GraphApiNode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = kind === "documents" ? await api.documents({ limit: 100 })
        : kind === "tickets" ? await api.tickets({ limit: 100 })
          : kind === "conversations" ? await api.conversations({ limit: 100 })
            : await api.proactiveInsights({ limit: 100 });
      const records = response.items;
      records.sort((a, b) => Date.parse(String(b.properties.updatedAt ?? b.properties.createdAt ?? "")) - Date.parse(String(a.properties.updatedAt ?? a.properties.createdAt ?? "")));
      setNodes(records);
      setTotal(response.total);
    } catch (cause) {
      setError(friendlyApiError(cause));
    } finally {
      setLoading(false);
    }
  }, [config.labels, config.source, kind]);

  useEffect(() => { void load(); }, [load]);

  async function syncSource() {
    setSyncing(true);
    setError("");
    setSyncMessage("");
    try {
      const result: IngestionResponse = await api.processIngestion(config.source, 100);
      const processed = result.outcomes.filter((item) => item.status === "processed").length;
      const failed = result.outcomes.filter((item) => item.status === "failed" || item.status === "unresolved").length;
      setSyncMessage(`${config.label} sync finished: ${processed} processed${failed ? `, ${failed} need attention` : ""}.`);
      await load();
      if (result.errors.length) setError(result.errors.join(" "));
    } catch (cause) {
      setError(friendlyApiError(cause));
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return nodes;
    return nodes.filter((node) => JSON.stringify(node.properties).toLowerCase().includes(term));
  }, [nodes, search]);

  return <section className="source-library">
    <header className="page-heading source-library-heading">
      <div><div className="source-library-brand"><Image src={config.image} alt="" width={30} height={30} /><span>{config.label} source</span></div><h1>{config.title}</h1><p>{config.subtitle}</p></div>
      <button className="button-primary source-sync-button" type="button" onClick={() => void syncSource()} disabled={syncing || loading}><RefreshCw size={14} className={syncing ? "source-spin" : ""} />{syncing ? "Syncing…" : `Sync ${config.label}`}</button>
    </header>

    <div className="source-library-toolbar">
      <label className="source-library-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind === "documents" ? "documentation" : "issues"}…`} /></label>
      <span>{loading ? "Loading records…" : `${filtered.length} shown · ${total} verified indexed`}</span>
    </div>

    <div className="source-library-stats" aria-label={`${config.label} statistics`}>
      <div><small>Verified indexed records</small><b>{loading ? "—" : total}</b></div>
      <div><small>Showing</small><b>{loading ? "—" : filtered.length}</b></div>
      <div><small>Source</small><b>{config.label}</b></div>
    </div>

    {error && <div className="source-library-alert" role="alert"><b>Could not load source records.</b><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
    {syncMessage && <div className="source-library-success" role="status">{syncMessage}</div>}
    {loading ? <div className="source-library-state"><span className="spinner" />Loading {config.label} records…</div> : !error && filtered.length === 0 ? <div className="source-library-state"><span className="source-library-state-icon">{kind === "documents" ? <FileText size={20} /> : <Ticket size={20} />}</span><b>{search ? "No matching records" : config.empty}</b><span>{search ? "Try another search term." : `Connect or sync ${config.label} from the Integrations page to populate this list.`}</span><Link href="/integrations">Open integrations <ArrowUpRight size={13} /></Link></div> : <div className="source-record-list">{filtered.map((node) => {
      const recordTitle = title(node);
      const recordType = node.labels.find((label) => config.labels.includes(label)) ?? config.label;
      const excerpt = String(node.properties.summary ?? node.properties.description ?? node.properties.content ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const issueKey = node.properties.sourceRecordId ?? node.properties.key;
      return <article className="source-record-card" key={node.id}>
        <div className="source-record-icon"><Image src={config.image} alt="" width={26} height={26} /></div>
        <div className="source-record-body"><div className="source-record-meta"><span className={`source-pill ${config.source}`}>{config.label}</span><span>{recordType}</span>{typeof issueKey === "string" && <span>{issueKey}</span>}<span>{timestamp(node)}</span></div><h2>{recordTitle}</h2>{excerpt && <p>{excerpt.slice(0, 360)}{excerpt.length > 360 ? "…" : ""}</p>}</div>
        <Link className="source-record-open" href={`/org-graph?mode=${kind === "tickets" && node.properties.graphDomain === "product-progress" ? "product" : "team"}&focus=${encodeURIComponent(node.id)}&type=${encodeURIComponent(recordType)}`} aria-label={`Open ${recordTitle} in the knowledge graph`}><ArrowUpRight size={16} /></Link>
      </article>;
    })}</div>}
  </section>;
}
