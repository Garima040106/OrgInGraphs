"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, UsersRound } from "lucide-react";
import { api, entityName, friendlyApiError } from "@/lib/api";
import type { Department } from "@/lib/types";

export function DepartmentDirectory() {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    api.departments().then((data) => { if (mounted) setItems(data); })
      .catch((reason: unknown) => { if (mounted) setError(friendlyApiError(reason)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  return (
    <>
      <div className="page-heading"><div><h1>Departments</h1><p>Explore the teams that make your organization work.</p></div><span className="tag">{loading ? "Loading…" : `${items.length} departments`}</span></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="entity-list">{Array.from({ length: 6 }, (_, i) => <div className="loading-skeleton" style={{ height: 118 }} key={i} />)}</div> :
        !items.length && !error ? <div className="empty-state"><Building2 size={20} /><b>No departments found</b><p>Department records will appear here when available from your company graph.</p></div> :
          <div className="entity-list">{items.map((department) => <Link className="entity-card" href={`/departments/${encodeURIComponent(department.id)}`} key={department.id}>
            <div className="entity-card-head"><span className="node-icon"><Building2 size={15} /></span><span><h3>{entityName(department)}</h3><p>{String(department.slug ?? department.id)}</p></span><ArrowUpRight size={13} style={{ marginLeft: "auto", color: "#a0a8b5" }} /></div>
            <div className="entity-card-meta"><span><UsersRound size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />People</span><b>{typeof department.employeeCount === "number" ? department.employeeCount : "—"}</b></div>
          </Link>)}</div>}
    </>
  );
}
