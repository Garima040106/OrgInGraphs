"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Building2, Network, UsersRound } from "lucide-react";
import { useParams } from "next/navigation";
import { api, entityName, friendlyApiError } from "@/lib/api";
import type { DepartmentDetail } from "@/lib/types";

export default function DepartmentDetailPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    api.department(departmentId).then((result) => { if (mounted) setDetail(result); })
      .catch((reason: unknown) => { if (mounted) setError(friendlyApiError(reason)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [departmentId]);
  if (loading) return <div className="loading-skeleton" style={{ height: 300 }} />;
  if (error || !detail) return <div className="empty-state"><Building2 size={20} /><b>{error || "Department not found"}</b><p>This department record could not be loaded.</p><Link className="detail-link" href="/departments"><ArrowLeft size={12} /> Back to departments</Link></div>;
  const { department, teams, employees } = detail;
  return (
    <>
      <div className="page-heading"><div><Link className="detail-link" href="/departments"><ArrowLeft size={12} /> Departments</Link><h1 style={{ marginTop: 9 }}>{entityName(department)}</h1><p>{String(department.slug ?? department.id)} · Department</p></div><Link className="small-button" href={`/dashboard?focus=${encodeURIComponent(department.id)}&type=Department`}><Network size={12} /> Explore in graph</Link></div>
      <div className="profile-grid">
        <section className="profile-main-card"><div className="profile-person"><span className="node-icon" style={{ width: 45, height: 45 }}><Building2 size={21} /></span><div><h2>{entityName(department)}</h2><p>{typeof department.employeeCount === "number" ? `${department.employeeCount} people` : `${employees.length} associated employees`} · {department.id}</p></div></div>
          <div className="detail-grid"><div><span className="detail-label">Department ID</span><span className="detail-value">{department.id}</span></div><div><span className="detail-label">Slug</span><span className="detail-value">{String(department.slug ?? "Not provided")}</span></div><div><span className="detail-label">Created</span><span className="detail-value">{String(department.createdAt ?? "Not provided")}</span></div><div><span className="detail-label">Updated</span><span className="detail-value">{String(department.updatedAt ?? "Not provided")}</span></div></div>
          <h3 className="detail-section-title">Teams · {teams.length}</h3><div className="tag-row">{teams.length ? teams.map((team) => <span className="tag" key={team.id}>{entityName(team)}</span>) : <span className="muted-copy">No teams are associated with this department in the API response.</span>}</div>
        </section>
        <aside className="profile-side-card"><h3>People · {employees.length}</h3>{employees.map((person) => <Link className="related-row" key={person.id} href={`/people/${encodeURIComponent(person.id)}`}><span className="user-avatar">{String(person.name ?? person.id).split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span>{entityName(person)}<small>{person.jobTitle ?? "Employee"}</small></span><ArrowUpRight size={11} style={{ marginLeft: "auto" }} /></Link>)}{!employees.length && <p className="muted-copy">No employees are associated with this department.</p>}<Link className="small-button" style={{ width: "100%", marginTop: 12 }} href={`/dashboard?focus=${encodeURIComponent(department.id)}&type=Department`}><UsersRound size={12} /> See team connections</Link></aside>
      </div>
    </>
  );
}
