"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileText, RefreshCw, Search, Ticket } from "lucide-react";
import { api, friendlyApiError } from "@/lib/api";
import type { GraphApiNode, IngestionSource } from "@/lib/types";

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

  useEffect(() => {
    const timer = setTimeout(() => { setOffset(0); setQuery(search.trim()); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <section className="source-library">
    <header className="page-heading source-library-heading">
      <div><div className="source-library-brand"><Image src={config.image} alt="" width={30} height={30} /><span>{config.label} source</span></div><h1>{config.title}</h1><p>{config.subtitle}</p></div>
      <button className="small-button source-sync-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "source-spin" : ""} />Refresh records</button>
    </header>

    <div className="source-library-toolbar">
      <label className="source-library-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${config.label} records…`} aria-label={`Search ${config.label} records`} /></label>
      <span>{loading ? "Loading records…" : total ? `${offset + 1}–${Math.min(offset + nodes.length, total)} of ${total} verified indexed` : "0 verified indexed records"}</span>
    </div>

    <div className="source-library-stats" aria-label={`${config.label} statistics`}>
      <div><small>Verified indexed records</small><b>{loading ? "—" : total}</b></div>
      <div><small>Showing</small><b>{loading ? "—" : nodes.length}</b></div>
      <div><small>Source</small><b>{config.label}</b></div>
    </div>

    {error && <div className="source-library-alert" role="alert"><b>Could not load source records.</b><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <div className="source-library-state"><span className="spinner" />Loading {config.label} records…</div> : nodes.length === 0 ? <div className="source-library-state"><span className="source-library-state-icon">{kind === "documents" ? <FileText size={20} /> : <Ticket size={20} />}</span><b>{error ? `${config.label} records are unavailable` : query ? "No matching records" : config.empty}</b><span>{error ? "The backend could not return records. Use Refresh records to try again." : query ? "Try another search term." : kind === "tickets" ? "Only verified Jira issues are shown. The current Jira connector returns seeded records marked with rawSeedId, so they are excluded until the connector returns verified live issues." : "Only verified records are shown. No verified records are currently available from the backend."}</span></div> : <div className="source-record-list">{nodes.map((node) => {
      const recordTitle = title(node);
      const recordType = node.labels.find((label) => config.labels.includes(label)) ?? config.label;
      const excerpt = String(node.properties.summary ?? node.properties.description ?? node.properties.content ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot);/g, " ").replace(/\s+/g, " ").trim();
      const issueKey = node.properties.issueKey ?? node.properties.key ?? node.properties.sourceRecordId;
      const sourceUrl = safeSourceUrl(node.properties.externalUrl ?? node.properties.sourceUrl);
      const fields = kind === "documents"
        ? [["Space", textValue(node.properties.spaceName ?? node.properties.spaceKey ?? node.properties.space)], ["Author", textValue(node.properties.authorName ?? node.properties.author)]]
        : kind === "tickets"
          ? [["Project", textValue(node.properties.projectName ?? node.properties.project)], ["Status", textValue(node.properties.originalStatus ?? node.properties.status)], ["Priority", textValue(node.properties.originalPriority ?? node.properties.priority)], ["Assignee", textValue(node.properties.assigneeName ?? node.properties.assignee)], ["Reporter", textValue(node.properties.reporterName ?? node.properties.reporter)]]
          : kind === "conversations"
            ? [["Channel", textValue(node.properties.channelName)], ["Author", textValue(node.properties.authorName ?? node.properties.userName)], ["Replies", textValue(node.properties.replyCount ?? node.properties.threadReplyCount)]]
            : [["Repository", textValue(node.properties.repository)], ["Status", textValue(node.properties.status)], ["Author", textValue(node.properties.authorName ?? node.properties.authorLogin)]];
      return <article className="source-record-card" key={node.id}>
        <div className="source-record-icon"><Image src={config.image} alt="" width={26} height={26} /></div>
        <div className="source-record-body"><div className="source-record-meta"><span className={`source-pill ${config.source}`}>{config.label}</span><span>{recordType}</span>{typeof issueKey === "string" && <span>{issueKey}</span>}<span>{timestamp(node)}</span></div><h2>{recordTitle}</h2>{fields.some(([, value]) => value) && <dl className="source-record-fields">{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{excerpt && <p>{excerpt.slice(0, 360)}{excerpt.length > 360 ? "…" : ""}</p>}</div>
        {sourceUrl ? <a className="source-record-open" href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${recordTitle} in ${config.label}`}><ArrowUpRight size={16} /></a> : <Link className="source-record-open" href={`/org-graph?mode=${kind === "tickets" && node.properties.graphDomain === "product-progress" ? "product" : "team"}&focus=${encodeURIComponent(node.id)}&type=${encodeURIComponent(recordType)}`} aria-label={`Open ${recordTitle} in the knowledge graph`}><ArrowUpRight size={16} /></Link>}
      </article>;
    })}</div>}
    {!loading && !error && total > pageSize && <nav className="source-library-pagination" aria-label={`${config.label} record pages`}><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}><ArrowLeft size={13}/>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)}>Next<ArrowRight size={13}/></button></nav>}
  </section>;
}
