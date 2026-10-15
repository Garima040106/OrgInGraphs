"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Building2, Mail, Network, UsersRound } from "lucide-react";
import { useParams } from "next/navigation";
import { api, entityName, friendlyApiError } from "@/lib/api";
import type { EmployeeDetail } from "@/lib/types";

export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.employee(employeeId).then((result) => { if (mounted) setDetail(result); })
      .catch((reason: unknown) => { if (mounted) setError(friendlyApiError(reason)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [employeeId]);

  if (loading) return <div className="profile-grid"><div className="loading-skeleton" style={{ height: 310 }} /><div className="loading-skeleton" style={{ height: 220 }} /></div>;
  if (error || !detail) return <div className="empty-state"><UsersRound size={20} /><b>{error || "Employee not found"}</b><p>This employee record could not be loaded from the company data service.</p><Link className="detail-link" href="/people"><ArrowLeft size={12} /> Back to people</Link></div>;

  const { employee } = detail;
  const active = String(employee.employmentStatus ?? "").toLowerCase() === "active";
  return (
    <>
      <div className="page-heading"><div><Link className="detail-link" href="/people"><ArrowLeft size={12} /> People</Link><h1 style={{ marginTop: 9 }}>{employee.name ?? employee.id}</h1><p>Employee profile from company records.</p></div><Link className="small-button" href={`/dashboard?focus=${encodeURIComponent(employee.id)}&type=Employee`}><Network size={12} /> Explore in graph</Link></div>
      <div className="profile-grid">
        <section className="profile-main-card">
          <div className="profile-person"><span className="user-avatar">{String(employee.name ?? employee.id).split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><h2>{employee.name ?? employee.id}</h2><p>{employee.jobTitle ?? "Employee"} · {employee.employeeId ?? employee.id}</p></div><span className={`status-badge ${active ? "" : "inactive"}`} style={{ marginLeft: "auto" }}><i className="status-dot" />{String(employee.employmentStatus ?? "unknown")}</span></div>
          <div className="detail-grid">
            <div><span className="detail-label">Email</span><a className="detail-value" href={employee.email ? `mailto:${employee.email}` : undefined}><Mail size={11} style={{ verticalAlign: "middle", marginRight: 5 }} />{employee.email ?? "Not provided"}</a></div>
            <div><span className="detail-label">Department</span><span className="detail-value">{detail.department ? entityName(detail.department) : employee.departmentId ?? "Not assigned"}</span></div>
            <div><span className="detail-label">Team</span><span className="detail-value">{detail.team ? entityName(detail.team) : employee.teamId ?? "Not assigned"}</span></div>
            <div><span className="detail-label">Location</span><span className="detail-value">{typeof employee.location === "string" ? employee.location : "Not provided"}</span></div>
            <div><span className="detail-label">Joined</span><span className="detail-value">{typeof employee.joinedAt === "string" ? employee.joinedAt : "Not provided"}</span></div>
            <div><span className="detail-label">Seniority</span><span className="detail-value">{typeof employee.seniority === "string" ? employee.seniority : "Not provided"}</span></div>
          </div>
          {detail.skills.length > 0 && <><h3 className="detail-section-title">Skills in record</h3><div className="tag-row">{detail.skills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}</div></>}
          {detail.projects.length > 0 && <><h3 className="detail-section-title">Projects</h3><div className="tag-row">{detail.projects.map((project) => <Link className="tag" key={project.id} href={`/projects/${encodeURIComponent(project.id)}`}>{entityName(project)} <ArrowUpRight size={9} /></Link>)}</div></>}
        </section>
        <aside className="profile-side-card">
          <h3>Connected people</h3>
          {detail.manager && <Link className="related-row" href={`/people/${encodeURIComponent(detail.manager.id)}`}><span className="user-avatar">{String(detail.manager.name ?? detail.manager.id).slice(0, 2).toUpperCase()}</span><span>{entityName(detail.manager)}<small>Manager</small></span></Link>}
          {detail.directReports.map((report) => <Link className="related-row" key={report.id} href={`/people/${encodeURIComponent(report.id)}`}><span className="user-avatar">{String(report.name ?? report.id).slice(0, 2).toUpperCase()}</span><span>{entityName(report)}<small>Direct report</small></span></Link>)}
          {!detail.manager && !detail.directReports.length && <p className="muted-copy">No reporting relationships are included in this record.</p>}
          <div className="detail-section-title"><Building2 size={10} style={{ verticalAlign: "middle", marginRight: 5 }} />Organization</div>
          {detail.department && <Link className="related-row" href={`/departments/${encodeURIComponent(detail.department.id)}`}><Building2 size={14} color="#8976c5" /><span>{entityName(detail.department)}<small>Department</small></span></Link>}
          {detail.team && <div className="related-row"><UsersRound size={14} color="#7483cc" /><span>{entityName(detail.team)}<small>Team</small></span></div>}
          <Link className="small-button" style={{ width: "100%", marginTop: 10 }} href={`/dashboard?focus=${encodeURIComponent(employee.id)}&type=Employee`}><BriefcaseBusiness size={12} /> Open company graph</Link>
        </aside>
      </div>
    </>
  );
}
