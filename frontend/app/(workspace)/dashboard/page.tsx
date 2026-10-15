"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Building2, CircleAlert, Network, RefreshCw, UsersRound } from "lucide-react";
import { OrganizationGraph } from "@/components/graph/OrganizationGraph";
import { api, friendlyApiError } from "@/lib/api";
import type { Department, Employee, Project } from "@/lib/types";

type LoadState<T> = { data: T; error: string };

export default function DashboardPage() {
  const [employees, setEmployees] = useState<LoadState<Employee[]>>({ data: [], error: "" });
  const [departments, setDepartments] = useState<LoadState<Department[]>>({ data: [], error: "" });
  const [projects, setProjects] = useState<LoadState<Project[]>>({ data: [], error: "" });
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<{ id?: string; type?: string }>({});

  async function load() {
    setLoading(true);
    const [peopleResult, departmentResult, projectResult] = await Promise.allSettled([
      api.employees(),
      api.departments(),
      api.projects(),
    ]);
    setEmployees(peopleResult.status === "fulfilled"
      ? { data: peopleResult.value, error: "" }
      : { data: [], error: friendlyApiError(peopleResult.reason) });
    setDepartments(departmentResult.status === "fulfilled"
      ? { data: departmentResult.value, error: "" }
      : { data: [], error: friendlyApiError(departmentResult.reason) });
    setProjects(projectResult.status === "fulfilled"
      ? { data: projectResult.value, error: "" }
      : { data: [], error: friendlyApiError(projectResult.reason) });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFocus({ id: params.get("focus") ?? undefined, type: params.get("type") ?? undefined });
  }, []);

  const failed = [employees.error, departments.error, projects.error].filter(Boolean);
  const activeEmployees = employees.data.filter((person) => person.employmentStatus === "active").length;

  return (
    <>
      <div className="page-heading">
        <div><h1>Your organization, at a glance.</h1><p>Explore people, teams, and projects — and the connections between them.</p></div>
        <div className="heading-actions"><button className="small-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={12} /> Refresh data</button><Link className="small-button" href="/people"><UsersRound size={12} /> Browse people</Link></div>
      </div>
      {failed.map((message, index) => <div className="error-banner" key={`${message}:${index}`}><CircleAlert size={14} /><span>{message} {index === 0 && "Confirm the backend is running and FalkorDB is seeded."}</span></div>)}
      <section className="dashboard-stats" aria-label="Organization totals">
        <div className="stat-item"><span className="stat-icon"><UsersRound size={14} /></span><span><b>{loading ? "—" : employees.data.length}</b><small>{loading ? "Loading people" : `${activeEmployees} active people`}</small></span></div>
        <span className="stats-divider" />
        <div className="stat-item"><span className="stat-icon"><Building2 size={14} /></span><span><b>{loading ? "—" : departments.data.length}</b><small>Departments</small></span></div>
        <span className="stats-divider" />
        <div className="stat-item"><span className="stat-icon"><BriefcaseBusiness size={14} /></span><span><b>{loading ? "—" : projects.data.length}</b><small>Projects</small></span></div>
        <span className="stats-caption"><Network size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />Graph relationships are loaded from company records</span>
      </section>
      {loading ? (
        <div className="graph-workspace" aria-label="Loading organization graph"><div className="graph-heading"><div className="loading-skeleton" style={{ width: 180, height: 12 }} /></div><div style={{ padding: 26, display: "grid", gridTemplateColumns: "repeat(3,minmax(100px,1fr))", gap: 14, marginTop: 52 }}>{Array.from({ length: 9 }, (_, index) => <div className="loading-skeleton" style={{ height: 67 }} key={index} />)}</div></div>
      ) : (
        <OrganizationGraph
          employees={employees.data}
          departments={departments.data}
          projects={projects.data}
          focusId={focus.id}
          focusType={focus.type}
        />
      )}
    </>
  );
}
