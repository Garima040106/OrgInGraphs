"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleHelp,
  Command,
  Compass,
  Network,
  Search,
  Settings2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { CompanyAssistant } from "@/components/assistant/CompanyAssistant";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { api } from "@/lib/api";
import type { Entity, EntityType, Health } from "@/lib/types";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: Compass },
  { href: "/dashboard", label: "Organization graph", icon: Network },
  { href: "/people", label: "People", icon: UsersRound },
  { href: "/departments", label: "Departments", icon: Building2 },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness },
];

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [workspace, setWorkspace] = useState("Demo workspace");
  const [company, setCompany] = useState("Company workspace");
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<{ entity: Entity; entityType: EntityType | "Unknown" } | null>(null);

  useEffect(() => {
    const email = window.localStorage.getItem("oig-demo-workspace");
    if (email) setWorkspace(email);
    let mounted = true;
    api.company().then((item) => { if (mounted) setCompany(String(item.name ?? "Company workspace")); }).catch(() => { if (mounted) setCompany("Company workspace"); });
    api.health().then((item) => { if (mounted) setHealth(item); }).catch(() => { if (mounted) setHealth({ status: "degraded", database: "unavailable" }); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title =
    pathname.startsWith("/people") ? "People" :
      pathname.startsWith("/departments") ? "Departments" :
        pathname.startsWith("/projects") ? "Projects" :
          pathname === "/dashboard" ? "Organization graph" : "Workspace";
  const connection = health?.status === "ok";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand href="/dashboard" />
        <div className="sidebar-kicker">Company intelligence</div>
        <button className="workspace-switch" type="button" aria-label={`${company} workspace`}>
          <span className="workspace-mark">{company.slice(0, 1).toUpperCase()}</span>
          <span><b>{company}</b><small>Company workspace</small></span><ChevronDown size={13} />
        </button>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navigation.map(({ href, label, icon: Icon }, index) => {
            const active = index === 0 || index === 1
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
            return <Link href={href} className={active ? "active" : ""} key={`${label}:${index}`} aria-current={active ? "page" : undefined}><Icon size={15} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="nav-section-label">PREFERENCES</div>
        <nav className="side-nav"><Link href="/dashboard#settings"><Settings2 size={15} /><span>Workspace settings</span></Link></nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={14} /><span>Help center</span></div>
          <div className="sidebar-user"><span className="user-avatar">{workspace.slice(0, 2).toUpperCase()}</span><div><b title={workspace}>{workspace}</b><small>Demo access</small></div><ArrowDownUp size={13} color="#98a0af" /></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span className="breadcrumb-company">{company}</span><span className="breadcrumb-divider">/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <div className={`connection-pill ${connection ? "" : "offline"}`} title={connection ? "Backend connected" : "Backend unavailable"}><span className="status-dot" /><span>{connection ? "Connected" : health ? "Offline" : "Checking"}</span></div>
            <button className="search-trigger" type="button" onClick={() => setSearchOpen(true)}><Search size={13} /><span>Search your organization</span><kbd><Command size={9} /> K</kbd></button>
            <button className="topbar-user" type="button" onClick={() => setAssistantOpen((open) => !open)} aria-label="Open OIG Intelligence"><Sparkles size={13} /></button>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <button className="assistant-launch" type="button" onClick={() => setAssistantOpen((open) => !open)} aria-label="Open OIG Intelligence"><Sparkles size={14} /> OIG Intelligence</button>
      <CompanyAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} selected={selected} />
      <SelectionSync onSelection={(value) => setSelected(value)} />
    </div>
  );
}

function SelectionSync({ onSelection }: { onSelection: (value: { entity: Entity; entityType: EntityType | "Unknown" } | null) => void }) {
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ entity: Entity; entityType: EntityType | "Unknown" } | null>).detail;
      onSelection(detail);
    };
    window.addEventListener("oig-graph-selection", listener);
    return () => window.removeEventListener("oig-graph-selection", listener);
  }, [onSelection]);
  return null;
}
