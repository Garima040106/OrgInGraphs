"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, UsersRound } from "lucide-react";
import { api, entityName, friendlyApiError } from "@/lib/api";
import type { Project } from "@/lib/types";

export function ProjectDirectory() {
  const [items, setItems] = useState<Project[]>([]);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    api.projects().then((data) => { if (mounted) setItems(data); })
      .catch((reason: unknown) => { if (mounted) setError(friendlyApiError(reason)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  const filtered = useMemo(() => items.filter((project) => `${project.name ?? ""} ${project.id} ${project.status ?? ""}`.toLowerCase().includes(term.trim().toLowerCase())), [items, term]);
  return (
    <>
      <div className="page-heading"><div><h1>Projects</h1><p>Follow the work and people connected to your projects.</p></div><span className="tag">{loading ? "Loading…" : `${filtered.length} projects`}</span></div>
      <div className="directory-toolbar"><label className="directory-search"><BriefcaseBusiness size={13} /><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search projects" aria-label="Search projects" /></label></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="entity-list">{Array.from({ length: 6 }, (_, i) => <div className="loading-skeleton" style={{ height: 118 }} key={i} />)}</div> :
        !filtered.length && !error ? <div className="empty-state"><BriefcaseBusiness size={20} /><b>No projects found</b><p>Try a different search or check the project records in your graph.</p></div> :
          <div className="entity-list">{filtered.map((project) => <Link className="entity-card" href={`/projects/${encodeURIComponent(project.id)}`} key={project.id}>
            <div className="entity-card-head"><span className="node-icon project"><BriefcaseBusiness size={15} /></span><span><h3>{entityName(project)}</h3><p>{project.status ?? "Project"} · {project.id}</p></span><ArrowUpRight size={13} style={{ marginLeft: "auto", color: "#a0a8b5" }} /></div>
            <div className="entity-card-meta"><span><UsersRound size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />Connected people</span><b>{new Set([...(project.owners ?? []), ...(project.contributors ?? [])].map((person) => person.id)).size || "—"}</b></div>
          </Link>)}</div>}
    </>
  );
}
