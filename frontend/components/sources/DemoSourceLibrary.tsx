"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Search, X } from "lucide-react";
import { DEMO_CONVERSATIONS, DEMO_TICKETS, filterDemoConversations, filterDemoTickets } from "@/lib/demo-data";
import { demoSourceSummary } from "@/lib/source-data";
import { useDemoSyncState } from "@/lib/demo-sync-state";

type DemoKind = "tickets" | "conversations";

export function DemoSourceLibrary({ kind }: { kind: DemoKind }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [selected, setSelected] = useState<(typeof DEMO_TICKETS)[number] | (typeof DEMO_CONVERSATIONS)[number] | null>(null);
  const tickets = kind === "tickets";
  const rows = useMemo(() => {
    if (tickets) return filterDemoTickets(search, statusFilter, priorityFilter);
    return filterDemoConversations(search);
  }, [search, tickets, statusFilter, priorityFilter]);
  const label = tickets ? "Jira" : "Slack";
  const demoSync = useDemoSyncState();
  const currentSyncState = demoSync.statuses[tickets ? "jira" : "slack"] ?? "Not run";
  const summary = demoSourceSummary(tickets ? "jira" : "slack", rows.length, currentSyncState === "Not run" ? "idle" : currentSyncState.toLowerCase() as "running" | "completed" | "failed");

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  const openFromCard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); (event.currentTarget as HTMLElement).click(); }
  };

  return <section className="source-library">
    <header className="page-heading source-library-heading">
      <div>
        <div className="source-library-brand"><Image src={tickets ? "/img/jira.webp" : "/img/slack.png"} alt="" width={30} height={30} /><span>{label} source · <b className="demo-data-label">Demo data</b></span></div>
        <h1>{tickets ? "Tickets" : "Conversations"}</h1>
        <p>{tickets ? "Example Jira issues for exploring the ticket view." : "Example Slack messages for exploring the conversation view."}</p>
      </div>
    </header>

    <div className="source-library-toolbar">
      <div className="demo-search-controls"><label className="source-library-search"><Search size={15} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tickets ? "Search key, title, status, assignee…" : "Search message, author, channel…"} aria-label={`Search demo ${tickets ? "tickets" : "conversations"}`} /></label>{tickets && <><label className="demo-select-label"><span className="sr-only">Filter tickets by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option><option>To Do</option><option>In Progress</option><option>Done</option></select></label><label className="demo-select-label"><span className="sr-only">Filter tickets by priority</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></>}</div>
      <span>Demo records only · no live {label} links</span>
    </div>
    <div className="source-library-stats">
      <div><small>Total demo records available</small><b>{summary.totalAvailableRecords}</b></div>
      <div><small>Currently displayed</small><b>{summary.currentlyDisplayedRecords}</b></div>
      <div><small>Verified live index</small><b>Not applicable · Demo</b></div>
    </div>

    {rows.length ? <div className="source-record-list">
      {tickets ? (rows as typeof DEMO_TICKETS).map((item) => <article className="source-record-card demo-clickable-card" key={item.key} role="button" tabIndex={0} onClick={() => setSelected(item)} onKeyDown={openFromCard} aria-haspopup="dialog" aria-label={`Open demo ticket ${item.key}: ${item.title}`}>
        <div className="source-record-icon"><Image src="/img/jira.webp" alt="Jira" width={26} height={26} /></div>
        <div className="source-record-body">
          <div className="source-record-meta"><span className="source-pill jira">Jira</span><b>{item.key}</b><span>{item.project}</span><span className={`demo-status demo-status-${item.status.toLowerCase().replace(" ", "-")}`}>{item.status}</span><span className={`demo-priority demo-priority-${item.priority.toLowerCase()}`}>{item.priority}</span></div>
          <h2>{item.title}</h2><p>{item.excerpt}</p>
          <div className="source-record-meta demo-record-footer"><span>Assignee: {item.assignee}</span><span>Updated {new Date(`${item.updatedAt}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span><span>Demo record</span></div>
        </div>
        <span className="source-record-open demo-record-action" title="Open demo ticket details" aria-hidden="true"><ArrowUpRight size={15} /></span>
      </article>) : (rows as typeof DEMO_CONVERSATIONS).map((item) => <article className="source-record-card demo-clickable-card" key={item.id} role="button" tabIndex={0} onClick={() => setSelected(item)} onKeyDown={openFromCard} aria-haspopup="dialog" aria-label={`Open demo Slack message in ${item.channel} by ${item.author}`}>
        <div className="source-record-icon"><Image src="/img/slack.png" alt="Slack" width={26} height={26} /></div>
        <div className="source-record-body">
          <div className="source-record-meta"><span className="source-pill slack">Slack</span><b>{item.channel}</b><span>{item.author}</span><span>{item.timestamp}</span></div>
          <h2 className="demo-message-title">{item.message}</h2><p>{item.replies} {item.replies === 1 ? "reply" : "replies"} · Demo message</p>
        </div>
        <span className="source-record-open demo-record-action" title="Open demo message details" aria-hidden="true"><ArrowUpRight size={15} /></span>
      </article>)}
    </div> : <div className="source-library-state"><span className="source-library-state-icon"><Search size={19} /></span><b>No matching demo records</b><span>Try a different search term or clear the search field.</span></div>}
    {selected && <div className="demo-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="demo-detail-modal" role="dialog" aria-modal="true" aria-labelledby="demo-detail-title" onKeyDown={(event) => { if (event.key !== "Tab") return; const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])'); if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }}><header><div><span className="demo-data-label">Demo data</span><h2 id="demo-detail-title">{tickets ? (selected as (typeof DEMO_TICKETS)[number]).key : (selected as (typeof DEMO_CONVERSATIONS)[number]).channel}</h2></div><button autoFocus className="icon-button" type="button" onClick={() => setSelected(null)} aria-label="Close details"><X size={16} /></button></header>
      {tickets ? (() => { const item = selected as (typeof DEMO_TICKETS)[number]; return <><h3>{item.title}</h3><p>{item.excerpt}</p><div className="demo-detail-fields">{[["Status", item.status], ["Priority", item.priority], ["Assignee", item.assignee], ["Project", item.project], ["Updated", item.updatedAt], ["Record ID", item.key]].map(([key, value]) => <div key={key}><small>{key}</small><b>{value}</b></div>)}</div></>; })() : (() => { const item = selected as (typeof DEMO_CONVERSATIONS)[number]; return <><div className="demo-detail-fields">{[["Author", item.author], ["Channel", item.channel], ["Timestamp", item.timestamp], ["Replies", String(item.replies)]].map(([key, value]) => <div key={key}><small>{key}</small><b>{value}</b></div>)}</div><p className="demo-detail-message">{item.message}</p><h3>Thread context</h3><p>{item.replies ? `${item.replies} example ${item.replies === 1 ? "reply" : "replies"} are represented by the reply count; no thread messages are included in this fixture.` : "No replies are included in this fixture."}</p></>; })()}
      <div className="demo-detail-empty"><b>Related records</b><span>No explicit relationships are included in this demo fixture.</span></div><footer><span>No live {label} link</span><button className="button-primary" type="button" onClick={() => setSelected(null)}>Close</button></footer>
    </section></div>}
  </section>;
}
