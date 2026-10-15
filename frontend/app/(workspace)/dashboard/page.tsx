"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Building2, CircleAlert, Network, RefreshCw, UsersRound } from "lucide-react";
import { OrganizationGraph } from "@/components/graph/OrganizationGraph";
import { api, friendlyApiError } from "@/lib/api";
import type { GraphResponse } from "@/lib/types";

type LoadState<T> = { data: T; error: string };

export default function DashboardPage() {
  const [graph, setGraph] = useState<LoadState<GraphResponse>>({ data: { nodes: [], edges: [] }, error: "" });
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<{ id?: string; type?: string }>({});

  async function load() {
    setLoading(true);
    try {
      setGraph({ data: await api.graph(), error: "" });
    } catch (error) {
      setGraph({ data: { nodes: [], edges: [] }, error: friendlyApiError(error) });
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFocus({ id: params.get("focus") ?? undefined, type: params.get("type") ?? undefined });
  }, []);

  const failed = [graph.error].filter(Boolean);
  const employees = graph.data.nodes.filter((node) => node.labels.includes("Employee"));
  const departments = graph.data.nodes.filter((node) => node.labels.includes("Department"));
  const projects = graph.data.nodes.filter((node) => node.labels.includes("Project"));
  const activeEmployees = employees.filter((person) => person.properties.employmentStatus === "active").length;

  return (
    <>
      <div className="page-heading">
        <div className="dashboard-heading-copy"><div className="eyebrow"><span className="eyebrow-mark" /> Organizational intelligence</div><h1>Your organization, at a glance.</h1><p>Explore people, teams, and projects — and the connections between them.</p></div>
        <div className="heading-actions"><button className="small-button primary-action" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={12} /> Refresh data</button><Link className="small-button" href="/people"><UsersRound size={12} /> Browse people</Link></div>
      </div>
      {failed.map((message, index) => <div className="error-banner" key={`${message}:${index}`}><CircleAlert size={14} /><span>{message} Confirm the backend is running and FalkorDB is seeded.</span><button className="small-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={12} /> Retry</button></div>)}
      <section className="dashboard-stats" aria-label="Organization totals">
        <div className="stat-item metric-people"><span className="stat-icon"><UsersRound size={14} /></span><span><small className="metric-label">People</small><b>{loading ? "—" : employees.length}</b><small>{loading ? "Loading" : `${activeEmployees} active`}</small></span></div>
        <span className="stats-divider" />
        <div className="stat-item metric-departments"><span className="stat-icon"><Building2 size={14} /></span><span><small className="metric-label">Structure</small><b>{loading ? "—" : departments.length}</b><small>Departments</small></span></div>
        <span className="stats-divider" />
        <div className="stat-item metric-projects"><span className="stat-icon"><BriefcaseBusiness size={14} /></span><span><small className="metric-label">Delivery</small><b>{loading ? "—" : projects.length}</b><small>Projects</small></span></div>
        <span className="stats-caption"><Network size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />Graph relationships are loaded from company records</span>
      </section>
      {loading ? (
        <div className="graph-workspace" aria-label="Loading organization graph"><div className="graph-heading"><div className="loading-skeleton" style={{ width: 180, height: 12 }} /></div><div style={{ padding: 26, display: "grid", gridTemplateColumns: "repeat(3,minmax(100px,1fr))", gap: 14, marginTop: 52 }}>{Array.from({ length: 9 }, (_, index) => <div className="loading-skeleton" style={{ height: 67 }} key={index} />)}</div></div>
      ) : (
        <OrganizationGraph
          graph={graph.data}
          focusId={focus.id}
          focusType={focus.type}
        />
      )}
    </>
  );
}
