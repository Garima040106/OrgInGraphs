"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserRound } from "lucide-react";
import { api, entityName, friendlyApiError } from "@/lib/api";
import type { Department, Employee } from "@/lib/types";

export function PeopleDirectory() {
  const [people, setPeople] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [term, setTerm] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([api.employees(), api.departments()])
      .then(([employeeList, departmentList]) => {
        if (!mounted) return;
        setPeople(employeeList);
        setDepartments(departmentList);
      })
      .catch((reason: unknown) => { if (mounted) setError(friendlyApiError(reason)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return people.filter((person) => {
      const matchesText = !needle || [person.name, person.email, person.jobTitle, person.id].some((value) => String(value ?? "").toLowerCase().includes(needle));
      const matchesDepartment = !departmentId || person.departmentId === departmentId;
      const isActive = String(person.employmentStatus ?? "").toLowerCase() === "active";
      const matchesStatus = !status || (status === "active" ? isActive : !isActive);
      return matchesText && matchesDepartment && matchesStatus;
    });
  }, [departmentId, people, status, term]);

  return (
    <>
      <div className="page-heading"><div><h1>People</h1><p>Find the people behind your company’s work.</p></div><span className="tag">{loading ? "Loading…" : `${filtered.length} of ${people.length} people`}</span></div>
      <div className="directory-toolbar">
        <label className="directory-search"><Search size={13} /><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search name, role, or email" aria-label="Search people" /></label>
        <select className="filter-select" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} aria-label="Filter by department"><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{entityName(department)}</option>)}</select>
        <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by employment status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="directory-table-wrap"><div className="loading-skeleton" style={{ height: 330, margin: 14 }} /></div> :
        !error && filtered.length === 0 ? <div className="empty-state"><UserRound size={20} /><b>No matching people</b><p>Try a different search or clear one of the filters.</p></div> :
          <div className="directory-table-wrap"><table className="directory-table"><thead><tr><th>Person</th><th>Department</th><th>Team</th><th>Status</th><th>Location</th></tr></thead><tbody>
            {filtered.map((person) => {
              const department = departments.find((item) => item.id === person.departmentId);
              const isActive = String(person.employmentStatus ?? "").toLowerCase() === "active";
              return <tr key={person.id}><td><Link className="table-person" href={`/people/${encodeURIComponent(person.id)}`}><span className="user-avatar">{String(person.name ?? person.id).split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><b>{person.name ?? person.id}</b><small>{person.jobTitle ?? person.email ?? person.id}</small></span></Link></td><td>{department ? entityName(department) : person.departmentId ?? "—"}</td><td>{person.teamId ?? "—"}</td><td><span className={`status-badge ${isActive ? "" : "inactive"}`}><i className="status-dot" />{String(person.employmentStatus ?? "unknown")}</span></td><td>{typeof person.location === "string" ? person.location : "—"}</td></tr>;
            })}
          </tbody></table></div>}
    </>
  );
}
