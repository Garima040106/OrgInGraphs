"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileText, RefreshCw, Search, Ticket } from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import type { GraphApiNode, IntegrationSyncResponse, IngestionSource } from "@/lib/types";
import { liveSourceSummary } from "@/lib/source-data";

type LibraryKind = "documents" | "tickets" | "conversations" | "insights";
const sourceConfig = {
  documents: { title: "Documentation", subtitle: "Search and inspect knowledge indexed from Confluence.", source: "confluence" as const, image: "/img/confluence.png", label: "Confluence", empty: "No Confluence pages have been indexed yet.", labels: ["Document"] },
  tickets: { title: "Tickets", subtitle: "Browse seeded Jira mock issues processed into the company graph.", source: "jira" as const, image: "/img/jira.webp", label: "Jira", empty: "No Jira mock issues have been indexed yet.", labels: ["Ticket", "Bug"] },
  conversations: { title: "Conversations", subtitle: "Browse seeded Slack mock messages and their indexed channel context.", source: "slack" as const, image: "/img/slack.png", label: "Slack", empty: "No Slack mock messages have been indexed yet.", labels: ["Message"] },
  insights: { title: "Proactive Insights", subtitle: "Review seeded GitHub mock pull requests, issues, and commits for engineering context.", source: "github" as const, image: "/img/github.png", label: "GitHub", empty: "No GitHub mock records have been indexed yet.", labels: ["PullRequest", "Bug", "Commit"] },
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

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["displayName", "name", "key", "login", "email"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return undefined;
}

function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch { return undefined; }
}

export function SourceLibrary({ kind }: { kind: LibraryKind }) {
  const config = sourceConfig[kind];
  const [nodes, setNodes] = useState<GraphApiNode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 20;
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = { q: query || undefined, limit: pageSize, offset, signal };
      const response = kind === "documents" ? await api.documents(params)
        : kind === "tickets" ? await api.tickets(params)
          : kind === "conversations" ? await api.conversations(params)
            : await api.proactiveInsights({ q: params.q, limit: params.limit, offset: params.offset });
      setNodes(response.items);
      setTotal(response.total);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(friendlyApiError(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [kind, offset, query]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function syncSource() {
    setSyncing(true);
    setError("");
    setSyncMessage("");
    try {
      const result: IntegrationSyncResponse = await api.syncIntegration(config.source, 1000);
      setSyncMessage(`${config.label} sync finished: ${result.fetched} fetched, ${result.processed} processed, ${result.indexed} indexed${result.failed ? `, ${result.failed} failed` : ""}.`);
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
  const sourceSummary = liveSourceSummary(config.source, total, error || undefined, filtered.length);
  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <section className="source-library">
    <header className="page-heading source-library-heading">
      <div><div className="source-library-brand"><Image src={config.image} alt="" width={30} height={30} /><span>{config.label} source · <b className="demo-data-label">{kind === "documents" ? "Live provider" : "Mock demo data"}</b></span></div><h1>{config.title}</h1><p>{config.subtitle}</p></div>
      <button className="button-primary source-sync-button" type="button" onClick={() => void syncSource()} disabled={syncing || loading}><RefreshCw size={14} className={syncing ? "source-spin" : ""} />{syncing ? "Syncing…" : `Sync ${config.label}`}</button>
    </header>

    <div className="source-library-toolbar">
      <label className="source-library-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind === "documents" ? "documentation" : "issues"}…`} /></label>
      <span>{loading ? "Loading records…" : error ? `${filtered.length} shown · verified index unavailable` : `${filtered.length} shown · ${total} verified indexed`}</span>
    </div>

    <div className="source-library-stats" aria-label={`${config.label} statistics`}>
      <div><small>{error ? "Verified index unavailable" : "Verified indexed records"}</small><b>{loading || error ? "—" : sourceSummary?.verifiedIndexedRecordCount ?? total}</b></div>
      <div><small>Showing</small><b>{loading ? "—" : filtered.length}</b></div>
      <div><small>Data mode</small><b>{kind === "documents" ? `Live · ${config.label}` : `Mock demo · ${config.label}`}</b></div>
    </div>

    {error && <div className="source-library-alert" role="alert"><b>Could not load source records.</b><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <div className="source-library-state"><span className="spinner" />Loading {config.label} records…</div> : nodes.length === 0 ? <div className="source-library-state"><span className="source-library-state-icon">{kind === "documents" ? <FileText size={20} /> : <Ticket size={20} />}</span><b>{error ? `${config.label} records are unavailable` : query ? "No matching records" : config.empty}</b><span>{error ? "The backend could not return records. Use Refresh records to try again." : query ? "Try another search term." : kind === "tickets" ? "Only verified Jira issues are shown. The current Jira connector returns seeded records marked with rawSeedId, so they are excluded until the connector returns verified live issues." : "Only verified records are shown. No verified records are currently available from the backend."}</span></div> : <div className="source-record-list">{nodes.map((node) => {
      const recordTitle = title(node);
      const recordType = node.labels.find((label) => config.labels.includes(label)) ?? config.label;
      const excerpt = String(node.properties.summary ?? node.properties.description ?? node.properties.content ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const issueKey = node.properties.sourceRecordId ?? node.properties.key;
      const focusType = recordType;
      const focusUrl = `/org-graph?mode=${kind === "tickets" && node.properties.graphDomain === "product-progress" ? "product" : "team"}&focus=${encodeURIComponent(node.id)}&type=${encodeURIComponent(focusType)}${kind === "documents" ? `&from=documents&sourceId=${encodeURIComponent(String(issueKey ?? node.id))}&sourceSystem=${encodeURIComponent(String(node.properties.sourceSystem ?? config.label))}` : ""}`;
      return <Link className="source-record-card source-record-card-link" href={focusUrl} key={node.id} aria-label={`Open ${recordTitle} in the knowledge graph`}>
        <div className="source-record-icon"><Image src={config.image} alt="" width={26} height={26} /></div>
        <div className="source-record-body"><div className="source-record-meta"><span className={`source-pill ${config.source}`}>{config.label}</span><span>{recordType}</span>{typeof issueKey === "string" && <span>{issueKey}</span>}<span>{timestamp(node)}</span></div><h2>{recordTitle}</h2>{excerpt && <p>{excerpt.slice(0, 360)}{excerpt.length > 360 ? "…" : ""}</p>}</div>
        <span className="source-record-open" aria-hidden="true"><ArrowUpRight size={16} /></span>
      </Link>;
    })}</div>}
    {!loading && !error && total > pageSize && <nav className="source-library-pagination" aria-label={`${config.label} record pages`}><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}><ArrowLeft size={13}/>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)}>Next<ArrowRight size={13}/></button></nav>}
  </section>;
}
