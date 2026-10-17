"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, CheckSquare, GitPullRequest, Network, UsersRound } from "lucide-react";
import { useParams } from "next/navigation";
import { api, entityName, friendlyApiError } from "@/lib/api";
import { isProductGraphEntity } from "@/lib/graph/mode";
import type { ProjectDetail } from "@/lib/types";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    api.project(projectId).then((result) => { if (mounted) setProject(result); })
      .catch((reason: unknown) => { if (mounted) setError(friendlyApiError(reason)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [projectId]);
  if (loading) return <div className="loading-skeleton" style={{ height: 300 }} />;
  if (error || !project) return <div className="empty-state"><BriefcaseBusiness size={20} /><b>{error || "Project not found"}</b><p>This project record could not be loaded.</p><Link className="detail-link" href="/projects"><ArrowLeft size={12} /> Back to projects</Link></div>;
  const people = [...new Map([...project.owners, ...project.employees].map((person) => [person.id, person])).values()];
  const projectGraphMode = isProductGraphEntity("Project", project.graphDomain) ? "product" : "team";
  return (
    <>
      <div className="page-heading"><div><Link className="detail-link" href="/projects"><ArrowLeft size={12} /> Projects</Link><h1 style={{ marginTop: 9 }}>{project.name ?? project.id}</h1><p>{String(project.status ?? "Project")} · Project record</p></div><Link className="small-button" href={`/org-graph?mode=${projectGraphMode}&focus=${encodeURIComponent(project.id)}&type=Project`}><Network size={12} /> Explore in graph</Link></div>
      <div className="profile-grid">
        <section className="profile-main-card"><div className="profile-person"><span className="node-icon project" style={{ width: 45, height: 45 }}><BriefcaseBusiness size={21} /></span><div><h2>{project.name ?? project.id}</h2><p>Project · {project.id}</p></div><span className="status-badge" style={{ marginLeft: "auto" }}>{String(project.status ?? "unknown")}</span></div>
          <div className="detail-grid"><div><span className="detail-label">Status</span><span className="detail-value">{String(project.status ?? "Not provided")}</span></div><div><span className="detail-label">Project ID</span><span className="detail-value">{project.id}</span></div><div><span className="detail-label">Valid from</span><span className="detail-value">{String(project.validFrom ?? "Not provided")}</span></div><div><span className="detail-label">Created</span><span className="detail-value">{String(project.createdAt ?? "Not provided")}</span></div></div>
          <h3 className="detail-section-title"><UsersRound size={10} style={{ verticalAlign: "middle", marginRight: 5 }} />People · {people.length}</h3>
          <div className="tag-row">{people.length ? people.map((person) => <Link className="tag" key={person.id} href={`/people/${encodeURIComponent(person.id)}`}>{entityName(person)} <ArrowUpRight size={9} /></Link>) : <span className="muted-copy">No employee connections are included in this project response.</span>}</div>
          <h3 className="detail-section-title"><GitPullRequest size={10} style={{ verticalAlign: "middle", marginRight: 5 }} />Pull requests · {project.pullRequests.length}</h3>
          <div className="tag-row">{project.pullRequests.length ? project.pullRequests.map((record) => <span className="tag" key={record.id}>{entityName(record)}{record.status ? ` · ${String(record.status)}` : ""}</span>) : <span className="muted-copy">No pull requests in the project response.</span>}</div>
        </section>
        <aside className="profile-side-card"><h3>Work connected to this project</h3><div className="related-row"><span className="connection-bullet"><CheckSquare size={12} /></span><span>Tasks<small>{project.tasks.length} linked records</small></span></div>{project.tasks.map((task) => <Link className="related-row" href={`/org-graph?mode=${isProductGraphEntity("Task",task.graphDomain)?"product":"team"}&focus=${encodeURIComponent(task.id)}&type=Task`} key={task.id}><span className="connection-bullet"><CheckSquare size={12} /></span><span>{entityName(task)}<small>{task.status ? String(task.status) : "Task"}</small></span><ArrowUpRight size={11} style={{ marginLeft: "auto" }} /></Link>)}{project.services?.map((service) => <div className="related-row" key={service.id}><span className="connection-bullet"><BriefcaseBusiness size={12} /></span><span>{entityName(service)}<small>{service.status ? String(service.status) : "Service"}</small></span></div>)}<Link className="small-button" style={{ width: "100%", marginTop: 12 }} href={`/org-graph?mode=${projectGraphMode}&focus=${encodeURIComponent(project.id)}&type=Project`}><Network size={12} /> Explore connections</Link></aside>
      </div>
    </>
  );
}
